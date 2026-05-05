// backend/config.js
// Single source of truth for all environment-driven configuration.
// Every module reads from here instead of calling process.env directly.

require('dotenv').config();
// console.log("DB CONFIG DEBUG:", {
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
// });

module.exports = {
  port: Number(process.env.PORT) || 5000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  jwt: {
    secret:    process.env.JWT_SECRET    || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Bootstrap-only: the email of the institution's root admin.
  // The first admin signup matching this address is auto-approved and granted
  // is_root_admin. Every other admin signup requires this user's approval.
  rootAdminEmail: (process.env.ROOT_ADMIN_EMAIL || '').trim().toLowerCase(),

  db: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 5432,
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME     || 'cviator',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@cviator.local',
  },
};
