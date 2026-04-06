from django.db import models
from django.contrib.auth.hashers import make_password, check_password as _check_password
from pgvector.django import VectorField

# Create your models here.
class Users(models.Model):
    name = models.CharField(max_length=255)
    password = models.CharField(max_length=255)

    @property
    def is_authenticated(self):
        return True

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return _check_password(raw_password, self.password)

class Graphs(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('done',    'Done'),
        ('failed',  'Failed'),
    ]

    file_data_path = models.CharField(max_length=255)
    id_user = models.ForeignKey(Users, on_delete=models.CASCADE)
    text_column = models.CharField(max_length=50, null=False, default="")
    id_column = models.CharField(max_length=20, null=False, default="")
    name = models.CharField(max_length=100, null=False)
    task_id = models.CharField(max_length=255, null=True, blank=True)
    status  = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')

class Nodes(models.Model): #nodes o categorias son lo mismo
    node_name = models.CharField(max_length=255, null=False)
    graph     = models.ForeignKey(Graphs, on_delete=models.CASCADE)
    pos_x     = models.FloatField(null=True, blank=True)
    pos_y     = models.FloatField(null=True, blank=True)

class Data(models.Model):
    id_data = models.CharField(max_length=20, null=False)
    embedding = VectorField(dimensions=1536, null=True)
    block = models.BooleanField(null=False, default=False)
    graph = models.ForeignKey(Graphs, on_delete=models.CASCADE)
    nodes = models.ManyToManyField(
        Nodes,
        through='Nodes_Category', 
        blank=True
    )

    class Meta:
        indexes = [
            models.Index(
                fields=['graph'],
                name='idx_data_graph'
            )
        ]

class Nodes_Category(models.Model):
    node = models.ForeignKey(Nodes, on_delete=models.CASCADE)
    data = models.ForeignKey(Data, on_delete=models.CASCADE)

    class Meta:
        unique_together = [('node', 'data')]  # evita duplicados
        indexes = [
            models.Index(fields=['data'], name='idx_nc_data'),
            models.Index(fields=['node'], name='idx_nc_node'),
        ]

class Relationship(models.Model):
    type         = models.CharField(max_length=255, null=False)
    color        = models.CharField(max_length=20, default='#6366f1')
    is_dashed    = models.BooleanField(default=False)
    direction    = models.CharField(max_length=20, default='forward')  # forward | backward | both
    stroke_width = models.IntegerField(default=2)
    is_global    = models.IntegerField(default=0)  # 1 = disponible en todos los grafos del user
    graph        = models.ForeignKey(Graphs, on_delete=models.CASCADE, null=True, blank=True)
    id_user      = models.ForeignKey(Users, on_delete=models.CASCADE, null=True, blank=True)

class Edge(models.Model):
    from_node = models.ForeignKey(Nodes, on_delete=models.CASCADE, related_name="from_node")
    to_node = models.ForeignKey(Nodes, on_delete=models.CASCADE, related_name="to_node")
    relation = models.ForeignKey(Relationship, on_delete=models.CASCADE)
    class Meta:
        # Evita que existan dos relaciones idénticas del mismo tipo entre los mismos nodos
        unique_together = ('from_node', 'to_node', 'relation')