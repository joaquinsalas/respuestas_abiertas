import pandas as pd
from django.http import HttpResponse
import s3fs, os, random
from .embeddings import get_embeddings_main
from .models import Users, Graphs, Edge, Nodes, Relationship, Data, Nodes_Category
import numpy as np
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
import polars as pl
import pyarrow as pa
import pyarrow.parquet as pq
from .task import process_graph
from pgvector.django import CosineDistance

from django.views.decorators.csrf import csrf_exempt

# ---------------------------------------------------------------------------
# S3 helpers
# ---------------------------------------------------------------------------
BUCKET = "user-graphs"
COLUM_COUNT_OCURRENCE = 'selected'
fs = s3fs.S3FileSystem(
    key=os.getenv("AWS_ACCESS_KEY_ID"),
    secret=os.getenv("AWS_SECRET_ACCESS_KEY"),
    client_kwargs={
        "endpoint_url": os.getenv("MINIO_ENDPOINT_URL", "http://localhost:9000")
    })

def save_or_update_tree_s3(path: str, data):
    if not fs.exists(BUCKET):
        fs.mkdir(BUCKET)
    full_path = f"{BUCKET}/{path}"
    table = data.to_arrow() if isinstance(data, pl.DataFrame) else pa.Table.from_pandas(data)
    with fs.open(full_path, 'wb') as f:
        pq.write_table(table, f)

def read_tree_s3(path: str) -> pd.DataFrame:
    full_path = f"{BUCKET}/{path}"
    if not fs.exists(full_path):
        raise FileNotFoundError(f"El archivo {full_path} no existe en el bucket {BUCKET}")
    data = pd.read_parquet(
        path=full_path,
        engine="pyarrow",
        filesystem=fs,
    )
    return data

def read_parquet_s3_pl(path: str) -> pl.DataFrame:
    full_path = f"{BUCKET}/{path}"
    if not fs.exists(full_path):
        raise FileNotFoundError(f"El archivo {full_path} no existe en el bucket {BUCKET}")
    with fs.open(full_path, 'rb') as f:
        return pl.read_parquet(f)

def delete_parquet_s3(path: str):
    full_path = f"{BUCKET}/{path}"
    if not fs.exists(full_path):
        raise FileNotFoundError(f"El archivo {full_path} no existe en el bucket {BUCKET}")
    fs.rm(full_path)


# ---------------------------------------------------------------------------
# Similarity helpers
# ---------------------------------------------------------------------------
def get_similar_embeddings(target_embedding: np.ndarray, embeddings_df: pd.DataFrame, min_similarity=0.8) -> pd.DataFrame:
    embeddings_matrix = np.vstack(embeddings_df['embedding'].values)  # type: ignore
    if embeddings_matrix.shape[1] != len(target_embedding):
        raise ValueError(
            f"Dimensiones no coinciden: target={len(target_embedding)}, "
            f"data={embeddings_matrix.shape[1]}"
        )
    dot_products = embeddings_matrix @ target_embedding
    target_norm = np.linalg.norm(target_embedding)
    embeddings_norms = np.linalg.norm(embeddings_matrix, axis=1)
    cosine_similarities = dot_products / (embeddings_norms * target_norm)
    mask = cosine_similarities >= min_similarity
    result_df = embeddings_df[mask].copy()
    result_df['similarity'] = cosine_similarities[mask]
    return result_df.sort_values('similarity', ascending=False)


def select_n_random_values(n: int, first: int, last: int) -> list:
    ls = []
    for i in range(n):
        x = random.randint(first, last)
        while x in ls:
            x = random.randint(first, last)
        ls.append(x)
    return ls


def range_cos(min_cos: float, n_opc: int) -> list:
    """Return a list of thresholds dividing [min_cos, 1] into n_opc steps."""
    step = (1 - min_cos) / n_opc
    return [min_cos - step + (step * cos) for cos in range(1, n_opc + 1)]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    name = request.data.get('name')
    password = request.data.get('password')
    if not name or not password:
        return Response({'error': 'name y password son requeridos'}, status=400)
    try:
        user = Users.objects.get(name=name)
    except Users.DoesNotExist:
        return Response({'error': 'Credenciales inválidas'}, status=401)
    if not user.check_password(password):
        return Response({'error': 'Credenciales inválidas'}, status=401)
    refresh = RefreshToken()
    refresh['user_id'] = user.pk
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {'id': user.pk, 'name': user.name},
    })


