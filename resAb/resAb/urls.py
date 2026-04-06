"""
URL configuration for resAb project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from django.views.generic import TemplateView
from back import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('login', views.login_view),
    path('new_analysis', views.new_analysis_request),
    path('get_similarity', views.search_similar),
    path('sim_cos', views.calculate_sim_cos),
    path('new_category', views.confirm_new_category),
    path('sample', views.sample),
    path('delete_tmp', views.delete_temp_embedding_endpoint),
    path('get_categorized_data', views.get_categorized_data),
    path('get_full_graph', views.get_full_graph),
    path('add_edge', views.add_edge),#add_edge
    path('get_user_graphs', views.get_user_graphs),
    path('delete_node', views.delete_node),
    path('delete_edge', views.delete_edge),
    path('delete_graph', views.delete_graph),
    path('get_progress', views.get_progress),
    path('create_relationship', views.create_relationship),
    path('get_relations', views.get_relations),
    path('rename_category', views.rename_category),
    path('update_node_position', views.update_node_position),
    path('', TemplateView.as_view(template_name='index.html')),
    path('jaja', views.jaja),
    path('analysis_status', views.analysis_status),
]
