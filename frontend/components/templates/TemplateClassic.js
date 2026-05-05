// frontend/components/templates/TemplateClassic.js
// Official institute CV format — strict single-page A4.
// Mirrors backend/utils/generateHTML.js for PDF parity.
//
// Layout:
//   • Header band:
//       LEFT  → Name (bold, large) + email/phone/linkedin/github/others/address.
//                Each contact line is prefixed with a small icon.
//       RIGHT → Photo box (always reserves the slot, with placeholder if empty).
//   • Body: two-column grid (label | content) with a vertical rule.
//
// Section order (always rendered, even when empty):
//   1. Objective
//   2. Education
//   3. Work Experience
//   4. Projects
//   5. Skills
// Custom sections are rendered after Skills.
//
// Empty content area shows a faint dash so the row stays visible.
//
// Empty-state CV:
//   When EVERY field is empty we render a greyed-out reference CV
//   so users see the layout. As soon as anything is typed, the
//   placeholder data disappears and only real data renders.
//
// Marker style (resume.markerStyle):
//   'number' → 1. 2. 3. (default)
//   'dot'    → •
//   'none'   → no marker
//
// Render-only caps (full data stays in DB):
//   Skills: 8  ·  Projects: 4
//   Summary trim: 420 chars  ·  Description trim: 280 chars

import { memo } from 'react';
import { formatDateRange } from './dateRange';
import {
  sortByDateDesc,
  normalizeSkills,
  toExternalUrl,
  stripProtocol,
} from '../../utils/resume';

const MAX_SKILLS      = 8;
const MAX_PROJECTS    = 4;
const MAX_SUMMARY     = 420;
const MAX_DESC        = 280;
const MAX_CUSTOM_DESC = 180;
const MAX_SKILL_DESC  = 160;

const FONT = "'Times New Roman', Times, serif";

// Reference CV — only used when the resume is completely empty.
const PLACEHOLDER = {
  name: 'YOUR NAME',
  email: 'you@giki.edu.pk',
  phone: '+92 300 0000000',
  location: 'Topi, Khyber Pakhtunkhwa, Pakistan',
  linkedin: 'linkedin.com/in/yourname',
  github:   'github.com/yourname',
  others:   'yourportfolio.com',
  summary:  'Final-year Computer Science student seeking a backend or full-stack role. Interested in distributed systems, cloud infrastructure, and developer tooling.',
  education:  [{ id: 'p-ed-1', school: 'Ghulam Ishaq Khan Institute', degree: 'BS Computer Science', from: '2021', to: '2025', description: 'CGPA: 3.50/4.00' }],
  experience: [{ id: 'p-ex-1', company: 'Acme Software', role: 'Software Engineering Intern', from: '2024-06', to: '2024-08', description: 'Optimized REST APIs in Node.js, cutting p95 latency by 35%. Owned the migration from a monolith to a service-oriented backend.' }],
  projects: [
    { id: 'p-pj-1', title: 'Distributed Key-Value Store', description: '- Built in Go with Raft consensus.\n- Linearizable reads/writes across 5 nodes.\n- Survives leader failure in <2s.' },
    { id: 'p-pj-2', title: 'Course Registration Portal', description: 'React + Express + PostgreSQL. Real-time seat counts via WebSockets.' },
    { id: 'p-pj-3', title: 'Tic-Tac-Toe AI', description: 'Minimax with alpha-beta pruning; perfect-play heuristic.' },
  ],
  skills: [
    { name: 'Languages',  description: 'C/C++, Python, JavaScript, Go' },
    { name: 'Frontend',   description: 'React, Next.js, Tailwind CSS' },
    { name: 'Backend',    description: 'Node.js, Express, PostgreSQL' },
    { name: 'Tools',      description: 'Git, Docker, Linux, AWS' },
    { name: 'Databases',  description: 'PostgreSQL, MongoDB, Redis' },
    { name: 'Frameworks', description: 'FastAPI, Flask, Django' },
  ],
  customSections: [],
};

