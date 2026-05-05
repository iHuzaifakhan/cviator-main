// frontend/pages/index.js
// ---------------------------------------------------------------
// Home / builder page. Auth-gated:
//   - 'loading'         → spinner while we verify the session token
//   - 'unauthenticated' → kick to /login
//   - 'authenticated'   → render the builder, populated from /api/cv
//
// Auto-save: a debounced PUT /api/cv 1.5s after the last change.
// ---------------------------------------------------------------

import {
  useCallback, useDeferredValue, useEffect, useMemo, useRef, useState,
} from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useRouter } from 'next/router';

import { useAuth } from '../hooks/useAuth';
import { loadCV, saveCV } from '../services/cv';
import { API_URL, getToken } from '../services/api';
import { uid } from '../utils/resume';

const ResumeForm = dynamic(() => import('../components/ResumeForm'), {
  ssr: false,
  loading: () => <FormSkeleton />,
});
const LivePreview = dynamic(() => import('../components/LivePreview'), {
  ssr: false,
  loading: () => <PreviewSkeleton />,
});

const AUTOSAVE_DELAY_MS = 1500;

const EMPTY_RESUME = {
  name: '',
  email: '',
  phone: '',
  location: '',
  linkedin: '',
  github: '',
  others: '',
  photo: '',
  summary: '',
  markerStyle: 'number',
  education: [],
  experience: [],
  projects: [],
  skillsTitle: 'Skills',
  skills: [],
  customSections: [],
};

