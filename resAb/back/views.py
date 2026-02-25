import pandas as pd
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse, HttpRequest, HttpResponseBadRequest, JsonResponse
import s3fs, os, random
from .embeddings import get_embeddings_main
from .models import users, graphs, edge, nodes, relationship
import numpy as np
import json
from django.db.models import Q


# Create your views here.
BUCKET = "user-graphs"
fs = s3fs.S3FileSystem(
    key=os.getenv("AWS_ACCESS_KEY_ID"),
    secret=os.getenv("AWS_SECRET_ACCESS_KEY"),
    client_kwargs={
        "endpoint_url": "http://localhost:9000"
    })
def save_or_update_tree_s3(path : str, data : pd.DataFrame):
    if not fs.exists(BUCKET):
        fs.mkdir(BUCKET)
    full_path = f"{BUCKET}/{path}"
    data.to_parquet(
        path=full_path,
        engine="pyarrow",
        filesystem=fs,
        index=False,
    )

def read_tree_s3(path : str) -> pd.DataFrame:
    full_path = f"{BUCKET}/{path}"
    if not fs.exists(full_path):
        raise FileNotFoundError(f"El archivo {full_path} no existe en el bucket {BUCKET}")
    data = pd.read_parquet(
        path=full_path,
        engine="pyarrow",
        filesystem=fs,
    )
    return data

def delete_parquet_s3(path : str):
    full_path = f"{BUCKET}/{path}"
    if not fs.exists(full_path):
        raise FileNotFoundError(f"El archivo {full_path} no existe en el bucket {BUCKET}")
    fs.rm(full_path)


def get_similar_embeddings(target_embedding : np.ndarray, embeddings_df : pd.DataFrame, min_similarity = 0.8) -> pd.DataFrame:
    embeddings_matrix = np.vstack(embeddings_df['embedding'].values)#type: ignore
    if embeddings_matrix.shape[1] != len(target_embedding):
        raise ValueError(
            f"Dimensiones no coinciden: target={len(target_embedding)}, "
            f"data={embeddings_matrix.shape[1]}"
        )
    dot_products = embeddings_matrix @ target_embedding
    target_norm = np.linalg.norm(target_embedding)
    embeddings_norms = np.linalg.norm(embeddings_matrix, axis=1)
    cosine_similarities = dot_products / (embeddings_norms * target_norm)
    #sim_cos = dot_product / ||a||*||b||
    mask = cosine_similarities >= min_similarity
    result_df = embeddings_df[mask].copy()
    result_df['similarity'] = cosine_similarities[mask]
    
    return result_df.sort_values('similarity', ascending=False)


@csrf_exempt
def new_analysis_request(request: HttpRequest):
    if request.method != "POST":
        return HttpResponseBadRequest("Método no permitido")

    file = request.FILES.get("file")

    if not file:
        return HttpResponseBadRequest("Archivo es requerido")

    user_id = request.POST.get("user_id")
    text_column = request.POST.get("text_column")
    id_column = request.POST.get("id_column", None)
    name = request.POST.get("name")
    if not user_id:
        return HttpResponseBadRequest("user_id es requerido")

    if not text_column:
        return HttpResponseBadRequest("text_column es requerido")

    if not name:
        return HttpResponseBadRequest("name es requerido")

    try:
        user = users.objects.get(id=user_id)
    except users.DoesNotExist:
        return HttpResponseBadRequest("Usuario no encontrado")
    
    # Validar extensión simple
    allowed_extensions = ["csv"]
    extension = file.name.split(".")[-1].lower()

    if extension not in allowed_extensions:
        return HttpResponseBadRequest("Formato de archivo no permitido")

    #create new graph on the DB
    graph = graphs(id_user=user, name=name)
    graph.save()
    pk = graph.pk
    BASE_PATH = f"{user_id}/{pk}"
    data = pd.read_csv(file) #type: ignore 
    if id_column is None:
        data['ID'] = [ str(i) for i in range(data.shape[0])]
    embedding = get_embeddings_main(data, text_column=text_column, ID_column= id_column) # type: ignore
    # this can be upgrade to do one travel to storage, right now make 2 travels to save the data
    #save csv file
    save_or_update_tree_s3(f"{BASE_PATH}/data.parquet", data=data)
    #save embedding csv file
    save_or_update_tree_s3(f"{BASE_PATH}/embedding.parquet", data=embedding)
    graph.file_data_path = f"{BASE_PATH}/data.parquet"
    graph.file_embedding_path = f"{BASE_PATH}/embedding.parquet"
    graph.text_column = text_column
    graph.id_column = "ID" if id_column is None else id_column
    graph.graph_structure = { 0 : []} #type: ignore
    graph.save()
    return JsonResponse({
        "status": "ok",
        "filename": file.name,
        "size": file.size
    })

