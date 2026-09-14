from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Route
from .serializers import RouteListSerializer, RouteSerializer
from .services import collect_publish_errors


class RouteViewSet(viewsets.ModelViewSet):
    """线路编排与发布接口。

    - POST 只创建草稿（不触发发布校验）；PATCH 更新内容
    - 已发布线路的内容若被改到不再满足发布要求，会被自动撤回为草稿，
      系统中不会保留无效的已发布记录
    - POST /routes/{id}/publish/ 执行发布前校验，缺失项以 400 返回
    """

    queryset = Route.objects.all().prefetch_related("checkpoints")
    serializer_class = RouteSerializer

    def get_queryset(self):
        queryset = Route.objects.all().prefetch_related("checkpoints")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset

    def get_serializer_class(self):
        if self.action == "list":
            return RouteListSerializer
        return RouteSerializer

    def perform_create(self, serializer):
        serializer.save(status="draft")

    def update(self, request, *args, **kwargs):
        """更新线路内容。

        草稿更新不做完整性校验；已发布线路更新后若不再满足发布要求，
        自动将状态撤回为 draft，并把缺失项随响应返回。
        """
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        was_published = instance.is_published

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if not was_published:
            return Response(serializer.data)

        # 用全新查询实例校验，避免序列化器整体替换打卡点后预取缓存过期
        fresh = Route.objects.prefetch_related("checkpoints").get(pk=instance.pk)
        errors = collect_publish_errors(fresh)
        if not errors:
            # 内容仍满足发布要求，保持已发布状态
            return Response(serializer.data)

        fresh.status = "draft"
        fresh.save(update_fields=["status", "updated_at"])
        payload = dict(RouteSerializer(fresh).data)
        payload["demoted"] = True
        payload["errors"] = errors
        payload["message"] = "修改后的内容不满足发布要求，线路已撤回为草稿"
        return Response(payload, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        route = self.get_object()

        errors = collect_publish_errors(route)
        if errors:
            return Response(
                {
                    "message": "线路信息不完整，无法发布",
                    "errors": errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        route.status = "published"
        route.published_at = timezone.now()
        route.save(update_fields=["status", "published_at", "updated_at"])
        route.refresh_from_db()
        return Response(RouteSerializer(route).data, status=status.HTTP_200_OK)
