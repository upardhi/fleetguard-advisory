-- Advisory Platform — core auth + warehouse tables only
-- Safe to run alongside an existing DB: uses IF NOT EXISTS throughout.

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Enums (skip if already exist) ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'superadmin', 'company_admin', 'guard', 'wh_manager', 'regional_manager', 'cso'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mfa_type AS ENUM ('totp', 'backup_code');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Orgs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orgs (
  id         TEXT PRIMARY KEY,
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  plan       TEXT        NOT NULL DEFAULT 'standard',
  settings   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT        PRIMARY KEY,
  org_id              TEXT        NOT NULL REFERENCES orgs(id),
  email               TEXT        NOT NULL,
  email_verified      BOOLEAN     NOT NULL DEFAULT false,
  password_hash       TEXT        NOT NULL,
  role                user_role   NOT NULL,
  full_name           TEXT        NOT NULL,
  mobile              TEXT,
  warehouse_id        TEXT,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  mfa_required        BOOLEAN     NOT NULL DEFAULT false,
  last_login_at       TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);
CREATE INDEX IF NOT EXISTS users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS users_email   ON users(email);

-- ── Sessions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT        PRIMARY KEY,
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       TEXT        NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  mfa_verified BOOLEAN     NOT NULL DEFAULT false,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);

-- ── Login attempts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
  id           TEXT        PRIMARY KEY,
  email        TEXT        NOT NULL,
  ip           TEXT        NOT NULL,
  success      BOOLEAN     NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_ip ON login_attempts(email, ip, attempted_at DESC);

-- ── Rate limit counters ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- ── Password reset tokens ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Warehouses ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id         TEXT        PRIMARY KEY,
  org_id     TEXT        NOT NULL REFERENCES orgs(id),
  name       TEXT        NOT NULL,
  city       TEXT        NOT NULL,
  state      TEXT        NOT NULL,
  region     TEXT        NOT NULL,
  address    TEXT,
  code       TEXT,
  lat        NUMERIC(9,6),
  lng        NUMERIC(9,6),
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS warehouses_org_id ON warehouses(org_id);

-- ── Audit events ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT        PRIMARY KEY,
  org_id        TEXT,
  actor_id      TEXT,
  actor_role    TEXT,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   TEXT,
  warehouse_id  TEXT,
  ip            TEXT,
  user_agent    TEXT,
  payload       JSONB       NOT NULL DEFAULT '{}',
  prev_hash     TEXT        NOT NULL,
  hash          TEXT        NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_org_time ON audit_events(org_id, occurred_at DESC);