@csrf_exempt
def search_similar(request: HttpRequest):
    """Vista para buscar embeddings similares"""
    try:
        user_id = request.GET.get("user_id")
        graph_id = request.GET.get("graph_id")
        target_id = request.GET.get("target_id") # ID del embedding de referencia
        min_sim = float(request.GET.get("min_similarity", 0.8))
        is_preanalized = int(request.GET.get('preanalized', 0))
    except Exception as e:
        return HttpResponseBadRequest(f"Error en los datos proporcionados {e}")
    
    try:
        user = users.objects.get(id=user_id)
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except users.DoesNotExist or graphs.DoesNotExist:
        HttpResponseBadRequest("usuario o grafo no existe")
    
    if is_preanalized == 1:
        tmp_df :pd.DataFrame= read_tree_s3(f"{user_id}/{graph_id}/temp_emb.parquet")
        data = tmp_df[tmp_df['similarity'] >= min_sim]
        result = data[['similarity',graph.text_column, graph.id_column]] #type: ignore
    else:
        # Cargar embeddings desde S3
        path = f"{user_id}/{graph_id}/embedding.parquet"
        id_column = graph.id_column #type: ignore   
        embeddings_df = read_tree_s3(path)
        # Obtener embedding objetivo
        target_row = embeddings_df[embeddings_df[id_column] == target_id] #se tiene que manejar escenario donde el id es texto
        if target_row.empty:
            return HttpResponseBadRequest("ID no encontrado")

        target_embedding = target_row.iloc[0]['embedding']

        # Buscar similares
        similares = get_similar_embeddings(
            target_embedding=target_embedding,
            embeddings_df=embeddings_df, 
            min_similarity=min_sim
        )

        # Cargar datos originales para mostrar texto
        data_path = f"{user_id}/{graph_id}/data.parquet"
        original_data = read_tree_s3(data_path)

        # Merge con datos originales
        result = similares.merge(original_data, on=graph.id_column, how='left')#type: ignore
        result = result[['similarity',graph.text_column, graph.id_column]] #type: ignore
        #save data untill the user confirm de new node
    save_or_update_tree_s3(f"{user_id}/{graph_id}/currentReview.parquet",result)
    return JsonResponse({
        "count": len(result),
        "results": result.to_dict('records'),
        "keys" : { 'id' : graph.id_column, 'data' : graph.text_column, 'sim' : 'similarity'}#type: ignore
    })

def select_n_random_values(n : int, first : int, last : int)-> list:
    ls = []
    for i in range(n):
        x = random.randint(first, last)
        while x in ls:
            x = random.randint(first, last)
        ls.append(x)
    return ls

@csrf_exempt
def delete_temp_embedding_endpoint(request: HttpRequest):
    """Endpoint para eliminar el tmp_embedding virtual"""
    user_id = request.GET.get("user_id")
    graph_id = request.GET.get("graph_id")
    if not user_id or not graph_id:
        return HttpResponseBadRequest("user_id y graph_id son requeridos")
    try:
        user = users.objects.get(id=user_id)
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except (users.DoesNotExist, graphs.DoesNotExist):
        return HttpResponseBadRequest("Usuario o grafo no encontrado")
    BASE_PATH = f"{user_id}/{graph_id}/temp_emb.parquet"
    delete_tmp_embedding(BASE_PATH)
    
    return HttpResponse(status=204)

def delete_tmp_embedding(path :str):
    delete_parquet_s3(path)


