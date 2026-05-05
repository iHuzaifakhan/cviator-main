// backend/utils/tokens.js
// Cryptographic helpers for verification tokens.
//
//   generateToken()  → a 32-byte URL-safe random hex string (the "secret")
//   hashToken(raw)   → SHA-256 hex of the raw token (what we store in the DB)
//
// The raw token is sent only once, in the email link. The DB never holds it.
// On verify, we hash the inbound token and look up by hash.

const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

module.exports = { generateToken, hashToken };
