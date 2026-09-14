"""打卡点顺序约束、发布后列表/详情顺序、刷新持久化与删除。"""
from rest_framework import status

from .base import ROUTES_URL, RouteApiTestCase, publish_url, route_detail_url, valid_payload
from ..models import Checkpoint, Route


class DuplicateOrderTests(RouteApiTestCase):
    def test_publish_rejects_duplicate_order(self):
        cps = [
            {"order": 1, "name": "甲", "clue": "线索甲", "task": "任务甲"},
            {"order": 1, "name": "乙", "clue": "线索乙", "task": "任务乙"},
            {"order": 2, "name": "丙", "clue": "线索丙", "task": "任务丙"},
        ]
        _, route_id = self.create_draft(valid_payload(checkpoints=cps))
        response = self.client.post(publish_url(route_id), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data["errors"]
        self.assertTrue(
            any("顺序重复" in e and "1" in e for e in errors),
            f"应明确提示第 1 位顺序重复，实际：{errors}",
        )
        self.assertEqual(self.get_route(route_id)["status"], "draft")

    def test_fix_order_then_publish_succeeds(self):
        broken = [
            {"order": 2, "name": "甲", "clue": "线索甲", "task": "任务甲"},
            {"order": 2, "name": "乙", "clue": "线索乙", "task": "任务乙"},
        ]
        _, route_id = self.create_draft(valid_payload(checkpoints=broken))
        rejected = self.client.post(publish_url(route_id), {}, format="json")
        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)

        fixed = [
            {"order": 1, "name": "甲", "clue": "线索甲", "task": "任务甲"},
            {"order": 2, "name": "乙", "clue": "线索乙", "task": "任务乙"},
        ]
        self.client.patch(route_detail_url(route_id), valid_payload(checkpoints=fixed), format="json")
        self.publish_expecting_ok(route_id)

    def test_order_must_be_positive(self):
        cps = [{"order": 0, "name": "甲", "clue": "线索甲", "task": "任务甲"}]
        response = self.client.post(ROUTES_URL, valid_payload(checkpoints=cps), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order", str(response.data))


class PublishedListAndDetailTests(RouteApiTestCase):
    def setUp(self):
        super().setUp()
        # 提交时故意打乱顺序，验证详情严格按 order 排序，而非按提交顺序
        shuffled = valid_payload(title="顺序验证线")
        shuffled["checkpoints"] = list(reversed(shuffled["checkpoints"]))  # 3,2,1
        _, self.route_id = self.create_draft(shuffled)
        self.publish_expecting_ok(self.route_id)

    def test_list_contains_published_route_with_basic_info(self):
        response = self.client.get(ROUTES_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = [r for r in response.data if r["id"] == self.route_id]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["status"], "published")
        self.assertEqual(row["status_label"], "已发布")
        self.assertEqual(row["start_point"], "南门牌楼")
        self.assertEqual(row["end_point"], "北门广场")
        self.assertEqual(row["difficulty"], "亲子")
        self.assertEqual(row["estimated_duration"], 90)
        self.assertEqual(row["checkpoint_count"], 3)
        # 列表项不应携带完整打卡点数组
        self.assertNotIn("checkpoints", row)

    def test_detail_checkpoints_strictly_ordered(self):
        detail = self.get_route(self.route_id)
        orders = [cp["order"] for cp in detail["checkpoints"]]
        self.assertEqual(orders, [1, 2, 3], "详情必须严格按 order 升序展示打卡点")
        self.assertEqual([cp["name"] for cp in detail["checkpoints"]],
                         ["南门牌楼", "湖边长椅", "北门钟楼"])

    def test_status_filters(self):
        self.create_draft(valid_payload(title="另一条草稿"))
        published = self.client.get(ROUTES_URL + "?status=published").data
        drafts = self.client.get(ROUTES_URL + "?status=draft").data
        self.assertTrue(all(r["status"] == "published" for r in published))
        self.assertTrue(all(r["status"] == "draft" for r in drafts))
        self.assertIn(self.route_id, [r["id"] for r in published])
        self.assertNotIn(self.route_id, [r["id"] for r in drafts])


class PersistenceTests(RouteApiTestCase):
    def test_data_present_after_refresh_simulation(self):
        """刷新 = 重新发起 GET 请求并从数据库读取；发布结果必须持久存在。"""
        _, route_id = self.create_draft(valid_payload(title="持久化验证线"))
        self.publish_expecting_ok(route_id)

        # 用新的客户端实例（无会话状态）重新读取，等价于浏览器刷新
        first = self.client.get(route_detail_url(route_id))
        second = self.client.get(route_detail_url(route_id))
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.json(), first.json(), "再次读取结果应一致（刷新后仍在）")
        self.assertEqual(second.data["status"], "published")
        self.assertEqual([c["order"] for c in second.data["checkpoints"]], [1, 2, 3])

    def test_draft_edit_survives_refresh(self):
        _, route_id = self.create_draft()
        self.client.patch(
            route_detail_url(route_id),
            valid_payload(equipment="新增装备：指北针"),
            format="json",
        )
        detail = self.get_route(route_id)
        self.assertEqual(detail["equipment"], "新增装备：指北针")
        self.assertEqual(detail["status"], "draft")


class DeleteTests(RouteApiTestCase):
    def test_delete_removes_route_and_its_checkpoints(self):
        _, route_id = self.create_draft(valid_payload(title="待删除线路"))
        self.assertEqual(Checkpoint.objects.filter(route_id=route_id).count(), 3)

        response = self.client.delete(route_detail_url(route_id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Route.objects.filter(pk=route_id).exists())
        self.assertEqual(Checkpoint.objects.filter(route_id=route_id).count(), 0,
                         "删除线路应级联删除其打卡点")

    def test_get_after_delete_returns_404(self):
        _, route_id = self.create_draft()
        self.client.delete(route_detail_url(route_id))
        response = self.client.get(route_detail_url(route_id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND,
                         "移除线路后再读取必须返回 404")

    def test_publish_after_delete_returns_404(self):
        _, route_id = self.create_draft()
        self.client.delete(route_detail_url(route_id))
        response = self.client.post(publish_url(route_id), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