@csrf_exempt
def confirm_new_category(request : HttpRequest):
    """Vista para confirmar el nuevo nodo/cateogria seleccionada"""
    try:
        user_id = request.GET.get("user_id")
        graph_id = request.GET.get("graph_id")
        name_category = request.GET.get("name") # ID del embedding de referencia
    except Exception as e:
        return HttpResponseBadRequest(f"Error en los datos proporcionados {e}")
    try:
        user = users.objects.get(id=user_id)
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except users.DoesNotExist or graphs.DoesNotExist:
        HttpResponseBadRequest("usuario o grafo no existe")
    new_node = nodes(node_name=name_category, graph=graph)#type: ignore
    BASE_PATH_USER =f"{user_id}/{graph_id}"
    #almacena el nodo definitivamente
    save_or_update_tree_s3(f"{BASE_PATH_USER}/{name_category}.parquet", read_tree_s3(f"{BASE_PATH_USER}/currentReview.parquet"))
    delete_parquet_s3(f"{BASE_PATH_USER}/currentReview.parquet")
    delete_tmp_embedding(f"{BASE_PATH_USER}/temp_emb.parquet")
    new_node.save()
    return HttpResponse(status=204)

@csrf_exempt
def sample(request : HttpRequest) -> HttpResponse:
    """Vista para obtener una muestra del conjunto"""
    try:
        user_id = request.GET.get("user_id")
        graph_id = request.GET.get("graph_id")
        random_sample = int(request.GET.get("random", 1)) # 0 paginado, 1 - random
        type_sample = int(request.GET.get("sample", 0)) # 0 - all data, 1 - category, 2 - currente category 
        sample_size = int(request.GET.get("ss", 5))
        category = request.GET.get("category", None)
        page = int(request.GET.get("page", 1))
        page_size = int(request.GET.get("page_size", 10))
    except Exception as e:
        return HttpResponseBadRequest(f"Error en los datos proporcionados {e}")
    try:
        user = users.objects.get(id=user_id)
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except (users.DoesNotExist, graphs.DoesNotExist):
        return HttpResponseBadRequest("usuario o grafo no existe")
    BASE_PATH = f"{user_id}/{graph_id}"
    
    data_to_return = pd.DataFrame()

    if type_sample == 0:
        #sobre todo los datos
        data = read_tree_s3(f"{BASE_PATH}/data.parquet")#type: ignore
        size = data.shape[0]
        if random_sample == 1: # Random sampling
            sample_size = sample_size if sample_size < size else size
            list_data_selected = select_n_random_values(sample_size, 0, size - 1)
            data_to_return = data.iloc[list_data_selected]
        else: # Paginado
            start_index = (page - 1) * page_size
            end_index = start_index + page_size
            data_to_return = data.iloc[start_index:end_index]

    elif type_sample == 1:
        #sobre una cateogria
        try:
            data = read_tree_s3(f"{BASE_PATH}/{category}.parquet")#type: ignore
        except Exception:
            return HttpResponseBadRequest("Categoria invalida")
        size = data.shape[0] 
        if random_sample == 1: # Random sampling
            sample_size = sample_size if sample_size < size else size
            list_data_selected : list = select_n_random_values(sample_size, 0, size - 1)
            data_to_return = data.iloc[list_data_selected]
        else: # Paginado
            start_index = (page - 1) * page_size
            end_index = start_index + page_size
            data_to_return = data.iloc[start_index:end_index]
    else:
        #sobre la categoria actual
        # Assuming 'currentReview.parquet' holds the current category data
        try:
            data = read_tree_s3(f"{BASE_PATH}/currentReview.parquet") #type: ignore
        except Exception:
            return HttpResponseBadRequest("No hay categoria actual en revisión")
        size = data.shape[0]
        if random_sample == 1: # Random sampling
            sample_size = sample_size if sample_size < size else size
            list_data_selected = select_n_random_values(sample_size, 0, size - 1)
            data_to_return = data.iloc[list_data_selected]
        else: # Paginado
            start_index = (page - 1) * page_size
            end_index = start_index + page_size
            data_to_return = data.iloc[start_index:end_index]
    
    # Format the output
    result = data_to_return[[graph.id_column, graph.text_column]].rename(
        columns={graph.id_column: 'id', graph.text_column: 'data'}
    )
    return JsonResponse({"data" : result.to_dict("records"),
                         "total_items" : data.shape[0]})

def range_cos(min_cos : float, n_opc : int) -> list:
    """
        return a list of range that contain the max sim_cos of every n_opc
    """
    step = (1 - min_cos) / n_opc
    return [min_cos - step + (step * cos) for cos in range(1, n_opc +1)]
    
