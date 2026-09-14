from django.urls import include, path
from rest_framework import routers

from domain.api import RouteViewSet
from domain.views import health, overview

# /api/ 由前端 Nginx（或 Vite 代理）转发到后端时会被去掉 /api 前缀，
# 因此同时挂载在根路径与 /api/ 下，两种转发方式都能访问到线路接口。
router = routers.SimpleRouter()
router.register("routes", RouteViewSet, basename="route")

urlpatterns = [
    path("health", health),
    path("api/health", health),
    path("overview", overview),
    path("api/overview", overview),
    path("api/", include((router.urls, "api"))),
    path("", include((router.urls, "root"))),
]
