"""重点回归：草稿重试只保留一条、已发布线路被改坏自动回草稿、失败请求不留错误状态。"""
from rest_framework import status

from .base import (
    ROUTES_URL,
    RouteApiTestCase,
    publish_url,
    route_detail_url,
    valid_payload,
)
from ..models import Route


class RepeatedFailedPublishTests(RouteApiTestCase):
    """首次发布失败后连续重试，只能复用同一条草稿。"""

    def test_repeated_failed_publish_keeps_single_draft(self):
        # 仅有标题、其余必填项全部缺失的草稿
        response = self.client.post(ROUTES_URL, {"title": "待完善线路"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        route_id = response.data["id"]

        for attempt in range(1, 4):
            failed = self.client.post(publish_url(route_id), {}, format="json")
            self.assertEqual(failed.status_code, status.HTTP_400_BAD_REQUEST,
                             f"第 {attempt} 次发布应继续被拒绝")
            self.assertTrue(failed.data["errors"], "每次失败都应返回缺失项清单")

        # 关键断言：重试 3 次后仍然只有这一条同名草稿
        self.assertEqual(Route.objects.filter(title="待完善线路").count(), 1,
                         "首次发布失败后连续重试，数据库中只能存在一条草稿，不能重复新建")
        self.assertEqual(Route.objects.count(), 1)
        self.assertEqual(self.get_route(route_id)["status"], "draft",
                         "失败的发布不能把状态改成已发布")

    def test_saving_and_retrying_still_single_record(self):
        _, route_id = self.create_draft()
        # 在草稿上反复保存（PATCH）并反复尝试发布，都不应产生新记录
        for i in range(3):
            patched = self.client.patch(
                route_detail_url(route_id),
                valid_payload(title="反复保存的草稿", start_point=""),
                format="json",
            )
            self.assertEqual(patched.status_code, status.HTTP_200_OK)
            self.assertEqual(patched.data["status"], "draft")
            failed = self.client.post(publish_url(route_id), {}, format="json")
            self.assertEqual(failed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Route.objects.count(), 1)

    def test_eventually_complete_and_publish_same_record(self):
        response = self.client.post(ROUTES_URL, {"title": "终将发布"}, format="json")
        route_id = response.data["id"]
        self.assertEqual(self.client.post(publish_url(route_id), {}, format="json").status_code,
                         status.HTTP_400_BAD_REQUEST)

        # 补全为合法内容后，同一条记录发布成功
        self.client.patch(route_detail_url(route_id), valid_payload(title="终将发布"),
                          format="json")
        ok = self.client.post(publish_url(route_id), {}, format="json")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertEqual(ok.data["id"], route_id, "应在原草稿上发布，而不是另建记录")
        self.assertEqual(Route.objects.count(), 1)
        self.assertEqual(self.get_route(route_id)["status"], "published")


class PublishedRouteDemotionTests(RouteApiTestCase):
    """已发布线路被保存成不完整内容后，必须自动回到草稿。"""

    def setUp(self):
        super().setUp()
        _, self.route_id = self.create_draft()
        self.publish_expecting_ok(self.route_id)

    def test_clearing_start_point_demotes_to_draft(self):
        response = self.client.patch(
            route_detail_url(self.route_id),
            valid_payload(start_point=""),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["demoted"], "响应应明确标记已撤回为草稿")
        self.assertEqual(response.data["status"], "draft",
                         "已发布线路清空起点后必须回到草稿，不能保留无效的已发布记录")
        self.assert_publish_errors_contain(response.data["errors"], "起点")

        detail = self.get_route(self.route_id)
        self.assertEqual(detail["status"], "draft")
        self.assertEqual(detail["start_point"], "")

    def test_removing_all_checkpoints_demotes(self):
        response = self.client.patch(
            route_detail_url(self.route_id),
            valid_payload(checkpoints=[]),
            format="json",
        )
        self.assertEqual(response.data["status"], "draft")
        self.assert_publish_errors_contain(response.data["errors"], "打卡点")
        self.assertEqual(len(self.get_route(self.route_id)["checkpoints"]), 0)

    def test_duplicate_order_edit_demotes(self):
        bad = [
            {"order": 1, "name": "甲", "clue": "线索甲", "task": "任务甲"},
            {"order": 1, "name": "乙", "clue": "线索乙", "task": "任务乙"},
        ]
        response = self.client.patch(
            route_detail_url(self.route_id), valid_payload(checkpoints=bad), format="json"
        )
        self.assertEqual(response.data["status"], "draft")
        self.assertTrue(any("顺序重复" in e for e in response.data["errors"]))

    def test_demoted_route_excluded_from_published_list(self):
        self.client.patch(
            route_detail_url(self.route_id), valid_payload(end_point=""), format="json"
        )
        published = self.client.get(ROUTES_URL + "?status=published").data
        self.assertNotIn(self.route_id, [r["id"] for r in published],
                         "回到草稿的线路不能继续出现在已发布活动列表")

    def test_valid_edit_keeps_published(self):
        response = self.client.patch(
            route_detail_url(self.route_id),
            valid_payload(equipment="饮用水、口哨"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("demoted", {k: v for k, v in response.data.items() if v})
        self.assertEqual(response.data["status"], "published",
                         "内容仍满足发布要求时应保持已发布")

    def test_demoted_route_can_be_completed_and_republished(self):
        # 改坏 -> 回草稿
        broken = self.client.patch(
            route_detail_url(self.route_id), valid_payload(start_point=""), format="json"
        )
        self.assertEqual(broken.data["status"], "draft")
        # 直接再发布仍然失败
        retry = self.client.post(publish_url(self.route_id), {}, format="json")
        self.assertEqual(retry.status_code, status.HTTP_400_BAD_REQUEST)
        # 补全后重新发布成功，仍是同一条记录
        self.client.patch(
            route_detail_url(self.route_id), valid_payload(start_point="南门牌楼"), format="json"
        )
        republished = self.client.post(publish_url(self.route_id), {}, format="json")
        self.assertEqual(republished.status_code, status.HTTP_200_OK)
        self.assertEqual(republished.data["status"], "published")
        self.assertEqual(Route.objects.count(), 1)


class FailedRequestsLeaveNoBadStateTests(RouteApiTestCase):
    """任何 4xx 请求都不能污染已有数据或留下错误状态。"""

    def test_invalid_create_does_not_persist(self):
        before = Route.objects.count()
        response = self.client.post(
            ROUTES_URL, valid_payload(title=""), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Route.objects.count(), before, "创建请求被拒后不应写入任何线路")

    def test_invalid_update_does_not_change_published_route(self):
        _, route_id = self.create_draft()
        self.publish_expecting_ok(route_id)
        # 非法时长（序列化层 400），原有已发布内容必须原样保留
        response = self.client.patch(
            route_detail_url(route_id), valid_payload(estimated_duration=-5), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        detail = self.get_route(route_id)
        self.assertEqual(detail["status"], "published", "更新被整体拒绝，状态不应改变")
        self.assertEqual(detail["estimated_duration"], 90)

    def test_publish_nonexistent_returns_404_without_side_effect(self):
        response = self.client.post(publish_url(999999), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_nonexistent_returns_404(self):
        response = self.client.patch(
            route_detail_url(999999), valid_payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_malformed_json_handled_cleanly(self):
        response = self.client.generic(
            "POST", ROUTES_URL, data="{not valid json", content_type="application/json"
        )
        self.assertGreaterEqual(response.status_code, 400)
        self.assertLess(response.status_code, 500, "畸形 JSON 应返回 4xx 而不是 500")
        self.assertEqual(Route.objects.count(), 0, "畸形请求不应创建数据")