@csrf_exempt
def opc_cut(request : HttpRequest):
    try:
        n_opc = int(request.GET.get('n_opc', 3))
        min_cos = float(request.GET.get('min_similarity', 0.85))
        target_id = request.GET.get('target_id')
        user_id = request.GET.get('user_id')
        graph_id = request.GET.get('graph_id')
    except Exception as e:
        return HttpResponseBadRequest(f"Formato de los datos erroneo {e}")
    if not (n_opc and min_cos and target_id):
        return HttpResponseBadRequest("Datos incompletos en la solicitud")
    try:
        user = users.objects.get(id=user_id)
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except users.DoesNotExist or graphs.DoesNotExist:
        return HttpResponseBadRequest("Arbol o usuario no encontrado")
    list_cos = range_cos(min_cos, n_opc)
    list_cos.sort()
    PATH_EMB = f"{user_id}/{graph_id}/embedding.parquet"
    df_embedding : pd.DataFrame= read_tree_s3(PATH_EMB)
    target_row = df_embedding[df_embedding[graph.id_column] == target_id].iloc[0]['embedding']

    #make the cut and add the column similarity
    df_embedding_min_cos = get_similar_embeddings(target_row, df_embedding, min_cos) #type: ignore

    #add the data to the parquet file tmp
    df_data :pd.DataFrame = read_tree_s3(f"{user_id}/{graph_id}/data.parquet")
    df_embedding_min_cos = df_embedding_min_cos.merge(df_data, on=graph.id_column,how="left")
    
    PATH_EMB_TEMP = f"{user_id}/{graph_id}/temp_emb.parquet"
    save_or_update_tree_s3(PATH_EMB_TEMP, df_embedding_min_cos)
    
    answer = []
    #df_embedding_min_cos = get_similar_embeddings(target_row, df_embedding_min_cos, min_cos)
    for cos in list_cos:
        df_tmp : pd.DataFrame= df_embedding_min_cos[df_embedding_min_cos['similarity'] > cos]
        border = df_tmp.iloc[[-1],[1,2,3]].iloc[0].values
        answer.append({'id' : border[0], 'data' : border[2], 'sim' : float(border[1])})
    return JsonResponse( { 'data' : answer})


@csrf_exempt
def get_categorized_data(request: HttpRequest) -> HttpResponse:
    """
    Endpoint to get all data from a graph, merged with its categories, and returned as a CSV.
    Query parameters: user_id, graph_id
    """
    try:
        user_id = request.GET.get("user_id")
        graph_id = request.GET.get("graph_id")
    except Exception as e:
        return HttpResponseBadRequest(f"Error en los datos proporcionados {e}")

    if not user_id or not graph_id:
        return HttpResponseBadRequest("user_id y graph_id son requeridos")

    try:
        user = users.objects.get(id=user_id)
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except (users.DoesNotExist, graphs.DoesNotExist):
        return HttpResponseBadRequest("Usuario o grafo no existe")

    BASE_PATH = f"{user_id}/{graph_id}"
    id_column = graph.id_column
    text_column = graph.text_column

    try:
        main_df = read_tree_s3(f"{BASE_PATH}/data.parquet")
    except FileNotFoundError:
        return HttpResponseBadRequest("El archivo data.parquet no se encontró para el grafo especificado.")
    
    # Initialize 'categorias' column as empty lists
    main_df['categorias'] = [[] for _ in range(len(main_df))]

    # Fetch all nodes for the graph
    graph_nodes = nodes.objects.filter(graph=graph)

    for node in graph_nodes:
        node_name = node.node_name
        try:
            category_df = read_tree_s3(f"{BASE_PATH}/{node_name}.parquet")
            # Update 'categorias' column in main_df
            for index, row in category_df.iterrows():
                # Find the corresponding row in main_df using id_column
                # Assuming id_column uniquely identifies rows in main_df
                main_df_index = main_df[main_df[id_column] == row[id_column]].index
                if not main_df_index.empty:
                    main_df.loc[main_df_index[0], 'categorias'].append(node_name)
        except FileNotFoundError:
            # If a category parquet file is not found, skip it
            print(f"Warning: Category parquet file for node '{node_name}' not found. Skipping.")
            continue
        except Exception as e:
            print(f"Error processing category '{node_name}': {e}")
            continue

    # Convert the list of categories to a comma-separated string for CSV output
    main_df['categorias'] = main_df['categorias'].apply(lambda x: ','.join(x))

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{graph_id}_categorized_data.csv"'
    main_df.to_csv(path_or_buf=response, index=False)
    return response

