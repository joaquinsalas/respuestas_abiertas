import pandas as pd
from django.http import HttpResponse
import s3fs, os, random
from .embeddings import get_embeddings_main
from .models import users, graphs, edge, nodes, relationship
import numpy as np
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken


# ---------------------------------------------------------------------------
# S3 helpers
# ---------------------------------------------------------------------------
BUCKET = "user-graphs"
fs = s3fs.S3FileSystem(
    key=os.getenv("AWS_ACCESS_KEY_ID"),
    secret=os.getenv("AWS_SECRET_ACCESS_KEY"),
    client_kwargs={
        "endpoint_url": os.getenv("MINIO_ENDPOINT_URL", "http://localhost:9000")
    })

def save_or_update_tree_s3(path: str, data: pd.DataFrame):
    if not fs.exists(BUCKET):
        fs.mkdir(BUCKET)
    full_path = f"{BUCKET}/{path}"
    data.to_parquet(
        path=full_path,
        engine="pyarrow",
        filesystem=fs,
        index=False,
    )

def read_tree_s3(path: str) -> pd.DataFrame:
    full_path = f"{BUCKET}/{path}"
    if not fs.exists(full_path):
        raise FileNotFoundError(f"El archivo {full_path} no existe en el bucket {BUCKET}")
    data = pd.read_parquet(
        path=full_path,
        engine="pyarrow",
        filesystem=fs,
    )
    return data

def delete_parquet_s3(path: str):
    full_path = f"{BUCKET}/{path}"
    if not fs.exists(full_path):
        raise FileNotFoundError(f"El archivo {full_path} no existe en el bucket {BUCKET}")
    fs.rm(full_path)


# ---------------------------------------------------------------------------
# Similarity helpers
# ---------------------------------------------------------------------------
def get_similar_embeddings(target_embedding: np.ndarray, embeddings_df: pd.DataFrame, min_similarity=0.8) -> pd.DataFrame:
    embeddings_matrix = np.vstack(embeddings_df['embedding'].values)  # type: ignore
    if embeddings_matrix.shape[1] != len(target_embedding):
        raise ValueError(
            f"Dimensiones no coinciden: target={len(target_embedding)}, "
            f"data={embeddings_matrix.shape[1]}"
        )
    dot_products = embeddings_matrix @ target_embedding
    target_norm = np.linalg.norm(target_embedding)
    embeddings_norms = np.linalg.norm(embeddings_matrix, axis=1)
    cosine_similarities = dot_products / (embeddings_norms * target_norm)
    mask = cosine_similarities >= min_similarity
    result_df = embeddings_df[mask].copy()
    result_df['similarity'] = cosine_similarities[mask]
    return result_df.sort_values('similarity', ascending=False)


def select_n_random_values(n: int, first: int, last: int) -> list:
    ls = []
    for i in range(n):
        x = random.randint(first, last)
        while x in ls:
            x = random.randint(first, last)
        ls.append(x)
    return ls


