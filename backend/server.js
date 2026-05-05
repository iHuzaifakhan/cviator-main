// backend/server.js
// Cviator Pro — Express API entry.

const config = require('./config');
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const pdfRoutes    = require('./routes/pdf');
const authRoutes   = require('./routes/auth');
const cvRoutes     = require('./routes/cv');
const adminRoutes  = require('./routes/admin');
const publicRoutes = require('./routes/public');
const { initDatabase } = require('./db/init');

const app = express();

// Trust proxy so rate-limit sees real client IPs behind nginx/load balancer.
app.set('trust proxy', 1);

// CORS — accept a comma-separated list in FRONTEND_URL. If not set, or set to
// '*', reflect any origin. This lets the same image serve localhost dev AND
// EC2 deploys (where the origin is http://<EC2-IP>:3000) without a rebuild.
const allowedOrigins = (config.frontendUrl || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Allow same-origin / curl / server-to-server (no Origin header)
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: false,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'Cviator Pro API', version: '3.0.0' });
});

// ── Per-endpoint rate limiters ──────────────────────────────────
//   • Strict on credential / signup endpoints (5/15 min) to slow brute-forcing.
//   • Looser on email confirmation links (30/15 min) so a clicked link doesn't
//     get blocked behind a shared NAT.
const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});
const looseAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
});

// Apply limits selectively
app.post('/api/auth/signup',              strictAuthLimiter);
app.post('/api/auth/login',               strictAuthLimiter);
app.post('/api/auth/forgot-password',     strictAuthLimiter);
app.post('/api/auth/reset-password',      strictAuthLimiter);
app.post('/api/auth/resend-verification', strictAuthLimiter);

app.get('/api/auth/verify-email/*', looseAuthLimiter);

app.use('/api/public',   publicRoutes);
app.use('/api/auth',     authRoutes);
app.use('/api/cv',       cvRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/generate-pdf', pdfRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.url}` });
});

app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

(async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.error('[server] Database init failed — refusing to start.', err.message);
    process.exit(1);
  }
  app.listen(config.port, () => {
    console.log(`🚀 Cviator backend listening on http://localhost:${config.port}`);
  });
})();
