// frontend/pages/signup-pending.js
// Shown after an admin signs up: their request is awaiting root-admin approval.
// In dev mode (SMTP not configured) we surface the approval link directly.

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AuthShell } from './login';

export default function SignupPendingPage() {
  const router = useRouter();
  const { email, devLink } = router.query;

  return (
    <>
      <Head><title>Awaiting approval — Cviator Pro</title></Head>
      <AuthShell
        title="Awaiting approval"
        subtitle={email ? `Your admin request for ${email} has been submitted.` : 'Your admin request has been submitted.'}
      >
        <p className="text-sm text-slate-500">
          The root administrator has been emailed to review and approve your request. You will receive an email once approved, after which you can sign in.
        </p>

        {devLink && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            <p className="font-semibold">Development mode</p>
            <p className="mt-1">SMTP isn't configured, so the approval email was not sent. The root admin can approve via:</p>
            <a href={devLink} className="mt-2 block break-all text-amber-900 underline">{devLink}</a>
          </div>
        )}

        <p className="mt-5 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-slate-900 hover:underline">Back to sign in</Link>
        </p>
      </AuthShell>
    </>
  );
}