def save_row(row, id_column, graph : Graphs):
    a = Data(id_data = row[id_column], embedding=row['embedding'], graph=graph)
    a.save()

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
@api_view(['POST'])
def new_analysis_request(request):
    file        = request.FILES.get("file")
    text_column = request.POST.get("text_column")
    id_column   = request.POST.get("id_column") or None
    name        = request.POST.get("name")

    if not file:        return Response("Archivo es requerido", status=400)
    if not text_column: return Response("text_column es requerido", status=400)
    if not name:        return Response("name es requerido", status=400)
    if file.name.split(".")[-1].lower() != "csv":
        return Response("Formato de archivo no permitido", status=400)

    try:
        data = pl.read_csv(file)
    except Exception:
        return Response("CSV inválido o corrupto", status=400)

    if text_column not in data.columns:
        return Response(f"Columna '{text_column}' no existe en el CSV", status=400)

    effective_id = id_column or "ID"
    if not id_column:
        data = data.with_columns(pl.Series("ID", [str(i) for i in range(data.shape[0])]))

    user = request.user
    graph = Graphs(
        id_user=user, name=name,
        text_column=text_column, id_column=effective_id,
        file_data_path="", status='pending',
    )
    graph.save()
    base = f"{user.pk}/{graph.pk}"

    try:
        save_or_update_tree_s3(f"{base}/raw.parquet", data)
    except Exception as exc:
        graph.delete()
        return Response(f"Error subiendo archivo: {exc}", status=500)

    graph.file_data_path = f"{base}/raw.parquet"
    result = process_graph.delay(graph.pk)
    graph.task_id = result.id
    graph.save(update_fields=['file_data_path', 'task_id'])

    return Response({"graph_id": graph.pk, "task_id": result.id}, status=202)


@api_view(['GET'])
def analysis_status(request):
    graph_id = request.GET.get("graph_id")
    if not graph_id:
        return Response("graph_id es requerido", status=400)
    try:
        graph = Graphs.objects.get(id_user=request.user, id=graph_id)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=404)
    return Response({"graph_id": graph.pk, "status": graph.status})


@api_view(['GET'])
def search_similar(request):
    """Buscar embeddings similares usando pgvector. Devuelve resultados paginados."""
    try:
        graph_id  = request.GET.get("graph_id")
        target_id = request.GET.get("target_id")
        min_sim   = float(request.GET.get("min_similarity", 0.8))
        page      = int(request.GET.get("page", 1))
        page_size = int(request.GET.get("page_size", 10))
    except Exception as e:
        return Response(f"Error en los datos proporcionados {e}", status=400)

    user = request.user
    try:
        graph = Graphs.objects.get(id_user=user, id=graph_id)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    try:
        target_data = Data.objects.get(graph=graph, id_data=target_id)
    except Data.DoesNotExist:
        return Response("ID no encontrado", status=400)

    max_dist = 1.0 - min_sim  # CosineDistance = 1 - CosineSimilarity

    qs = (
        Data.objects
            .filter(graph=graph, block=False)
            .annotate(dist=CosineDistance('embedding', target_data.embedding))
            .filter(dist__lte=max_dist)
            .order_by('dist')
            .values('id_data', 'dist')
    )

    total = qs.count()
    offset = (page - 1) * page_size
    page_rows = list(qs[offset: offset + page_size])

    if not page_rows:
        return Response({"data": [], "total_items": total})

    page_ids = [r['id_data'] for r in page_rows]
    try:
        raw_df = read_parquet_s3_pl(f"{user.pk}/{graph_id}/raw.parquet")
    except FileNotFoundError:
        return Response("Datos no encontrados", status=404)

    id_to_text = {
        str(row[graph.id_column]): row[graph.text_column]
        for row in raw_df.filter(
            pl.col(graph.id_column).cast(pl.Utf8).is_in(page_ids)
        ).to_dicts()
    }

    in_category_ids = set(
        Data.objects
            .filter(graph=graph, nodes__isnull=False)
            .values_list('id_data', flat=True)
            .distinct()
    )

    result = [
        {
            'id': r['id_data'],
            'data': id_to_text.get(r['id_data'], ''),
            'similarity': round(1.0 - r['dist'], 4),
            'inCategory': 1 if r['id_data'] in in_category_ids else 0,
        }
        for r in page_rows
    ]

    return Response({"data": result, "total_items": total})

