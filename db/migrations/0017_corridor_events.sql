-- Fix adv_intel_jobs: route_id/org_id must be TEXT to match adv_watched_routes schema
DROP TABLE IF EXISTS adv_intel_jobs CASCADE;

CREATE TABLE adv_intel_jobs (
  id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id            TEXT        NOT NULL,
  route_id          TEXT        NOT NULL REFERENCES adv_watched_routes(id) ON DELETE CASCADE,
  status            TEXT        NOT NULL DEFAULT 'pending',
  -- pending | running | done | failed | cancelled
  segments_total    INTEGER     NOT NULL DEFAULT 0,
  segments_done     INTEGER     NOT NULL DEFAULT 0,
  disruptions_found INTEGER     NOT NULL DEFAULT 0,
  error             TEXT,
  triggered_by      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ
);

CREATE INDEX idx_adv_intel_jobs_status   ON adv_intel_jobs (status, created_at);
CREATE INDEX idx_adv_intel_jobs_route_id ON adv_intel_jobs (route_id);

-- Source transparency: store every URL checked per segment scan
ALTER TABLE adv_watched_segments
  ADD COLUMN IF NOT EXISTS disruption_sources JSONB;

-- Event timeline: past, ongoing, and FUTURE SCHEDULED events per corridor
-- Never overwritten — append-only with upsert on (segment_id, title)
CREATE TABLE IF NOT EXISTS adv_corridor_events (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id           TEXT        NOT NULL,
  watched_route_id TEXT        NOT NULL REFERENCES adv_watched_routes(id) ON DELETE CASCADE,
  segment_id       TEXT        REFERENCES adv_watched_segments(id) ON DELETE SET NULL,

  event_type       TEXT        NOT NULL DEFAULT 'ongoing',
  -- 'ongoing'    = disruption happening now
  -- 'scheduled'  = future planned event (PM visit, bandh, election, etc.)
  -- 'historical' = past event (resolved)

  event_start_at   TIMESTAMPTZ,      -- actual event date (may be future)
  event_end_at     TIMESTAMPTZ,
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  title            TEXT        NOT NULL,
  summary          TEXT,
  category         TEXT        NOT NULL DEFAULT 'traffic',
  risk_level       TEXT        NOT NULL DEFAULT 'medium',
  eta_impact_hours NUMERIC     NOT NULL DEFAULT 0,
  duration_days    INTEGER     NOT NULL DEFAULT 1,

  sources          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  rescan_count     INTEGER     NOT NULL DEFAULT 1,  -- seen in N scans = more confident
  is_active        BOOLEAN     NOT NULL DEFAULT true,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup: same segment + same event title = update, don't insert
CREATE UNIQUE INDEX IF NOT EXISTS idx_adv_corridor_events_dedup
  ON adv_corridor_events (segment_id, lower(left(title, 80)));

CREATE INDEX IF NOT EXISTS idx_adv_corridor_events_route
  ON adv_corridor_events (watched_route_id, event_type, is_active);

CREATE INDEX IF NOT EXISTS idx_adv_corridor_events_date
  ON adv_corridor_events (event_start_at) WHERE event_start_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_adv_corridor_events_org
  ON adv_corridor_events (org_id, is_active);
