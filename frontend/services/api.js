// frontend/services/api.js
// ---------------------------------------------------------------
// Tiny fetch wrapper:
//   - prefixes the API base URL
//   - attaches Authorization: Bearer <token> from localStorage
//   - throws an Error with .status and a parsed body on non-2xx
// ---------------------------------------------------------------

// Resolve the API base URL.
//
// Next.js bakes NEXT_PUBLIC_* into the JS bundle at *build* time, which breaks
// when the same image is run on a different host (e.g. AWS EC2) — the browser
// would try to hit `localhost:5000` on the *user's* machine.
//
// Strategy:
//   1. If NEXT_PUBLIC_API_URL is set to a real value (not the localhost default),
//      trust it — useful when the API lives on a separate domain.
//   2. Otherwise, in the browser, compute the URL from window.location so the
//      backend is always reached at `<same-host>:5000`. This makes one Docker
//      image work on localhost, EC2, or any other host with no rebuild.
//   3. On the server (SSR), fall back to the env var or localhost.
const ENV_API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function resolveApiUrl() {
  if (typeof window !== 'undefined') {
    if (ENV_API_URL && ENV_API_URL !== 'http://localhost:5000') return ENV_API_URL;
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }
  return ENV_API_URL || 'http://localhost:5000';
}

export const API_URL = resolveApiUrl();

const TOKEN_KEY = 'cviator.token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else       window.localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, { method = 'GET', body, auth = false, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  let payload = null;
  const text = await res.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }

  if (!res.ok) {
    const message = (payload && payload.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}