@api_view(['GET'])
def delete_temp_embedding_endpoint(request):
    """Eliminar el tmp_embedding."""
    graph_id = request.GET.get("graph_id")
    if not graph_id:
        return Response("graph_id es requerido", status=400)

    user = request.user
    try:
        Graphs.objects.get(id_user=user, id=graph_id)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    delete_parquet_s3(f"{user.pk}/{graph_id}/temp_emb.parquet")
    return HttpResponse(status=204)

@csrf_exempt
def jaja(request):
    print(make_demo.delay(2,2).id)
    return HttpResponse("simon", status=200)

@api_view(['GET'])
def confirm_new_category(request):
    """Confirmar el nuevo nodo/categoría seleccionada."""
    try:
        graph_id      = request.GET.get("graph_id")
        name_category = request.GET.get("name")
        block         = int(request.GET.get('block', 0))
        target_id     = request.GET.get("target_id")
        min_sim       = float(request.GET.get("min_similarity", 0.8))
    except Exception as e:
        return Response(f"Error en los datos proporcionados {e}", status=400)

    user = request.user
    try:
        graph = Graphs.objects.get(id_user=user, id=graph_id)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    if Nodes.objects.filter(node_name=name_category, graph=graph).exists():
        return Response("Categoria ya existente", status=400)

    try:
        target_data = Data.objects.get(graph=graph, id_data=target_id)
    except Data.DoesNotExist:
        return Response("ID de referencia no encontrado", status=400)

    max_dist = 1.0 - min_sim
    matching_ids = list(
        Data.objects
            .filter(graph=graph, block=False)
            .annotate(dist=CosineDistance('embedding', target_data.embedding))
            .filter(dist__lte=max_dist)
            .values_list('id_data', flat=True)
    )

    BASE_PATH_USER = f"{user.pk}/{graph_id}"
    try:
        raw_df = read_parquet_s3_pl(f"{BASE_PATH_USER}/raw.parquet")
    except FileNotFoundError:
        return Response("Datos no encontrados", status=404)

    cat_df = raw_df.filter(pl.col(graph.id_column).cast(pl.Utf8).is_in(matching_ids))
    save_or_update_tree_s3(f"{BASE_PATH_USER}/{name_category}.parquet", cat_df)

    new_node = Nodes(node_name=name_category, graph=graph)
    new_node.save()
    data_qs = Data.objects.filter(graph=graph, id_data__in=matching_ids)
    Nodes_Category.objects.bulk_create(
        [Nodes_Category(node=new_node, data=d) for d in data_qs],
        ignore_conflicts=True,
    )
    if block == 1:
        data_qs.update(block=True)

    return HttpResponse(status=204)


