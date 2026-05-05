// backend/db/pool.js
// PostgreSQL connection pool. Single shared instance.

const { Pool } = require('pg');
const { db } = require('../config');

const pool = new Pool({
  host:     db.host,
  port:     db.port,
  user:     db.user,
  password: db.password,
  database: db.database,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected idle client error:', err.message);
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
