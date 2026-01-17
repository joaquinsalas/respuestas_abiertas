from django.shortcuts import render
from django.http import HttpResponse, HttpRequest, HttpResponseNotFound
from back_resAb.tree import Tree
from .models import Usuario, Arbol
from datetime import datetime
import s3fs, pyarrow, os
import pandas as pd
from django.views.decorators.csrf import csrf_exempt
BUCKET = "user-trees"

def save_or_update_tree_s3(path : str, data : pd.DataFrame):
    fs = s3fs.S3FileSystem(
    key=os.getenv("AWS_ACCESS_KEY_ID"),
    secret=os.getenv("AWS_SECRET_ACCESS_KEY"),
    client_kwargs={
        "endpoint_url": "http://localhost:9000"
    })
    id_usuario = path.split('/')[0]
    if not fs.exists(BUCKET):
        fs.mkdir(BUCKET)
    full_path = f"{BUCKET}/{path}"
    data.to_parquet(
        path=full_path,
        engine="pyarrow",
        filesystem=fs,
        index=False,
    )

@csrf_exempt
def new_tree(request : HttpRequest):
    """
        Almacena un objeto en minio con los siguientes valores columnares
        ID
        texto
        embedding
        nodo
        nodo_history
        y los asocia a un usuario
    """
    id_usuario :str = request.GET.get('id_usuario')
    text_column = request.GET.get('text')
    id_column = request.GET.get('id_column', None)
    csv_file = request.FILES.get('csv')
    if not csv_file:
        return HttpResponseNotFound("Archivo CSV no proporcionado")
    df = pd.read_csv(csv_file)
    try:
        usuario : Usuario = Usuario.objects.get(id=id_usuario)
    except Usuario.DoesNotExist:
        return HttpResponseNotFound("Usuario no encontrado")
    parquet_path = f"{id_usuario.strip()}/{datetime.now().strftime("%Y%m%d_%H%M%S")}.parquet"
    id_data_column = "id_data" if id_column is None else id_column
    if id_column is not None: #si el usuario indico la columna que se usara como identificador
        df2 = df[[id_column,text_column]]
        df2["id_node"] = 0
        df2["history_nodes"] = [[0] for _ in range(len(df2))]
        save_or_update_tree_s3(parquet_path, df2)
    else:
        print(text_column)
        print(df.head())
        df2 = df[[text_column]]
        df2["id_data"] = range(len(df2))
        df2["id_node"] = 0
        df2["history_nodes"] = [[0] for _ in range(len(df2))]
        save_or_update_tree_s3(parquet_path, df2)
    arbol = Arbol(archivo_parquet=parquet_path, id_usuario=usuario,text_column=text_column, id_column_data =id_data_column, tree_structure={0: []})
    arbol.save()
    return HttpResponse("hola gente hermosa")
