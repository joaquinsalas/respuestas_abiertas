import logging
import os
import polars as pl
from celery import shared_task
from .models import Graphs, Data

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def process_graph(self, graph_pk: int):
    """
    Pipeline completo de procesamiento de un grafo:
    1. Lee raw.csv desde MinIO
    2. Genera embeddings via OpenAI
    3. Guarda embedding.parquet en MinIO
    4. Bulk-inserta registros Data en PostgreSQL
    5. Actualiza graph.status a 'done'
    En caso de error, marca graph.status como 'failed'.
    """
    from .embeddings import get_embeddings_main
    import s3fs
    import pyarrow.parquet as pq

    BUCKET = "user-graphs"

    try:
        graph = Graphs.objects.get(pk=graph_pk)
    except Graphs.DoesNotExist:
        logger.error(f"process_graph: Graphs pk={graph_pk} no encontrado")
        return

    try:
        fs_local = s3fs.S3FileSystem(
            key=os.getenv("AWS_ACCESS_KEY_ID"),
            secret=os.getenv("AWS_SECRET_ACCESS_KEY"),
            client_kwargs={"endpoint_url": os.getenv("MINIO_ENDPOINT_URL", "http://localhost:9000")},
        )
        base = f"{graph.id_user_id}/{graph_pk}"

        # 1. Leer datos desde MinIO
        with fs_local.open(f"{BUCKET}/{base}/raw.parquet", 'rb') as f:
            data = pl.read_parquet(f)

        # 2. Generar embeddings (ID_column=None cuando usamos la columna sintética "ID")
        id_col_arg = graph.id_column if graph.id_column != "ID" else None
        emb_df = get_embeddings_main(data, text_column=graph.text_column, ID_column=id_col_arg)
        # emb_df columnas: 'embedding' (np.ndarray float32), 'ID' (str)

        # 3. Guardar embedding.parquet en MinIO usando fs_local (fork-safe)
        with fs_local.open(f"{BUCKET}/{base}/embedding.parquet", 'wb') as f:
            pq.write_table(emb_df.to_arrow(), f)

        # 4. Bulk insert en PostgreSQL
        rows = [
            Data(
                id_data=row['ID'],
                embedding=list(row['embedding']),
                graph=graph,
            )
            for row in emb_df.iter_rows(named=True)
        ]
        Data.objects.bulk_create(rows, batch_size=500)

        # 5. Marcar exitoso
        graph.status = 'done'
        graph.task_id = None
        graph.save(update_fields=['status', 'task_id'])

    except Exception as exc:
        logger.exception(f"process_graph failed para graph_pk={graph_pk}: {exc}")
        Graphs.objects.filter(pk=graph_pk).update(status='failed', task_id=None)
        raise
