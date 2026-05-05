// frontend/services/auth.js
// Thin wrappers over /api/auth/* endpoints.

import { apiFetch, setToken } from './api';

// Returns whichever of these the backend chose:
//   { needsVerification, email, devLink? }     — student awaiting email confirmation
//   { pendingApproval,   email, devLink? }     — admin awaiting root approval
//   { token, user }                             — root admin auto-bootstrapped
export async function signupRaw(payload) {
  return apiFetch('/api/auth/signup', { method: 'POST', body: payload });
}

export async function login({ email, password }) {
  let data;
  try {
    data = await apiFetch('/api/auth/login', { method: 'POST', body: { email, password } });
  } catch (err) {
    if (err.payload?.needsVerification) {
      const e = new Error(err.payload.error || 'Email not verified.');
      e.needsVerification = true;
      e.email = err.payload.email;
      throw e;
    }
    if (err.payload?.pendingApproval) {
      const e = new Error(err.payload.error || 'Awaiting approval.');
      e.pendingApproval = true;
      throw e;
    }
    throw err;
  }
  setToken(data.token);
  return data.user;
}

export async function verify() {
  const data = await apiFetch('/api/auth/verify', { method: 'POST', auth: true });
  return data.user;
}

export async function logout() {
  try { await apiFetch('/api/auth/logout', { method: 'POST', auth: true }); } catch {}
  setToken(null);
}

export async function resendVerification(email) {
  return apiFetch('/api/auth/resend-verification', { method: 'POST', body: { email } });
}

export async function verifyEmailToken(token) {
  return apiFetch(`/api/auth/verify-email/${token}`, { method: 'GET' });
}

export async function forgotPassword(email) {
  return apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function resetPassword(token, password) {
  return apiFetch('/api/auth/reset-password', { method: 'POST', body: { token, password } });
}

// Root-admin approval link click: hits the public token-gated endpoint.
export async function approveAdminByToken(token) {
  return apiFetch(`/api/admin/approve/${encodeURIComponent(token)}`, { method: 'GET' });
}
