// backend/routes/auth.js
// Authentication endpoints — refactored.
//
// Public endpoints:
//   POST /api/auth/signup               { email, password, role, firstName, lastName, ...profile }
//   POST /api/auth/login                { email, password }
//   POST /api/auth/verify               (Bearer)
//   POST /api/auth/logout               (Bearer)
//   POST /api/auth/resend-verification  { email }
//   GET  /api/auth/verify-email/:token
//   POST /api/auth/forgot-password      { email }
//   POST /api/auth/reset-password       { token, password }
//
// Roles:
//   student → email must match  ^u\d{7}@giki\.edu\.pk$ ; needs email verification.
//   admin   → email must match  ^[a-z0-9._-]+@giki\.edu\.pk$ ; account stays in
//             status='pending' until the root admin approves the request, except
//             for the configured ROOT_ADMIN_EMAIL which becomes the root admin
//             automatically on first signup.
//
// Tokens:
//   • 32-byte random hex generated server-side, sent only in the email link.
//   • Stored as SHA-256 hash in email_verifications.token_hash.
//   • Marked single-use via consumed_at timestamp inside a transaction.

const express = require('express');
const bcrypt  = require('bcryptjs');

const { query, pool }            = require('../db/pool');
const { signToken, requireAuth } = require('../middleware/auth');
const { generateToken, hashToken } = require('../utils/tokens');
const { validateEmailForRole, normaliseEmail, isValidRegNo, isValidBatch } = require('../utils/validators');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAdminApprovalRequest,
} = require('../utils/mailer');
const config = require('../config');

const router = express.Router();

const MIN_PASSWD    = 8;
const BCRYPT_ROUNDS = 10;
const ROLES         = new Set(['student', 'admin']);

const VERIFY_TTL_MS  = 24 * 60 * 60 * 1000;   // 24 h
const RESET_TTL_MS   =  1 * 60 * 60 * 1000;   //  1 h
const APPROVAL_TTL_MS = 48 * 60 * 60 * 1000;  // 48 h

const ttlFor = {
  email_verify:    VERIFY_TTL_MS,
  password_reset:  RESET_TTL_MS,
  admin_approval:  APPROVAL_TTL_MS,
};

function publicUser(row) {
  return {
    id:           row.id,
    email:        row.email,
    fullName:     row.full_name  || null,
    firstName:    row.first_name || null,
    lastName:     row.last_name  || null,
    role:         row.role       || 'student',
    status:       row.status     || 'active',
    isAdmin:      row.is_admin   || false,
    isRootAdmin:  row.is_root_admin || false,
    regNo:        row.reg_no     || null,
    facultyId:    row.faculty_id    || null,
    departmentId: row.department_id || null,
    facultyName:    row.faculty_name    || null,
    departmentName: row.department_name || null,
    batch:        row.batch      || null,
    createdAt:    row.created_at,
  };
}

const USER_SELECT = `
  SELECT u.id, u.email, u.password_hash, u.full_name, u.first_name, u.last_name,
         u.role, u.is_admin, u.is_root_admin, u.status,
         u.reg_no, u.faculty_id, u.department_id, u.batch,
         u.email_verified, u.created_at,
         f.name AS faculty_name, d.name AS department_name
    FROM users u
    LEFT JOIN faculties   f ON f.id = u.faculty_id
    LEFT JOIN departments d ON d.id = u.department_id
`;

function joinName(first, last) {
  return [first, last].filter(Boolean).join(' ').trim() || null;
}

