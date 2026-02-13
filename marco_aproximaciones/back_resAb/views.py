from django.shortcuts import render
from django.http import HttpResponse, HttpRequest, HttpResponseNotFound, JsonResponse
import json
from back_resAb.tree import Tree
from .models import Usuario, Arbol
from datetime import datetime
import s3fs, os
from .embeddings import get_embeddings_main
import pandas as pd
from django.views.decorators.csrf import csrf_exempt
from .clustering import Cluster
import numpy as np
BUCKET = "user-trees"
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



def name_parquet_file(id_usuario : int, id_tree : int, id_node :int ) -> str:
    """
        el id_tree = 0 sera asignado por defecto cuando no conozcamos el id del arbol
    """
    return f"{id_usuario}/{id_tree}/{id_node}.parquet"

@csrf_exempt
def get_tree_structure(request: HttpRequest):
    """
    Recibe id_usuario e id_arbol y regresa la estructura del árbol (lista de adyacencia)
    """
    id_usuario = request.GET.get('id_usuario')
    id_arbol = request.GET.get('id_arbol')

    if not id_usuario or not id_arbol:
        return JsonResponse({"error": "Faltan parámetros id_usuario e id_arbol"}, status=400)

    try:
        arbol = Arbol.objects.get(id=id_arbol, id_usuario_id=id_usuario)
    except Arbol.DoesNotExist:
        return JsonResponse({"error": "Árbol no encontrado para este usuario"}, status=404)
    for node_str in arbol.tree_structure:
        if int(node_str) != 0:
            arbol.tree_structure[node_str].pop(0)
    return JsonResponse(arbol.tree_structure, safe=True)

@csrf_exempt
def get_node_data(request: HttpRequest):
    """
    Recibe id_usuario, id_arbol, id_node y opcionalmente page.
    Regresa los datos del nodo de 10 en 10.
    """
    id_usuario = request.GET.get('id_usuario')
    id_arbol = request.GET.get('id_arbol')
    id_node = request.GET.get('id_node')
    page = int(request.GET.get('page', 0))
    page_size = 10

    if not all([id_usuario, id_arbol, id_node]):
        return JsonResponse({"error": "Faltan parámetros id_usuario, id_arbol o id_node"}, status=400)

    path = name_parquet_file(id_usuario, id_arbol, id_node)
    full_path = f"{BUCKET}/{path}"

    if not fs.exists(full_path):
        return JsonResponse({"error": f"El archivo {full_path} no existe"}, status=404)
    try:
        arbol = Arbol.objects.get(id=id_arbol)
    except Arbol.DoesNotExist:
        return JsonResponse({"error": "Árbol no encontrado"}, status=404)
    df = read_tree_s3(path)
    start = page * page_size
    end = start + page_size
    
    data_paginated : pd.DataFrame = df.iloc[start:end]
    data_paginated : list = data_paginated[arbol.text_column].to_list()
    print(type(data_paginated))
    return JsonResponse({
        "data": data_paginated,
        "total_rows": len(df),
        "page": page,
        "page_size": page_size
    })


@csrf_exempt
def get_trees(request: HttpRequest):
    """
    Recibe un id_usuario y regresa una lista de arboles
    """
    id_usuario = request.GET.get('id_usuario')
    if not id_usuario:
        return JsonResponse({"error": "Falta parametro id_usuario"}, status=400)
    
    try:
        usuario = Usuario.objects.get(id=id_usuario)
    except Usuario.DoesNotExist:
        return JsonResponse({"error": "Usuario no encontrado"}, status=404)

    arboles = Arbol.objects.filter(id_usuario=usuario)
    data = []
    for arbol in arboles:
        data.append({
            "id": arbol.id,
            "tree_structure": arbol.tree_structure,
            "text_column": arbol.text_column,
            "archivo_parquet": arbol.archivo_parquet
        })
    return JsonResponse(data, safe=False)