@csrf_exempt
def get_full_graph(request: HttpRequest):
    """
    Vista para obtener la estructura completa de un grafo, mostrando las relaciones entre nodos.
    Retorna una lista de nodos con sus IDs y una lista de aristas.
    """
    graph_id = request.GET.get("graph_id")
    if not graph_id:
        return HttpResponseBadRequest("Falta el parámetro 'graph_id'")

    try:
        # Validar que el grafo existe.
        graph_obj = graphs.objects.get(id=graph_id)
        
        # Obtener todos los nodos del grafo.
        all_nodes = nodes.objects.filter(graph=graph_obj)
        
        # Obtener todas las aristas de esos nodos.
        edges_objs = edge.objects.filter(from_node__in=all_nodes).select_related('from_node', 'to_node', 'relation')

        nodes_list = []
        for node in all_nodes:
            nodes_list.append({
                "id": node.id,
                "name": node.node_name
            })

        edges_list = []
        for e in edges_objs:
            edges_list.append({
                "id":e.id,
                "source": e.from_node.id,
                "target": e.to_node.id,
                "relation_id": e.relation.id
            })
                
        return JsonResponse({
            "nodes": nodes_list,
            "edges": edges_list
        })

    except graphs.DoesNotExist:
        return HttpResponseBadRequest("El grafo no existe")
    except Exception as e:
        return HttpResponse(f"Error inesperado: {e}", status=500)

@csrf_exempt
def add_edge(request: HttpRequest):
    """
    Endpoint para crear o actualizar una relación (edge) entre dos nodos.
    Recibe: user_id, graph_id, node_id_1, node_id_2, connection_type (todos enteros).
    """
    if request.method != "POST":
        return HttpResponseBadRequest("Método no permitido")

    try:
        body = json.loads(request.body)
        user_id = body.get("user_id")
        graph_id = body.get("graph_id")
        node_id_1 = body.get("node_id_1")
        node_id_2 = body.get("node_id_2")
        connection_type = body.get("connection_type")

        if not all([user_id, graph_id, node_id_1, node_id_2, connection_type]):
            return HttpResponseBadRequest("Faltan parámetros obligatorios")

        # Verificar existencia de usuario
        try:
            user_obj = users.objects.get(id=user_id)
        except users.DoesNotExist:
            return HttpResponseBadRequest("Usuario no encontrado")

        # Verificar existencia de grafo y que pertenezca al usuario
        try:
            graph_obj = graphs.objects.get(id=graph_id, id_user=user_obj)
        except graphs.DoesNotExist:
            return HttpResponseBadRequest("Grafo no encontrado o no pertenece al usuario")

        # Verificar existencia de ambos nodos y que pertenezcan al grafo
        try:
            node1 = nodes.objects.get(id=node_id_1, graph=graph_obj)
            node2 = nodes.objects.get(id=node_id_2, graph=graph_obj)
        except nodes.DoesNotExist:
            return HttpResponseBadRequest("Uno o ambos nodos no encontrados en este grafo")

        # Verificar existencia del tipo de relación
        try:
            rel_obj = relationship.objects.get(id=connection_type)
        except relationship.DoesNotExist:
            return HttpResponseBadRequest("Tipo de conexión (relación) no encontrado")

        # Verificar si ya existe una relación entre ambos nodos
        # Si existe, sobreescribimos la relación.
        edge_obj = edge.objects.filter(from_node=node1, to_node=node2).first()
        
        if edge_obj:
            edge_obj.relation = rel_obj
            edge_obj.save()
        else:
            edge.objects.create(from_node=node1, to_node=node2, relation=rel_obj)

        return HttpResponse("OK", status=200)

    except Exception as e:
        return HttpResponse(f"Error inesperado: {e}", status=500)
    