async function createVerification(client, userId, purpose, metadata = null) {
  const raw  = generateToken();
  const hash = hashToken(raw);
  const expires = new Date(Date.now() + ttlFor[purpose]);
  await client.query(
    `INSERT INTO email_verifications (user_id, token_hash, purpose, expires_at, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
    [userId, hash, purpose, expires, metadata ? JSON.stringify(metadata) : null]
  );
  return raw;
}

async function consumeVerification(client, rawToken, purpose) {
  const hash = hashToken(rawToken);
  const { rows } = await client.query(
    `UPDATE email_verifications
        SET consumed_at = NOW()
      WHERE token_hash = $1
        AND purpose    = $2
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id, metadata`,
    [hash, purpose]
  );
  return rows[0] || null;
}

async function invalidateOpenTokens(client, userId, purpose) {
  await client.query(
    `UPDATE email_verifications
        SET consumed_at = NOW()
      WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose]
  );
}

async function getRootAdmin() {
  const { rows } = await query(
    `SELECT id, email, full_name, first_name FROM users WHERE is_root_admin = TRUE LIMIT 1`
  );
  return rows[0] || null;
}

// ── POST /api/auth/signup ────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const {
    email, password,
    role = 'student',
    firstName, lastName,
    regNo, facultyId, departmentId, batch,
  } = req.body || {};

  // Basic validation
  if (!ROLES.has(role)) {
    return res.status(400).json({ error: 'Role must be student or admin.' });
  }
  const emailErr = validateEmailForRole(email, role);
  if (emailErr) return res.status(400).json({ error: emailErr });

  if (!password || password.length < MIN_PASSWD) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWD} characters.` });
  }
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First and last name are required.' });
  }

  const normEmail = normaliseEmail(email);

  // Student-specific validation
  if (role === 'student') {
    if (!isValidRegNo(regNo)) {
      return res.status(400).json({ error: 'Registration number must be 7 digits.' });
    }
    if (!isValidBatch(batch)) {
      return res.status(400).json({ error: 'Batch must be a 4-digit year.' });
    }
    if (!Number.isInteger(Number(facultyId))) {
      return res.status(400).json({ error: 'Faculty is required.' });
    }
    // Verify faculty exists
    const fr = await query(`SELECT id FROM faculties WHERE id = $1`, [Number(facultyId)]);
    if (!fr.rows[0]) return res.status(400).json({ error: 'Unknown faculty.' });

    // Department: optional only for faculties with one department; require otherwise.
    const dr = await query(
      `SELECT COUNT(*)::int AS cnt FROM departments WHERE faculty_id = $1`,
      [Number(facultyId)]
    );
    const deptCount = dr.rows[0].cnt;

    if (deptCount > 1 && !Number.isInteger(Number(departmentId))) {
      return res.status(400).json({ error: 'Department is required for this faculty.' });
    }
    if (departmentId != null) {
      const ok = await query(
        `SELECT id FROM departments WHERE id = $1 AND faculty_id = $2`,
        [Number(departmentId), Number(facultyId)]
      );
      if (!ok.rows[0]) {
        return res.status(400).json({ error: 'Department does not belong to the selected faculty.' });
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const fullName     = joinName(firstName, lastName);

    // Decide initial state.
    let initialStatus  = 'pending';
    let initialIsRoot  = false;
    let initialVerified = false;

    if (role === 'admin') {
      // Root admin auto-bootstrap: only the configured ROOT_ADMIN_EMAIL
      // becomes the root admin, and only if no root admin exists yet.
      const rootSet = config.rootAdminEmail;
      if (rootSet && normEmail === rootSet) {
        const rr = await client.query(`SELECT 1 FROM users WHERE is_root_admin = TRUE`);
        if (rr.rows.length === 0) {
          initialStatus   = 'active';
          initialIsRoot   = true;
          initialVerified = true;
        }
      }
      // All other admins remain pending until a root admin approves them.
    }

    // Determine faculty/department FK values (admins have none).
    const facultyFk    = role === 'student' ? Number(facultyId) : null;
    const deptFk       = role === 'student'
      ? (Number.isInteger(Number(departmentId)) ? Number(departmentId) : null)
      : null;

    // If student selected a faculty with one department, auto-fill it.
    let resolvedDept = deptFk;
    if (role === 'student' && !resolvedDept && facultyFk) {
      const single = await client.query(
        `SELECT id FROM departments WHERE faculty_id = $1`,
        [facultyFk]
      );
      if (single.rows.length === 1) resolvedDept = single.rows[0].id;
    }

    const insert = await client.query(
      `INSERT INTO users (
         email, password_hash, full_name, role, status, is_root_admin,
         first_name, last_name, reg_no, faculty_id, department_id, batch,
         email_verified, last_login_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13, NULL
       )
       RETURNING id, email, full_name, first_name, last_name, role, status,
                 is_admin, is_root_admin, reg_no, faculty_id, department_id,
                 batch, created_at`,
      [
        normEmail, passwordHash, fullName, role, initialStatus, initialIsRoot,
        firstName, lastName,
        role === 'student' ? String(regNo).trim() : null,
        facultyFk, resolvedDept,
        role === 'student' ? String(batch).trim() : null,
        initialVerified,
      ]
    );
    const user = insert.rows[0];

    // Students get a CV row; admins do not.
    if (role === 'student') {
      await client.query(
        `INSERT INTO cv_data (user_id, data) VALUES ($1, '{}'::jsonb)
           ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
      );
    }

    // Decide what verification flow to run.
    let mail;
    if (role === 'student') {
      const tok  = await createVerification(client, user.id, 'email_verify');
      const link = `${config.frontendUrl}/verify-email?token=${tok}`;
      mail = await sendVerificationEmail(normEmail, fullName || firstName, link);
    } else if (role === 'admin' && !initialIsRoot) {
      // Admin signup → email goes to ROOT admin (not the requester).
      const root = (await client.query(
        `SELECT id, email, full_name, first_name FROM users WHERE is_root_admin = TRUE LIMIT 1`
      )).rows[0];

      if (!root) {
        // No root admin exists yet — and this isn't the configured one.
        await client.query('ROLLBACK');
        return res.status(503).json({
          error: 'Admin signups are unavailable: no root administrator is configured. Contact IT.',
        });
      }

      const tok  = await createVerification(client, user.id, 'admin_approval', {
        requesterEmail: normEmail,
      });
      const link = `${config.frontendUrl}/admin/approve?token=${tok}`;
      mail = await sendAdminApprovalRequest(
        root.email,
        normEmail,
        fullName || firstName,
        link
      );
    }

    // Audit log: admin signup attempts (whether root or pending)
    if (role === 'admin') {
      await client.query(
        `INSERT INTO admin_audit_log (actor_id, action, target_id, details)
         VALUES ($1, $2, $3, $4)`,
        [
          user.id,
          initialIsRoot ? 'admin.bootstrap_root' : 'admin.signup_request',
          user.id,
          JSON.stringify({ email: normEmail }),
        ]
      );
    }

    await client.query('COMMIT');

    // Response shape
    if (role === 'student') {
      return res.status(201).json({
        needsVerification: true,
        email: normEmail,
        ...(mail?.devLink ? { devLink: mail.devLink } : {}),
      });
    }
    if (initialIsRoot) {
      return res.status(201).json({
        token: signToken({ id: user.id, email: user.email }),
        user: publicUser({ ...user, faculty_name: null, department_name: null }),
      });
    }
    // Pending admin
    return res.status(201).json({
      pendingApproval: true,
      email: normEmail,
      ...(mail?.devLink ? { devLink: mail.devLink } : {}),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    console.error('[auth] signup failed:', err.message);
    return res.status(500).json({ error: 'Could not create account.' });
  } finally {
    client.release();
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const email    = normaliseEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const { rows } = await query(`${USER_SELECT} WHERE LOWER(u.email) = $1`, [email]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    if (user.role === 'student') {
      if (!user.email_verified) {
        return res.status(403).json({
          error: 'Please verify your email before signing in.',
          needsVerification: true,
          email: user.email,
        });
      }
    } else if (user.role === 'admin') {
      if (user.status === 'pending') {
        return res.status(403).json({
          error: 'Your admin account is awaiting approval by the root administrator.',
          pendingApproval: true,
        });
      }
    }

    query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id])
      .catch((err) => console.error('[auth] last_login_at update failed:', err.message));

    res.json({ token: signToken({ id: user.id, email: user.email }), user: publicUser(user) });
  } catch (err) {
    console.error('[auth] login failed:', err.message);
    res.status(500).json({ error: 'Could not log in.' });
  }
});

