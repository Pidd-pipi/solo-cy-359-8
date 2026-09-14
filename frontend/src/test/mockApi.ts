/**
 * 前端测试用的内存版 API mock。
 *
 * 行为与后端 domain/api.py + domain/services.py 保持一致：
 * - 新建只产生草稿；发布按相同规则校验，失败抛出携带 errors 的 ApiError（400）
 * - 更新已发布线路若不再合规，会返回 demoted:true 并把状态撤回为草稿
 * - 删除后再读取/发布返回 404
 *
 * 不做任何网络请求，状态保存在内存里；每个测试调用 resetMock() 即可在干净环境运行。
 */
import type {
  RoutePayload,
  RouteSaveResult,
  RouteDetail,
  RouteSummary,
  RouteStatus,
  Checkpoint,
} from "../types";

export class ApiError extends Error {
  status: number;
  errors: string[];
  constructor(status: number, message: string, errors: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

interface MockCheckpoint extends Checkpoint {}

interface MockRoute {
  id: number;
  title: string;
  status: RouteStatus;
  start_point: string;
  end_point: string;
  difficulty: string;
  estimated_duration: number | null;
  equipment: string;
  checkpoints: MockCheckpoint[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  亲子: "亲子（轻松休闲）",
  成人: "成人（标准挑战）",
  专业: "专业（高强度越野）",
};

const now = () => new Date().toISOString();

let seq = 0;
let store = new Map<number, MockRoute>();
const callCounts = { create: 0, update: 0, publish: 0, delete: 0, fetch: 0 };

function blank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** 与后端 collect_publish_errors 等价的校验。 */
export function collectErrors(route: {
  start_point: string;
  end_point: string;
  difficulty: string;
  estimated_duration: number | null;
  checkpoints: Pick<MockCheckpoint, "order" | "name" | "clue" | "task">[];
}): string[] {
  const errors: string[] = [];
  if (blank(route.start_point)) errors.push("未填写起点");
  if (blank(route.end_point)) errors.push("未填写终点");
  if (blank(route.difficulty)) errors.push("未选择难度");
  if (route.estimated_duration === null) errors.push("未填写预计时长");
  else if (route.estimated_duration <= 0) errors.push("预计时长必须大于 0 分钟");

  const cps = route.checkpoints;
  if (cps.length === 0) {
    errors.push("至少需要添加 1 个打卡点");
  } else {
    const seen = new Set<number>();
    const dup = new Set<number>();
    cps.forEach((cp) => {
      if (seen.has(cp.order)) dup.add(cp.order);
      seen.add(cp.order);
      const label = cp.name?.trim() || `第 ${cp.order} 个打卡点`;
      if (blank(cp.clue)) errors.push(`打卡点「${label}」未填写线索`);
      if (blank(cp.task)) errors.push(`打卡点「${label}」未填写任务`);
    });
    if (dup.size) {
      errors.push(`打卡点顺序重复（第 ${[...dup].sort((a, b) => a - b).join("、")} 位），请调整后再发布`);
    }
  }
  return errors;
}

function toDetail(route: MockRoute, extra: Partial<RouteSaveResult> = {}): RouteSaveResult {
  const ordered = [...route.checkpoints].sort((a, b) => a.order - b.order);
  return {
    id: route.id,
    title: route.title,
    status: route.status,
    status_label: route.status === "published" ? "已发布" : "草稿",
    start_point: route.start_point,
    end_point: route.end_point,
    difficulty: route.difficulty,
    difficulty_label: route.difficulty ? DIFFICULTY_LABELS[route.difficulty] ?? route.difficulty : "未设置",
    estimated_duration: route.estimated_duration,
    equipment: route.equipment,
    checkpoints: ordered,
    checkpoint_count: ordered.length,
    created_at: route.created_at,
    updated_at: route.updated_at,
    published_at: route.published_at,
    ...extra,
  };
}

function toSummary(route: MockRoute): RouteSummary {
  const { checkpoints, ...rest } = toDetail(route);
  void checkpoints;
  return rest;
}

function applyPayload(route: MockRoute, p: RoutePayload) {
  route.title = p.title;
  route.start_point = p.start_point;
  route.end_point = p.end_point;
  route.difficulty = p.difficulty;
  route.estimated_duration = p.estimated_duration;
  route.equipment = p.equipment;
  route.checkpoints = p.checkpoints.map((cp, i) => ({
    id: (route.id + 1) * 1000 + i + 1,
    order: cp.order,
    name: cp.name,
    clue: cp.clue,
    task: cp.task,
  }));
  route.updated_at = now();
}

export async function createRoute(payload: RoutePayload): Promise<RouteSaveResult> {
  callCounts.create += 1;
  if (blank(payload.title)) throw new ApiError(400, "线路名称必填", []);
  if (payload.estimated_duration !== null && payload.estimated_duration <= 0) {
    throw new ApiError(400, "预计时长非法", []);
  }
  if (payload.checkpoints.some((c) => c.order <= 0)) {
    throw new ApiError(400, "打卡点顺序非法", []);
  }
  const id = ++seq;
  const route: MockRoute = {
    id,
    title: payload.title,
    status: "draft",
    start_point: payload.start_point,
    end_point: payload.end_point,
    difficulty: payload.difficulty,
    estimated_duration: payload.estimated_duration,
    equipment: payload.equipment,
    checkpoints: [],
    created_at: now(),
    updated_at: now(),
    published_at: null,
  };
  applyPayload(route, payload);
  store.set(id, route);
  return toDetail(route);
}

export async function updateRoute(id: number, payload: RoutePayload): Promise<RouteSaveResult> {
  callCounts.update += 1;
  const route = store.get(id);
  if (!route) throw new ApiError(404, "线路不存在", []);
  const wasPublished = route.status === "published";
  applyPayload(route, payload);

  if (!wasPublished) return toDetail(route);

  const errors = collectErrors(route);
  if (errors.length === 0) return toDetail(route);

  route.status = "draft";
  return toDetail(route, {
    demoted: true,
    errors,
    message: "修改后的内容不满足发布要求，线路已撤回为草稿",
  });
}

export async function publishRoute(id: number): Promise<RouteDetail> {
  callCounts.publish += 1;
  const route = store.get(id);
  if (!route) throw new ApiError(404, "线路不存在", []);
  const errors = collectErrors(route);
  if (errors.length) throw new ApiError(400, "线路信息不完整，无法发布", errors);
  route.status = "published";
  route.published_at = now();
  route.updated_at = now();
  return toDetail(route);
}

export async function fetchRoute(id: number): Promise<RouteDetail> {
  callCounts.fetch += 1;
  const route = store.get(id);
  if (!route) throw new ApiError(404, "线路不存在", []);
  return toDetail(route);
}

export async function fetchRoutes(): Promise<RouteSummary[]> {
  return [...store.values()].map(toSummary);
}

export async function deleteRoute(id: number): Promise<void> {
  callCounts.delete += 1;
  if (!store.has(id)) throw new ApiError(404, "线路不存在", []);
  store.delete(id);
}

export async function fetchOverview(): Promise<never> {
  throw new Error("overview 不在编辑器测试范围内");
}

// ---- 测试辅助 ----
export function resetMock() {
  seq = 0;
  store = new Map();
  callCounts.create = 0;
  callCounts.update = 0;
  callCounts.publish = 0;
  callCounts.delete = 0;
  callCounts.fetch = 0;
}

export function getCallCounts() {
  return { ...callCounts };
}

export function getMockRoute(id: number): MockRoute | undefined {
  return store.get(id);
}

export function routeCount(): number {
  return store.size;
}

/** 直接向内存库写入一条线路，不经过 create 计数，用于测试前置数据。 */
function seedRoute(payload: RoutePayload, status: RouteStatus): number {
  const id = ++seq;
  const route: MockRoute = {
    id,
    title: payload.title,
    status,
    start_point: payload.start_point,
    end_point: payload.end_point,
    difficulty: payload.difficulty,
    estimated_duration: payload.estimated_duration,
    equipment: payload.equipment,
    checkpoints: [],
    created_at: now(),
    updated_at: now(),
    published_at: status === "published" ? now() : null,
  };
  applyPayload(route, payload);
  store.set(id, route);
  return id;
}

const VALID: RoutePayload = {
  title: "合规线路",
  start_point: "南门牌楼",
  end_point: "北门广场",
  difficulty: "亲子",
  estimated_duration: 90,
  equipment: "饮用水",
  checkpoints: [
    { order: 1, name: "CP1", clue: "线索一", task: "任务一" },
    { order: 2, name: "CP2", clue: "线索二", task: "任务二" },
  ],
};

export function seedValidDraft(): number {
  return seedRoute({ ...VALID }, "draft");
}

export function seedValidPublished(): number {
  return seedRoute({ ...VALID }, "published");
}
