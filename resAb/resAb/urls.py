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
from back_resAb import views
from django.urls import path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('get_trees/', views.get_trees, name="get_trees"),
    path('new_tree/', views.new_tree, name="new_tree"),
    path('new_branches/', views.new_branches, name="new_branches"),
    path('prune_tree/', views.prune_tree, name="prune_tree"),
    path('get_tree_structure/', views.get_tree_structure, name="get_tree_structure"),
    path('get_node_data/', views.get_node_data, name="get_node_data"),
]