def range_cos(min_cos: float, n_opc: int) -> list:
    """Return a list of thresholds dividing [min_cos, 1] into n_opc steps."""
    step = (1 - min_cos) / n_opc
    return [min_cos - step + (step * cos) for cos in range(1, n_opc + 1)]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    name = request.data.get('name')
    password = request.data.get('password')
    if not name or not password:
        return Response({'error': 'name y password son requeridos'}, status=400)
    try:
        user = users.objects.get(name=name)
    except users.DoesNotExist:
        return Response({'error': 'Credenciales inválidas'}, status=401)
    if not user.check_password(password):
        return Response({'error': 'Credenciales inválidas'}, status=401)
    refresh = RefreshToken()
    refresh['user_id'] = user.pk
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {'id': user.pk, 'name': user.name},
    })


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
@api_view(['POST'])
def new_analysis_request(request):
    file = request.FILES.get("file")
    if not file:
        return Response("Archivo es requerido", status=400)

    text_column = request.POST.get("text_column")
    id_column = request.POST.get("id_column", None)
    name = request.POST.get("name")

    if not text_column:
        return Response("text_column es requerido", status=400)
    if not name:
        return Response("name es requerido", status=400)

    user = request.user

    allowed_extensions = ["csv"]
    extension = file.name.split(".")[-1].lower()
    if extension not in allowed_extensions:
        return Response("Formato de archivo no permitido", status=400)

    graph = graphs(id_user=user, name=name)
    graph.save()
    pk = graph.pk
    BASE_PATH = f"{user.pk}/{pk}"
    data = pd.read_csv(file)  # type: ignore
    if id_column is None:
        data['ID'] = [str(i) for i in range(data.shape[0])]
    embedding = get_embeddings_main(data, text_column=text_column, ID_column=id_column)  # type: ignore
    save_or_update_tree_s3(f"{BASE_PATH}/data.parquet", data=data)
    save_or_update_tree_s3(f"{BASE_PATH}/embedding.parquet", data=embedding)
    graph.file_data_path = f"{BASE_PATH}/data.parquet"
    graph.file_embedding_path = f"{BASE_PATH}/embedding.parquet"
    graph.text_column = text_column
    graph.id_column = "ID" if id_column is None else id_column
    graph.graph_structure = {0: []}  # type: ignore
    graph.save()
    return Response({
        "status": "ok",
        "graph_id": pk,
        "filename": file.name,
        "size": file.size,
    })


@api_view(['GET'])
def search_similar(request):
    """Buscar embeddings similares."""
    try:
        graph_id = request.GET.get("graph_id")
        target_id = request.GET.get("target_id")
        min_sim = float(request.GET.get("min_similarity", 0.8))
        is_preanalized = int(request.GET.get('preanalized', 0))
    except Exception as e:
        return Response(f"Error en los datos proporcionados {e}", status=400)

    user = request.user
    try:
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    if is_preanalized == 1:
        tmp_df: pd.DataFrame = read_tree_s3(f"{user.pk}/{graph_id}/temp_emb.parquet")
        data = tmp_df[tmp_df['similarity'] >= min_sim]
        result = data[['similarity', graph.text_column, graph.id_column]]  # type: ignore
    else:
        path = f"{user.pk}/{graph_id}/embedding.parquet"
        id_column = graph.id_column  # type: ignore
        embeddings_df = read_tree_s3(path)
        target_row = embeddings_df[embeddings_df[id_column] == target_id]
        if target_row.empty:
            return Response("ID no encontrado", status=400)
        target_embedding = target_row.iloc[0]['embedding']
        similares = get_similar_embeddings(
            target_embedding=target_embedding,
            embeddings_df=embeddings_df,
            min_similarity=min_sim,
        )
        data_path = f"{user.pk}/{graph_id}/data.parquet"
        original_data = read_tree_s3(data_path)
        result = similares.merge(original_data, on=graph.id_column, how='left')  # type: ignore
        result = result[['similarity', graph.text_column, graph.id_column]]  # type: ignore

    save_or_update_tree_s3(f"{user.pk}/{graph_id}/currentReview.parquet", result)
    return Response({
        "count": len(result),
        "results": result.to_dict('records'),
        "keys": {'id': graph.id_column, 'data': graph.text_column, 'sim': 'similarity'},  # type: ignore
    })


@api_view(['GET'])
def delete_temp_embedding_endpoint(request):
    """Eliminar el tmp_embedding."""
    graph_id = request.GET.get("graph_id")
    if not graph_id:
        return Response("graph_id es requerido", status=400)

    user = request.user
    try:
        graphs.objects.get(id_user=user, id=graph_id)
    except graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    delete_parquet_s3(f"{user.pk}/{graph_id}/temp_emb.parquet")
    return HttpResponse(status=204)


@api_view(['GET'])
def confirm_new_category(request):
    """Confirmar el nuevo nodo/categoría seleccionada."""
    try:
        graph_id = request.GET.get("graph_id")
        name_category = request.GET.get("name")
    except Exception as e:
        return Response(f"Error en los datos proporcionados {e}", status=400)

    user = request.user
    try:
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    new_node = nodes(node_name=name_category, graph=graph)  # type: ignore
    BASE_PATH_USER = f"{user.pk}/{graph_id}"
    save_or_update_tree_s3(
        f"{BASE_PATH_USER}/{name_category}.parquet",
        read_tree_s3(f"{BASE_PATH_USER}/currentReview.parquet"),
    )
    delete_parquet_s3(f"{BASE_PATH_USER}/currentReview.parquet")
    delete_parquet_s3(f"{BASE_PATH_USER}/temp_emb.parquet")
    new_node.save()
    return HttpResponse(status=204)


