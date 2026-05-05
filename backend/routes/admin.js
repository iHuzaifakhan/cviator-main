// backend/routes/admin.js
// Admin endpoints. requireAuth + requireAdmin on every route except where noted.
//
//   GET    /api/admin/users                          — paginated user list (filterable)
//   GET    /api/admin/users/:id                      — single user + CV snapshot
//   GET    /api/admin/users/:id/pdf                  — user CV as PDF
//   GET    /api/admin/filters                        — faculties (with departments) + batches
//   GET    /api/admin/download-all                   — bulk ZIP of CVs (filtered)
//
// Root-admin only:
//   GET    /api/admin/admin-requests                 — list pending admin requests
//   POST   /api/admin/admin-requests/:id/approve     — approve (in-app)
//   POST   /api/admin/admin-requests/:id/reject      — reject (in-app)
//   GET    /api/admin/audit                          — recent audit log
//
// Public (token-gated):
//   GET    /api/admin/approve/:token                 — approve via emailed link

const express   = require('express');
const puppeteer = require('puppeteer');
const archiver  = require('archiver');

const { query, pool } = require('../db/pool');
const { requireAuth, requireAdmin, requireRootAdmin } = require('../middleware/auth');
const { generateHTML }       = require('../utils/generateHTML');
const { hashToken }          = require('../utils/tokens');
const { sendAdminApprovedNotice } = require('../utils/mailer');

const router = express.Router();

const PAGE_LIMIT = 20;

function publicUser(u) {
  return {
    id:             u.id,
    email:          u.email,
    fullName:       u.full_name   || null,
    firstName:      u.first_name  || null,
    lastName:       u.last_name   || null,
    role:           u.role        || 'student',
    status:         u.status      || 'active',
    isAdmin:        u.is_admin,
    isRootAdmin:    u.is_root_admin || false,
    regNo:          u.reg_no      || null,
    facultyId:      u.faculty_id    || null,
    departmentId:   u.department_id || null,
    facultyName:    u.faculty_name    || null,
    departmentName: u.department_name || null,
    batch:          u.batch       || null,
    createdAt:      u.created_at,
    lastLoginAt:    u.last_login_at || null,
  };
}

// ── Public approval-link endpoint (token-gated, no auth header) ──
// Lives under /api/admin so it's grouped, but mounted before requireAuth.
router.get('/approve/:token', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = hashToken(req.params.token);
    const { rows } = await client.query(
      `UPDATE email_verifications
          SET consumed_at = NOW()
        WHERE token_hash = $1
          AND purpose    = 'admin_approval'
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING user_id, metadata`,
      [hash]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Approval link is invalid or has expired.' });
    }

    const targetId = rows[0].user_id;

    const { rows: targetRows } = await client.query(
      `SELECT id, email, full_name, first_name, role, status FROM users WHERE id = $1`,
      [targetId]
    );
    if (!targetRows[0] || targetRows[0].role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Approval target is not a valid admin request.' });
    }

    await client.query(
      `UPDATE users SET status = 'active', email_verified = TRUE WHERE id = $1`,
      [targetId]
    );
    await client.query(
      `INSERT INTO admin_audit_log (actor_id, action, target_id, details)
       VALUES (NULL, 'admin.approved_by_link', $1, '{}'::jsonb)`,
      [targetId]
    );

    await client.query('COMMIT');

    sendAdminApprovedNotice(targetRows[0].email, targetRows[0].full_name || targetRows[0].first_name)
      .catch((err) => console.error('[admin] approval notice email failed:', err.message));

    res.json({ ok: true, email: targetRows[0].email });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[admin] approval link failed:', err.message);
    res.status(500).json({ error: 'Could not approve admin.' });
  } finally {
    client.release();
  }
});

// All routes below require an authenticated admin.
router.use(requireAuth, requireAdmin);

