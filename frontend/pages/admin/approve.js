// frontend/pages/admin/approve.js
// Public page reached by clicking the link in the root-admin's email.
// Calls GET /api/admin/approve/:token. Token is consumed atomically server-side.

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { approveAdminByToken } from '../../services/auth';
import { AuthShell } from '../login';

export default function AdminApprovePage() {
  const router = useRouter();
  const { token } = router.query;
  const [state,   setState]   = useState('idle');     // idle | working | done | error
  const [message, setMessage] = useState('');
  const [email,   setEmail]   = useState('');

  useEffect(() => {
    if (!token) return;
    setState('working');
    approveAdminByToken(token)
      .then((r) => { setState('done'); setEmail(r.email || ''); })
      .catch((err) => { setState('error'); setMessage(err.message || 'Approval failed.'); });
  }, [token]);

  return (
    <>
      <Head><title>Approve admin — Cviator Pro</title></Head>
      <AuthShell title="Admin approval">
        {state === 'working' && (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
          </div>
        )}
        {state === 'done' && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Approved. {email ? `${email} can now sign in.` : 'The admin can now sign in.'}
          </p>
        )}
        {state === 'error' && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
        )}
        <p className="mt-5 text-center text-sm text-slate-500">
          <Link href="/admin" className="font-medium text-slate-900 hover:underline">Go to admin dashboard</Link>
        </p>
      </AuthShell>
    </>
  );
}
