-- Intelligence job queue for async corridor analysis
-- Note: route_id and org_id are TEXT to match adv_watched_routes schema
CREATE TABLE IF NOT EXISTS adv_intel_jobs (
  id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id            TEXT        NOT NULL,
  route_id          TEXT        NOT NULL REFERENCES adv_watched_routes(id) ON DELETE CASCADE,
  status            TEXT        NOT NULL DEFAULT 'pending',
  -- pending | running | done | failed
  segments_total    INTEGER     NOT NULL DEFAULT 0,
  segments_done     INTEGER     NOT NULL DEFAULT 0,
  disruptions_found INTEGER     NOT NULL DEFAULT 0,
  error             TEXT,
  triggered_by      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_adv_intel_jobs_status   ON adv_intel_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_adv_intel_jobs_route_id ON adv_intel_jobs (route_id);