@api_view(['GET'])
def sample(request):
    """Obtener una muestra del conjunto."""
    try:
        graph_id = request.GET.get("graph_id")
        random_sample = int(request.GET.get("random", 1))
        type_sample = int(request.GET.get("sample", 0))
        sample_size = int(request.GET.get("ss", 5))
        category = request.GET.get("category", None)
        page = int(request.GET.get("page", 1))
        page_size = int(request.GET.get("page_size", 10))
    except Exception as e:
        return Response(f"Error en los datos proporcionados {e}", status=400)

    user = request.user
    try:
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    BASE_PATH = f"{user.pk}/{graph_id}"
    data_to_return = pd.DataFrame()

    if type_sample == 0:
        data = read_tree_s3(f"{BASE_PATH}/data.parquet")  # type: ignore
        size = data.shape[0]
        if random_sample == 1:
            sample_size = sample_size if sample_size < size else size
            list_data_selected = select_n_random_values(sample_size, 0, size - 1)
            data_to_return = data.iloc[list_data_selected]
        else:
            start_index = (page - 1) * page_size
            data_to_return = data.iloc[start_index:start_index + page_size]

    elif type_sample == 1:
        try:
            data = read_tree_s3(f"{BASE_PATH}/{category}.parquet")  # type: ignore
        except Exception:
            return Response("Categoria invalida", status=400)
        size = data.shape[0]
        if random_sample == 1:
            sample_size = sample_size if sample_size < size else size
            list_data_selected: list = select_n_random_values(sample_size, 0, size - 1)
            data_to_return = data.iloc[list_data_selected]
        else:
            start_index = (page - 1) * page_size
            data_to_return = data.iloc[start_index:start_index + page_size]
    else:
        try:
            data = read_tree_s3(f"{BASE_PATH}/currentReview.parquet")  # type: ignore
        except Exception:
            return Response("No hay categoria actual en revisión", status=400)
        size = data.shape[0]
        if random_sample == 1:
            sample_size = sample_size if sample_size < size else size
            list_data_selected = select_n_random_values(sample_size, 0, size - 1)
            data_to_return = data.iloc[list_data_selected]
        else:
            start_index = (page - 1) * page_size
            data_to_return = data.iloc[start_index:start_index + page_size]

    result = data_to_return[[graph.id_column, graph.text_column]].rename(
        columns={graph.id_column: 'id', graph.text_column: 'data'}
    )
    return Response({"data": result.to_dict("records"), "total_items": data.shape[0]})


@api_view(['GET'])
def opc_cut(request):
    try:
        n_opc = int(request.GET.get('n_opc', 3))
        min_cos = float(request.GET.get('min_similarity', 0.85))
        target_id = request.GET.get('target_id')
        graph_id = request.GET.get('graph_id')
    except Exception as e:
        return Response(f"Formato de los datos erroneo {e}", status=400)

    if not (n_opc and min_cos and target_id):
        return Response("Datos incompletos en la solicitud", status=400)

    user = request.user
    try:
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    list_cos = sorted(range_cos(min_cos, n_opc))
    PATH_EMB = f"{user.pk}/{graph_id}/embedding.parquet"
    df_embedding: pd.DataFrame = read_tree_s3(PATH_EMB)
    target_row = df_embedding[df_embedding[graph.id_column] == target_id].iloc[0]['embedding']

    df_embedding_min_cos = get_similar_embeddings(target_row, df_embedding, min_cos)  # type: ignore

    df_data: pd.DataFrame = read_tree_s3(f"{user.pk}/{graph_id}/data.parquet")
    df_embedding_min_cos = df_embedding_min_cos.merge(df_data, on=graph.id_column, how="left")

    save_or_update_tree_s3(f"{user.pk}/{graph_id}/temp_emb.parquet", df_embedding_min_cos)

    answer = []
    for cos in list_cos:
        df_tmp: pd.DataFrame = df_embedding_min_cos[df_embedding_min_cos['similarity'] > cos]
        border = df_tmp.iloc[[-1], [1, 2, 3]].iloc[0].values
        answer.append({'id': border[0], 'data': border[2], 'sim': float(border[1])})
    return Response({'data': answer})


