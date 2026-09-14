import { API_BASE_URL } from "../constants/app";
import type {
  OverviewResponse,
  PublishErrorResponse,
  RouteDetail,
  RoutePayload,
  RouteSaveResult,
  RouteStatus,
  RouteSummary,
} from "../types";

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** 业务/接口异常：发布校验失败时携带后端给出的缺失项列表。 */
export class ApiError extends Error {
  status: number;
  errors: string[];
  detail: unknown;

  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    if (detail && typeof detail === "object" && Array.isArray((detail as PublishErrorResponse).errors)) {
      this.errors = (detail as PublishErrorResponse).errors ?? [];
    } else {
      this.errors = [];
    }
  }
}

export async function fetchOverview(): Promise<OverviewResponse> {
  const response = await fetch(`${API_BASE_URL}/overview`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new ApiError(response.status, `Overview request failed: ${response.status}`);
  }

  return response.json() as Promise<OverviewResponse>;
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...options,
  });
  const body = await readJson(response);

  if (!response.ok) {
    const fallback = `请求失败（${response.status}）`;
    const message =
      (body as PublishErrorResponse)?.message ??
      (typeof body === "string" ? body : fallback);
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

export function fetchRoutes(status?: RouteStatus): Promise<RouteSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<RouteSummary[]>(`/routes/${query}`, { method: "GET" });
}

export function fetchRoute(id: number): Promise<RouteDetail> {
  return request<RouteDetail>(`/routes/${id}/`, { method: "GET" });
}

export function createRoute(payload: RoutePayload): Promise<RouteSaveResult> {
  return request<RouteSaveResult>(`/routes/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRoute(id: number, payload: RoutePayload): Promise<RouteSaveResult> {
  return request<RouteSaveResult>(`/routes/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function publishRoute(id: number): Promise<RouteDetail> {
  return request<RouteDetail>(`/routes/${id}/publish/`, { method: "POST" });
}

export function deleteRoute(id: number): Promise<void> {
  return request<void>(`/routes/${id}/`, { method: "DELETE" });
}
