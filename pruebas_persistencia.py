import s3fs
from dotenv import load_dotenv
import os


load_dotenv()

fs = s3fs.S3FileSystem(
    key=os.getenv("AWS_ACCESS_KEY_ID"),
    secret=os.getenv("AWS_SECRET_ACCESS_KEY"),
    client_kwargs={
        "endpoint_url": "http://localhost:9000"
    }
)

BUCKET_NAME = "mangos"
if not fs.exists(BUCKET_NAME):
    fs.mkdir(BUCKET_NAME)
    print("creando bucket")

import pandas as pd

df = pd.DataFrame({
    "user_id": [1, 2, 3],
    "score": [0.82, 0.91, 0.76],
    "label": ["A", "B", "C"]
})

print(df)
path = f"{BUCKET_NAME}/experiment_01.parquet"

df.to_parquet(
    path,
    engine="pyarrow",
    filesystem=fs,
    index=False
)

print(fs.ls(BUCKET_NAME))

df_loaded = pd.read_parquet(
    path=f"{BUCKET_NAME}/experiment_01.parquet",
    engine="pyarrow",
    filesystem=fs
)

print(df_loaded)