@csrf_exempt
def new_tree(request : HttpRequest):
    """
        Recibe un archivo CSV con una columna de texto y opcionalmente una columna ID
        genera los embeddings para la columna de texto
        crea un nuevo árbol en la base de datos
        Almacena un objeto en minio con los siguientes valores columnares
        ID
        texto
        embedding
        nodo
        nodo_history
        y los asocia a un usuario
    """
    id_usuario :int = int(request.POST.get('id_usuario'))
    text_column = request.POST.get('text')
    id_column = request.POST.get('id_column', None)
    csv_file = request.FILES.get('csv')
    if not csv_file:
        return HttpResponseNotFound("Archivo CSV no proporcionado")
    df = pd.read_csv(csv_file)
    df_embeddings = get_embeddings_main(df, text_column, id_column)
    #df incluye las columnas originales mas la columna de embeddings excluyendo la columna ID si es que fue proporcionada
    df = pd.concat([df, df_embeddings.drop(columns=[id_column] if id_column else ["ID"])], axis=1)
    try:
        usuario : Usuario = Usuario.objects.get(id=id_usuario)
    except Usuario.DoesNotExist:
        return HttpResponseNotFound("Usuario no encontrado")
    
    #guardando meta información del arbol para recrearlo en cualquier momento
    id_data_column = "id_data" if id_column is None else id_column
    parquet_path = name_parquet_file(id_usuario=id_usuario, id_tree=0, id_node=0)
    arbol = Arbol(archivo_parquet=parquet_path, id_usuario=usuario,text_column=text_column, id_column_data =id_data_column, tree_structure={0: []})
    arbol.save()
    parquet_path = name_parquet_file(id_usuario=id_usuario, id_tree=arbol.pk, id_node=0)
    arbol.archivo_parquet = parquet_path
    arbol.save()
    ################################################################

    if id_column is not None: #si el usuario indico la columna que se usara como identificador
        df = df.rename(columns={id_column: "id_data"})
        
    else:
        df["id_data"] = range(len(df))
    df["id_node"] = 0 
    df["history_nodes"] = [[0] for _ in range(len(df))]
    save_or_update_tree_s3(parquet_path, df)
    return JsonResponse({"message": "Arbol creado exitosamente", "id_arbol": arbol.pk})

def normalized_keys(d: dict) -> dict:
    """ Normaliza las claves de un diccionario a enteros """
    return {int(k): v for k, v in d.items()}

def new_clusters(embeddings: pd.DataFrame, n_clusters: int) -> np.ndarray:
    """ Genera nuevos clusters a partir de los embeddings proporcionados 
     los embbedings deben ser un DataFrame sin la columna ID"""
    model_kmeans = Cluster()
    return model_kmeans.generation_n_cluster(n_clusters, embeddings.values)

def new_branches(request : HttpRequest):
    """
        Crea nuevas ramas en el árbol
        los datos asociados al padre son clusterizados y de los grupos resultantes se crean nodos hijos
    """
    id_arbol : int = int(request.GET.get('id_arbol'))
    parent_node : int = int(request.GET.get('id_node'))
    try:
        arbol : Arbol = Arbol.objects.get(id=id_arbol)
    except Arbol.DoesNotExist:
        return HttpResponseNotFound("Árbol no encontrado")
    if str(parent_node) not in arbol.tree_structure:
        return HttpResponseNotFound("Nodo padre no encontrado")
    #creamos un arbol temporal para modificar la estructura con los datos provenientes de miniIO
    #solo obtengo el archivo parquet del nodo padre
    path_parquet_target = f"{BUCKET}/{name_parquet_file(id_usuario=arbol.id_usuario.pk, id_tree=arbol.pk, id_node=parent_node)}"
    try:
        dataframe_parquet = pd.read_parquet(path=path_parquet_target, filesystem=fs, engine="pyarrow")
    except Exception as e:
        return HttpResponseNotFound(f"Error al obtener el archivo parquet del nodo padre {parent_node}, posiblemente el nodo no es una hoja")
    tree = Tree(dataframe_parquet, arbol.id_column_data)
    tree.tree_structure = normalized_keys(arbol.tree_structure) if arbol.tree_structure else {}

    #el id del nodo mayor sera el id_node inicial para las nuevas ramas
    tree.id_node = max(tree.tree_structure.keys()) if tree.tree_structure else 0
    #obtemos los ids en el orden en el que seran clasificados
    data_ids = dataframe_parquet[arbol.id_column_data].values
    if len(data_ids) == 0:
        return HttpResponseNotFound("Nodo padre no tiene datos asociados")
    columns_embeddings = list(range(1536)) #asumiendo que los embeddings son de dimension 1536 del 0 al 1535
    print(dataframe_parquet.head())
    #convertimos las columnas a enteros si es posible
    dataframe_parquet.columns = [
    int(c) if c.isdigit() else c
    for c in dataframe_parquet.columns
    ]

    data_embeddings = dataframe_parquet[columns_embeddings]
    data = new_clusters(data_embeddings, n_clusters=3)
    try:
        tree.new_branches(parent_node, data.tolist(), data_ids.tolist())
    except KeyError as e:
        return HttpResponseNotFound(str(e))
    dataframe_parquet['id_node'] = tree.data['id_node']
    dataframe_parquet['history_nodes'] = tree.data['history_nodes']
    # actualizar el archivo parquet en minio
    for node in tree.data["id_node"].unique():
        #obtengo solo los datos asociados a ese nodo
        df_node = dataframe_parquet[dataframe_parquet["id_node"] == node]
        #creo el path correspondiente
        parquet_path = name_parquet_file(id_usuario=arbol.id_usuario.pk, id_tree=arbol.pk, id_node=node)
        #almaceno el archivo en minio
        save_or_update_tree_s3(parquet_path, df_node)
    #borro el archivo parquet del nodo padre
    fs.delete(f"{BUCKET}/{name_parquet_file(id_usuario=arbol.id_usuario.pk, id_tree=arbol.pk, id_node=parent_node)}")
    # actualizar la estructura del árbol en la base de datos
    arbol.tree_structure = tree.tree_structure
    arbol.save()
    # actualizar la estructura del árbol en la base de datos
    arbol.tree_structure = tree.tree_structure
    arbol.save()
    return JsonResponse({"message": "Ramas creadas exitosamente", "tree_structure": arbol.tree_structure})