export default function Home() {
  const router = useRouter();
  const { status, user, logout } = useAuth();

  const [resume, setResume] = useState(EMPTY_RESUME);
  const [template, setTemplate] = useState('classic');
  const [downloading, setDownloading] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [loadingCV, setLoadingCV] = useState(true);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error

  // Redirect anonymous users to /login, and admins to /admin
  // (admins do not build CVs — the builder is for students/faculty only).
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    else if (status === 'authenticated' && user?.isAdmin) router.replace('/admin');
  }, [status, user, router]);

  // Once the session is verified, fetch the user's CV.
  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    (async () => {
      setLoadingCV(true);
      try {
        const { data } = await loadCV();
        if (cancelled) return;
        const merged = { ...EMPTY_RESUME, ...data };
        // Make sure repeating items have stable IDs (older saves may not).
        merged.experience     = (merged.experience  || []).map((e) => e.id ? e : { ...e, id: uid() });
        merged.education      = (merged.education   || []).map((e) => e.id ? e : { ...e, id: uid() });
        merged.projects       = (merged.projects    || []).map((p) => p.id ? p : { ...p, id: uid() });
        merged.customSections = (merged.customSections || []).map((s) => ({
          ...s,
          id: s.id || uid(),
          items: (s.items || []).map((it) => it.id ? it : { ...it, id: uid() }),
        }));
        setResume(merged);
      } catch (err) {
        console.error('Could not load CV:', err);
      } finally {
        if (!cancelled) setLoadingCV(false);
      }
    })();
    return () => { cancelled = true; };
  }, [status]);

  // ── Debounced auto-save ────────────────────────────────────
  const saveTimer = useRef(null);
  const dirtyRef  = useRef(false);
  const inflight  = useRef(null);

  useEffect(() => {
    // Don't save during the initial population.
    if (loadingCV || status !== 'authenticated') return;
    dirtyRef.current = true;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      // Cancel any in-flight save by ignoring its outcome.
      const ticket = Symbol('save');
      inflight.current = ticket;

      setSaveState('saving');
      try {
        await saveCV(resume);
        if (inflight.current === ticket) setSaveState('saved');
      } catch (err) {
        console.error('Auto-save failed:', err);
        if (inflight.current === ticket) setSaveState('error');
      }
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(saveTimer.current);
  }, [resume, loadingCV, status]);

  // Flush on tab close — best-effort.
  useEffect(() => {
    const handler = () => {
      if (!dirtyRef.current) return;
      const token = getToken();
      if (!token) return;
      const blob = new Blob(
        [JSON.stringify({ data: resume })],
        { type: 'application/json' }
      );
      // sendBeacon can't set Authorization headers — fall back to fetch keepalive.
      try {
        fetch(`${API_URL}/api/cv`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ data: resume }),
          keepalive: true,
        });
      } catch { /* noop */ }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [resume]);

  const deferredResume = useDeferredValue(resume);

  const handleDownload = useCallback(async () => {
    try {
      setDownloading(true);
      const res = await fetch(`${API_URL}/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeData: resume, template }),
      });
      if (!res.ok) throw new Error(`PDF request failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(resume.name || 'resume').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Could not generate PDF. Make sure the backend is running on port 5000.');
    } finally {
      setDownloading(false);
    }
  }, [resume, template]);

  const templateOptions = useMemo(() => ([
    { value: 'classic', label: 'Classic' },
    { value: 'modern',  label: 'Modern'  },
  ]), []);

  // ── Render gates ──────────────────────────────────────────
  if (status === 'loading') return <FullPageMessage>Verifying your session…</FullPageMessage>;
  if (status !== 'authenticated') return null; // redirect in progress

  return (
    <>
      <Head>
        <title>Cviator Pro — Smart Resume Builder</title>
        <meta name="description" content="Build and download beautiful resumes in seconds." />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">C</div>
            <span className="text-base font-semibold text-slate-900">
              Cviator <span className="font-normal text-slate-500">Pro</span>
            </span>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <SaveIndicator state={saveState} />
            <SegmentedControl
              label="Template"
              value={template}
              onChange={setTemplate}
              options={templateOptions}
            />
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? 'Generating…' : 'Download PDF'}
            </button>

            <UserMenu user={user} onLogout={async () => { await logout(); router.replace('/login'); }} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section>
            <div className="mb-5">
              <h1 className="text-xl font-semibold text-slate-900">Build your resume</h1>
              <p className="mt-1 text-sm text-slate-500">
                Changes save automatically.
              </p>
            </div>
            {loadingCV ? <FormSkeleton /> : <ResumeForm resume={resume} setResume={setResume} />}
          </section>

          <section className="lg:sticky lg:top-20 lg:self-start">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Preview</h2>
                <p className="mt-1 text-sm text-slate-500">What you see is what the PDF will look like.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewExpanded(true)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                >
                  Enlarge Preview
                </button>
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 capitalize">
                  {template}
                </span>
              </div>
            </div>

            <div className="max-h-[calc(100vh-11rem)] overflow-y-auto scroll-thin rounded-lg border border-slate-200 bg-slate-100 p-4">
              <LivePreview resume={deferredResume} template={template} />
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
          Built with Next.js, Tailwind, Express, Postgres, and Puppeteer.
        </div>
      </footer>

      {previewExpanded && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Expanded Preview</h3>
                <p className="mt-0.5 text-xs text-slate-500">Review the resume at a larger size.</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewExpanded(false)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
              >
                Close
              </button>
            </div>
            <div className="overflow-auto p-5">
              <LivePreview resume={deferredResume} template={template} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── helpers ──────────────────────────────────────────────────

function SaveIndicator({ state }) {
  const map = {
    idle:   { dot: 'bg-slate-300', text: '' },
    saving: { dot: 'bg-amber-400 animate-pulse', text: 'Saving…' },
    saved:  { dot: 'bg-emerald-500',             text: 'Saved' },
    error:  { dot: 'bg-red-500',                 text: 'Save failed' },
  };
  const cfg = map[state] || map.idle;
  if (!cfg.text) return null;
  return (
    <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:inline-flex">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.text}
    </span>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const initial = (user?.fullName || user?.email || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 transition hover:bg-slate-300"
        aria-label="Account menu"
        title={user?.email || ''}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
          <div className="border-b border-slate-100 px-2 pb-2">
            {user?.fullName && <div className="text-sm font-medium text-slate-900">{user.fullName}</div>}
            <div className="truncate text-xs text-slate-500">{user?.email}</div>
          </div>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onLogout(); }}
            className="mt-1 block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function SegmentedControl({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs font-medium uppercase tracking-wider text-slate-500 sm:inline">{label}</span>
      <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white" />
      ))}
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="mx-auto h-[600px] w-full max-w-[820px] animate-pulse rounded-md border border-slate-200 bg-white" />
  );
}

function FullPageMessage({ children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-500">{children}</p>
    </main>
  );
}
