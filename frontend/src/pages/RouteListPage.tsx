import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Empty,
  Popconfirm,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { deleteRoute, fetchRoutes } from "../api/client";
import { STATUS_META, difficultyLabel, formatDuration } from "../constants/routes";
import type { RouteStatus, RouteSummary } from "../types";

type Filter = "all" | RouteStatus;

export function RouteListPage() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [messageApi, contextHolder] = message.useMessage();

  const load = useCallback((status: Filter) => {
    setLoading(true);
    fetchRoutes(status === "all" ? undefined : status)
      .then(setRoutes)
      .catch(() => messageApi.error("加载活动列表失败，请稍后重试"))
      .finally(() => setLoading(false));
  }, [messageApi]);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const handleDelete = async (id: number) => {
    try {
      await deleteRoute(id);
      messageApi.success("线路已删除");
      load(filter);
    } catch {
      messageApi.error("删除失败，请稍后重试");
    }
  };

  const columns: ColumnsType<RouteSummary> = [
    {
      title: "线路名称",
      dataIndex: "title",
      key: "title",
      render: (value, record) => (
        <Button type="link" className="cell-link" onClick={() => navigate(`/routes/${record.id}`)}>
          {value}
        </Button>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: RouteStatus) => (
        <Tag color={STATUS_META[status]?.color}>{STATUS_META[status]?.label ?? status}</Tag>
      ),
    },
    {
      title: "起点 → 终点",
      key: "path",
      render: (_, record) =>
        record.start_point || record.end_point ? (
          <span>
            {record.start_point || "—"} <span className="muted">→</span> {record.end_point || "—"}
          </span>
        ) : (
          <span className="muted">未设置</span>
        ),
    },
    {
      title: "难度",
      dataIndex: "difficulty",
      key: "difficulty",
      width: 150,
      render: (value: string) => (value ? difficultyLabel(value) : <span className="muted">未设置</span>),
    },
    {
      title: "预计时长",
      dataIndex: "estimated_duration",
      key: "estimated_duration",
      width: 130,
      render: (value: number | null) => formatDuration(value),
    },
    {
      title: "打卡点",
      dataIndex: "checkpoint_count",
      key: "checkpoint_count",
      width: 90,
      align: "center",
      render: (value: number) => <Tag>{value} 个</Tag>,
    },
    {
      title: "操作",
      key: "actions",
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" onClick={() => navigate(`/routes/${record.id}`)}>
            详情
          </Button>
          <Button size="small" type="primary" ghost onClick={() => navigate(`/routes/${record.id}/edit`)}>
            编辑
          </Button>
          <Popconfirm
            title="删除该线路？"
            description="删除后不可恢复。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <section className="work-panel">
      {contextHolder}
      <div className="panel-head">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            活动线路
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            编排线路草稿并发布，发布后的线路出现在活动列表中，刷新后依旧保留。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load(filter)} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/routes/new")}>
            新建线路
          </Button>
        </Space>
      </div>

      <Segmented
        className="filter-segment"
        value={filter}
        onChange={(value) => setFilter(value as Filter)}
        options={[
          { label: "全部", value: "all" },
          { label: "草稿", value: "draft" },
          { label: "已发布", value: "published" },
        ]}
      />

      <Spin spinning={loading}>
        <Card styles={{ body: { padding: 0 } }}>
          <Table
            columns={columns}
            dataSource={routes}
            rowKey="id"
            pagination={false}
            locale={{
              emptyText: <Empty description={filter === "published" ? "暂无已发布线路" : "暂无线路，点击右上角新建"} />,
            }}
          />
        </Card>
      </Spin>
    </section>
  );
}
