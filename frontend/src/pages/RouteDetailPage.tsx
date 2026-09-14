import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Result,
  Row,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from "antd";
import {
  ClockCircleOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FlagOutlined,
  SafetyOutlined,
} from "@ant-design/icons";
import { fetchRoute } from "../api/client";
import { STATUS_META, difficultyLabel, formatDuration } from "../constants/routes";
import type { RouteDetail } from "../types";

export function RouteDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const routeId = Number(id);
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setNotFound(false);
    fetchRoute(routeId)
      .then(setRoute)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [routeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="page-loading">
        <Spin size="large" />
        <span className="loading-text">加载线路详情…</span>
      </div>
    );
  }

  if (notFound || !route) {
    return (
      <Result
        status="404"
        title="线路不存在"
        subTitle="该线路可能已被删除。"
        extra={
          <Button type="primary" onClick={() => navigate("/routes")}>
            返回活动列表
          </Button>
        }
      />
    );
  }

  const orderedCheckpoints = [...route.checkpoints].sort((a, b) => a.order - b.order);
  const meta = STATUS_META[route.status];

  return (
    <section className="work-panel detail-panel">
      <div className="panel-head">
        <div>
          <Space align="center" wrap>
            <Typography.Title level={3} style={{ marginBottom: 0 }}>
              {route.title}
            </Typography.Title>
            <Tag color={meta?.color}>{meta?.label ?? route.status}</Tag>
          </Space>
        </div>
        <Space>
          <Button onClick={() => navigate("/routes")}>返回列表</Button>
          <Button type="primary" ghost onClick={() => navigate(`/routes/${route.id}/edit`)}>
            {route.status === "draft" ? "继续编辑" : "编辑线路"}
          </Button>
        </Space>
      </div>

      {route.status === "draft" && (
        <Alert
          className="publish-alert"
          type="warning"
          showIcon
          message="该线路仍是草稿，尚未发布"
          description="补全起点、终点、难度、时长以及各打卡点的线索与任务后即可发布。"
          action={
            <Button type="primary" size="small" onClick={() => navigate(`/routes/${route.id}/edit`)}>
              去完善并发布
            </Button>
          }
        />
      )}

      <Card className="editor-card">
        <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
          <Descriptions.Item label={<><EnvironmentOutlined /> 起点</>}>
            {route.start_point || <span className="muted">未设置</span>}
          </Descriptions.Item>
          <Descriptions.Item label={<><FlagOutlined /> 终点</>}>
            {route.end_point || <span className="muted">未设置</span>}
          </Descriptions.Item>
          <Descriptions.Item label={<><DashboardOutlined /> 难度</>}>
            {route.difficulty ? difficultyLabel(route.difficulty) : <span className="muted">未设置</span>}
          </Descriptions.Item>
          <Descriptions.Item label={<><ClockCircleOutlined /> 预计时长</>}>
            {formatDuration(route.estimated_duration)}
          </Descriptions.Item>
          <Descriptions.Item label={<><SafetyOutlined /> 装备要求</>} span={2}>
            {route.equipment || <span className="muted">无特殊要求</span>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        className="editor-card"
        title={
          <Space>
            <span>打卡点路线（严格按顺序）</span>
            <Tag>{orderedCheckpoints.length} 个</Tag>
          </Space>
        }
      >
        {orderedCheckpoints.length === 0 ? (
          <Empty description="暂无打卡点" />
        ) : (
          <Timeline
            mode="left"
            items={orderedCheckpoints.map((cp) => ({
              color: "#b14f3b",
              label: (
                <span className="cp-timeline-order">
                  第 {cp.order} 站
                </span>
              ),
              children: (
                <div className="cp-timeline-body">
                  <Space align="center" wrap className="cp-timeline-head">
                    <Tag color="processing">CP{cp.order}</Tag>
                    <strong>{cp.name || `打卡点 ${cp.order}`}</strong>
                  </Space>
                  <Row gutter={[16, 8]} className="cp-timeline-grid">
                    <Col xs={24} md={12}>
                      <div className="cp-field-label">线索</div>
                      <div className="cp-field-text">{cp.clue || <span className="muted">未填写</span>}</div>
                    </Col>
                    <Col xs={24} md={12}>
                      <div className="cp-field-label">任务</div>
                      <div className="cp-field-text">{cp.task || <span className="muted">未填写</span>}</div>
                    </Col>
                  </Row>
                </div>
              ),
            }))}
          />
        )}
      </Card>
    </section>
  );
}
