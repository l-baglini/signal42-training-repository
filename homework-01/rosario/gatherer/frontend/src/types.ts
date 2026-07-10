export interface Topic {
  id: string;
  name: string;
  schedule_cron: string | null;
  active: boolean;
  unread_count: number;
}

export interface FindingSummary {
  id: string;
  title: string;
  status: string;
  is_read: boolean;
  latest_digest_at: string | null;
}

export interface SourceOut {
  n: number;
  title: string | null;
  url: string;
  published_at: string | null;
}

export interface ImageOut {
  url: string;
  attribution: string | null;
  origin_url: string;
  width: number | null;
  height: number | null;
}

export interface DigestOut {
  what_changed: string;
  why_it_matters: string;
  technical_details: string;
  sources_md: string;
  model: string;
  created_at: string;
}

export interface FindingDetail {
  id: string;
  title: string;
  status: string;
  is_read: boolean;
  digest: DigestOut | null;
  sources: SourceOut[];
  images: ImageOut[];
}

export interface RunOut {
  id: string;
  topic_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  stats: Record<string, unknown> | null;
}