// ── POST /api/auth/verify ────────────────────────────────────────
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [req.user.id]);
    if (!rows[0]) return res.status(401).json({ error: 'User no longer exists.' });
    if (rows[0].status === 'suspended') return res.status(403).json({ error: 'Account suspended.' });
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    console.error('[auth] verify failed:', err.message);
    res.status(500).json({ error: 'Could not verify session.' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────
router.post('/logout', requireAuth, (_req, res) => res.json({ ok: true }));

// ── POST /api/auth/resend-verification ───────────────────────────
router.post('/resend-verification', async (req, res) => {
  const email = normaliseEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, email, full_name, first_name, email_verified, role, status
         FROM users WHERE LOWER(email) = $1`,
      [email]
    );
    const user = rows[0];

    // Always return success to avoid leaking whether the email exists.
    if (!user || user.role !== 'student' || user.email_verified) {
      await client.query('COMMIT');
      return res.json({ ok: true });
    }

    await invalidateOpenTokens(client, user.id, 'email_verify');
    const tok  = await createVerification(client, user.id, 'email_verify');
    const link = `${config.frontendUrl}/verify-email?token=${tok}`;

    await client.query('COMMIT');
    const mail = await sendVerificationEmail(user.email, user.full_name || user.first_name || '', link);
    res.json({ ok: true, ...(mail?.devLink ? { devLink: mail.devLink } : {}) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[auth] resend-verification failed:', err.message);
    res.status(500).json({ error: 'Could not resend verification email.' });
  } finally {
    client.release();
  }
});

// ── GET /api/auth/verify-email/:token ────────────────────────────
router.get('/verify-email/:token', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const consumed = await consumeVerification(client, req.params.token, 'email_verify');
    if (!consumed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Token is invalid or has expired.' });
    }
    await client.query(
      `UPDATE users SET email_verified = TRUE, status = 'active' WHERE id = $1 AND role = 'student'`,
      [consumed.user_id]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[auth] verify-email failed:', err.message);
    res.status(500).json({ error: 'Could not verify email.' });
  } finally {
    client.release();
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const email = normaliseEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, email, full_name, first_name FROM users WHERE LOWER(email) = $1`,
      [email]
    );
    const user = rows[0];

    if (!user) {
      // Do not leak existence.
      await client.query('COMMIT');
      return res.json({ ok: true });
    }

    await invalidateOpenTokens(client, user.id, 'password_reset');
    const tok  = await createVerification(client, user.id, 'password_reset');
    const link = `${config.frontendUrl}/reset-password?token=${tok}`;

    await client.query('COMMIT');
    const mail = await sendPasswordResetEmail(user.email, user.full_name || user.first_name || '', link);
    res.json({ ok: true, ...(mail?.devLink ? { devLink: mail.devLink } : {}) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[auth] forgot-password failed:', err.message);
    res.status(500).json({ error: 'Could not process request.' });
  } finally {
    client.release();
  }
});

// ── POST /api/auth/reset-password ────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }
  if (password.length < MIN_PASSWD) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWD} characters.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const consumed = await consumeVerification(client, token, 'password_reset');
    if (!consumed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Token is invalid or has expired.' });
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, consumed.user_id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[auth] reset-password failed:', err.message);
    res.status(500).json({ error: 'Could not reset password.' });
  } finally {
    client.release();
  }
});

module.exports = router;
