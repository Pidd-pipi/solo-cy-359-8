"""草稿新建，以及发布前的必填项校验。"""
from rest_framework import status

from .base import RouteApiTestCase, publish_url, valid_payload
from ..models import Route


class DraftCreationTests(RouteApiTestCase):
    def test_create_with_only_title_is_a_draft(self):
        response = self.client.post(
            "/api/routes/", {"title": "仅标题草稿"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "draft")
        self.assertEqual(response.data["status_label"], "草稿")
        self.assertEqual(response.data["title"], "仅标题草稿")
        self.assertEqual(response.data["checkpoints"], [])
        self.assertIsNone(response.data["published_at"])
        saved = Route.objects.get(pk=response.data["id"])
        self.assertEqual(saved.status, "draft", "新建后数据库中应为草稿状态")

    def test_draft_persists_even_when_incomplete(self):
        """草稿保存不做完整性校验：缺少起点/难度等也能保存。"""
        payload = valid_payload(start_point="", difficulty="", estimated_duration=None,
                                checkpoints=[])
        response = self.client.post("/api/routes/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, "草稿允许不完整")
        detail = self.get_route(response.data["id"])
        self.assertEqual(detail["status"], "draft")
        self.assertEqual(detail["start_point"], "")
        self.assertEqual(detail["checkpoints"], [])

    def test_create_requires_title(self):
        response = self.client.post("/api/routes/", {"title": "   "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("title", response.data)

    def test_draft_can_be_updated_repeatedly(self):
        _, route_id = self.create_draft()
        for title in ("第一次修改", "第二次修改"):
            response = self.client.patch(
                f"/api/routes/{route_id}/", valid_payload(title=title), format="json"
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.get_route(route_id)["title"], "第二次修改")


class PublishValidationTests(RouteApiTestCase):
    def test_valid_draft_publishes(self):
        _, route_id = self.create_draft()
        response = self.publish_expecting_ok(route_id)
        self.assertEqual(response.data["status"], "published")
        self.assertEqual(response.data["status_label"], "已发布")
        self.assertIsNotNone(response.data["published_at"])

    def _publish_with(self, **overrides):
        _, route_id = self.create_draft(valid_payload(**overrides))
        response = self.client.post(publish_url(route_id), {}, format="json")
        return response

    def test_publish_rejected_when_everything_missing(self):
        response = self._publish_with(
            start_point="", end_point="", difficulty="", estimated_duration=None,
            checkpoints=[],
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data["errors"]
        for keyword in ("起点", "终点", "难度", "预计时长", "打卡点"):
            self.assert_publish_errors_contain(errors, keyword)

    def test_missing_start_point_rejected(self):
        response = self._publish_with(start_point="   ")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assert_publish_errors_contain(response.data["errors"], "起点")

    def test_missing_end_point_rejected(self):
        response = self._publish_with(end_point="")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assert_publish_errors_contain(response.data["errors"], "终点")

    def test_missing_difficulty_rejected(self):
        response = self._publish_with(difficulty="")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assert_publish_errors_contain(response.data["errors"], "难度")

    def test_missing_duration_rejected(self):
        response = self._publish_with(estimated_duration=None)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assert_publish_errors_contain(response.data["errors"], "预计时长")

    def test_zero_duration_blocked_at_save(self):
        response = self.client.post(
            "/api/routes/", valid_payload(estimated_duration=0), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("estimated_duration", response.data)

    def test_zero_duration_also_rejected_by_publish_service(self):
        """绕过序列化层直接构造 0 时长时，发布校验服务仍须拒绝（纵深防御）。"""
        from ..services import collect_publish_errors
        route = Route.objects.create(title="零时长线", start_point="起", end_point="终",
                                     difficulty="亲子", estimated_duration=0)
        errors = collect_publish_errors(route)
        self.assertTrue(any("时长" in e for e in errors), f"应提示时长问题，实际：{errors}")

    def test_checkpoint_missing_clue_rejected(self):
        cps = valid_payload()["checkpoints"]
        cps[1] = {**cps[1], "clue": ""}
        response = self._publish_with(checkpoints=cps)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assert_publish_errors_contain(response.data["errors"], "线索")

    def test_checkpoint_missing_task_rejected(self):
        cps = valid_payload()["checkpoints"]
        cps[0] = {**cps[0], "task": ""}
        response = self._publish_with(checkpoints=cps)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assert_publish_errors_contain(response.data["errors"], "任务")

    def test_no_checkpoints_rejected(self):
        response = self._publish_with(checkpoints=[])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assert_publish_errors_contain(response.data["errors"], "打卡点")

    def test_failed_publish_keeps_draft_status(self):
        _, route_id = self.create_draft()
        bad = self.client.patch(
            f"/api/routes/{route_id}/",
            valid_payload(start_point=""),
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_200_OK)
        response = self.client.post(publish_url(route_id), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.get_route(route_id)["status"], "draft",
                         "发布失败后线路必须仍是草稿，不能留下错误的已发布状态")
