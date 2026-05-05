// frontend/pages/reset-password.js
// Reached via link in the password-reset email: /reset-password?token=...
// User enters a new password; on success, redirect to /login?verified=1.

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { resetPassword } from '../services/auth';
import { AuthShell, Field } from './login';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { token } = router.query;

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [error,     setError]     = useState('');
  const [busy,      setBusy]      = useState(false);
  const [success,   setSuccess]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('No reset token found. Please request a new link.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => router.replace('/login?verified=1'), 2000);
    } catch (err) {
      setError(err.message || 'Could not reset password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head><title>Reset password — Cviator Pro</title></Head>
      <AuthShell title="Set a new password">
        {success ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Password updated! Redirecting you to sign in…
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                label="New password"
                type="password"
                value={password}
                onChange={setPassword}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
              <Field
                label="Confirm new password"
                type="password"
                value={confirm}
                onChange={setConfirm}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Repeat your password"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={busy || !token}
                className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Set new password'}
              </button>
            </form>
            <p className="mt-5 text-center text-sm text-slate-500">
              <Link href="/login" className="font-medium text-slate-900 hover:underline">Back to sign in</Link>
            </p>
          </>
        )}
      </AuthShell>
    </>
  );
}