// ── Page (strict A4) ─────────────────────────────────────────────
const pageStyle = {
  background: '#ffffff',
  width: '210mm',
  height: '297mm',
  maxHeight: '297mm',
  margin: '0',
  padding: '13mm 15mm',
  fontFamily: FONT,
  fontSize: '11px',
  lineHeight: 1.4,
  color: '#000',
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const ROW_STYLE = {
  display: 'grid',
  gridTemplateColumns: '115px 1fr',
  columnGap: '14px',
  paddingTop: '9px',
};

const LABEL_STYLE = {
  textAlign: 'right',
  fontWeight: 700,
  fontSize: '11.5px',
  color: '#000',
  paddingRight: '12px',
  borderRight: '1px solid #000',
  lineHeight: 1.25,
};

const CONTENT_STYLE = { fontSize: '11px', color: '#000', lineHeight: 1.45 };

const bodyStyle = {
  margin: 0,
  fontSize: '11px',
  color: '#000',
  lineHeight: 1.45,
  whiteSpace: 'pre-line',
};

const EMPTY_HINT = { color: '#bbb', fontStyle: 'italic' };

// ── helpers ──────────────────────────────────────────────────────

function trim(text, n) {
  if (!text) return '';
  const s = String(text).trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

function toLines(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*]\s?/, '').trim())
    .filter(Boolean);
}

function isEffectivelyEmpty(r) {
  if (!r) return true;
  const has = (s) => s && String(s).trim().length > 0;
  if (has(r.name) || has(r.email) || has(r.phone) || has(r.location)
      || has(r.linkedin) || has(r.github) || has(r.others) || has(r.summary) || has(r.photo)) return false;
  if ((r.education  || []).some((e) => has(e?.school) || has(e?.degree))) return false;
  if ((r.experience || []).some((e) => has(e?.company) || has(e?.role))) return false;
  if ((r.projects   || []).some((p) => has(p?.title))) return false;
  if ((r.skills     || []).some((s) => has(typeof s === 'string' ? s : s?.name))) return false;
  if ((r.customSections || []).some((sec) =>
    has(sec?.title) || has(sec?.content) ||
    (sec?.items || []).some((i) => has(i?.name) || has(i?.description))
  )) return false;
  return true;
}

// ── Inline SVG icons ─────────────────────────────────────────────
const Icon = ({ children }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
       style={{ flexShrink: 0, verticalAlign: '-2px', marginRight: '6px' }} aria-hidden>
    {children}
  </svg>
);

const EmailIcon   = () => <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Icon>;
const PhoneIcon   = () => <Icon><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" /></Icon>;
const AddressIcon = () => <Icon><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></Icon>;
const GlobeIcon   = () => <Icon><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 0 20" /><path d="M12 2a15.3 15.3 0 0 0 0 20" /></Icon>;

const LinkedInIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
       style={{ flexShrink: 0, verticalAlign: '-2px', marginRight: '6px' }} aria-hidden>
    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.91 1.65-1.85 3.4-1.85 3.63 0 4.3 2.39 4.3 5.5v6.24zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/>
  </svg>
);
const GitHubIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
       style={{ flexShrink: 0, verticalAlign: '-2px', marginRight: '6px' }} aria-hidden>
    <path d="M12 .3a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.2c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.31 1.23a11.5 11.5 0 0 1 6.02 0c2.3-1.55 3.31-1.23 3.31-1.23.65 1.66.24 2.88.11 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .3"/>
  </svg>
);

// Pick icon based on URL hostname.
function linkIcon(url = '') {
  const u = String(url).toLowerCase();
  if (u.includes('linkedin')) return <LinkedInIcon />;
  if (u.includes('github'))   return <GitHubIcon />;
  return <GlobeIcon />;
}

