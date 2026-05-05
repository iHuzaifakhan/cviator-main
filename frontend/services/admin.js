// frontend/services/admin.js
// Wrappers for /api/admin/* endpoints.

import { apiFetch, API_URL, getToken } from './api';

export async function fetchUsers({ page = 1, role, status, facultyId, departmentId, batch, q } = {}) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (role)         params.set('role',         role);
  if (status)       params.set('status',       status);
  if (facultyId)    params.set('facultyId',    String(facultyId));
  if (departmentId) params.set('departmentId', String(departmentId));
  if (batch)        params.set('batch',        batch);
  if (q)            params.set('q',            q);
  return apiFetch(`/api/admin/users?${params.toString()}`, { auth: true });
}

export async function fetchUser(id) {
  return apiFetch(`/api/admin/users/${id}`, { auth: true });
}

// Returns { faculties: [{id, code, name, departments: [{id, code, name}]}], batches: [...] }
export async function fetchFilters() {
  return apiFetch('/api/admin/filters', { auth: true });
}

// Public — no auth header (filters: facultyId, departmentId, batch, q, template)
export async function downloadAllCvs({ facultyId, departmentId, batch, q, template = 'classic' } = {}) {
  const params = new URLSearchParams();
  if (facultyId)    params.set('facultyId',    String(facultyId));
  if (departmentId) params.set('departmentId', String(departmentId));
  if (batch)        params.set('batch',        batch);
  if (q)            params.set('q',            q);
  if (template)     params.set('template',     template);

  const token = getToken();
  const res = await fetch(`${API_URL}/api/admin/download-all?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try { const body = await res.json(); if (body?.error) message = body.error; } catch {}
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const dispo = res.headers.get('Content-Disposition') || '';
  const match = dispo.match(/filename="?([^";]+)"?/i);
  const filename = match ? match[1] : `cvs_${new Date().toISOString().slice(0, 10)}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadUserPdf(id, { template = 'classic', filename } = {}) {
  const token = getToken();
  const res = await fetch(
    `${API_URL}/api/admin/users/${id}/pdf?template=${encodeURIComponent(template)}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) throw new Error(`PDF download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (filename || 'resume').replace(/\s+/g, '_') + '.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Root-admin only ────────────────────────────────────────────
export async function fetchAdminRequests() {
  return apiFetch('/api/admin/admin-requests', { auth: true });
}
export async function approveAdminRequest(id) {
  return apiFetch(`/api/admin/admin-requests/${id}/approve`, { method: 'POST', auth: true });
}
export async function rejectAdminRequest(id) {
  return apiFetch(`/api/admin/admin-requests/${id}/reject`, { method: 'POST', auth: true });
}
export async function fetchAuditLog() {
  return apiFetch('/api/admin/audit', { auth: true });
}
