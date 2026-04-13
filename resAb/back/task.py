import logging
import os
import polars as pl
from celery import shared_task
from .models import Graphs, Data

logger = logging.getLogger(__name__)


def _half(val: str | None) -> str:
    if not val:
        return "(no definida)"
    half = len(val) // 2
    return val[:half] + "…"


@shared_task(bind=True, max_retries=0)
def process_graph(self, graph_pk: int):
    """
    Pipeline completo de procesamiento de un grafo:
    1. Lee raw.parquet desde MinIO
    2. Genera embeddings via OpenAI
    3. Guarda embedding.parquet en MinIO
    4. Bulk-inserta registros Data en PostgreSQL
    5. Actualiza graph.status a 'done'
    En caso de error, marca graph.status como 'failed'.
    """
    task_id = self.request.id
    logger.info(f"[TASK START] process_graph iniciada | graph_pk={graph_pk} | task_id={task_id}")
    print(f"[TASK START] process_graph iniciada | graph_pk={graph_pk} | task_id={task_id}")

    # Log env vars relevantes para esta tarea
    logger.info(f"[TASK ENV] AWS_ACCESS_KEY_ID={_half(os.getenv('AWS_ACCESS_KEY_ID'))}")
    logger.info(f"[TASK ENV] AWS_SECRET_ACCESS_KEY={_half(os.getenv('AWS_SECRET_ACCESS_KEY'))}")
    logger.info(f"[TASK ENV] MINIO_ENDPOINT_URL={_half(os.getenv('MINIO_ENDPOINT_URL', 'http://localhost:9000'))}")
    logger.info(f"[TASK ENV] api_key_openai={_half(os.getenv('api_key_openai'))}")
    logger.info(f"[TASK ENV] DATABASE_HOST={_half(os.getenv('DATABASE_HOST'))}")
    logger.info(f"[TASK ENV] DATABASE_NAME={_half(os.getenv('DATABASE_NAME'))}")

    from .embeddings import get_embeddings_main
    import s3fs
    import pyarrow.parquet as pq

    logger.info("[TASK IMPORT] Imports de embeddings, s3fs y pyarrow completados")

    BUCKET = "user-graphs"

    # ── Paso 0: obtener el grafo de la BD ─────────────────────────────────────
    logger.info(f"[TASK PASO 0] Buscando Graphs pk={graph_pk} en BD")
    try:
        graph = Graphs.objects.get(pk=graph_pk)
        logger.info(f"[TASK PASO 0] Grafo encontrado: id_user={graph.id_user_id}, "
                    f"text_column={graph.text_column}, id_column={graph.id_column}, "
                    f"status={graph.status}")
    except Graphs.DoesNotExist:
        logger.error(f"[TASK PASO 0] ERROR: Graphs pk={graph_pk} no encontrado en BD")
        return

    try:
        # ── Paso 1: conectar a MinIO ───────────────────────────────────────────
        logger.info("[TASK PASO 1] Creando s3fs.S3FileSystem para MinIO")
        minio_url = os.getenv("MINIO_ENDPOINT_URL", "http://localhost:9000")
        logger.info(f"[TASK PASO 1] endpoint_url={minio_url}")
        fs_local = s3fs.S3FileSystem(
            key=os.getenv("AWS_ACCESS_KEY_ID"),
            secret=os.getenv("AWS_SECRET_ACCESS_KEY"),
            client_kwargs={"endpoint_url": minio_url},
        )
        logger.info("[TASK PASO 1] s3fs.S3FileSystem creado OK")

        base = f"{graph.id_user_id}/{graph_pk}"
        raw_path = f"{BUCKET}/{base}/raw.parquet"
        logger.info(f"[TASK PASO 1] Leyendo raw.parquet desde: {raw_path}")

        # ── Paso 2: leer raw.parquet ───────────────────────────────────────────
        with fs_local.open(raw_path, 'rb') as f:
            data = pl.read_parquet(f)
        logger.info(f"[TASK PASO 2] raw.parquet leído OK — shape={data.shape}, columnas={data.columns}")

        # ── Paso 3: generar embeddings ─────────────────────────────────────────
        id_col_arg = graph.id_column if graph.id_column != "ID" else None
        logger.info(f"[TASK PASO 3] Generando embeddings | text_column={graph.text_column} | ID_column={id_col_arg}")
        emb_df = get_embeddings_main(data, text_column=graph.text_column, ID_column=id_col_arg)
        logger.info(f"[TASK PASO 3] Embeddings generados OK — shape={emb_df.shape}")

        # ── Paso 4: guardar embedding.parquet en MinIO ────────────────────────
        emb_path = f"{BUCKET}/{base}/embedding.parquet"
        logger.info(f"[TASK PASO 4] Guardando embedding.parquet en: {emb_path}")
        with fs_local.open(emb_path, 'wb') as f:
            pq.write_table(emb_df.to_arrow(), f)
        logger.info("[TASK PASO 4] embedding.parquet guardado en MinIO OK")

        # ── Paso 5: bulk insert en PostgreSQL ─────────────────────────────────
        logger.info(f"[TASK PASO 5] Preparando bulk_create de {len(emb_df)} registros Data")
        rows = [
            Data(
                id_data=row['ID'],
                embedding=list(row['embedding']),
                graph=graph,
            )
            for row in emb_df.iter_rows(named=True)
        ]
        logger.info(f"[TASK PASO 5] Ejecutando bulk_create (batch_size=500)")
        Data.objects.bulk_create(rows, batch_size=500)
        logger.info(f"[TASK PASO 5] bulk_create completado OK — {len(rows)} registros insertados")

        # ── Paso 6: actualizar status ──────────────────────────────────────────
        logger.info(f"[TASK PASO 6] Actualizando graph.status a 'done'")
        graph.status = 'done'
        graph.task_id = None
        graph.save(update_fields=['status', 'task_id'])
        logger.info(f"[TASK DONE] process_graph finalizada exitosamente | graph_pk={graph_pk}")

    except Exception as exc:
        logger.exception(f"[TASK ERROR] process_graph falló en graph_pk={graph_pk}: {exc}")
        print(f"[TASK ERROR] process_graph falló en graph_pk={graph_pk}: {exc}")
        Graphs.objects.filter(pk=graph_pk).update(status='failed', task_id=None)
        raise