@csrf_exempt
def prune_tree(request: HttpRequest):
    """
        Realiza la poda del árbol:
        1. Obtiene el nodo seleccionado y su padre.
        2. Mueve los datos del nodo hijo (y sus descendientes) al archivo parquet del padre.
        3. Elimina los archivos parquet del hijo y descendientes.
        4. Elimina el nodo hijo de la estructura del árbol.
    """
    id_arbol = request.GET.get('id_arbol')
    id_node = request.GET.get('id_node')
    
    if not id_arbol or not id_node:
         return HttpResponseNotFound("Faltan parámetros id_arbol o id_node")
         

    try:
        arbol = Arbol.objects.get(id=id_arbol)
    except Arbol.DoesNotExist:
        return HttpResponseNotFound("Árbol no encontrado")
    if id_node not in arbol.tree_structure:
        return HttpResponseNotFound("Nodo no encontrado")

    id_arbol = int(id_arbol)
    id_node = int(id_node)

    tree = Tree(column_data=arbol.id_column_data, id_node=id_node, main_dataframe=pd.DataFrame(), prune=True)
    tree.tree_structure = normalized_keys(arbol.tree_structure) if arbol.tree_structure else {}
    
    # 1. Obtener padre
    parent_node = tree.get_parent(id_node)
    
    all_childs = tree.get_all_childrens(id_node)
    df_childs = pd.DataFrame()

    #por cada hijo, obtengo el archivo parquet y lo concateno con el dataframe de los hijos
    for child in all_childs:
        path_child = f"{BUCKET}/{name_parquet_file(arbol.id_usuario.pk, arbol.pk, child)}"
        #si no existe el archivo parquet o el nodo no existe en la estructura del árbol, lo omito
        #lo anterior emulando una transacción o todo se hace o nada
        if not fs.exists(path_child) or tree.tree_structure.get(child, None) is None:
            continue
        df_child = pd.read_parquet(path=path_child, filesystem=fs, engine="pyarrow")
        df_childs = pd.concat([df_childs, df_child], ignore_index=True)
        #elimino el nodo hijo de la estructura del árbol
        tree.cut_children(child)
        #elimino el archivo parquet del hijo
        fs.rm(path_child)

    #el dataframe df_childs contiene todos los datos de los hijos
    df_childs['id_node'] = parent_node
    df_childs['history_nodes'] = [[parent_node] for _ in range(len(df_childs))]
    
    #actualizo el archivo parquet del padre
    path_parent = name_parquet_file(arbol.id_usuario.pk, arbol.pk, parent_node)
    full_path_parent = f"{BUCKET}/{path_parent}"
    if fs.exists(full_path_parent):
        df_parent = pd.read_parquet(path=full_path_parent, filesystem=fs, engine="pyarrow")
        df_childs = pd.concat([df_parent, df_childs], ignore_index=True)

    print(path_parent)
    print(df_childs.head())
    save_or_update_tree_s3(path_parent, df_childs)       
            
    arbol.tree_structure = tree.tree_structure
    arbol.save()
    
    return JsonResponse({"message": f"Poda exitosa. Nodo {id_node} y {len(all_childs)} descendientes fusionados al padre {parent_node}.", "tree_structure": arbol.tree_structure})