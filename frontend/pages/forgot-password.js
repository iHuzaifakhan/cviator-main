// frontend/pages/forgot-password.js
// Enter email → backend sends a reset link (or logs it in dev).
// Always shows "check your email" after submission to avoid leaking account existence.

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { forgotPassword } from '../services/auth';
import { AuthShell, Field } from './login';

export default function ForgotPasswordPage() {
  const [email,     setEmail]     = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState('');
  const [busy,      setBusy]      = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Could not process request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head><title>Forgot password — Cviator Pro</title></Head>
      <AuthShell
        title="Forgot password"
        subtitle={submitted ? undefined : "We'll email you a link to reset it."}
      >
        {submitted ? (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              If that email is registered, a reset link has been sent. Check your inbox (and spam folder).
            </div>
            <p className="text-center text-sm text-slate-500">
              <Link href="/login" className="font-medium text-slate-900 hover:underline">Back to sign in</Link>
            </p>
          </div>
        ) : (
          <>
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
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Send reset link'}
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