@api_view(['GET'])
def sample(request):
    """Obtener una muestra del conjunto."""
    try:
        graph_id      = request.GET.get("graph_id")
        random_sample = int(request.GET.get("random", 1))
        type_sample   = int(request.GET.get("sample", 0))  # 0=todos, 1=categoría, 2=en revisión
        sample_size   = int(request.GET.get("ss", 5))
        category      = request.GET.get("category", None)
        page          = int(request.GET.get("page", 1))
        page_size     = int(request.GET.get("page_size", 10))
    except Exception as e:
        return Response(f"Error en los datos proporcionados {e}", status=400)

    user = request.user
    try:
        graph = Graphs.objects.get(id_user=user, id=graph_id)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    BASE_PATH = f"{user.pk}/{graph_id}"

    # IDs con al menos una categoría asignada (para calcular inCategory)
    in_category_ids = set(
        Data.objects
            .filter(graph=graph, nodes__isnull=False)
            .values_list('id_data', flat=True)
            .distinct()
    )

    if type_sample == 0:
        unblocked_ids = set(
            Data.objects.filter(graph=graph, block=False)
                        .values_list('id_data', flat=True)
        )
        try:
            df = read_parquet_s3_pl(f"{BASE_PATH}/raw.parquet")
        except FileNotFoundError:
            return Response("Datos no encontrados", status=404)

        df = df.filter(pl.col(graph.id_column).is_in(unblocked_ids))
        size = df.height

        if random_sample == 1:
            df_sample = df.sample(n=min(sample_size, size), shuffle=True)
        else:
            start = (page - 1) * page_size
            df_sample = df.slice(start, page_size)

        df_sample = df_sample.with_columns(
            pl.col(graph.id_column).is_in(in_category_ids).cast(pl.Int8).alias('inCategory')
        )

    elif type_sample == 1:
        try:
            df = read_parquet_s3_pl(f"{BASE_PATH}/{category}.parquet")
        except FileNotFoundError:
            return Response("Categoria invalida", status=400)

        size = df.height
        if random_sample == 1:
            df_sample = df.sample(n=min(sample_size, size), shuffle=True)
        else:
            start = (page - 1) * page_size
            df_sample = df.slice(start, page_size)

    else:  # type_sample == 2
        try:
            df = read_parquet_s3_pl(f"{BASE_PATH}/currentReview.parquet")
        except FileNotFoundError:
            return Response("No hay categoria actual en revisión", status=400)

        size = df.height
        if random_sample == 1:
            df_sample = df.sample(n=min(sample_size, size), shuffle=True)
        else:
            start = (page - 1) * page_size
            df_sample = df.slice(start, page_size)

        df_sample = df_sample.with_columns(
            pl.col(graph.id_column).is_in(in_category_ids).cast(pl.Int8).alias('inCategory')
        )

    cols = [graph.id_column, graph.text_column]
    if 'inCategory' in df_sample.columns:
        cols.append('inCategory')

    result_df = df_sample.select(cols).rename({
        graph.id_column: 'id',
        graph.text_column: 'data',
    })
    return Response({"data": result_df.to_dicts(), "total_items": size})


@api_view(['GET'])
def calculate_sim_cos(request):
    try:
        target_id = request.GET.get('target_id')
        graph_id = request.GET.get('graph_id')
    except Exception as e:
        return Response(f"Formato de los datos erroneo {e}", status=400)
    min_cos = 0
    if not (target_id):
        return Response("Datos incompletos en la solicitud", status=400)

    user = request.user # el decorador api_view hace cosas
    try:
        graph = Graphs.objects.get(id_user=user, id=graph_id)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)
    PATH_EMB = f"{user.pk}/{graph_id}/embedding.parquet"
    df_embedding: pd.DataFrame = read_tree_s3(PATH_EMB)
    df_embedding = df_embedding[df_embedding['block']!='1']
    target_row = df_embedding[df_embedding[graph.id_column] == target_id].iloc[0]['embedding']

    #voy a obtener la similitud coseno de todos los datos
    df_embedding_min_cos = get_similar_embeddings(target_row, df_embedding, min_cos)  # type: ignore

    df_data: pd.DataFrame = read_tree_s3(f"{user.pk}/{graph_id}/data.parquet")
    df_embedding_min_cos = df_embedding_min_cos.merge(df_data, on=graph.id_column, how="left")

    save_or_update_tree_s3(f"{user.pk}/{graph_id}/temp_emb.parquet", df_embedding_min_cos)

    return HttpResponse(200)


