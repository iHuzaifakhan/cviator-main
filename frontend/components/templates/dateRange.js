// frontend/components/templates/dateRange.js
// ---------------------------------------------------------------
// Format a from/to pair into a human "MMM yyyy – MMM yyyy" range.
// Keeps backward compatibility with the legacy `duration`/`year`
// strings the templates used to render directly.
// ---------------------------------------------------------------

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatMonthYear(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateRange(from, to, { fallback = '' } = {}) {
  const f = formatMonthYear(from);
  const t = formatMonthYear(to);
  if (!f && !t) return fallback;
  if (f && t) return `${f} – ${t}`;
  if (f && !t) return `${f} – Present`;
  return t;
}

export { formatMonthYear };
