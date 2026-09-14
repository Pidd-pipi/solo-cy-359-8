import type { RouteStatus } from "../types";

/** 难度选项，顺序与后端 choices 保持一致 */
export const DIFFICULTY_OPTIONS: { value: string; label: string }[] = [
  { value: "亲子", label: "亲子（轻松休闲）" },
  { value: "成人", label: "成人（标准挑战）" },
  { value: "专业", label: "专业（高强度越野）" },
];

export const STATUS_META: Record<
  RouteStatus,
  { label: string; color: string }
> = {
  draft: { label: "草稿", color: "default" },
  published: { label: "已发布", color: "green" },
};

export const EQUIPMENT_SUGGESTIONS = [
  "运动服",
  "徒步鞋",
  "手机充电宝",
  "饮用水",
  "雨衣",
  "指北针",
];

export function difficultyLabel(value: string): string {
  return DIFFICULTY_OPTIONS.find((item) => item.value === value)?.label ?? value ?? "未设置";
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === undefined) {
    return "未设置";
  }
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}
