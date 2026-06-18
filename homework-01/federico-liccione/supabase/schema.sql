-- Enable PostGIS for geographic queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Main events table
CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  event_type    TEXT NOT NULL CHECK (event_type IN ('sciopero', 'manifestazione', 'corteo', 'presidio', 'altro')),
  tags          TEXT[] NOT NULL DEFAULT '{}',
  location_text TEXT,
  city          TEXT,
  region        TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  geom          GEOGRAPHY(POINT, 4326),
  start_date    TIMESTAMPTZ,
  end_date      TIMESTAMPTZ,
  source_url    TEXT,
  source_name   TEXT CHECK (source_name IN ('cgsse', 'mit', 'telegram', 'centrisociali', 'altro')),
  raw_text      TEXT,
  -- deduplication: hash of (title + start_date + city)
  content_hash  TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index for map queries
CREATE INDEX IF NOT EXISTS events_geom_idx ON events USING GIST (geom);

-- Filtering indexes
CREATE INDEX IF NOT EXISTS events_type_idx       ON events (event_type);
CREATE INDEX IF NOT EXISTS events_start_date_idx ON events (start_date);
CREATE INDEX IF NOT EXISTS events_tags_idx       ON events USING GIN (tags);
CREATE INDEX IF NOT EXISTS events_region_idx     ON events (region);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-populate geom from lat/lng
CREATE OR REPLACE FUNCTION sync_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER events_sync_geom
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION sync_geom();

-- Read-only access for the anon role (public portal)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access"
  ON events FOR SELECT
  USING (true);

-- PostGIS spatial_ref_sys is owned by the extension (postgres superuser).
-- RLS cannot be enabled on it; revoke grants instead to block PostgREST access.
-- Run manually in Supabase SQL Editor:
--   REVOKE ALL ON public.spatial_ref_sys FROM anon, authenticated;