@api_view(['GET'])
def get_categorized_data(request):
    """Obtener todos los datos con sus categorías como CSV."""
    graph_id = request.GET.get("graph_id")
    if not graph_id:
        return Response("graph_id es requerido", status=400)

    user = request.user
    try:
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    BASE_PATH = f"{user.pk}/{graph_id}"
    id_column = graph.id_column
    text_column = graph.text_column

    try:
        main_df = read_tree_s3(f"{BASE_PATH}/data.parquet")
    except FileNotFoundError:
        return Response("El archivo data.parquet no se encontró", status=400)

    main_df['categorias'] = [[] for _ in range(len(main_df))]

    for node in nodes.objects.filter(graph=graph):
        node_name = node.node_name
        try:
            category_df = read_tree_s3(f"{BASE_PATH}/{node_name}.parquet")
            for index, row in category_df.iterrows():
                main_df_index = main_df[main_df[id_column] == row[id_column]].index
                if not main_df_index.empty:
                    main_df.loc[main_df_index[0], 'categorias'].append(node_name)
        except FileNotFoundError:
            print(f"Warning: Category parquet file for node '{node_name}' not found. Skipping.")
            continue
        except Exception as e:
            print(f"Error processing category '{node_name}': {e}")
            continue

    main_df['categorias'] = main_df['categorias'].apply(lambda x: ','.join(x))

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{graph_id}_categorized_data.csv"'
    main_df.to_csv(path_or_buf=response, index=False)
    return response


@api_view(['GET'])
def get_full_graph(request):
    """Obtener la estructura completa de un grafo."""
    graph_id = request.GET.get("graph_id")
    if not graph_id:
        return Response("Falta el parámetro 'graph_id'", status=400)

    user = request.user
    try:
        graph_obj = graphs.objects.get(id=graph_id, id_user=user)
        all_nodes = nodes.objects.filter(graph=graph_obj)
        edges_objs = edge.objects.filter(from_node__in=all_nodes).select_related('from_node', 'to_node', 'relation')

        nodes_list = [{"id": n.id, "name": n.node_name} for n in all_nodes]
        edges_list = [
            {"id": e.id, "source": e.from_node.id, "target": e.to_node.id, "relation_id": e.relation.id}
            for e in edges_objs
        ]

        return Response({"nodes": nodes_list, "edges": edges_list})

    except graphs.DoesNotExist:
        return Response("El grafo no existe o no pertenece al usuario", status=400)
    except Exception as e:
        return Response(f"Error inesperado: {e}", status=500)


@api_view(['POST'])
def add_edge(request):
    """Crear o actualizar una relación entre dos nodos."""
    try:
        graph_id = request.data.get("graph_id")
        node_id_1 = request.data.get("node_id_1")
        node_id_2 = request.data.get("node_id_2")
        connection_type = request.data.get("connection_type")

        if not all([graph_id, node_id_1, node_id_2, connection_type]):
            return Response("Faltan parámetros obligatorios", status=400)

        user = request.user
        try:
            graph_obj = graphs.objects.get(id=graph_id, id_user=user)
        except graphs.DoesNotExist:
            return Response("Grafo no encontrado o no pertenece al usuario", status=400)

        try:
            node1 = nodes.objects.get(id=node_id_1, graph=graph_obj)
            node2 = nodes.objects.get(id=node_id_2, graph=graph_obj)
        except nodes.DoesNotExist:
            return Response("Uno o ambos nodos no encontrados en este grafo", status=400)

        try:
            rel_obj = relationship.objects.get(id=connection_type)
        except relationship.DoesNotExist:
            return Response("Tipo de conexión (relación) no encontrado", status=400)

        edge_obj = edge.objects.filter(from_node=node1, to_node=node2).first()
        if edge_obj:
            edge_obj.relation = rel_obj
            edge_obj.save()
        else:
            edge.objects.create(from_node=node1, to_node=node2, relation=rel_obj)

        return Response("OK", status=200)

    except Exception as e:
        return Response(f"Error inesperado: {e}", status=500)