#este endpoint esta obsoleto
@api_view(['GET'])
def opc_cut(request):
    try:
        n_opc = int(request.GET.get('n_opc', 3))
        min_cos = float(request.GET.get('min_similarity', 0.85))
        target_id = request.GET.get('target_id')
        graph_id = request.GET.get('graph_id')
    except Exception as e:
        return Response(f"Formato de los datos erroneo {e}", status=400)

    if not (n_opc and min_cos and target_id):
        return Response("Datos incompletos en la solicitud", status=400)

    user = request.user
    try:
        graph = Graphs.objects.get(id_user=user, id=graph_id)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    list_cos = sorted(range_cos(min_cos, n_opc))
    PATH_EMB = f"{user.pk}/{graph_id}/embedding.parquet"
    df_embedding: pd.DataFrame = read_tree_s3(PATH_EMB)
    target_row = df_embedding[df_embedding[graph.id_column] == target_id].iloc[0]['embedding']

    df_embedding_min_cos = get_similar_embeddings(target_row, df_embedding, min_cos)  # type: ignore

    df_data: pd.DataFrame = read_tree_s3(f"{user.pk}/{graph_id}/data.parquet")
    df_embedding_min_cos = df_embedding_min_cos.merge(df_data, on=graph.id_column, how="left")

    save_or_update_tree_s3(f"{user.pk}/{graph_id}/temp_emb.parquet", df_embedding_min_cos)

    answer = []
    for cos in list_cos:
        df_tmp: pd.DataFrame = df_embedding_min_cos[df_embedding_min_cos['similarity'] > cos]
        border = df_tmp.iloc[[-1], [1, 2, 3]].iloc[0].values
        answer.append({'id': border[0], 'data': border[2], 'sim': float(border[1])})
    return Response({'data': answer})


