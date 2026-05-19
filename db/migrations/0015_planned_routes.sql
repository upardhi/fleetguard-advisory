-- Saved route corridors — watched permanently for disruptions.
-- No dates, no trips. Just corridors the company monitors continuously.
CREATE TABLE IF NOT EXISTS adv_watched_routes (
  id               TEXT PRIMARY KEY,
  org_id           TEXT NOT NULL,
  name             TEXT NOT NULL DEFAULT '',
  origin           TEXT NOT NULL,
  destination      TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  routes_fetched   BOOLEAN NOT NULL DEFAULT false,
  last_intel_at    TIMESTAMPTZ,
  max_risk_level   TEXT NOT NULL DEFAULT 'safe',
  disruption_count INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per geographic segment (districts, tehsils, highways).
-- route_variant: 0 = primary route, 1/2 = alternatives from Google Directions.
CREATE TABLE IF NOT EXISTS adv_watched_segments (
  id                    TEXT PRIMARY KEY,
  watched_route_id      TEXT NOT NULL REFERENCES adv_watched_routes(id) ON DELETE CASCADE,
  route_variant         INT NOT NULL DEFAULT 0,
  segment_type          TEXT NOT NULL,
  name                  TEXT NOT NULL,
  state                 TEXT,
  seq                   INT NOT NULL DEFAULT 0,
  lat                   NUMERIC(9,6),
  lng                   NUMERIC(9,6),
  has_disruption        BOOLEAN NOT NULL DEFAULT false,
  disruption_risk_level TEXT,
  disruption_title      TEXT,
  disruption_summary    TEXT,
  disruption_eta_hours  INT,
  disruption_category   TEXT,
  last_checked_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_adv_watched_segments_route ON adv_watched_segments(watched_route_id);
CREATE INDEX IF NOT EXISTS idx_adv_watched_routes_org    ON adv_watched_routes(org_id);