// ── GET /api/admin/users ─────────────────────────────────────────
router.get('/users', async (req, res) => {
  const page   = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * PAGE_LIMIT;

  const w  = [];
  const p  = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('$$', `$${p.length}`)); };

  if (req.query.role)         add('u.role          = $$', req.query.role);
  if (req.query.status)       add('u.status        = $$', req.query.status);
  if (req.query.facultyId)    add('u.faculty_id    = $$', Number(req.query.facultyId));
  if (req.query.departmentId) add('u.department_id = $$', Number(req.query.departmentId));
  if (req.query.batch)        add('u.batch         = $$', req.query.batch);
  if (req.query.q) {
    const like = `%${String(req.query.q).toLowerCase()}%`;
    p.push(like);
    const i = p.length;
    w.push(`(LOWER(u.email) LIKE $${i} OR LOWER(COALESCE(u.full_name, '')) LIKE $${i} OR LOWER(COALESCE(u.reg_no, '')) LIKE $${i})`);
  }

  const whereSql = w.length ? `WHERE ${w.join(' AND ')}` : '';

  try {
    const [usersResult, countResult] = await Promise.all([
      query(
        `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name,
                u.role, u.status, u.is_admin, u.is_root_admin,
                u.reg_no, u.faculty_id, u.department_id, u.batch,
                u.created_at, u.last_login_at,
                f.name AS faculty_name, d.name AS department_name
           FROM users u
           LEFT JOIN faculties   f ON f.id = u.faculty_id
           LEFT JOIN departments d ON d.id = u.department_id
           ${whereSql}
          ORDER BY u.created_at DESC
          LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
        [...p, PAGE_LIMIT, offset]
      ),
      query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, p),
    ]);

    const total = Number(countResult.rows[0].total);
    res.json({
      users: usersResult.rows.map(publicUser),
      pagination: {
        page, limit: PAGE_LIMIT, total,
        pages: Math.max(1, Math.ceil(total / PAGE_LIMIT)),
      },
    });
  } catch (err) {
    console.error('[admin] GET /users failed:', err.message);
    res.status(500).json({ error: 'Could not fetch users.' });
  }
});

// ── GET /api/admin/filters ───────────────────────────────────────
// Returns nested faculties→departments (so the frontend can render a
// cascading filter without extra requests) plus the batches that exist.
router.get('/filters', async (_req, res) => {
  try {
    const [facultiesResult, departmentsResult, batchesResult] = await Promise.all([
      query(`SELECT id, code, name, display_order FROM faculties ORDER BY display_order, name`),
      query(`SELECT id, faculty_id, code, name, display_order FROM departments ORDER BY faculty_id, display_order, name`),
      query(`SELECT DISTINCT batch FROM users WHERE batch IS NOT NULL AND batch <> '' ORDER BY batch DESC`),
    ]);

    const departmentsByFaculty = new Map();
    for (const d of departmentsResult.rows) {
      if (!departmentsByFaculty.has(d.faculty_id)) departmentsByFaculty.set(d.faculty_id, []);
      departmentsByFaculty.get(d.faculty_id).push({ id: d.id, code: d.code, name: d.name });
    }

    const faculties = facultiesResult.rows.map((f) => ({
      id:   f.id,
      code: f.code,
      name: f.name,
      departments: departmentsByFaculty.get(f.id) || [],
    }));

    res.json({
      faculties,
      batches: batchesResult.rows.map((r) => r.batch),
    });
  } catch (err) {
    console.error('[admin] GET /filters failed:', err.message);
    res.status(500).json({ error: 'Could not fetch filters.' });
  }
});

// ── GET /api/admin/users/:id ─────────────────────────────────────
router.get('/users/:id', async (req, res) => {
  try {
    const [userResult, cvResult] = await Promise.all([
      query(
        `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name,
                u.role, u.status, u.is_admin, u.is_root_admin,
                u.reg_no, u.faculty_id, u.department_id, u.batch,
                u.created_at, u.last_login_at,
                f.name AS faculty_name, d.name AS department_name
           FROM users u
           LEFT JOIN faculties   f ON f.id = u.faculty_id
           LEFT JOIN departments d ON d.id = u.department_id
          WHERE u.id = $1`,
        [req.params.id]
      ),
      query(`SELECT data, updated_at FROM cv_data WHERE user_id = $1`, [req.params.id]),
    ]);
    if (!userResult.rows[0]) return res.status(404).json({ error: 'User not found.' });
    const u  = userResult.rows[0];
    const cv = cvResult.rows[0] || null;
    res.json({ user: publicUser(u), cv: cv ? { data: cv.data, updatedAt: cv.updated_at } : null });
  } catch (err) {
    console.error('[admin] GET /users/:id failed:', err.message);
    res.status(500).json({ error: 'Could not fetch user.' });
  }
});

// ── GET /api/admin/users/:id/pdf ─────────────────────────────────
router.get('/users/:id/pdf', async (req, res) => {
  const template = (req.query.template || 'classic').toString();
  let browser;
  try {
    const [userResult, cvResult] = await Promise.all([
      query(`SELECT email, full_name, first_name, last_name FROM users WHERE id = $1`, [req.params.id]),
      query(`SELECT data FROM cv_data WHERE user_id = $1`, [req.params.id]),
    ]);
    if (!userResult.rows[0]) return res.status(404).json({ error: 'User not found.' });
    const u    = userResult.rows[0];
    const data = cvResult.rows[0]?.data || {};

    const html = generateHTML(data, template);
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4', printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });

    const filename = ([u.first_name, u.last_name].filter(Boolean).join('_')
      || u.full_name || u.email || 'resume').replace(/\s+/g, '_');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[admin] GET /users/:id/pdf failed:', err.message);
    res.status(500).json({ error: 'Could not generate PDF.' });
  } finally {
    if (browser) await browser.close();
  }
});

// ── GET /api/admin/download-all ──────────────────────────────────
router.get('/download-all', async (req, res) => {
  const template = (req.query.template || 'classic').toString();

  const w  = [];
  const p  = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('$$', `$${p.length}`)); };

  if (req.query.role)         add('u.role          = $$', req.query.role);
  if (req.query.facultyId)    add('u.faculty_id    = $$', Number(req.query.facultyId));
  if (req.query.departmentId) add('u.department_id = $$', Number(req.query.departmentId));
  if (req.query.batch)        add('u.batch         = $$', req.query.batch);
  if (req.query.q) {
    const like = `%${String(req.query.q).toLowerCase()}%`;
    p.push(like);
    const i = p.length;
    w.push(`(LOWER(u.email) LIKE $${i} OR LOWER(COALESCE(u.full_name, '')) LIKE $${i} OR LOWER(COALESCE(u.reg_no, '')) LIKE $${i})`);
  }

  w.push("u.role = 'student'");
  w.push("u.status = 'active'");
  const whereSql = `WHERE ${w.join(' AND ')}`;

  let browser;
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name,
              u.batch, c.data,
              f.name AS faculty_name, d.name AS department_name
         FROM users u
         LEFT JOIN cv_data    c ON c.user_id = u.id
         LEFT JOIN faculties  f ON f.id      = u.faculty_id
         LEFT JOIN departments d ON d.id     = u.department_id
         ${whereSql}
         ORDER BY u.last_name, u.first_name, u.email`,
      p
    );

    if (rows.length === 0) return res.status(404).json({ error: 'No users matched the filters.' });

    const stamp     = new Date().toISOString().slice(0, 10);
    const filterTag = [req.query.facultyId, req.query.departmentId, req.query.batch]
      .filter(Boolean).join('_').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
    const zipName   = ['cvs', stamp, filterTag].filter(Boolean).join('_') + '.zip';

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', (err) => console.warn('[zip] warning:', err.message));
    archive.on('error',   (err) => { throw err; });
    archive.pipe(res);

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });

    let included = 0, skipped = 0;
    for (const u of rows) {
      const data = u.data || {};
      const hasContent = data && (
        data.name || data.summary ||
        (data.education  || []).length ||
        (data.experience || []).length ||
        (data.projects   || []).length ||
        (data.skills     || []).length
      );
      if (!hasContent) { skipped++; continue; }

      try {
        const html = generateHTML(data, template);
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
          format: 'A4', printBackground: true,
          margin: { top: '0', bottom: '0', left: '0', right: '0' },
        });
        await page.close();
        const baseName = ([u.first_name, u.last_name].filter(Boolean).join('_')
          || u.full_name || u.email || `user_${u.id.slice(0, 8)}`)
          .replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/gi, '');
        const folder = u.faculty_name || u.batch || 'Other';
        archive.append(pdf, { name: `${folder}/${baseName}.pdf` });
        included++;
      } catch (err) {
        console.error(`[zip] failed for user ${u.email}:`, err.message);
        skipped++;
      }
    }

    archive.append(
      `Generated: ${new Date().toISOString()}\nIncluded: ${included}\nSkipped: ${skipped}\n`,
      { name: 'README.txt' }
    );
    await archive.finalize();
  } catch (err) {
    console.error('[admin] GET /download-all failed:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate zip.' });
    else res.end();
  } finally {
    if (browser) await browser.close();
  }
});

