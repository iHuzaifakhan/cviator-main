// backend/utils/validators.js
// Shared input validators. The single source of truth for email policy.
//
//   GIKI domain rule:
//     • Students  → ^u\d{7}@giki\.edu\.pk$         (e.g. u2024597@giki.edu.pk)
//     • Admins    → ^[a-z0-9._-]+@giki\.edu\.pk$   (any GIKI mailbox)
//
//   These are normalised to lowercase before checking. A student email that
//   does not match the strict format is rejected — Gmail / Yahoo / temp-mail
//   addresses cannot pass either rule.

const STUDENT_EMAIL_RE = /^u\d{7}@giki\.edu\.pk$/;
const ADMIN_EMAIL_RE   = /^[a-z0-9._-]+@giki\.edu\.pk$/;

function normaliseEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isStudentEmail(email) {
  return STUDENT_EMAIL_RE.test(normaliseEmail(email));
}

function isAdminEmail(email) {
  return ADMIN_EMAIL_RE.test(normaliseEmail(email));
}

function validateEmailForRole(email, role) {
  const e = normaliseEmail(email);
  if (!e) return 'Email is required.';
  if (role === 'student' && !STUDENT_EMAIL_RE.test(e)) {
    return 'Students must use their official GIKI email (e.g. u2024597@giki.edu.pk).';
  }
  if (role === 'admin' && !ADMIN_EMAIL_RE.test(e)) {
    return 'Admin accounts require a @giki.edu.pk email address.';
  }
  return null;
}

const REG_NO_RE = /^\d{7}$/;
function isValidRegNo(regNo) {
  return REG_NO_RE.test(String(regNo || '').trim());
}

const BATCH_RE = /^(19|20)\d{2}$/;
function isValidBatch(batch) {
  return BATCH_RE.test(String(batch || '').trim());
}

module.exports = {
  STUDENT_EMAIL_RE,
  ADMIN_EMAIL_RE,
  normaliseEmail,
  isStudentEmail,
  isAdminEmail,
  validateEmailForRole,
  isValidRegNo,
  isValidBatch,
};