@api_view(['GET'])
def get_user_graphs(request):
    """Obtener todos los grafos del usuario autenticado."""
    user = request.user
    user_graphs = graphs.objects.filter(id_user=user)
    results = [
        {"name": g.name if g.name else f"Grafo {g.id}", "id": g.id, "date": 0}
        for g in user_graphs
    ]
    return Response(results)


@api_view(['POST', 'DELETE'])
def delete_node(request):
    """Eliminar un nodo, su archivo parquet y sus relaciones."""
    try:
        if request.content_type and 'application/json' in request.content_type:
            graph_id = request.data.get("graph_id")
            node_id = request.data.get("node_id")
        else:
            graph_id = request.POST.get("graph_id")
            node_id = request.POST.get("node_id")

        if not all([graph_id, node_id]):
            return Response("Faltan parámetros obligatorios: graph_id, node_id", status=400)

        user = request.user
        graph = graphs.objects.get(id=graph_id, id_user=user)
        node = nodes.objects.get(id=node_id, graph=graph)

        node_parquet_path = f"{user.pk}/{graph_id}/{node.node_name}.parquet"
        try:
            delete_parquet_s3(node_parquet_path)
        except FileNotFoundError:
            print(f"Archivo no encontrado, continuando: {node_parquet_path}")

        node.delete()
        return HttpResponse(status=204)

    except (graphs.DoesNotExist, nodes.DoesNotExist):
        return Response("Grafo o nodo no encontrado", status=400)
    except Exception as e:
        return Response(f"Error inesperado: {e}", status=500)


@api_view(['POST', 'DELETE'])
def delete_graph(request):
    """Eliminar un grafo, sus datos en S3 y sus registros en BD."""
    graph_id = request.data.get("graph_id")
    if not graph_id:
        return Response("graph_id es requerido", status=400)

    user = request.user
    try:
        graph = graphs.objects.get(id=graph_id, id_user=user)
    except graphs.DoesNotExist:
        return Response("Grafo no encontrado o no pertenece al usuario", status=400)

    s3_path = f"{BUCKET}/{user.pk}/{graph_id}"
    try:
        if fs.exists(s3_path):
            fs.rm(s3_path, recursive=True)
    except Exception as e:
        print(f"Warning: error eliminando S3 path {s3_path}: {e}")

    graph.delete()  # cascade elimina nodos → aristas
    return HttpResponse(status=204)


@api_view(['POST', 'DELETE'])
def delete_edge(request):
    """Eliminar una arista."""
    try:
        if request.content_type and 'application/json' in request.content_type:
            graph_id = request.data.get("graph_id")
            from_node_id = request.data.get("from_node_id")
            to_node_id = request.data.get("to_node_id")
        else:
            graph_id = request.POST.get("graph_id")
            from_node_id = request.POST.get("from_node_id")
            to_node_id = request.POST.get("to_node_id")

        if not all([graph_id, from_node_id, to_node_id]):
            return Response(f"Faltan parámetros obligatorios", status=400)

        user = request.user
        graph = graphs.objects.get(id=graph_id, id_user=user)
        from_node = nodes.objects.get(id=from_node_id, graph=graph)
        to_node = nodes.objects.get(id=to_node_id, graph=graph)
        edge_selected = edge.objects.get(
            Q(Q(from_node=from_node) & Q(to_node=to_node)) |
            Q(Q(from_node=to_node) & Q(to_node=from_node))
        )
        edge_selected.delete()
        return HttpResponse(status=204)

    except (graphs.DoesNotExist, nodes.DoesNotExist, edge.DoesNotExist):
        return Response("Grafo, nodo o arista no encontrado", status=400)
    except Exception as e:
        return Response(f"Error inesperado: {e}", status=500)
