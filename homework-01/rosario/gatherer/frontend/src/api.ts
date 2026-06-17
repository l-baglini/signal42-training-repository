import type {
  DigestOut,
  FindingDetail,
  FindingSummary,
  RunOut,
  Topic,
} from "./types";

// Relative base — nginx (prod) / Vite proxy (dev) forwards /api to the backend.
const BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listTopics: () => req<Topic[]>("/topics"),
  createTopic: (name: string, schedule_cron?: string) =>
    req<Topic>("/topics", {
      method: "POST",
      body: JSON.stringify({ name, schedule_cron: schedule_cron || null }),
    }),
  deleteTopic: (id: string) => req<void>(`/topics/${id}`, { method: "DELETE" }),
  runTopic: (id: string) =>
    req<{ run_id: string }>(`/topics/${id}/run`, { method: "POST" }),
  listFindings: (topicId: string) =>
    req<FindingSummary[]>(`/topics/${topicId}/findings`),
  getFinding: (id: string) => req<FindingDetail>(`/findings/${id}`),
  setRead: (id: string, is_read: boolean) =>
    req<void>(`/findings/${id}/read`, {
      method: "PATCH",
      body: JSON.stringify({ is_read }),
    }),
  getRun: (id: string) => req<RunOut>(`/runs/${id}`),
};

export type { DigestOut };