@api_view(['GET'])
def get_categorized_data(request):
    """Obtener todos los datos con sus categorías como CSV."""
    graph_id = request.GET.get("graph_id")
    if not graph_id:
        return Response("graph_id es requerido", status=400)

    user = request.user
    try:
        graph = Graphs.objects.get(id_user=user, id=graph_id)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    try:
        raw_df = read_parquet_s3_pl(f"{user.pk}/{graph_id}/raw.parquet")
    except FileNotFoundError:
        return Response("Datos no encontrados", status=404)

    # Obtener asignaciones id_data → categorías desde la DB
    assignments = (
        Nodes_Category.objects
            .filter(node__graph=graph)
            .values('data__id_data', 'node__node_name')
    )

    # Agrupar: id_data → lista de categorías
    id_to_cats: dict[str, list[str]] = {}
    for row in assignments:
        id_val = str(row['data__id_data'])
        id_to_cats.setdefault(id_val, []).append(row['node__node_name'])

    # Añadir columna 'categorias' al dataframe
    id_col = graph.id_column
    categorias = [
        ','.join(id_to_cats.get(str(v), []))
        for v in raw_df[id_col].to_list()
    ]
    result_df = raw_df.with_columns(pl.Series('categorias', categorias))

    csv_bytes = result_df.write_csv().encode('utf-8')
    response = HttpResponse(csv_bytes, content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{graph_id}_categorized_data.csv"'
    return response


@api_view(['GET'])
def get_full_graph(request):
    """Obtener la estructura completa de un grafo."""
    graph_id = request.GET.get("graph_id")
    if not graph_id:
        return Response("Falta el parámetro 'graph_id'", status=400)

    user = request.user
    try:
        graph_obj = Graphs.objects.get(id=graph_id, id_user=user)
        all_nodes = Nodes.objects.filter(graph=graph_obj)
        edges_objs = Edge.objects.filter(from_node__in=all_nodes).select_related('from_node', 'to_node', 'relation')

        nodes_list = [{"id": n.id, "name": n.node_name, "pos_x": n.pos_x, "pos_y": n.pos_y} for n in all_nodes]
        edges_list = [
            {
                "id":          e.id,
                "source":      e.from_node.id,
                "target":      e.to_node.id,
                "relation_id": e.relation.id,
                "relation_style": {
                    "label":        e.relation.type,
                    "color":        e.relation.color,
                    "is_dashed":    e.relation.is_dashed,
                    "direction":    e.relation.direction,
                    "stroke_width": e.relation.stroke_width,
                },
            }
            for e in edges_objs
        ]

        return Response({"nodes": nodes_list, "edges": edges_list})

    except Graphs.DoesNotExist:
        return Response("El grafo no existe o no pertenece al usuario", status=400)
    except Exception as e:
        return Response(f"Error inesperado: {e}", status=500)


@api_view(['POST'])
def add_edge(request):
    """Crear o actualizar una relación entre dos nodos."""
    try:
        graph_id = request.data.get("graph_id")
        node_id_1 = request.data.get("node_id_1")
        node_id_2 = request.data.get("node_id_2")
        connection_type = request.data.get("connection_type")

        if not all([graph_id, node_id_1, node_id_2, connection_type]):
            return Response("Faltan parámetros obligatorios", status=400)

        user = request.user
        try:
            graph_obj = Graphs.objects.get(id=graph_id, id_user=user)
        except Graphs.DoesNotExist:
            return Response("Grafo no encontrado o no pertenece al usuario", status=400)

        try:
            node1 = Nodes.objects.get(id=node_id_1, graph=graph_obj)
            node2 = Nodes.objects.get(id=node_id_2, graph=graph_obj)
        except Nodes.DoesNotExist:
            return Response("Uno o ambos nodos no encontrados en este grafo", status=400)

        try:
            rel_obj = Relationship.objects.get(id=connection_type)
        except Relationship.DoesNotExist:
            return Response("Tipo de conexión (relación) no encontrado", status=400)

        edge_obj = Edge.objects.filter(from_node=node1, to_node=node2).first()
        if edge_obj:
            edge_obj.relation = rel_obj
            edge_obj.save()
        else:
            Edge.objects.create(from_node=node1, to_node=node2, relation=rel_obj)

        return Response("OK", status=200)

    except Exception as e:
        return Response(f"Error inesperado: {e}", status=500)


@api_view(['GET'])
def get_user_graphs(request):
    """Obtener todos los grafos del usuario autenticado."""
    user = request.user
    user_Graphs = Graphs.objects.filter(id_user=user)
    results = [
        {"name": g.name if g.name else f"Grafo {g.id}", "id": g.id, "date": 0, "status": g.status, "task_id": g.task_id}
        for g in user_Graphs
    ]
    return Response(results)


@api_view(['POST', 'DELETE'])
def delete_node(request):
    """Eliminar un nodo, su archivo parquet y sus relaciones."""
    try:
        if request.content_type and 'application/json' in request.content_type:
            graph_id = request.data.get("graph_id")
            node_id  = request.data.get("node_id")
        else:
            graph_id = request.POST.get("graph_id")
            node_id  = request.POST.get("node_id")

        if not all([graph_id, node_id]):
            return Response("Faltan parámetros obligatorios: graph_id, node_id", status=400)

        user  = request.user
        graph = Graphs.objects.get(id=graph_id, id_user=user)
        node  = Nodes.objects.get(id=node_id, graph=graph)

        # IDs de las respuestas en esta categoría (antes de borrar el nodo)
        ids_in_node = list(
            Nodes_Category.objects.filter(node=node)
                .values_list('data__id_data', flat=True)
        )

        # Borrar parquet de la categoría en S3
        try:
            delete_parquet_s3(f"{user.pk}/{graph_id}/{node.node_name}.parquet")
        except FileNotFoundError:
            pass

        # Borrar nodo (CASCADE elimina Nodes_Category y Edge automáticamente)
        node.delete()

        # Desbloquear respuestas que pertenecían a esta categoría
        Data.objects.filter(graph=graph, id_data__in=ids_in_node).update(block=False)

        return HttpResponse(status=204)

    except (Graphs.DoesNotExist, Nodes.DoesNotExist):
        return Response("Grafo o nodo no encontrado", status=400)
    except Exception as e:
        return Response(f"Error inesperado: {e}", status=500)


@api_view(['POST'])
def create_relationship(request):
    """Crear un nuevo tipo de relación/arista personalizada."""
    try:
        graph_id     = request.data.get('graph_id')
        label        = (request.data.get('type') or '').strip()
        color        = request.data.get('color', '#6366f1')
        is_dashed    = bool(request.data.get('is_dashed', False))
        direction    = request.data.get('direction', 'forward')
        stroke_width = int(request.data.get('stroke_width', 2))
        is_global    = int(request.data.get('is_global', 0))
    except Exception as e:
        return Response(f"Error en los datos: {e}", status=400)

    if not label:
        return Response("El nombre de la relación es requerido", status=400)
    if direction not in ('forward', 'backward', 'both'):
        return Response("direction debe ser forward, backward o both", status=400)

    user = request.user
    graph_obj = None

    if is_global == 0:
        if not graph_id:
            return Response("graph_id es requerido para relaciones no globales", status=400)
        try:
            graph_obj = Graphs.objects.get(id=graph_id, id_user=user)
        except Graphs.DoesNotExist:
            return Response("Grafo no encontrado o no pertenece al usuario", status=400)

    rel = Relationship.objects.create(
        type=label,
        color=color,
        is_dashed=is_dashed,
        direction=direction,
        stroke_width=stroke_width,
        is_global=is_global,
        graph=graph_obj,
        id_user=user,
    )
    return Response({"id": rel.id, "type": rel.type}, status=201)


@api_view(['GET'])
def get_relations(request):
    """Obtener tipos de relación disponibles para un grafo (globales del user + específicas del grafo)."""
    graph_id = request.GET.get('graph_id')
    if not graph_id:
        return Response("graph_id es requerido", status=400)
    user = request.user
    try:
        graph_obj = Graphs.objects.get(id=graph_id, id_user=user)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    from django.db.models import Q as DQ
    rels = Relationship.objects.filter(
        DQ(is_global=1, id_user=user) | DQ(is_global=0, graph=graph_obj)
    )
    data = [
        {
            'id':           r.id,
            'type':         r.type,
            'color':        r.color,
            'is_dashed':    r.is_dashed,
            'direction':    r.direction,
            'stroke_width': r.stroke_width,
            'is_global':    r.is_global,
        }
        for r in rels
    ]
    return Response({'relations': data})


@api_view(['GET'])
def get_progress(request):
    """Porcentaje de registros asignados a al menos una categoría."""
    graph_id = request.GET.get("graph_id")
    if not graph_id:
        return Response("graph_id es requerido", status=400)
    user = request.user
    try:
        graph = Graphs.objects.get(id_user=user, id=graph_id)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    total = Data.objects.filter(graph=graph).count()
    if total == 0:
        return Response({"progress": 0.0})
    assigned = Data.objects.filter(graph=graph, nodes__isnull=False).distinct().count()
    progress = round(assigned / total * 100, 2)
    return Response({"progress": progress})


@api_view(['POST'])
def rename_category(request):
    """Renombrar una categoría: actualiza el nodo en BD y mueve su parquet en S3."""
    try:
        graph_id = request.data.get('graph_id')
        node_id  = request.data.get('node_id')
        new_name = (request.data.get('new_name') or '').strip()
    except Exception as e:
        return Response(f"Error en los datos: {e}", status=400)

    if not all([graph_id, node_id]):
        return Response("graph_id y node_id son requeridos", status=400)
    if not new_name:
        return Response("new_name no puede estar vacío", status=400)
    if any(c in new_name for c in ('/', '\\', '..', '\0')):
        return Response("new_name contiene caracteres no permitidos", status=400)

    user = request.user
    try:
        graph = Graphs.objects.get(id=graph_id, id_user=user)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado o no pertenece al usuario", status=400)

    try:
        node =Nodes.objects.get(id=node_id, graph=graph)
    except Nodes.DoesNotExist:
        return Response("Nodo no encontrado en este grafo", status=400)

    old_name = node.node_name

    # No-op si el nombre es idéntico
    if old_name == new_name:
        return Response("OK", status=200)

    # Verificar colisión con otro nodo del mismo grafo
    if Nodes.objects.filter(node_name=new_name, graph=graph).exists():
        return Response("Ya existe una categoría con ese nombre en este grafo", status=400)

    BASE_PATH   = f"{user.pk}/{graph_id}"
    old_s3_path = f"{BASE_PATH}/{old_name}.parquet"
    new_s3_path = f"{BASE_PATH}/{new_name}.parquet"

    # --- Operación S3 (primero, para poder revertir si falla la BD) ---
    s3_copy_done    = False
    parquet_existed = fs.exists(f"{BUCKET}/{old_s3_path}")

    try:
        if parquet_existed:
            df_category = read_tree_s3(old_s3_path)
            save_or_update_tree_s3(new_s3_path, df_category)
            s3_copy_done = True
            delete_parquet_s3(old_s3_path)
    except Exception as e:
        # Revertir copia parcial si la copia llegó a completarse antes del delete
        if s3_copy_done:
            try:
                delete_parquet_s3(new_s3_path)
            except Exception:
                pass
        return Response(f"Error al mover el archivo en S3: {e}", status=500)

    # --- Actualización en BD ---
    try:
        node.node_name = new_name
        node.save(update_fields=['node_name'])
    except Exception as e:
        # Revertir S3: restaurar archivo original y borrar el nuevo
        if parquet_existed:
            try:
                df_category = read_tree_s3(new_s3_path)
                save_or_update_tree_s3(old_s3_path, df_category)
                delete_parquet_s3(new_s3_path)
            except Exception as revert_err:
                print(f"CRITICAL: fallo al revertir S3 tras error en BD. "
                      f"Parquet nuevo='{new_s3_path}' sin actualizar en BD. Revert error: {revert_err}")
        return Response(f"Error al actualizar la base de datos: {e}", status=500)

    return Response({"old_name": old_name, "new_name": new_name}, status=200)


@api_view(['POST'])
def update_node_position(request):
    """Guardar la posición de un nodo en el canvas."""
    try:
        graph_id = request.data.get('graph_id')
        node_id  = request.data.get('node_id')
        pos_x    = float(request.data.get('pos_x'))
        pos_y    = float(request.data.get('pos_y'))
    except (TypeError, ValueError) as e:
        return Response(f"Datos inválidos: {e}", status=400)

    user = request.user
    try:
        graph_obj = Graphs.objects.get(id=graph_id, id_user=user)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado", status=400)

    try:
        node_obj = Nodes.objects.get(id=node_id, graph=graph_obj)
    except Nodes.DoesNotExist:
        return Response("Nodo no encontrado en este grafo", status=400)

    node_obj.pos_x = pos_x
    node_obj.pos_y = pos_y
    node_obj.save(update_fields=['pos_x', 'pos_y'])
    return Response("OK", status=200)


@api_view(['POST', 'DELETE'])
def delete_graph(request):
    """Eliminar un grafo, sus datos en S3 y sus registros en BD."""
    graph_id = request.data.get("graph_id")
    if not graph_id:
        return Response("graph_id es requerido", status=400)

    user = request.user
    try:
        graph = Graphs.objects.get(id=graph_id, id_user=user)
    except Graphs.DoesNotExist:
        return Response("Grafo no encontrado o no pertenece al usuario", status=400)

    s3_path = f"{BUCKET}/{user.pk}/{graph_id}"
    try:
        if fs.exists(s3_path):
            fs.rm(s3_path, recursive=True)
    except Exception as e:
        print(f"Warning: error eliminando S3 path {s3_path}: {e}")

    graph.delete()  # cascade elimina nodos → aristas
    return HttpResponse(status=204)


@api_view(['POST', 'DELETE'])
def delete_edge(request):
    """Eliminar una arista."""
    try:
        if request.content_type and 'application/json' in request.content_type:
            graph_id = request.data.get("graph_id")
            from_node_id = request.data.get("from_node_id")
            to_node_id = request.data.get("to_node_id")
        else:
            graph_id = request.POST.get("graph_id")
            from_node_id = request.POST.get("from_node_id")
            to_node_id = request.POST.get("to_node_id")

        if not all([graph_id, from_node_id, to_node_id]):
            return Response(f"Faltan parámetros obligatorios", status=400)

        user = request.user
        graph = Graphs.objects.get(id=graph_id, id_user=user)
        from_node = Nodes.objects.get(id=from_node_id, graph=graph)
        to_node = Nodes.objects.get(id=to_node_id, graph=graph)
        edge_selected = Edge.objects.get(
            Q(Q(from_node=from_node) & Q(to_node=to_node)) |
            Q(Q(from_node=to_node) & Q(to_node=from_node))
        )
        edge_selected.delete()
        return HttpResponse(status=204)

    except (Graphs.DoesNotExist, Nodes.DoesNotExist, Edge.DoesNotExist):
        return Response("Grafo, nodo o arista no encontrado", status=400)
    except Exception as e:
        return Response(f"Error inesperado: {e}", status=500)
