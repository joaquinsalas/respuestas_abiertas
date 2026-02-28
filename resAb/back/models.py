from django.db import models
from django.contrib.auth.hashers import make_password, check_password as _check_password

# Create your models here.
class users(models.Model):
    name = models.CharField(max_length=255)
    password = models.CharField(max_length=255)

    @property
    def is_authenticated(self):
        return True

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return _check_password(raw_password, self.password)

class graphs(models.Model):
    file_data_path = models.CharField(max_length=255)
    file_embedding_path = models.CharField(max_length=255)
    id_user = models.ForeignKey(users, on_delete=models.CASCADE)
    text_column = models.CharField(max_length=50, null=False, default="")
    id_column = models.CharField(max_length=20, null=False, default="")
    name = models.CharField(max_length=100, null=False)

class nodes(models.Model):
    node_name = models.CharField(max_length=255, null=False)
    graph = models.ForeignKey(graphs, on_delete=models.CASCADE)

class relationship(models.Model):
    type = models.CharField(max_length=255, null=False)

class edge(models.Model):
    from_node = models.ForeignKey(nodes, on_delete=models.CASCADE, related_name="from_node")
    to_node = models.ForeignKey(nodes, on_delete=models.CASCADE, related_name="to_node")
    relation = models.ForeignKey(relationship, on_delete=models.CASCADE)
    class Meta:
        # Evita que existan dos relaciones idénticas del mismo tipo entre los mismos nodos
        unique_together = ('from_node', 'to_node', 'relation')