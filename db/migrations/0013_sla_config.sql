-- Per-org SLA configuration. One row per org; absence of a row means
-- "use defaults from app/_lib/incidentSla.ts". Both columns are non-null
-- with sensible defaults so a freshly upserted row works without surprise.
--
--   sla_minutes : { "fraud_attempt": 30, ... } — partial override; types
--                 missing from the JSON fall back to the code default.
--   paused_days : INT[] of weekday codes (0=Sun ... 6=Sat) on which the SLA
--                 clock is paused and the escalation cron is a no-op.
--                 Default is {0} → Sunday off (matches today's hardcoded
--                 behaviour).

CREATE TABLE IF NOT EXISTS sla_config (
  org_id      TEXT         PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  sla_minutes JSONB        NOT NULL DEFAULT '{}'::jsonb,
  paused_days INT[]        NOT NULL DEFAULT ARRAY[0],
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by  TEXT         REFERENCES users(id)
);

-- Sanity: paused day codes must be 0..6.
ALTER TABLE sla_config
  ADD CONSTRAINT sla_config_paused_days_range
  CHECK (paused_days <@ ARRAY[0,1,2,3,4,5,6]);
