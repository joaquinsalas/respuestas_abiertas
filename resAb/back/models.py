from django.db import models

# Create your models here.
class users(models.Model):
    name = models.CharField(max_length=255)
    password = models.CharField(max_length=255)

class graphs(models.Model):
    file_data_path = models.CharField(max_length=255)
    file_embedding_path = models.CharField(max_length=255)
    id_user = models.ForeignKey(users, on_delete=models.CASCADE)
    text_column = models.CharField(max_length=50, null=False, default="")
    id_column = models.CharField(max_length=20, null=False, default="")
    graph_structure = models.JSONField(null=True, default=dict)