// ── ROOT-ADMIN ONLY ──────────────────────────────────────────────

router.get('/admin-requests', requireRootAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, email, full_name, first_name, last_name, created_at
         FROM users
        WHERE role = 'admin' AND status = 'pending' AND is_root_admin = FALSE
        ORDER BY created_at DESC`
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('[admin] GET /admin-requests failed:', err.message);
    res.status(500).json({ error: 'Could not fetch admin requests.' });
  }
});

router.post('/admin-requests/:id/approve', requireRootAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query(
      `SELECT id, email, full_name, first_name, role, status
         FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!target.rows[0] || target.rows[0].role !== 'admin' || target.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No matching admin request.' });
    }
    await client.query(
      `UPDATE users SET status = 'active', email_verified = TRUE WHERE id = $1`,
      [target.rows[0].id]
    );
    // Invalidate any open admin_approval tokens for this user.
    await client.query(
      `UPDATE email_verifications SET consumed_at = NOW()
         WHERE user_id = $1 AND purpose = 'admin_approval' AND consumed_at IS NULL`,
      [target.rows[0].id]
    );
    await client.query(
      `INSERT INTO admin_audit_log (actor_id, action, target_id, details)
       VALUES ($1, 'admin.approved_in_app', $2, '{}'::jsonb)`,
      [req.user.id, target.rows[0].id]
    );
    await client.query('COMMIT');

    sendAdminApprovedNotice(target.rows[0].email, target.rows[0].full_name || target.rows[0].first_name)
      .catch((err) => console.error('[admin] approval notice email failed:', err.message));

    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[admin] approve request failed:', err.message);
    res.status(500).json({ error: 'Could not approve.' });
  } finally {
    client.release();
  }
});

router.post('/admin-requests/:id/reject', requireRootAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'admin' AND status = 'pending' AND is_root_admin = FALSE`,
      [req.params.id]
    );
    if (!target.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No matching admin request.' });
    }
    await client.query(`DELETE FROM users WHERE id = $1`, [target.rows[0].id]);
    await client.query(
      `INSERT INTO admin_audit_log (actor_id, action, target_id, details)
       VALUES ($1, 'admin.rejected', $2, '{}'::jsonb)`,
      [req.user.id, target.rows[0].id]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[admin] reject request failed:', err.message);
    res.status(500).json({ error: 'Could not reject.' });
  } finally {
    client.release();
  }
});

router.get('/audit', requireRootAdmin, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.action, a.details, a.created_at,
              actor.email AS actor_email, target.email AS target_email
         FROM admin_audit_log a
         LEFT JOIN users actor  ON actor.id  = a.actor_id
         LEFT JOIN users target ON target.id = a.target_id
        ORDER BY a.created_at DESC
        LIMIT 100`
    );
    res.json({ entries: rows });
  } catch (err) {
    console.error('[admin] GET /audit failed:', err.message);
    res.status(500).json({ error: 'Could not fetch audit log.' });
  }
});

module.exports = router;