@csrf_exempt
def get_user_graphs(request: HttpRequest):
    """
    Endpoint para obtener todos los grafos asociados a un usuario.
    Recibe user_id por GET.
    """
    user_id = request.GET.get("user_id")
    if not user_id:
        return HttpResponseBadRequest("Falta el parámetro 'user_id'")
    
    try:
        user_obj = users.objects.get(id=user_id)
        user_graphs = graphs.objects.filter(id_user=user_obj)
        
        results = []
        for g in user_graphs:
            # Intentamos extraer un nombre legible del path o usamos un default
           
            
            name = g.name if g.name else f"Grafo {g.id}"
            results.append({
                "name": name,
                "id": g.id,
                "date": 0  # El modelo actual no tiene campo de fecha
            })
            
        return JsonResponse(results, safe=False)
    except users.DoesNotExist:
        return HttpResponseBadRequest("Usuario no encontrado")
    except Exception as e:
        return HttpResponse(f"Error inesperado: {e}", status=500)

@csrf_exempt
def delete_node(request: HttpRequest):
    """
    Endpoint para eliminar un nodo, su archivo parquet asociado y sus relaciones.
    Recibe: user_id, graph_id, node_id.
    """
    if request.method not in ["POST", "DELETE"]:
        return HttpResponseBadRequest("Método no permitido")

    try:
        if request.content_type == 'application/json':
            body = json.loads(request.body)
            user_id = body.get("user_id")
            graph_id = body.get("graph_id")
            node_id = body.get("node_id")
        else: # Soporte para form-data
            user_id = request.POST.get("user_id")
            graph_id = request.POST.get("graph_id")
            node_id = request.POST.get("node_id")

        if not all([user_id, graph_id, node_id]):
            return HttpResponseBadRequest("Faltan parámetros obligatorios: user_id, graph_id, node_id")

        # Validar existencia de los objetos
        user = users.objects.get(id=user_id)
        graph = graphs.objects.get(id=graph_id, id_user=user)
        node = nodes.objects.get(id=node_id, graph=graph)
        
        # 1. Eliminar archivo parquet de S3
        node_parquet_path = f"{user_id}/{graph_id}/{node.node_name}.parquet"
        try:
            delete_parquet_s3(node_parquet_path)
        except FileNotFoundError:
            # Si el archivo no existe, no es un error fatal.
            # Se podría loggear este evento.
            print(f"Archivo no encontrado, continuando con la eliminación: {node_parquet_path}")
            pass

        # 2. Eliminar el nodo de la base de datos.
        # Gracias al `on_delete=models.CASCADE` en el modelo `edge`,
        # todas las aristas relacionadas con este nodo se eliminarán automáticamente.
        node.delete()

        return HttpResponse(status=204)

    except (users.DoesNotExist, graphs.DoesNotExist, nodes.DoesNotExist):
        return HttpResponseBadRequest("Usuario, grafo o nodo no encontrado")
    except json.JSONDecodeError:
        return HttpResponseBadRequest("Cuerpo de la solicitud JSON inválido")
    except Exception as e:
        return HttpResponse(f"Error inesperado: {e}", status=500)

@csrf_exempt
def delete_edge(request : HttpRequest):
    if request.method not in ["POST", "DELETE"]:
      return HttpResponseBadRequest("Método no permitido")
    if request.content_type == 'application/json':
        body = json.loads(request.body)
        user_id = body.get("user_id")
        graph_id = body.get("graph_id")
        #edge_id = body.get("edge_id")
        from_node_id = body.get("from_node_id")
        to_node_id = body.get("to_node_id")
    else: # Soporte para form-data
        user_id = request.POST.get("user_id")
        graph_id = request.POST.get("graph_id")
        #edge_id = request.POST.get("edge_id")
        from_node_id = request.POST.get("from_node_id")
        to_node_id = request.POST.get("to_node_id")
    if not all([user_id, graph_id, from_node_id, to_node_id]):
        return HttpResponseBadRequest(f"Faltan parámetros obligatorios: {[user_id, graph_id, from_node_id, to_node_id]}")
    user = users.objects.get(id=user_id)
    graph = graphs.objects.get(id=graph_id, id_user=user)
    from_node_id = nodes.objects.get(id=from_node_id, graph=graph)
    to_node_id = nodes.objects.get(id=to_node_id, graph=graph)
    edge_selected = edge.objects.get(Q(Q(from_node=from_node_id) & Q(to_node=to_node_id)) | Q(Q(from_node=to_node_id) & Q(to_node=from_node_id)))
    edge_selected.delete()
    return HttpResponse(status=204)
