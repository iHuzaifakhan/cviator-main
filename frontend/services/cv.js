// frontend/services/cv.js
// ---------------------------------------------------------------
// CV load/save against the backend.
//
// Date fields (`from`/`to` in experience/education) are stored as
// ISO strings in JSONB, so on load we revive them into Date objects
// for the date picker and template helpers.
// ---------------------------------------------------------------

import { apiFetch } from './api';

const DATE_FIELDS = ['from', 'to'];

function reviveDates(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(reviveDates);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (DATE_FIELDS.includes(k) && typeof v === 'string' && v) {
      const d = new Date(v);
      out[k] = Number.isNaN(d.getTime()) ? v : d;
    } else {
      out[k] = reviveDates(v);
    }
  }
  return out;
}

export async function loadCV() {
  const { data, updatedAt } = await apiFetch('/api/cv', { auth: true });
  return { data: reviveDates(data || {}), updatedAt };
}

export async function saveCV(data) {
  return apiFetch('/api/cv', {
    method: 'PUT',
    auth: true,
    body: { data },
  });
}
