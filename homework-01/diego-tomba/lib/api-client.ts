/**
 * api-client.ts
 * -------------
 * Thin typed client for the REST API, used by the React tabs.
 */

export interface SettingsView {
  githubToken: { set: boolean; last4: string };
  anthropicToken: { set: boolean; last4: string };
  monthlyBudgetUsd: number;
}

export interface WatchedRepoView {
  id: number;
  owner: string;
  name: string;
  platform: string;
  scheduleCron: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface PromptView {
  id: number;
  name: string;
  content: string;
  isActive: boolean;
  createdAt: string;
}

export interface ReportListItem {
  id: number;
  repoOwner: string;
  repoName: string;
  eventsProcessed: number;
  costUsd: number;
  generatedAt: string;
}

export interface ReportView extends ReportListItem {
  markdown: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  model: string | null;
}

export interface UsageByTask {
  taskType: string;
  costUsd: number;
  runs: number;
}

export interface UsageSummary {
  periodSpendUsd: number;
  budgetUsd: number;
  pct: number | null;
  runs: number;
  byTaskType: UsageByTask[];
  periodStart: string;
}

export interface UsageHistory {
  series: { date: string; costUsd: number }[];
  estimates: {
    taskType: string;
    sampleSize: number;
    costMean: number;
    costP90: number;
    suggestedBudgetUsd: number;
  }[];
  recent: {
    taskType: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    createdAt: string;
  }[];
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Settings
  getSettings: () => req<SettingsView>('/api/settings'),
  updateSettings: (patch: {
    githubToken?: string;
    anthropicToken?: string;
    monthlyBudgetUsd?: number;
  }) =>
    req<{ ok: true }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  // Repos
  listRepos: () => req<WatchedRepoView[]>('/api/repos'),
  createRepo: (data: {
    owner: string;
    name: string;
    platform: string;
    scheduleCron?: string | null;
    enabled?: boolean;
  }) =>
    req<WatchedRepoView>('/api/repos', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateRepo: (id: number, patch: Partial<WatchedRepoView>) =>
    req<WatchedRepoView>(`/api/repos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteRepo: (id: number) =>
    req<{ ok: true }>(`/api/repos/${id}`, { method: 'DELETE' }),
  runRepo: (id: number) =>
    req<{
      reportId: number;
      eventsFetched: number;
      eventsProcessed: number;
      costUsd: number;
    }>(`/api/repos/${id}/run`, { method: 'POST' }),

  // Prompts
  listPrompts: () => req<PromptView[]>('/api/prompts'),
  createPrompt: (data: { name: string; content: string }) =>
    req<PromptView>('/api/prompts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePrompt: (id: number, patch: { name?: string; content?: string }) =>
    req<PromptView>(`/api/prompts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  activatePrompt: (id: number) =>
    req<{ ok: true }>(`/api/prompts/${id}/activate`, { method: 'PUT' }),
  deletePrompt: (id: number) =>
    req<{ ok: true }>(`/api/prompts/${id}`, { method: 'DELETE' }),

  // Reports
  listReports: (limit?: number) =>
    req<ReportListItem[]>(`/api/reports${limit ? `?limit=${limit}` : ''}`),
  getReport: (id: number) => req<ReportView>(`/api/reports/${id}`),

  // Usage
  usageSummary: () => req<UsageSummary>('/api/usage/summary'),
  usageHistory: (days = 90) =>
    req<UsageHistory>(`/api/usage/history?days=${days}`),
};
