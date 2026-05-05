// frontend/pages/admin/index.js
// Admin dashboard — visible only to authenticated admins (status=active).
// Root admins additionally see the "Pending admin requests" panel.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchUsers, fetchFilters, downloadUserPdf, downloadAllCvs,
  fetchAdminRequests, approveAdminRequest, rejectAdminRequest,
} from '../../services/admin';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminPage() {
  const router = useRouter();
  const { status, user, logout } = useAuth();

  const [state,         setState]         = useState('loading');
  const [users,         setUsers]         = useState([]);
  const [pagination,    setPagination]    = useState({ page: 1, pages: 1, total: 0 });
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadingAll,setDownloadingAll]= useState(false);

  // Cascading filters
  const [filterOptions, setFilterOptions] = useState({ faculties: [], batches: [] });
  const [filters, setFilters] = useState({
    role: '', status: '', facultyId: '', departmentId: '', batch: '', q: '',
  });

  // Root-only: pending admin requests
  const [adminRequests, setAdminRequests] = useState([]);
  const [reqBusyId,     setReqBusyId]     = useState(null);

  // Auth gates
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    else if (status === 'authenticated' && !user?.isAdmin) router.replace('/');
  }, [status, user, router]);

  const loadPage = useCallback(async (page = 1, override = filters) => {
    setState('loading');
    try {
      const data = await fetchUsers({ page, ...override });
      setUsers(data.users);
      setPagination(data.pagination);
      setState('ready');
    } catch (err) {
      if (err.status === 403) setState('forbidden');
      else { console.error(err); setState('error'); }
    }
  }, [filters]);

  const loadAdminRequests = useCallback(async () => {
    if (!user?.isRootAdmin) return;
    try {
      const r = await fetchAdminRequests();
      setAdminRequests(r.requests || []);
    } catch (err) {
      console.error('[admin] fetch admin-requests failed:', err);
    }
  }, [user]);

  useEffect(() => {
    if (status !== 'authenticated' || !user?.isAdmin) return;
    loadPage(1);
    fetchFilters().then(setFilterOptions).catch(() => {});
    loadAdminRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user]);

  useEffect(() => {
    if (status !== 'authenticated' || !user?.isAdmin) return;
    const t = setTimeout(() => loadPage(1, filters), 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const setFilter = (key, value) => setFilters((f) => {
    const next = { ...f, [key]: value };
    // Clear department when faculty changes
    if (key === 'facultyId') next.departmentId = '';
    return next;
  });

  const selectedFaculty = useMemo(
    () => filterOptions.faculties.find((f) => String(f.id) === String(filters.facultyId)),
    [filterOptions, filters.facultyId]
  );
  const showDepartmentFilter = selectedFaculty && selectedFaculty.departments.length > 1;

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters]
  );

  const handleDownload = useCallback(async (u) => {
    setDownloadingId(u.id);
    try {
      const filename = [u.firstName, u.lastName].filter(Boolean).join('_')
        || u.fullName || u.email || 'resume';
      await downloadUserPdf(u.id, { template: 'classic', filename });
    } catch (err) {
      alert('Could not download PDF.');
    } finally { setDownloadingId(null); }
  }, []);

  const handleDownloadAll = useCallback(async () => {
    setDownloadingAll(true);
    try {
      await downloadAllCvs({
        facultyId: filters.facultyId, departmentId: filters.departmentId,
        batch: filters.batch, q: filters.q, template: 'classic',
      });
    } catch (err) {
      alert(err.message || 'Could not download CVs.');
    } finally { setDownloadingAll(false); }
  }, [filters]);

  const handleApproveAdmin = async (id) => {
    setReqBusyId(id);
    try { await approveAdminRequest(id); await loadAdminRequests(); }
    catch (err) { alert(err.message || 'Approval failed.'); }
    finally { setReqBusyId(null); }
  };
  const handleRejectAdmin = async (id) => {
    if (!confirm('Reject this admin request? The pending account will be deleted.')) return;
    setReqBusyId(id);
    try { await rejectAdminRequest(id); await loadAdminRequests(); }
    catch (err) { alert(err.message || 'Reject failed.'); }
    finally { setReqBusyId(null); }
  };

  if (status === 'loading') {
    return <Shell user={user} onLogout={() => logout().then(() => router.replace('/login'))}><Spinner /></Shell>;
  }

  if (state === 'forbidden') {
    return (
      <Shell user={user} onLogout={() => logout().then(() => router.replace('/login'))}>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-700">Access denied</p>
          <p className="mt-1 text-xs text-red-500">Your account does not have admin privileges.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell user={user} onLogout={() => logout().then(() => router.replace('/login'))}>

      {/* Root admin: pending admin requests */}
      {user?.isRootAdmin && adminRequests.length > 0 && (
        <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            Pending admin requests ({adminRequests.length})
          </h2>
          <div className="mt-3 space-y-2">
            {adminRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded border border-amber-200 bg-white px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-slate-900">{r.full_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || '(no name)'}</div>
                  <div className="text-xs text-slate-500">{r.email} · requested {fmtDate(r.created_at)}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApproveAdmin(r.id)}
                    disabled={reqBusyId === r.id}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >Approve</button>
                  <button
                    type="button"
                    onClick={() => handleRejectAdmin(r.id)}
                    disabled={reqBusyId === r.id}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 disabled:opacity-60"
                  >Reject</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          {state === 'ready' && (
            <p className="mt-0.5 text-sm text-slate-500">
              {pagination.total} matching user{pagination.total === 1 ? '' : 's'}
              {activeFilterCount > 0 && ' (filtered)'}
              {' · '}page {pagination.page} of {pagination.pages}
            </p>
          )}
        </div>
        {state === 'ready' && pagination.total > 0 && (
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloadingAll}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {downloadingAll ? 'Bundling…' : `Download all ${activeFilterCount > 0 ? 'filtered ' : ''}(${pagination.total}) as ZIP`}
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-5">
        <FilterInput
          placeholder="Search email / name / reg"
          value={filters.q}
          onChange={(v) => setFilter('q', v)}
        />
        <FilterSelect
          value={filters.role}
          onChange={(v) => setFilter('role', v)}
          placeholder="All roles"
          options={[
            { value: 'student', label: 'Students' },
            { value: 'admin',   label: 'Admins'   },
          ]}
        />
        <FilterSelect
          value={filters.facultyId}
          onChange={(v) => setFilter('facultyId', v)}
          placeholder="All faculties"
          options={filterOptions.faculties.map((f) => ({ value: String(f.id), label: f.code }))}
        />
        {showDepartmentFilter ? (
          <FilterSelect
            value={filters.departmentId}
            onChange={(v) => setFilter('departmentId', v)}
            placeholder="All departments"
            options={selectedFaculty.departments.map((d) => ({ value: String(d.id), label: d.name }))}
          />
        ) : <span className="hidden sm:block" />}
        <FilterSelect
          value={filters.batch}
          onChange={(v) => setFilter('batch', v)}
          placeholder="All batches"
          options={filterOptions.batches.map((b) => ({ value: b, label: b }))}
        />
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters({ role: '', status: '', facultyId: '', departmentId: '', batch: '', q: '' })}
            className="col-span-full text-left text-xs text-slate-500 underline hover:text-slate-900 sm:col-auto"
          >Clear filters</button>
        )}
      </div>

      {state === 'loading' ? (
        <Spinner />
      ) : state === 'error' ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-700">Failed to load data.</p>
          <button type="button" onClick={() => loadPage(pagination.page)}
            className="mt-3 text-xs text-slate-500 underline hover:text-slate-900">Retry</button>
        </div>
      ) : users.length === 0 ? (
        <Empty text="No users match those filters." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Th>Name / Email</Th>
                  <Th>Role</Th>
                  <Th>Faculty / Dept</Th>
                  <Th>Batch / Reg</Th>
                  <Th>Joined</Th>
                  <Th><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-slate-50">
                    <Td>
                      <div className="font-medium text-slate-900">{u.fullName || '—'}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </Td>
                    <Td><RoleBadge user={u} /></Td>
                    <Td className="text-xs">
                      {u.facultyName || <span className="text-slate-400">—</span>}
                      {u.departmentName && u.departmentName !== u.facultyName && (
                        <div className="text-slate-500">{u.departmentName}</div>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {u.batch ? `Batch ${u.batch}` : null}
                      {u.regNo  ? <div className="text-slate-500">{u.regNo}</div> : null}
                      {!u.batch && !u.regNo && <span className="text-slate-400">—</span>}
                    </Td>
                    <Td className="text-xs text-slate-600">{fmtDate(u.createdAt)}</Td>
                    <Td>
                      <div className="flex justify-end whitespace-nowrap">
                        {!u.isAdmin ? (
                          <button
                            type="button"
                            onClick={() => handleDownload(u)}
                            disabled={downloadingId === u.id}
                            className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
                          >{downloadingId === u.id ? 'Generating…' : 'Download PDF'}</button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <PaginationBtn disabled={pagination.page <= 1} onClick={() => loadPage(pagination.page - 1)}>← Prev</PaginationBtn>
              <span className="text-xs text-slate-500">{pagination.page} / {pagination.pages}</span>
              <PaginationBtn disabled={pagination.page >= pagination.pages} onClick={() => loadPage(pagination.page + 1)}>Next →</PaginationBtn>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

// ── Presentational helpers ────────────────────────────────────────

function Shell({ children, user, onLogout }) {
  return (
    <>
      <Head><title>Admin — Cviator Pro</title></Head>
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-xs font-bold text-white">C</div>
            <span className="text-sm font-semibold text-slate-900">
              Cviator <span className="font-normal text-slate-500">Admin</span>
              {user?.isRootAdmin && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">ROOT</span>}
            </span>
            <div className="ml-auto flex items-center gap-3">
              {user && <span className="hidden text-xs text-slate-500 sm:inline">{user.email}</span>}
              {onLogout && (
                <button type="button" onClick={onLogout}
                  className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900">
                  Sign out
                </button>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </>
  );
}

function FilterInput({ placeholder, value, onChange }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500" />
  );
}

function FilterSelect({ value, onChange, placeholder, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-slate-500">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function RoleBadge({ user: u }) {
  if (u.isRootAdmin) return <span className="inline-block rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">Root admin</span>;
  if (u.isAdmin)     return <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">Admin</span>;
  return <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">Student</span>;
}

function Th({ children })       { return <th className="px-4 py-3 text-left">{children}</th>; }
function Td({ children, className = '' }) { return <td className={`px-4 py-3 text-sm text-slate-700 ${className}`}>{children}</td>; }
function PaginationBtn({ children, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50">
      {children}
    </button>
  );
}
function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
    </div>
  );
}
function Empty({ text }) { return <p className="py-8 text-center text-sm text-slate-400">{text}</p>; }
