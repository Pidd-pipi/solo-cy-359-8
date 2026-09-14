export interface FeatureItem {
  id: number;
  title: string;
  description: string;
  status: string;
  metric: string;
}

export interface KpiItem {
  label: string;
  value: string;
  trend: string;
  tone: string;
}

export interface OperationRecord {
  key: string;
  name: string;
  owner: string;
  status: string;
  metric: string;
  priority: string;
}

export interface OverviewResponse {
  appName: string;
  appCode: string;
  description: string;
  features: FeatureItem[];
  kpis: KpiItem[];
  records: OperationRecord[];
}

// ---- 线路编排与发布 ----

export type RouteStatus = "draft" | "published";

export interface CheckpointDraft {
  /** 已保存后才有 id，编辑中的新点为 undefined */
  id?: number;
  order: number;
  name: string;
  clue: string;
  task: string;
}

export interface Checkpoint extends CheckpointDraft {
  id: number;
}

export interface RoutePayload {
  title: string;
  start_point: string;
  end_point: string;
  difficulty: string;
  estimated_duration: number | null;
  equipment: string;
  checkpoints: CheckpointDraft[];
}

/** 活动列表中的精简线路结构 */
export interface RouteSummary {
  id: number;
  title: string;
  status: RouteStatus;
  status_label: string;
  start_point: string;
  end_point: string;
  difficulty: string;
  difficulty_label: string;
  estimated_duration: number | null;
  equipment: string;
  checkpoint_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/** 线路详情（含按顺序排列的打卡点） */
export interface RouteDetail extends RouteSummary {
  checkpoints: Checkpoint[];
}

/** 更新已发布线路后，若内容不再满足发布要求，后端会撤回为草稿并返回缺失项 */
export interface RouteSaveResult extends RouteDetail {
  demoted?: boolean;
  errors?: string[];
  message?: string;
}

/** 发布失败时后端返回的校验信息 */
export interface PublishErrorResponse {
  message?: string;
  errors?: string[];
}
