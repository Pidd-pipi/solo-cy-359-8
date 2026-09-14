from django.db import models

from .constants import (
    DIFFICULTY_CHOICES,
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    STATUS_CHOICES,
)


class Route(models.Model):
    """定向越野线路。可反复编辑保存为草稿，校验通过后发布。"""

    title = models.CharField("线路名称", max_length=120)
    status = models.CharField(
        "状态", max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT
    )
    start_point = models.CharField("起点", max_length=120, blank=True, default="")
    end_point = models.CharField("终点", max_length=120, blank=True, default="")
    difficulty = models.CharField(
        "难度", max_length=16, choices=DIFFICULTY_CHOICES, blank=True, default=""
    )
    # 预计时长（分钟），草稿阶段允许为空，发布时必填且大于 0
    estimated_duration = models.PositiveIntegerField(
        "预计时长（分钟）", null=True, blank=True
    )
    equipment = models.TextField("装备要求", blank=True, default="")
    created_at = models.DateTimeField("创建时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)
    published_at = models.DateTimeField("发布时间", null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "线路"
        verbose_name_plural = "线路"

    def __str__(self):
        return f"{self.title}（{self.get_status_display()}）"

    @property
    def is_published(self):
        return self.status == STATUS_PUBLISHED


class Checkpoint(models.Model):
    """按顺序排列的打卡点（CP 点），每个点包含线索与任务。"""

    route = models.ForeignKey(
        Route,
        verbose_name="所属线路",
        related_name="checkpoints",
        on_delete=models.CASCADE,
    )
    order = models.PositiveIntegerField("顺序", default=1)
    name = models.CharField("打卡点名称", max_length=120, blank=True, default="")
    clue = models.TextField("线索", blank=True, default="")
    task = models.TextField("任务", blank=True, default="")
    created_at = models.DateTimeField("创建时间", auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "打卡点"
        verbose_name_plural = "打卡点"

    def __str__(self):
        return f"CP{self.order} {self.name}".strip()