function ContactLine({ icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', lineHeight: 1.5 }}>
      {icon}
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

function TemplateClassic({ resume }) {
  const isEmpty = isEffectivelyEmpty(resume);
  const r       = isEmpty ? PLACEHOLDER : (resume || {});
  const placeholderTint = isEmpty ? { color: '#666', opacity: 0.85 } : null;

  const markerStyle = (resume && resume.markerStyle) || 'number';

  const skills     = normalizeSkills(r.skills).slice(0, MAX_SKILLS);
  const projects   = sortByDateDesc(r.projects   || []).slice(0, MAX_PROJECTS);
  const education  = sortByDateDesc(r.education  || []);
  const experience = sortByDateDesc(r.experience || []);
  const customs    = r.customSections || [];

  const addressLines = String(r.location || '')
    .split(/\r?\n|,\s*/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
    <article style={{ ...pageStyle, ...placeholderTint, position: 'relative' }}>
      {isEmpty && (
        <div style={{
          position: 'absolute', top: '8px', right: '12px',
          fontSize: '9px', color: '#888', fontStyle: 'italic',
          letterSpacing: '0.05em',
        }}>
          REFERENCE LAYOUT — start filling the form to see your CV
        </div>
      )}

      {/* ── Header band ─────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '20px', paddingBottom: '10px', borderBottom: '1px solid #000',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '24px', fontWeight: 700, lineHeight: 1.1, color: isEmpty ? '#666' : '#000' }}>
            {r.name || 'Your Name'}
          </div>
          <div style={{ marginTop: '7px', fontSize: '11px', lineHeight: 1.5 }}>
            {r.email    && <ContactLine icon={<EmailIcon />}>{r.email}</ContactLine>}
            {r.phone    && <ContactLine icon={<PhoneIcon />}>{r.phone}</ContactLine>}
            {r.linkedin && <ContactLine icon={<LinkedInIcon />}>{stripProtocol(r.linkedin)}</ContactLine>}
            {r.github   && <ContactLine icon={<GitHubIcon />}>{stripProtocol(r.github)}</ContactLine>}
            {r.others   && <ContactLine icon={<GlobeIcon />}>{stripProtocol(r.others)}</ContactLine>}
            {addressLines.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: '2px' }}>
                <span style={{ marginTop: '2px' }}><AddressIcon /></span>
                <div>
                  {addressLines.map((line, i) => <div key={`addr-${i}`}>{line}</div>)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ flexShrink: 0 }}>
          {r.photo ? (
            <img src={r.photo} alt={r.name || 'Profile'}
              style={{ width: '100px', height: '120px', objectFit: 'cover', border: '1px solid #000', display: 'block' }} />
          ) : (
            <div style={{
              width: '100px', height: '120px', border: '1px solid #000',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '9px', color: '#666', fontStyle: 'italic',
              textAlign: 'center', lineHeight: 1.3, background: '#fafafa',
            }}>
              Profile<br />Photo
            </div>
          )}
        </div>
      </header>

      {/* ── Body — labels ALWAYS render, content area shows a faint dash when empty ── */}
      <Row label="Objective">
        {r.summary
          ? <p style={bodyStyle}>{trim(r.summary, MAX_SUMMARY)}</p>
          : <span style={EMPTY_HINT}>—</span>}
      </Row>

      <Row label="Education">
        {education.length > 0
          ? education.map((ed, i) => (
              <Entry
                key={ed.id || `edu-${i}`}
                title={ed.school}
                right={[ed.location, formatDateRange(ed.from, ed.to, { fallback: ed.year || '' })]}
                lines={[ed.degree, ed.description].filter(Boolean).map((s) => trim(s, MAX_DESC))}
                spaced={i < education.length - 1}
              />
            ))
          : <span style={EMPTY_HINT}>—</span>}
      </Row>

      <Row label={<>Work<br />Experience</>}>
        {experience.length > 0
          ? experience.map((ex, i) => (
              <Entry
                key={ex.id || `exp-${i}`}
                title={[ex.company, ex.role].filter(Boolean).join(', ')}
                right={[ex.location, formatDateRange(ex.from, ex.to, { fallback: ex.duration || '' })]}
                lines={ex.description ? [trim(ex.description, MAX_DESC)] : []}
                spaced={i < experience.length - 1}
              />
            ))
          : <span style={EMPTY_HINT}>—</span>}
      </Row>

      <Row label="Projects">
        {projects.length > 0
          ? projects.map((pr, i) => (
              <ProjectBlock key={pr.id || `proj-${i}`} project={pr} markerStyle={markerStyle} spaced={i < projects.length - 1} />
            ))
          : <span style={EMPTY_HINT}>—</span>}
      </Row>

      <Row label={r.skillsTitle || 'Skills'}>
        {skills.length > 0
          ? (
              <MarkerList markerStyle={markerStyle}>
                {skills.map((s, i) => (
                  <MarkerItem key={`sk-${i}`} index={i} markerStyle={markerStyle}>
                    {s.name && <strong>{s.name}</strong>}
                    {s.name && s.description && ': '}
                    {s.description && trim(s.description, MAX_SKILL_DESC)}
                  </MarkerItem>
                ))}
              </MarkerList>
            )
          : <span style={EMPTY_HINT}>—</span>}
      </Row>

      {/* Custom sections — rendered only when they have data */}
      {customs.map((sec, si) => {
        const items = sec?.items || [];
        const legacy = !items.length && sec?.content ? toLines(sec.content) : [];
        if (!sec?.title && !items.length && !legacy.length) return null;
        return (
          <Row key={sec.id || `cs-${si}`} label={sec.title || 'Custom'}>
            <MarkerList markerStyle={markerStyle}>
              {(items.length
                ? items.map((it, i) => ({ key: it.id || `ci-${i}`, name: it.name, description: it.description }))
                : legacy.map((line, i) => ({ key: `csl-${i}`, name: '', description: line }))
              ).map((it, i) => (
                <MarkerItem key={it.key} index={i} markerStyle={markerStyle}>
                  {it.name && <strong>{it.name}</strong>}
                  {it.name && it.description && ' — '}
                  {it.description && trim(it.description, MAX_CUSTOM_DESC)}
                </MarkerItem>
              ))}
            </MarkerList>
          </Row>
        );
      })}
    </article>
  );
}

export default memo(TemplateClassic);

// ── sub-components ───────────────────────────────────────────────

function Row({ label, children }) {
  return (
    <div style={ROW_STYLE}>
      <div style={LABEL_STYLE}>{label}</div>
      <div style={CONTENT_STYLE}>{children}</div>
    </div>
  );
}

function Entry({ title, right = [], lines = [], spaced }) {
  const [loc, date] = right;
  return (
    <div style={{ marginBottom: spaced ? '9px' : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '11.5px' }}>{title}</span>
        </div>
        {(loc || date) && (
          <div style={{ textAlign: 'right', fontSize: '10.5px', lineHeight: 1.3, flexShrink: 0 }}>
            {loc  && <div>{loc}</div>}
            {date && <div>{date}</div>}
          </div>
        )}
      </div>
      {lines.map((ln, i) => (
        <div key={i} style={{ marginTop: '1px', fontSize: '11px' }}>{ln}</div>
      ))}
    </div>
  );
}

function ProjectBlock({ project: pr, spaced, markerStyle }) {
  const lines = toLines(pr.description).map((l) => trim(l, MAX_DESC));
  const dateRange = formatDateRange(pr.from, pr.to, { fallback: '' });
  return (
    <div style={{ marginBottom: spaced ? '7px' : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ fontWeight: 700, fontSize: '11.5px' }}>{pr.title}</span>
        {dateRange && <span style={{ fontSize: '10.5px', flexShrink: 0 }}>{dateRange}</span>}
      </div>
      {lines.length > 1 ? (
        <MarkerList markerStyle={markerStyle} compact>
          {lines.map((ln, i) => (
            <MarkerItem key={i} index={i} markerStyle={markerStyle}>{ln}</MarkerItem>
          ))}
        </MarkerList>
      ) : lines.length === 1 ? (
        <p style={{ ...bodyStyle, marginTop: '2px' }}>{lines[0]}</p>
      ) : null}
      {pr.link && (
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '10.5px', marginTop: '1px' }}>
          {linkIcon(pr.link)}
          <a href={toExternalUrl(pr.link)} target="_blank" rel="noreferrer" style={{ color: '#000' }}>
            {stripProtocol(pr.link)}
          </a>
        </div>
      )}
    </div>
  );
}

// ── Marker rendering ─────────────────────────────────────────────
// 'number' → ordered list with "1. 2. 3." numerals
// 'dot'    → unordered list with "•" markers
// 'none'   → plain stacked rows with NO marker

function MarkerList({ children, markerStyle = 'number', compact = false }) {
  const margin = compact ? '2px 0 0 0' : '0';
  if (markerStyle === 'none') {
    return <div style={{ margin, display: 'flex', flexDirection: 'column' }}>{children}</div>;
  }
  if (markerStyle === 'dot') {
    return (
      <ul style={{ margin, paddingLeft: '14px', listStyle: 'disc' }}>{children}</ul>
    );
  }
  return (
    <ol style={{ margin, paddingLeft: '18px', listStyle: 'decimal' }}>{children}</ol>
  );
}

function MarkerItem({ children, markerStyle }) {
  // 'none' must NOT render an <li> (would inherit a bullet); use a plain <div>.
  if (markerStyle === 'none') {
    return (
      <div style={{ fontSize: '11px', lineHeight: 1.45, marginBottom: '1px' }}>
        {children}
      </div>
    );
  }
  return (
    <li style={{ fontSize: '11px', lineHeight: 1.45, marginBottom: '1px' }}>
      {children}
    </li>
  );
}
