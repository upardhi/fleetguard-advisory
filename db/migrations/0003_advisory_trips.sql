-- Advisory Platform — trip monitoring + disruption intelligence pipeline
-- All tables prefixed adv_ to stay clear of other projects sharing this DB.

-- ── Trips ────────────────────────────────────────────────────────────────────
-- A planned truck movement, e.g. Kolkata → Siliguri.
CREATE TABLE IF NOT EXISTS adv_trips (
  id               TEXT PRIMARY KEY,
  org_id           TEXT REFERENCES orgs(id),
  origin_name      TEXT        NOT NULL,
  origin_lat       NUMERIC(9,6),
  origin_lng       NUMERIC(9,6),
  destination_name TEXT        NOT NULL,
  destination_lat  NUMERIC(9,6),
  destination_lng  NUMERIC(9,6),
  truck_reg        TEXT,
  driver_name      TEXT,
  cargo_type       TEXT,
  scheduled_at     TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'planned',
                   -- planned | monitoring | dispatched | completed | cancelled
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adv_trips_org    ON adv_trips(org_id);
CREATE INDEX IF NOT EXISTS adv_trips_status ON adv_trips(status);

-- ── Routes ───────────────────────────────────────────────────────────────────
-- 1–2 route options per trip, returned by Google Directions.
CREATE TABLE IF NOT EXISTS adv_routes (
  id             TEXT PRIMARY KEY,
  trip_id        TEXT        NOT NULL REFERENCES adv_trips(id) ON DELETE CASCADE,
  label          TEXT        NOT NULL,
  summary        TEXT,                       -- Google route summary, e.g. "NH12"
  distance_km    NUMERIC(8,1),
  duration_hours NUMERIC(6,2),
  polyline       TEXT,                       -- Google encoded polyline
  is_primary     BOOLEAN     NOT NULL DEFAULT false,
  risk_score     INT         NOT NULL DEFAULT 0,
  risk_level     TEXT        NOT NULL DEFAULT 'safe',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adv_routes_trip ON adv_routes(trip_id);

-- ── Route segments ───────────────────────────────────────────────────────────
-- The geographic decomposition: each district / tehsil / NH / SH a route crosses.
CREATE TABLE IF NOT EXISTS adv_route_segments (
  id           TEXT PRIMARY KEY,
  route_id     TEXT        NOT NULL REFERENCES adv_routes(id) ON DELETE CASCADE,
  segment_type TEXT        NOT NULL,
               -- district | tehsil | national_highway | state_highway
  name         TEXT        NOT NULL,
  state        TEXT,
  seq          INT         NOT NULL DEFAULT 0,
  lat          NUMERIC(9,6),
  lng          NUMERIC(9,6),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adv_route_segments_route ON adv_route_segments(route_id);
CREATE INDEX IF NOT EXISTS adv_route_segments_name  ON adv_route_segments(name);

-- ── News items ───────────────────────────────────────────────────────────────
-- Raw Firecrawl search + scrape results.
CREATE TABLE IF NOT EXISTS adv_news_items (
  id              TEXT PRIMARY KEY,
  url             TEXT        NOT NULL,
  title           TEXT,
  source          TEXT,
  snippet         TEXT,
  raw_content     TEXT,                      -- scraped markdown
  published_at    TIMESTAMPTZ,
  search_query    TEXT,
  matched_segment TEXT,
  segment_type    TEXT,
  state           TEXT,
  status          TEXT        NOT NULL DEFAULT 'found',
                  -- found | scraped | analyzed | irrelevant
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS adv_news_items_url    ON adv_news_items(url);
CREATE INDEX        IF NOT EXISTS adv_news_items_status ON adv_news_items(status);

-- ── Disruptions ──────────────────────────────────────────────────────────────
-- LLM-processed "best data" — structured intelligence from a news item.
CREATE TABLE IF NOT EXISTS adv_disruptions (
  id                TEXT PRIMARY KEY,
  news_item_id      TEXT REFERENCES adv_news_items(id) ON DELETE SET NULL,
  category          TEXT        NOT NULL,
                    -- political | weather | traffic | security |
                    -- infrastructure | religious | vvip | natural_disaster
  title             TEXT        NOT NULL,
  summary           TEXT,
  detail            TEXT,
  risk_level        TEXT        NOT NULL DEFAULT 'medium',
  affected_location TEXT,
  affected_highway  TEXT,
  state             TEXT,
  eta_impact_hours  NUMERIC(5,1) DEFAULT 0,
  confidence        INT          DEFAULT 50,
  starts_at         TIMESTAMPTZ,
  expected_clear_at TIMESTAMPTZ,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adv_disruptions_active ON adv_disruptions(is_active);

-- ── Trip alerts ──────────────────────────────────────────────────────────────
-- A disruption matched to a trip route via overlapping segment.
CREATE TABLE IF NOT EXISTS adv_trip_alerts (
  id              TEXT PRIMARY KEY,
  trip_id         TEXT        NOT NULL REFERENCES adv_trips(id) ON DELETE CASCADE,
  route_id        TEXT REFERENCES adv_routes(id) ON DELETE CASCADE,
  disruption_id   TEXT REFERENCES adv_disruptions(id) ON DELETE CASCADE,
  matched_segment TEXT,
  severity        TEXT        NOT NULL DEFAULT 'warning',  -- info | warning | critical
  message         TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'new',      -- new | acknowledged | resolved
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adv_trip_alerts_trip   ON adv_trip_alerts(trip_id);
CREATE INDEX IF NOT EXISTS adv_trip_alerts_status ON adv_trip_alerts(status);

-- ── Pipeline runs ────────────────────────────────────────────────────────────
-- Audit/observability for each pipeline execution.
CREATE TABLE IF NOT EXISTS adv_pipeline_runs (
  id            TEXT PRIMARY KEY,
  stage         TEXT        NOT NULL,   -- search | scrape | analyze | match | full
  status        TEXT        NOT NULL DEFAULT 'running', -- running | done | failed
  segments_seen INT         NOT NULL DEFAULT 0,
  news_found    INT         NOT NULL DEFAULT 0,
  disruptions   INT         NOT NULL DEFAULT 0,
  alerts        INT         NOT NULL DEFAULT 0,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);
