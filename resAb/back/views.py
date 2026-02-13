import pandas as pd
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse, HttpRequest, HttpResponseBadRequest
import s3fs, os
from .embeddings import get_embeddings_main
from .models import users, graphs
import numpy as np
from math import sqrt


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

import json
from django.http import (
    HttpRequest,
    JsonResponse,
    HttpResponseBadRequest,
)
from .models import users

def get_similar_embeddings(target_embedding : np.ndarray, embeddings_df : pd.DataFrame, min_similarity = 0.8) -> pd.DataFrame:
    embeddings_matrix = np.vstack(embeddings_df['embedding'].values)
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

    if not user_id:
        return HttpResponseBadRequest("user_id es requerido")

    if not text_column:
        return HttpResponseBadRequest("text_column es requerido")

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
    graph = graphs(id_user=user)
    graph.save()
    pk = graph.pk
    BASE_PATH = f"{user_id}/{pk}"
    data = pd.read_csv(file) #type: ignore 
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
    user_id = request.POST.get("user_id")
    graph_id = request.POST.get("graph_id")
    target_id = request.POST.get("target_id") # ID del embedding de referencia
    min_sim = float(request.POST.get("min_similarity", 0.8))
    
    try:
        user = users.objects.get(id=user_id)
        graph = graphs.objects.get(id_user=user, id=graph_id)
    except users.DoesNotExist or graphs.DoesNotExist:
        HttpResponseBadRequest("usuario o grafo no existe")
    
    # Cargar embeddings desde S3
    path = f"{user_id}/{graph_id}/embedding.parquet"
    id_column = graph.id_column
    embeddings_df = read_tree_s3(path)
    print(f"tipo del embedding {type(embeddings_df['ID'][0])} y tipo valor recibido {type(target_id)}")
    # Obtener embedding objetivo
    target_row = embeddings_df[embeddings_df[id_column] == int(target_id)] #se tiene que manejar escenario donde el id es texto
    if target_row.empty:
        return HttpResponseBadRequest("ID no encontrado")
    
    target_embedding = target_row.iloc[0]['embedding']
    
    # Buscar similares
    similares = get_similar_embeddings(
        target_embedding=target_embedding,
        embeddings_df=embeddings_df.drop(id_column, axis=1), # votar columna ID
        min_similarity=min_sim
    )
    
    # Cargar datos originales para mostrar texto
    data_path = f"{user_id}/{graph_id}/data.parquet"
    original_data = read_tree_s3(data_path)
    
    # Merge con datos originales
    result = similares.merge(original_data, on='ID', how='left')
    
    return JsonResponse({
        "count": len(result),
        "results": result.to_dict(orient='records')
    })

def name_new_analysis(id_user : int, id_graph) -> str:
    return f"{str(id_user)}/{str(id_graph)}.parquet"

def index(request : HttpRequest) -> HttpResponse:
    archivo = request.FILES.get('archivo')
    if archivo:
        print(f"Archivo recibido: {archivo.name}")
    return render(request, 'resAb/index.html')