from django.shortcuts import render
from django.http import HttpResponse, HttpRequest, HttpResponseNotFound
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

def name_parquet_file(id_usuario : int, id_tree : int, id_node :int ) -> str:
    """
        el id_tree = 0 sera asignado por defecto cuando no conozcamos el id del arbol
    """
    return f"{id_usuario}/{id_tree}/{id_node}.parquet"

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
    id_usuario :int = int(request.GET.get('id_usuario'))
    text_column = request.GET.get('text')
    id_column = request.GET.get('id_column', None)
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
    print(df.head())
    save_or_update_tree_s3(parquet_path, df)
    return HttpResponse("hola gente hermosa")

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
    #creamos un arbol temporal para modificar la estructura con los datos provenientes de miniIO
    #solo obtengo el archivo parquet del nodo padre
    path_parquet_target = f"{BUCKET}/{name_parquet_file(id_usuario=arbol.id_usuario.pk, id_tree=arbol.pk, id_node=parent_node)}"
    print(path_parquet_target)
    dataframe_parquet = pd.read_parquet(path=path_parquet_target, filesystem=fs, engine="pyarrow")
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
    # actualizar la estructura del árbol en la base de datos
    arbol.tree_structure = tree.tree_structure
    arbol.save()
    return HttpResponse("Ramas creadas exitosamente")