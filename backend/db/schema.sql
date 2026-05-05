-- backend/db/schema.sql
-- Idempotent: safe to run on every startup via initDatabase().
--
-- Tables:
--   faculties             — top-level academic divisions (FCSE, FEE, …)
--   departments           — children of a faculty (CS, CE, …)
--   users                 — accounts (students + admins)
--   email_verifications   — hashed, single-use tokens (verify / reset / admin approval)
--   admin_audit_log       — append-only record of admin actions
--   cv_data               — one JSONB row per student
--
-- Roles / status:
--   role IN ('student','admin')
--   status IN ('pending','active','suspended')
--     • student.pending  — email not yet verified
--     • student.active   — verified
--     • admin.pending    — awaiting root-admin approval
--     • admin.active     — approved
--   is_root_admin = TRUE for the single root admin (bootstrapped from ROOT_ADMIN_EMAIL)
--
-- Email policy:
--   GIKI domain enforced at the application layer; DB enforces lowercase + non-empty.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ── Faculties ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faculties (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  display_order INT  NOT NULL DEFAULT 0
);

-- ── Departments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id            SERIAL PRIMARY KEY,
  faculty_id    INT  NOT NULL REFERENCES faculties(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  display_order INT  NOT NULL DEFAULT 0,
  UNIQUE (faculty_id, code)
);

CREATE INDEX IF NOT EXISTS departments_faculty_idx ON departments (faculty_id);

-- ── Users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT,
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

-- Idempotently add columns that postdate the original schema.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role           TEXT     NOT NULL DEFAULT 'student';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status         TEXT     NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_root_admin  BOOLEAN  NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reg_no         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS faculty_id     INT      REFERENCES faculties(id)   ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id  INT      REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS faculty        TEXT;            -- legacy, kept for migration
ALTER TABLE users ADD COLUMN IF NOT EXISTS batch          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN  NOT NULL DEFAULT FALSE;

-- Constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD  CONSTRAINT users_role_check   CHECK (role   IN ('student', 'admin'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD  CONSTRAINT users_status_check CHECK (status IN ('pending', 'active', 'suspended'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_lowercase_check;
ALTER TABLE users ADD  CONSTRAINT users_email_lowercase_check CHECK (email = LOWER(email));

-- Only one root admin allowed (partial unique index over the boolean column)
DROP INDEX IF EXISTS users_one_root_admin_idx;
CREATE UNIQUE INDEX users_one_root_admin_idx ON users (is_root_admin) WHERE is_root_admin = TRUE;

-- Useful indexes
CREATE INDEX IF NOT EXISTS users_email_idx       ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS users_role_idx        ON users (role);
CREATE INDEX IF NOT EXISTS users_status_idx      ON users (status);
CREATE INDEX IF NOT EXISTS users_faculty_id_idx  ON users (faculty_id);
CREATE INDEX IF NOT EXISTS users_dept_id_idx     ON users (department_id);
CREATE INDEX IF NOT EXISTS users_batch_idx       ON users (batch);

-- Drop legacy verification_tokens if present (replaced by email_verifications)
DROP TABLE IF EXISTS verification_tokens;

-- ── Email verifications (hashed, single-use) ─────────────────────
CREATE TABLE IF NOT EXISTS email_verifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  purpose      TEXT NOT NULL CHECK (purpose IN ('email_verify','password_reset','admin_approval')),
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata     JSONB
);

CREATE INDEX IF NOT EXISTS ev_active_user_idx
  ON email_verifications (user_id, purpose) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS ev_active_hash_idx
  ON email_verifications (token_hash) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS ev_expires_idx
  ON email_verifications (expires_at) WHERE consumed_at IS NULL;

-- ── Admin audit log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_actor_idx ON admin_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_target_idx ON admin_audit_log (target_id);

-- ── CV data ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cv_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cv_data_touch_updated_at ON cv_data;
CREATE TRIGGER cv_data_touch_updated_at
BEFORE UPDATE ON cv_data
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── Trigger: keep is_admin in sync with role ─────────────────────
-- Single source of truth = role. is_admin auto-derived for query convenience.
CREATE OR REPLACE FUNCTION sync_is_admin() RETURNS TRIGGER AS $$
BEGIN
  NEW.is_admin = (NEW.role = 'admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_sync_is_admin ON users;
CREATE TRIGGER users_sync_is_admin
BEFORE INSERT OR UPDATE OF role ON users
FOR EACH ROW EXECUTE FUNCTION sync_is_admin();
