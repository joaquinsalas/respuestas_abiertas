import pandas as pd
from django.shortcuts import render
from django.http import HttpResponse, HttpRequest
import s3fs, os

# Create your views here.
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

def name_new_analysis(id_user : int, id_graph) -> str:
    return f"{str(id_user)}/{str(id_graph)}.parquet"

def index(request : HttpRequest) -> HttpResponse:
    archivo = request.FILES.get('archivo')
    if archivo:
        print(f"Archivo recibido: {archivo.name}")
    return render(request, 'resAb/index.html')