// backend/middleware/auth.js
// JWT verification middleware + role guards.
//
//   requireAuth        — verifies the Bearer token, attaches req.user
//   requireActive      — ensures status='active'   (rejects pending/suspended)
//   requireAdmin       — ensures role='admin' AND status='active'
//   requireRootAdmin   — ensures is_root_admin=TRUE
//   requireNonAdmin    — students-only routes (CV builder)

const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config');
const { query } = require('../db/pool');

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresIn }
  );
}

function extractBearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

function requireAuth(req, res, next) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  try {
    const payload = jwt.verify(token, jwtConfig.secret);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Hydrates req.user with fresh role/status/admin flags from the DB.
async function loadUser(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, email, role, status, is_admin, is_root_admin
         FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(401).json({ error: 'User no longer exists' });
    req.dbUser = rows[0];
    next();
  } catch (err) {
    console.error('[auth] loadUser failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function requireActive(req, res, next) {
  if (!req.dbUser) return loadUser(req, res, () => requireActive(req, res, next));
  if (req.dbUser.status !== 'active') {
    return res.status(403).json({ error: 'Account is not active.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  return loadUser(req, res, () => {
    if (!req.dbUser.is_admin || req.dbUser.status !== 'active') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

function requireRootAdmin(req, res, next) {
  return loadUser(req, res, () => {
    if (!req.dbUser.is_root_admin) {
      return res.status(403).json({ error: 'Root admin access required' });
    }
    next();
  });
}

function requireNonAdmin(req, res, next) {
  return loadUser(req, res, () => {
    if (req.dbUser.is_admin) {
      return res.status(403).json({ error: 'Admins cannot build CVs.' });
    }
    if (req.dbUser.status !== 'active') {
      return res.status(403).json({ error: 'Account not active.' });
    }
    next();
  });
}

module.exports = {
  signToken,
  requireAuth,
  loadUser,
  requireActive,
  requireAdmin,
  requireRootAdmin,
  requireNonAdmin,
};
