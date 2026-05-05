// frontend/pages/verify-email.js
// Two modes:
//   ?new=1&email=...  — shown right after signup: "check your email"
//   ?token=...        — user clicked the link in the email; we call the API
//                       and redirect to /login?verified=1 on success

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { verifyEmailToken, resendVerification } from '../services/auth';
import { AuthShell } from './login';

export default function VerifyEmailPage() {
  const router = useRouter();
  const { token, email, new: isNew } = router.query;

  const [state,   setState]   = useState('idle');   // idle | verifying | success | error | resent | resending
  const [message, setMessage] = useState('');

  // Auto-verify when token is in URL.
  useEffect(() => {
    if (!token) return;
    setState('verifying');
    verifyEmailToken(token)
      .then(() => {
        router.replace('/login?verified=1');
      })
      .catch((err) => {
        setState('error');
        setMessage(err.message || 'Token is invalid or has expired.');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleResend() {
    const addr = email || '';
    if (!addr) return;
    setState('resending');
    try {
      const result = await resendVerification(addr);
      if (result?.devLink) {
        router.replace(result.devLink);
      } else {
        setState('resent');
      }
    } catch (err) {
      setState('error');
      setMessage(err.message || 'Could not resend email.');
    }
  }

  // Token mode — show spinner while verifying.
  if (token) {
    if (state === 'verifying') {
      return (
        <AuthShell title="Verifying…">
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
          </div>
        </AuthShell>
      );
    }
    if (state === 'error') {
      return (
        <AuthShell title="Link expired">
          <p className="text-sm text-red-600">{message}</p>
          {email && (
            <button
              type="button"
              onClick={handleResend}
              className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Resend verification email
            </button>
          )}
          <p className="mt-4 text-center text-sm text-slate-500">
            <Link href="/login" className="font-medium text-slate-900 hover:underline">Back to sign in</Link>
          </p>
        </AuthShell>
      );
    }
  }

  // Post-signup "check your inbox" mode.
  return (
    <>
      <Head><title>Verify your email — Cviator Pro</title></Head>
      <AuthShell
        title="Check your email"
        subtitle={email ? `We sent a verification link to ${email}.` : 'We sent you a verification link.'}
      >
        {state === 'resent' ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Email resent! Check your inbox (and spam folder).
          </div>
        ) : state === 'error' ? (
          <p className="text-sm text-red-600">{message}</p>
        ) : (
          <p className="text-sm text-slate-500">
            {isNew
              ? 'Click the link in the email to activate your account. The link expires in 24 hours.'
              : 'Click the link in the email to verify your address.'}
          </p>
        )}

        {email && state !== 'resent' && (
          <button
            type="button"
            onClick={handleResend}
            disabled={state === 'resending'}
            className="mt-4 w-full rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
          >
            {state === 'resending' ? 'Sending…' : 'Resend verification email'}
          </button>
        )}

        <p className="mt-5 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-slate-900 hover:underline">Back to sign in</Link>
        </p>
      </AuthShell>
    </>
  );
}
