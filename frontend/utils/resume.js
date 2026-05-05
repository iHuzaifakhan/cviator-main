// frontend/utils/resume.js
// Shared pure utility functions used by templates, the form, and pages.
// Nothing React-specific here — all plain JS.

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function withId(item) {
  return item?.id ? item : { ...item, id: uid() };
}

function toTime(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

export function sortByDateDesc(items = []) {
  const now = Date.now();
  return [...items].sort((a, b) => {
    const aTo = toTime(a?.to) ?? (a?.from ? now + 1 : 0);
    const bTo = toTime(b?.to) ?? (b?.from ? now + 1 : 0);
    if (aTo !== bTo) return bTo - aTo;
    return (toTime(b?.from) ?? 0) - (toTime(a?.from) ?? 0);
  });
}

export function normalizeSkills(skills = []) {
  return (skills || [])
    .map((s) =>
      typeof s === 'string'
        ? { name: s, description: '' }
        : { name: s?.name || '', description: s?.description || '' }
    )
    .filter((s) => s.name || s.description);
}

export function toExternalUrl(v = '') {
  if (!v) return '#';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function stripProtocol(v = '') {
  return (v || '').replace(/^https?:\/\//i, '');
}

export function getInitials(name = '') {
  const words = (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!words.length) return 'CP';
  return words.map((w) => w[0].toUpperCase()).join('');
}
