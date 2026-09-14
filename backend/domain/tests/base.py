"""共享测试基类与可复用的构造数据。

仅包含辅助方法，文件名不以 test 开头，Django 不会把它当作测试用例执行。
"""
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Route

ROUTES_URL = "/api/routes/"


def route_detail_url(route_id):
    return f"{ROUTES_URL}{route_id}/"


def publish_url(route_id):
    return f"{ROUTES_URL}{route_id}/publish/"


# 一份始终合法、可发布的线路内容（3 个顺序唯一、线索与任务齐全的打卡点）
def valid_payload(**overrides):
    payload = {
        "title": "测试线路",
        "start_point": "南门牌楼",
        "end_point": "北门广场",
        "difficulty": "亲子",
        "estimated_duration": 90,
        "equipment": "饮用水、雨衣",
        "checkpoints": [
            {"order": 1, "name": "南门牌楼", "clue": "沿主路向东", "task": "拍摄团队合影"},
            {"order": 2, "name": "湖边长椅", "clue": "第三张红色长椅", "task": "扫码答题"},
            {"order": 3, "name": "北门钟楼", "clue": "整点敲响的钟楼", "task": "集体跳绳视频"},
        ],
    }
    payload.update(overrides)
    return payload


class RouteApiTestCase(APITestCase):
    def setUp(self):
        # 清空种子迁移写入的示例线路，保证每个用例都在“干净环境”开始，
        # 这样 Route.objects.count() 等断言只反映当前用例创建的数据。
        Route.objects.all().delete()

    def create_draft(self, payload=None):
        """创建一条草稿并返回 (响应数据, route_id)。"""
        payload = valid_payload() if payload is None else payload
        response = self.client.post(ROUTES_URL, payload, format="json")
        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            f"创建草稿应返回 201，实际：{response.status_code} {response.content!r}",
        )
        return response.data, response.data["id"]

    def publish_expecting_ok(self, route_id):
        response = self.client.post(publish_url(route_id), {}, format="json")
        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            f"发布应返回 200，实际：{response.status_code} {response.content!r}",
        )
        return response

    def get_route(self, route_id):
        response = self.client.get(route_detail_url(route_id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def assert_publish_errors_contain(self, errors, keyword):
        """断言 400 的缺失项清单中包含某个关键词，失败时打印完整清单便于定位。"""
        self.assertTrue(
            any(keyword in item for item in errors),
            f"发布校验应提示包含「{keyword}」的缺失项，实际返回：{errors}",
        )
