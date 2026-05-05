// frontend/pages/login.js
// Email + password sign-in. Redirects to / on success.

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { status, user, login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);

  const verified = router.query.verified === '1';

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(user?.isAdmin ? '/admin' : '/');
    }
  }, [status, user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login({ email: email.trim(), password });
      router.replace(u?.isAdmin ? '/admin' : '/');
    } catch (err) {
      if (err.needsVerification) {
        router.replace(`/verify-email?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      if (err.pendingApproval) {
        router.replace(`/signup-pending?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      setError(err.message || 'Could not log in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head><title>Sign in — Cviator Pro</title></Head>
      <AuthShell title="Welcome back" subtitle="Sign in to keep building your resume.">
        {verified && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Email verified! You can now sign in.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="mt-5 flex flex-col items-center gap-2 text-sm text-slate-500">
          <Link href="/forgot-password" className="hover:text-slate-700 hover:underline">
            Forgot your password?
          </Link>
          <span>
            New here?{' '}
            <Link href="/signup" className="font-medium text-slate-900 hover:underline">
              Create an account
            </Link>
          </span>
        </div>
      </AuthShell>
    </>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">C</div>
          <span className="text-base font-semibold text-slate-900">
            Cviator <span className="font-normal text-slate-500">Pro</span>
          </span>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function Field({ label, type = 'text', value, onChange, ...rest }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        {...rest}
      />
    </label>
  );
}
