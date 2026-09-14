from django.db import migrations
from django.utils import timezone


def seed_demo_route(apps, schema_editor):
    Route = apps.get_model("domain", "Route")
    Checkpoint = apps.get_model("domain", "Checkpoint")

    if Route.objects.filter(title="滨江公园亲子寻宝线").exists():
        return

    route = Route.objects.create(
        title="滨江公园亲子寻宝线",
        status="published",
        start_point="公园南门牌楼",
        end_point="北门广场",
        difficulty="亲子",
        estimated_duration=90,
        equipment="饮用水、雨衣、徒步鞋",
        published_at=timezone.now(),
    )

    points = [
        (
            1,
            "南门牌楼",
            "从刻着园名的牌楼出发，沿主路向东直行 200 米。",
            "在牌楼前拍摄一张全员入镜的团队合影。",
        ),
        (
            2,
            "湖边长椅",
            "在人工湖边找到第三张红色长椅，椅背贴着二维码。",
            "扫描二维码回答一道公园历史题，答对即可通过。",
        ),
        (
            3,
            "北门钟楼",
            "朝整点会敲响的钟楼前进，终点位于钟楼下广场。",
            "全队完成 30 秒集体跳绳并上传视频。",
        ),
    ]
    for order, name, clue, task in points:
        Checkpoint.objects.create(route=route, order=order, name=name, clue=clue, task=task)


def remove_demo_route(apps, schema_editor):
    Route = apps.get_model("domain", "Route")
    Route.objects.filter(title="滨江公园亲子寻宝线").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("domain", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_demo_route, remove_demo_route),
    ]
