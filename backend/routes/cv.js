// backend/routes/cv.js
// ---------------------------------------------------------------
// CV data endpoints — all protected, all scoped to req.user.id so a
// user can never read or write another user's data.
//
//   GET  /api/cv     → { data, updatedAt }
//   PUT  /api/cv     { data }   → { ok, updatedAt }
// ---------------------------------------------------------------

const express = require('express');
const { query } = require('../db/pool');
const { requireAuth, requireNonAdmin } = require('../middleware/auth');

const router = express.Router();
// Admins cannot build CVs — these endpoints are for students/faculty only.
router.use(requireAuth, requireNonAdmin);

// ---- GET /api/cv ----
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT data, updated_at FROM cv_data WHERE user_id = $1`,
      [req.user.id]
    );
    if (!rows[0]) {
      // Edge case: user exists but cv_data row missing — create it lazily.
      await query(
        `INSERT INTO cv_data (user_id, data) VALUES ($1, '{}'::jsonb)
         ON CONFLICT (user_id) DO NOTHING`,
        [req.user.id]
      );
      return res.json({ data: {}, updatedAt: null });
    }
    res.json({ data: rows[0].data, updatedAt: rows[0].updated_at });
  } catch (err) {
    console.error('GET /api/cv failed:', err);
    res.status(500).json({ error: 'Could not load CV data.' });
  }
});

// ---- PUT /api/cv ----
router.put('/', async (req, res) => {
  const { data } = req.body || {};
  if (data === undefined || data === null || typeof data !== 'object') {
    return res.status(400).json({ error: '`data` must be a JSON object.' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO cv_data (user_id, data)
            VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id)
         DO UPDATE SET data = EXCLUDED.data
       RETURNING updated_at`,
      [req.user.id, JSON.stringify(data)]
    );
    res.json({ ok: true, updatedAt: rows[0].updated_at });
  } catch (err) {
    console.error('PUT /api/cv failed:', err);
    res.status(500).json({ error: 'Could not save CV data.' });
  }
});

module.exports = router;
