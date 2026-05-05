// frontend/pages/signup.js
// Create an account.
//   • Student → email must match  u<7-digits>@giki.edu.pk ; needs faculty/department
//   • Admin   → email must match  *@giki.edu.pk ; account created in 'pending' state
//                until the root admin approves (via emailed link or the dashboard).
//
// Faculty list is fetched from the backend (/api/admin/filters is admin-only;
// we expose the same data via /api/auth/filters? — no, simpler: keep a static
// list synced with the backend seed). We hit the public faculties endpoint instead.

import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';
import { signupRaw } from '../services/auth';
import { API_URL } from '../services/api';

import { AuthShell, Field } from './login';

const STUDENT_EMAIL_RE = /^u\d{7}@giki\.edu\.pk$/i;
const ADMIN_EMAIL_RE   = /^[a-z0-9._-]+@giki\.edu\.pk$/i;

export default function SignupPage() {
  const router = useRouter();
  const { status, user, setSession } = useAuth();

  const [role,      setRole]      = useState('student');
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');

  // Student
  const [regNo,        setRegNo]        = useState('');
  const [facultyId,    setFacultyId]    = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [batch,        setBatch]        = useState('');

  // Faculty data (fetched from public endpoint)
  const [faculties, setFaculties] = useState([]);

  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(user?.isAdmin ? '/admin' : '/');
    }
  }, [status, user, router]);

  // Public faculties endpoint
  useEffect(() => {
    fetch(`${API_URL}/api/public/faculties`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setFaculties(d.faculties || []))
      .catch(() => setFaculties([]));
  }, []);

  const selectedFaculty = useMemo(
    () => faculties.find((f) => String(f.id) === String(facultyId)),
    [faculties, facultyId]
  );
  const showDepartment = selectedFaculty && selectedFaculty.departments.length > 1;

  // Reset department when faculty changes
  useEffect(() => { setDepartmentId(''); }, [facultyId]);

  function validate() {
    if (password.length < 8) return 'Password must be at least 8 characters.';
    const e = email.trim().toLowerCase();
    if (role === 'student' && !STUDENT_EMAIL_RE.test(e)) {
      return 'Students must use the official GIKI format: u#######@giki.edu.pk';
    }
    if (role === 'admin' && !ADMIN_EMAIL_RE.test(e)) {
      return 'Admin accounts require a @giki.edu.pk email address.';
    }
    if (role === 'student') {
      if (!/^\d{7}$/.test(regNo.trim())) return 'Registration number must be 7 digits.';
      if (!/^(19|20)\d{2}$/.test(batch.trim())) return 'Batch must be a 4-digit year (e.g. 2024).';
      if (!facultyId) return 'Please select your faculty.';
      if (showDepartment && !departmentId) return 'Please select your department.';
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    try {
      const payload = {
        email: email.trim().toLowerCase(),
        password,
        role,
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
      };
      if (role === 'student') {
        Object.assign(payload, {
          regNo:        regNo.trim(),
          facultyId:    Number(facultyId),
          departmentId: departmentId ? Number(departmentId) : undefined,
          batch:        batch.trim(),
        });
      }

      const result = await signupRaw(payload);

      if (result.token && result.user) {
        // Root admin auto-bootstrap
        setSession(result.token, result.user);
        router.replace('/admin');
        return;
      }
      if (result.needsVerification) {
        if (result.devLink) router.replace(result.devLink);
        else router.replace(`/verify-email?email=${encodeURIComponent(result.email)}&new=1`);
        return;
      }
      if (result.pendingApproval) {
        router.replace(`/signup-pending?email=${encodeURIComponent(result.email)}${result.devLink ? `&devLink=${encodeURIComponent(result.devLink)}` : ''}`);
        return;
      }
    } catch (err) {
      setError(err.message || 'Could not create account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head><title>Create account — Cviator Pro</title></Head>
      <AuthShell title="Create your account" subtitle="Join your university's CV portal.">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role selector */}
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">I am a</span>
            <div className="inline-flex w-full rounded-md border border-slate-200 bg-white p-0.5">
              {[{ value: 'student', label: 'Student' }, { value: 'admin', label: 'Admin' }].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition ${
                    role === opt.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" value={firstName} onChange={setFirstName} required maxLength={50} autoComplete="given-name" />
            <Field label="Last name"  value={lastName}  onChange={setLastName}  required maxLength={50} autoComplete="family-name" />
          </div>

          <Field
            label={role === 'student' ? 'GIKI Email (e.g. u2024597@giki.edu.pk)' : 'GIKI Email'}
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
            placeholder={role === 'student' ? 'u2024597@giki.edu.pk' : 'your.name@giki.edu.pk'}
          />
          <Field label="Password" type="password" value={password} onChange={setPassword} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />

          {role === 'student' && (
            <>
              <Field label="Registration number" value={regNo} onChange={setRegNo} required maxLength={7} placeholder="e.g. 2018128" />

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Faculty</span>
                <select
                  value={facultyId}
                  onChange={(e) => setFacultyId(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                >
                  <option value="">Select your faculty…</option>
                  {faculties.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>

              {showDepartment && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Department</span>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    required
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                  >
                    <option value="">Select your department…</option>
                    {selectedFaculty.departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <Field label="Batch / Year" value={batch} onChange={setBatch} required maxLength={4} placeholder="e.g. 2024" />
            </>
          )}

          {role === 'admin' && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Admin signups require approval by the institute's root administrator.
              Once approved you'll receive an email and can sign in.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-slate-900 hover:underline">Sign in</Link>
        </p>
      </AuthShell>
    </>
  );
}
