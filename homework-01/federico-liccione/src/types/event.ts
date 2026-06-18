export type EventType = 'sciopero' | 'manifestazione' | 'corteo' | 'presidio' | 'altro'
export type SourceName = 'cgsse' | 'mit' | 'telegram' | 'centrisociali' | 'altro'

export interface Event {
  id: string
  title: string
  description: string | null
  event_type: EventType
  tags: string[]
  location_text: string | null
  city: string | null
  region: string | null
  lat: number | null
  lng: number | null
  start_date: string | null
  end_date: string | null
  source_url: string | null
  source_name: SourceName | null
  content_hash: string | null
  created_at: string
  updated_at: string
}

export interface RawEvent {
  title: string
  raw_text: string
  source_url: string
  source_name: SourceName
}

export interface ExtractedEvent {
  title: string
  description: string
  event_type: EventType
  tags: string[]
  location_text: string
  city: string
  region: string
  start_date: string | null
  end_date: string | null
}

export interface EventFilters {
  query?: string
  event_type?: EventType
  tags?: string[]
  region?: string
  from_date?: string
  to_date?: string
}
