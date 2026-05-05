// frontend/components/templates/TemplateModern.js
// Modern template — two-column layout with a dark sidebar.
// Mirrors backend/utils/generateHTML.js for PDF parity.

import { memo } from 'react';
import { formatDateRange } from './dateRange';
import {
  sortByDateDesc,
  normalizeSkills,
  toExternalUrl,
  stripProtocol,
  getInitials,
} from '../../utils/resume';

const styles = {
  sidebarBg: '#1e293b',
  accent:    '#94a3b8',
  heading:   '#334155',
};

function markerText(index, style) {
  if (style === 'none') return null;
  return style === 'dot' ? '•' : `${index + 1}.`;
}

function TemplateModern({ resume }) {
  const r          = resume || {};
  const skills     = normalizeSkills(r.skills);
  const experience = sortByDateDesc(r.experience || []);
  const education  = sortByDateDesc(r.education  || []);
  const marker     = r.markerStyle || 'number';

  return (
    <article className="grid min-h-[1050px] grid-cols-[30%_minmax(0,70%)] bg-white text-[12px] leading-[1.62] text-slate-900">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="px-7 py-7 pr-4 text-slate-100" style={{ background: styles.sidebarBg }}>
        {r.photo ? (
          <img
            src={r.photo}
            alt={r.name || 'Profile photo'}
            className="h-32 w-32 rounded-full border-2 border-white/20 object-cover"
          />
        ) : (
          <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-2xl font-semibold">
            {getInitials(r.name)}
          </div>
        )}

        <h1 className="mt-5 text-[28px] font-bold leading-tight text-white">
          {r.name || 'Your Name'}
        </h1>
        <div className="mt-3 border-b border-white/30" />

        <div className="mt-4 space-y-3.5 text-[11px]" style={{ color: styles.accent }}>
          {r.email    && <InfoRow label="Email"    value={r.email} />}
          {r.phone    && <InfoRow label="Phone"    value={r.phone} />}
          {r.location && <InfoRow label="Location" value={r.location} />}
          {r.linkedin && <InfoRow label="LinkedIn" value={stripProtocol(r.linkedin)} href={toExternalUrl(r.linkedin)} />}
          {r.github   && <InfoRow label="GitHub"   value={stripProtocol(r.github)}   href={toExternalUrl(r.github)} />}
        </div>

        {skills.length > 0 && (
          <div className="mt-7">
            <SidebarHeading>{r.skillsTitle || 'Skills'}</SidebarHeading>
            <div className="mt-3 space-y-3">
              {skills.map((skill, i) => (
                <div key={`skill-${i}`} className="flex items-start gap-2 text-[11px]">
                  {markerText(i, marker) && (
                    <div className="min-w-[1rem] shrink-0 pt-0.5 text-white/70">
                      {markerText(i, marker)}
                    </div>
                  )}
                  <div className="min-w-0 break-words">
                    <div className="font-medium text-white">{skill.name}</div>
                    {skill.description && (
                      <div className="mt-0.5 leading-relaxed text-white/75">{skill.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="min-w-0 break-words px-8 py-9 pl-5">
        {r.summary && (
          <Section title="About" accent={styles.heading}>
            <MultilineText>{r.summary}</MultilineText>
          </Section>
        )}

        <Section title="Experience" accent={styles.heading}>
          {experience.map((ex, i) => (
            <div key={ex.id || `exp-${i}`}>
              <EntryHeader
                left={ex.company}
                sub={ex.role}
                right={formatDateRange(ex.from, ex.to, { fallback: ex.duration || '' })}
                accent={styles.heading}
              />
              {ex.description && <MultilineText className="mt-1.5">{ex.description}</MultilineText>}
            </div>
          ))}
        </Section>

        <Section title="Education" accent={styles.heading}>
          {education.map((ed, i) => (
            <EntryHeader
              key={ed.id || `edu-${i}`}
              left={ed.school}
              sub={ed.degree}
              right={formatDateRange(ed.from, ed.to, { fallback: ed.year || '' })}
              accent={styles.heading}
            />
          ))}
        </Section>

        <Section title="Projects" accent={styles.heading}>
          {(r.projects || []).map((pr, i) => (
            <div key={pr.id || `proj-${i}`} className="flex items-start gap-3">
              {markerText(i, marker) && (
                <div className="min-w-[1.25rem] shrink-0 pt-0.5 text-xs font-semibold text-slate-500">
                  {markerText(i, marker)}
                </div>
              )}
              <div className="min-w-0 flex-1 break-words">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[13px] font-semibold text-slate-900">{pr.title}</div>
                  {pr.link && (
                    <a href={toExternalUrl(pr.link)} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-slate-900">
                      {stripProtocol(pr.link)}
                    </a>
                  )}
                </div>
                {pr.description && <MultilineText className="mt-1.5">{pr.description}</MultilineText>}
              </div>
            </div>
          ))}
        </Section>

        {(r.customSections || []).map((sec, si) => {
          const items = sec?.items || [];
          const hasLegacyContent = !items.length && sec?.content;
          if (!sec?.title && !items.length && !hasLegacyContent) return null;
          return (
            <Section key={sec.id || `custom-${si}`} title={sec.title || 'Custom Section'} accent={styles.heading}>
              {hasLegacyContent ? (
                <MultilineText>{sec.content}</MultilineText>
              ) : (
                <div className="space-y-3">
                  {items.map((item, ii) => (
                    <div key={item.id || `ci-${ii}`} className="flex items-start gap-3">
                      {markerText(ii, marker) && (
                        <div className="min-w-[1rem] shrink-0 pt-0.5 text-xs text-slate-500">
                          {markerText(ii, marker)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 break-words">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        {item.description && <MultilineText className="mt-0.5">{item.description}</MultilineText>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          );
        })}
      </main>
    </article>
  );
}

export default memo(TemplateModern);

// ── sub-components ────────────────────────────────────────────────

function Section({ title, accent, children }) {
  return (
    <section className="mt-7 first:mt-0">
      <h2
        className="mb-3.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: accent, borderBottom: `1px solid ${accent}33` }}
      >
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function EntryHeader({ left, sub, right, accent }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <div className="text-[13px] font-semibold text-slate-900">{left}</div>
        {sub && (
          <div className="mt-0.5 text-[11.5px] font-medium" style={{ color: accent }}>
            {sub}
          </div>
        )}
      </div>
      {right && <div className="text-xs text-slate-500">{right}</div>}
    </div>
  );
}

function SidebarHeading({ children }) {
  return (
    <h2 className="border-b border-white/20 pb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90">
      {children}
    </h2>
  );
}

function InfoRow({ label, value, href }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/60">{label}</div>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="mt-0.5 block break-all text-white hover:underline">
          {value}
        </a>
      ) : (
        <div className="mt-0.5 text-white">{value}</div>
      )}
    </div>
  );
}

function MultilineText({ children, className = '' }) {
  return (
    <p className={`whitespace-pre-line break-words text-slate-700 ${className}`.trim()}>
      {children}
    </p>
  );
}
