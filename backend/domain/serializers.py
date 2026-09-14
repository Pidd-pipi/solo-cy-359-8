from rest_framework import serializers

from .constants import DIFFICULTY_VALUES
from .models import Checkpoint, Route


class CheckpointSerializer(serializers.ModelSerializer):
    class Meta:
        model = Checkpoint
        fields = ["id", "order", "name", "clue", "task"]

    def validate_order(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("打卡点顺序必须为大于 0 的整数")
        return value


class RouteSerializer(serializers.ModelSerializer):
    checkpoints = CheckpointSerializer(many=True, required=False)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    difficulty_label = serializers.SerializerMethodField()
    checkpoint_count = serializers.SerializerMethodField()

    class Meta:
        model = Route
        fields = [
            "id",
            "title",
            "status",
            "status_label",
            "start_point",
            "end_point",
            "difficulty",
            "difficulty_label",
            "estimated_duration",
            "equipment",
            "checkpoints",
            "checkpoint_count",
            "created_at",
            "updated_at",
            "published_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at", "published_at"]

    def get_difficulty_label(self, obj):
        return obj.get_difficulty_display() if obj.difficulty else ""

    def get_checkpoint_count(self, obj):
        return len(obj.checkpoints.all())

    def validate_difficulty(self, value):
        # 草稿允许留空；一旦填写必须是合法难度
        if value and value not in DIFFICULTY_VALUES:
            raise serializers.ValidationError("难度只能是 亲子 / 成人 / 专业")
        return value

    def validate_title(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("请填写线路名称")
        return value

    def validate_estimated_duration(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("预计时长必须大于 0 分钟")
        return value

    def _replace_checkpoints(self, route, checkpoints_data):
        # 整体替换，保证顺序与前端提交的数组一致
        route.checkpoints.all().delete()
        checkpoints = [
            Checkpoint(
                route=route,
                order=item["order"],
                name=item.get("name", ""),
                clue=item.get("clue", ""),
                task=item.get("task", ""),
            )
            for item in checkpoints_data
        ]
        Checkpoint.objects.bulk_create(checkpoints)

    def create(self, validated_data):
        checkpoints_data = validated_data.pop("checkpoints", [])
        route = Route.objects.create(**validated_data)
        self._replace_checkpoints(route, checkpoints_data)
        return route

    def update(self, instance, validated_data):
        checkpoints_data = validated_data.pop("checkpoints", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if checkpoints_data is not None:
            self._replace_checkpoints(instance, checkpoints_data)
        return instance


class RouteListSerializer(serializers.ModelSerializer):
    """活动列表使用的精简结构，状态与基本信息都在这里。"""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    difficulty_label = serializers.SerializerMethodField()
    checkpoint_count = serializers.SerializerMethodField()

    class Meta:
        model = Route
        fields = [
            "id",
            "title",
            "status",
            "status_label",
            "start_point",
            "end_point",
            "difficulty",
            "difficulty_label",
            "estimated_duration",
            "equipment",
            "checkpoint_count",
            "created_at",
            "updated_at",
            "published_at",
        ]

    def get_difficulty_label(self, obj):
        return obj.get_difficulty_display() if obj.difficulty else "未设置"

    def get_checkpoint_count(self, obj):
        return len(obj.checkpoints.all())
