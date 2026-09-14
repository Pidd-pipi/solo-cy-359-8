"""确保新增线路模块不影响原有的健康检查与运营总览。"""
from rest_framework import status

from .base import ROUTES_URL, RouteApiTestCase, valid_payload


class HealthAndOverviewTests(RouteApiTestCase):
    def test_health_ok_with_and_without_api_prefix(self):
        for path in ("/health", "/api/health"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, status.HTTP_200_OK, f"{path} 应可访问")
            self.assertEqual(response.json(), {"status": "ok"}, f"{path} 健康内容不应变化")

    def test_overview_unchanged_with_both_prefixes(self):
        original = self.client.get("/api/overview").json()
        for path in ("/overview", "/api/overview"):
            data = self.client.get(path).json()
            self.assertEqual(data, original, f"{path} 返回的总览数据应保持一致")

    def test_overview_keeps_original_content(self):
        data = self.client.get("/api/overview").json()
        self.assertEqual(data["appCode"], "lporienteering")
        self.assertEqual(len(data["features"]), 5, "运营总览应保留 5 个功能")
        self.assertEqual(len(data["kpis"]), 4, "运营总览应保留 4 项指标")
        self.assertEqual(len(data["records"]), 5, "运营总览应保留 5 条运营记录")
        self.assertIn("城市定向越野", data["appName"])

    def test_creating_routes_does_not_mutate_overview(self):
        before = self.client.get("/api/overview").json()
        self.create_draft(valid_payload(title="不应影响总览"))
        self.client.post("/api/routes/999999/publish/", {}, format="json")  # 不存在的发布请求
        after = self.client.get("/api/overview").json()
        self.assertEqual(before, after, "任何线路操作都不应改动运营总览内容")
