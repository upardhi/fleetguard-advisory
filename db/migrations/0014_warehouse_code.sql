-- Add a short, human-readable warehouse code that the company admin types
-- in (e.g. "BHW-01"). The form has been collecting this value all along but
-- the API was silently dropping it because the column didn't exist and the
-- create/update SQL never referenced it.
--
-- Nullable to keep existing rows valid; uniqueness is per-org and only
-- enforced on populated codes (so multiple legacy rows without a code
-- don't fight each other).

ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_org_code
  ON warehouses (org_id, code)
  WHERE code IS NOT NULL;
