from django.db import models

# Create your models here.
class Usuario(models.Model):
    usuario = models.CharField(max_length=50, null=False, unique=True)
    password = models.CharField(max_length=50, null=False)

class Arbol(models.Model):
    archivo_parquet = models.CharField(max_length=100, null=False, unique=True)
    id_usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE) 
    text_column = models.CharField(max_length=60, null=False, default="")
    id_column_data = models.CharField(max_length=20, null=False, default="")
    tree_structure = models.JSONField(null=True, default=dict)