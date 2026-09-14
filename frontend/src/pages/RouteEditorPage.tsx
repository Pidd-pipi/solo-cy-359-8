import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  PushpinOutlined,
} from "@ant-design/icons";
import { ApiError, createRoute, fetchRoute, publishRoute, updateRoute } from "../api/client";
import { DIFFICULTY_OPTIONS, EQUIPMENT_SUGGESTIONS } from "../constants/routes";
import type { RoutePayload, RouteSaveResult } from "../types";

interface CheckpointRow {
  key: string;
  order: number;
  name: string;
  clue: string;
  task: string;
}

interface RouteFormState {
  title: string;
  start_point: string;
  end_point: string;
  difficulty: string;
  estimated_duration: number | null;
  equipment: string;
}

const EMPTY_FORM: RouteFormState = {
  title: "",
  start_point: "",
  end_point: "",
  difficulty: "",
  estimated_duration: null,
  equipment: "",
};

export function RouteEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editId = id && id !== "new" ? Number(id) : null;
  const isEdit = editId !== null;

  const [form, setForm] = useState<RouteFormState>(EMPTY_FORM);
  const [checkpoints, setCheckpoints] = useState<CheckpointRow[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishErrors, setPublishErrors] = useState<string[]>([]);
  // 进入编辑时线路是否为已发布（一旦被撤回为草稿会同步更新）
  const [publishedAtLoad, setPublishedAtLoad] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const keySeq = useRef(0);
  // 已持久化的线路 id：首次创建后即固定，发布校验失败再点发布时复用同一条草稿，不重复新建
  const routeIdRef = useRef<number | null>(null);

  const nextKey = () => `cp-${Date.now()}-${keySeq.current++}`;

  useEffect(() => {
    if (!isEdit || editId === null) {
      return;
    }
    setLoading(true);
    fetchRoute(editId)
      .then((route) => {
        routeIdRef.current = editId;
        setPublishedAtLoad(route.status === "published");
        setForm({
          title: route.title,
          start_point: route.start_point,
          end_point: route.end_point,
          difficulty: route.difficulty,
          estimated_duration: route.estimated_duration,
          equipment: route.equipment,
        });
        const cps = [...route.checkpoints]
          .sort((a, b) => a.order - b.order)
          .map((cp) => ({
            key: nextKey(),
            order: cp.order,
            name: cp.name,
            clue: cp.clue,
            task: cp.task,
          }));
        setCheckpoints(cps);
      })
      .catch(() => messageApi.error("加载线路草稿失败"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, isEdit]);

  // 重复的打卡点顺序（前端即时提示，发布以后端校验为准）
  const duplicateOrders = useMemo(() => {
    const seen = new Set<number>();
    const dup = new Set<number>();
    checkpoints.forEach((cp) => {
      if (seen.has(cp.order)) {
        dup.add(cp.order);
      }
      seen.add(cp.order);
    });
    return dup;
  }, [checkpoints]);

  const updateForm = <K extends keyof RouteFormState>(key: K, value: RouteFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCheckpoint = (key: string, patch: Partial<CheckpointRow>) => {
    setCheckpoints((prev) => prev.map((cp) => (cp.key === key ? { ...cp, ...patch } : cp)));
  };

  const addCheckpoint = () => {
    const maxOrder = checkpoints.reduce((max, cp) => Math.max(max, cp.order), 0);
    setCheckpoints((prev) => [
      ...prev,
      { key: nextKey(), order: maxOrder + 1, name: "", clue: "", task: "" },
    ]);
  };

  const removeCheckpoint = (key: string) => {
    setCheckpoints((prev) => prev.filter((cp) => cp.key !== key));
  };

  const moveCheckpoint = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= checkpoints.length) {
      return;
    }
    setCheckpoints((prev) => {
      const next = [...prev];
      // 交换两条的顺序值与位置，保证顺序唯一且直观
      const a = next[index];
      const b = next[target];
      const orderA = a.order;
      next[index] = { ...b, order: orderA };
      next[target] = { ...a, order: b.order };
      return next;
    });
  };

  const buildPayload = (): RoutePayload => ({
    title: form.title.trim(),
    start_point: form.start_point.trim(),
    end_point: form.end_point.trim(),
    difficulty: form.difficulty,
    estimated_duration: form.estimated_duration,
    equipment: form.equipment.trim(),
    checkpoints: checkpoints.map((cp) => ({
      order: cp.order,
      name: cp.name.trim(),
      clue: cp.clue.trim(),
      task: cp.task.trim(),
    })),
  });

  const persist = async (): Promise<RouteSaveResult | null> => {
    if (!form.title.trim()) {
      messageApi.warning("请先填写线路名称");
      return null;
    }
    const payload = buildPayload();
    const existingId = routeIdRef.current;
    if (existingId !== null) {
      // 复用同一条线路（含首次发布校验失败后再次发布的场景），绝不重复新建
      return updateRoute(existingId, payload);
    }
    const created = await createRoute(payload);
    routeIdRef.current = created.id;
    return created;
  };

  // 更新已发布线路时若被后端撤回为草稿，同步本地状态并返回缺失项
  const applySaveResult = (result: RouteSaveResult): string[] => {
    if (result.demoted) {
      setPublishedAtLoad(false);
      return result.errors ?? [];
    }
    return [];
  };

  const handleSaveDraft = async () => {
    setPublishErrors([]);
    setSaving(true);
    try {
      const result = await persist();
      if (result === null) {
        return;
      }
      const demotionErrors = applySaveResult(result);
      if (demotionErrors.length > 0) {
        setPublishErrors(demotionErrors);
        messageApi.warning("内容已不满足发布要求，线路已撤回为草稿");
      } else {
        messageApi.success(result.status === "published" ? "已发布线路内容已更新" : "草稿已保存");
      }
      navigate(`/routes/${result.id}/edit`, { replace: true });
    } catch {
      messageApi.error("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishErrors([]);
    setPublishing(true);
    try {
      // 先保存再发布，确保发布的是最新编辑内容；始终复用 routeIdRef 中的同一条线路
      const beforeId = routeIdRef.current;
      const result = await persist();
      if (result === null) {
        return;
      }
      const demotionErrors = applySaveResult(result);
      if (demotionErrors.length > 0) {
        // 原本已发布的线路被改到不合规，已被后端撤回为草稿，直接提示，不再继续发布
        setPublishErrors(demotionErrors);
        navigate(`/routes/${result.id}/edit`, { replace: true });
        return;
      }
      const routeId = result.id;
      // 新建线路首次就点发布时：草稿已落库，把地址栏固定到该草稿的编辑页（不卸载组件，
      // 保留缺失项提示），这样再次点发布或刷新都复用同一条记录，绝不重复新建草稿。
      if (beforeId === null) {
        window.history.replaceState(null, "", `/routes/${routeId}/edit`);
      }
      try {
        await publishRoute(routeId);
      } catch (error) {
        if (error instanceof ApiError && error.errors.length > 0) {
          setPublishErrors(error.errors);
          return;
        }
        messageApi.error("发布失败，请稍后重试");
        return;
      }
      setPublishedAtLoad(true);
      messageApi.success("线路发布成功，已进入活动列表");
      navigate(`/routes/${routeId}`);
    } finally {
      setPublishing(false);
    }
  };

  const appendEquipment = (item: string) => {
    setForm((prev) => {
      const current = prev.equipment.trim();
      if (current.split(/[、,，\s]+/).includes(item)) {
        return prev;
      }
      return { ...prev, equipment: current ? `${current}、${item}` : item };
    });
  };

  if (loading) {
    return (
      <div className="page-loading">
        <Spin size="large" />
        <span className="loading-text">加载草稿中…</span>
      </div>
    );
  }

  return (
    <section className="work-panel editor-panel">
      {contextHolder}
      <div className="panel-head">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            {!isEdit ? "新建线路草稿" : publishedAtLoad ? "编辑已发布线路" : "编辑线路草稿"}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            录入起点、终点与按顺序排列的打卡点，填写每个点的线索与任务，设置难度、预计时长和装备要求。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={() => navigate("/routes")}>返回列表</Button>
          <Button loading={saving} onClick={handleSaveDraft}>
            保存草稿
          </Button>
          <Button type="primary" loading={publishing} onClick={handlePublish}>
            发布线路
          </Button>
        </Space>
      </div>

      {publishErrors.length > 0 && (
        <Alert
          className="publish-alert"
          type="error"
          showIcon
          message="存在缺失项，暂不能发布"
          description={
            <ul className="error-list">
              {publishErrors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          }
        />
      )}

      <Card title="基本信息" className="editor-card">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <label className="field-label">
              <span className="required">*</span> 线路名称
            </label>
            <Input
              value={form.title}
              placeholder="例如：滨江公园亲子寻宝线"
              maxLength={120}
              onChange={(e) => updateForm("title", e.target.value)}
            />
          </Col>
          <Col xs={24} md={12}>
            <label className="field-label">
              <span className="required">*</span> 难度
            </label>
            <Select
              className="full-width"
              placeholder="选择难度等级"
              value={form.difficulty || undefined}
              options={DIFFICULTY_OPTIONS}
              onChange={(value) => updateForm("difficulty", value)}
            />
          </Col>
          <Col xs={24} md={12}>
            <label className="field-label">
              <EnvironmentOutlined /> <span className="required">*</span> 起点
            </label>
            <Input
              value={form.start_point}
              placeholder="例如：公园南门牌楼"
              maxLength={120}
              onChange={(e) => updateForm("start_point", e.target.value)}
            />
          </Col>
          <Col xs={24} md={12}>
            <label className="field-label">
              <EnvironmentOutlined /> <span className="required">*</span> 终点
            </label>
            <Input
              value={form.end_point}
              placeholder="例如：北门广场"
              maxLength={120}
              onChange={(e) => updateForm("end_point", e.target.value)}
            />
          </Col>
          <Col xs={24} md={12}>
            <label className="field-label">
              <span className="required">*</span> 预计时长（分钟）
            </label>
            <InputNumber
              className="full-width"
              min={1}
              precision={0}
              placeholder="例如：90"
              value={form.estimated_duration}
              onChange={(value) => updateForm("estimated_duration", value)}
            />
          </Col>
          <Col xs={24} md={12}>
            <label className="field-label">装备要求</label>
            <Input
              value={form.equipment}
              placeholder="例如：饮用水、雨衣、徒步鞋"
              onChange={(e) => updateForm("equipment", e.target.value)}
            />
            <div className="suggest-row">
              {EQUIPMENT_SUGGESTIONS.map((item) => (
                <Tag key={item} className="suggest-tag" onClick={() => appendEquipment(item)}>
                  + {item}
                </Tag>
              ))}
            </div>
          </Col>
        </Row>
      </Card>

      <Card
        title={
          <Space>
            <PushpinOutlined />
            <span>打卡点（按到达顺序排列）</span>
            <Tag color={duplicateOrders.size ? "red" : "default"}>
              {checkpoints.length} 个{duplicateOrders.size ? " · 顺序有重复" : ""}
            </Tag>
          </Space>
        }
        extra={
          <Button type="dashed" icon={<PlusOutlined />} onClick={addCheckpoint}>
            添加打卡点
          </Button>
        }
        className="editor-card"
      >
        {checkpoints.length === 0 ? (
          <Empty description="还没有打卡点，点击「添加打卡点」开始编排" />
        ) : (
          <div className="cp-list">
            {checkpoints.map((cp, index) => {
              const duplicated = duplicateOrders.has(cp.order);
              return (
                <Card
                  key={cp.key}
                  size="small"
                  className={`cp-card ${duplicated ? "cp-card-error" : ""}`}
                  title={
                    <Space align="center">
                      <InputNumber
                        className="cp-order-input"
                        min={1}
                        precision={0}
                        value={cp.order}
                        status={duplicated ? "error" : undefined}
                        onChange={(value) =>
                          updateCheckpoint(cp.key, { order: typeof value === "number" ? value : 1 })
                        }
                      />
                      <Input
                        className="cp-name-input"
                        placeholder="打卡点名称（如：南门牌楼）"
                        value={cp.name}
                        maxLength={120}
                        onChange={(e) => updateCheckpoint(cp.key, { name: e.target.value })}
                      />
                      {duplicated && <Tag color="red">顺序重复</Tag>}
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        onClick={() => moveCheckpoint(index, -1)}
                      />
                      <Button
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={index === checkpoints.length - 1}
                        onClick={() => moveCheckpoint(index, 1)}
                      />
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeCheckpoint(cp.key)}
                      />
                    </Space>
                  }
                >
                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={12}>
                      <label className="field-label">
                        <span className="required">*</span> 线索
                      </label>
                      <Input.TextArea
                        rows={3}
                        placeholder="参与者据此找到该打卡点，例如：沿主路向东找到第三张红色长椅"
                        value={cp.clue}
                        onChange={(e) => updateCheckpoint(cp.key, { clue: e.target.value })}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <label className="field-label">
                        <span className="required">*</span> 任务
                      </label>
                      <Input.TextArea
                        rows={3}
                        placeholder="到达后需完成的任务，例如：扫描椅背二维码答题 / 拍摄团队合影"
                        value={cp.task}
                        onChange={(e) => updateCheckpoint(cp.key, { task: e.target.value })}
                      />
                    </Col>
                  </Row>
                </Card>
              );
            })}
          </div>
        )}
      </Card>

      <Typography.Paragraph type="secondary" className="existing-hint">
        {publishedAtLoad
          ? "提示：该线路已发布，保存或再次发布时内容必须继续满足发布要求；若清空必填项或打卡点，线路会被撤回为草稿，不会保留无效的已发布记录。"
          : "提示：保存草稿不会校验完整性；点击「发布线路」时将统一校验缺失项与打卡点顺序。"}
      </Typography.Paragraph>
    </section>
  );
}
