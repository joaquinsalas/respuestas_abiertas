from celery import Celery
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'resAb.settings')
app = Celery('resAb')

app.config_from_object('django.conf:settings', namespace='CELERY')

app.autodiscover_tasks()