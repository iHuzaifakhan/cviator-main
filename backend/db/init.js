// backend/db/init.js
// ---------------------------------------------------------------
// Apply schema.sql, seed faculties/departments, and bootstrap the
// root admin from ROOT_ADMIN_EMAIL on every boot. Idempotent.
// ---------------------------------------------------------------

const fs   = require('fs');
const path = require('path');
const { pool, query } = require('./pool');
const { runSeed }     = require('./seed');
const config          = require('../config');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

async function applySchema() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(sql);
}

// If ROOT_ADMIN_EMAIL is set and that user already exists, ensure they
// are flagged as the root admin. Promotion is automatic — there is no
// other path to root admin. (Brand-new root signup is auto-detected
// during /api/auth/signup.)
async function bootstrapRootAdmin() {
  if (!config.rootAdminEmail) {
    console.warn('⚠️  ROOT_ADMIN_EMAIL not set — root-admin bootstrap skipped.');
    return;
  }

  const { rows } = await query(
    `SELECT id, is_root_admin, role, status
       FROM users
      WHERE LOWER(email) = $1`,
    [config.rootAdminEmail]
  );
  if (!rows[0]) return;  // Will be promoted on first signup.

  const u = rows[0];
  if (u.is_root_admin && u.role === 'admin' && u.status === 'active') return;

  await query(
    `UPDATE users
        SET is_root_admin = TRUE,
            role          = 'admin',
            status        = 'active',
            email_verified = TRUE
      WHERE id = $1`,
    [u.id]
  );
  console.log(`✅ Root admin bootstrapped: ${config.rootAdminEmail}`);
}

async function applyAll() {
  await applySchema();
  await runSeed();
  await bootstrapRootAdmin();
}

async function initDatabase({ retries = 10, delayMs = 1500 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await applyAll();
      console.log('✅ Postgres schema, seed, and root-admin applied');
      return;
    } catch (err) {
      lastErr = err;
      console.warn(
        `⚠️  Postgres not ready (attempt ${attempt}/${retries}): ${err.message}`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    `Could not initialise Postgres after ${retries} attempts: ${lastErr?.message}`
  );
}

module.exports = { initDatabase };
