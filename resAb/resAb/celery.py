import logging
import os

logger = logging.getLogger(__name__)


def _half(val: str | None) -> str:
    if not val:
        return "(no definida)"
    half = len(val) // 2
    return val[:half] + "…"


# ── 1. Configurar Django antes de todo ────────────────────────────────────────
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'resAb.settings')

print("[CELERY STARTUP] Iniciando celery.py — configurando DJANGO_SETTINGS_MODULE")

from celery import Celery
from celery.signals import worker_ready, worker_init, setup_logging

app = Celery('resAb')

print("[CELERY STARTUP] Cargando config desde django.conf:settings (namespace=CELERY)")
app.config_from_object('django.conf:settings', namespace='CELERY')

print("[CELERY STARTUP] Ejecutando autodiscover_tasks")
app.autodiscover_tasks()
print("[CELERY STARTUP] autodiscover_tasks completo")


# ── 2. Log de variables de entorno al iniciar el worker ───────────────────────
ENV_VARS_TO_CHECK = [
    'DJANGO_SETTINGS_MODULE',
    'CELERY_BROKER_URL',
    'CELERY_RESULT_BACKEND',
    'DATABASE_NAME',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
    'DATABASE_HOST',
    'DATABASE_PORT',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'MINIO_ENDPOINT_URL',
    'api_key_openai',
    'DJANGO_SECRET_KEY',
    'DEBUG',
]


def _log_env_vars(prefix: str = ""):
    tag = f"[CELERY ENV{' ' + prefix if prefix else ''}]"
    print(f"{tag} ── Variables de entorno (primera mitad del valor) ──")
    for var in ENV_VARS_TO_CHECK:
        val = os.getenv(var)
        print(f"{tag}   {var} = {_half(val)}")
    print(f"{tag} ── Fin variables ──")


# Log en tiempo de importación (cuando el worker arranca y carga el módulo)
_log_env_vars("IMPORT TIME")


@worker_init.connect
def on_worker_init(sender=None, **kwargs):
    print("[CELERY SIGNAL] worker_init disparado — Django aún no está completamente listo")
    _log_env_vars("worker_init")


@worker_ready.connect
def on_worker_ready(sender=None, **kwargs):
    print("[CELERY SIGNAL] worker_ready disparado — worker listo para recibir tareas")
    _log_env_vars("worker_ready")

    # Verificar conexión a la BD
    try:
        from django.db import connection
        connection.ensure_connection()
        print("[CELERY SIGNAL] Conexión a PostgreSQL: OK")
    except Exception as exc:
        print(f"[CELERY SIGNAL] ERROR al conectar a PostgreSQL: {exc}")

    # Verificar broker
    try:
        inspect = app.control.inspect(timeout=3)
        print(f"[CELERY SIGNAL] Broker URL configurada: {_half(app.conf.broker_url)}")
    except Exception as exc:
        print(f"[CELERY SIGNAL] ERROR inspeccionando broker: {exc}")
