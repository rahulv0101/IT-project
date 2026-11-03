import { appFetch } from './http.js';
import React, { useEffect, useState } from 'react';

async function api(path, options = {}) {
  const r = await appFetch(`/api/v1/admin${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json' },
  });
  const body = r.status === 204 ? null : await r.json();
  if (!r.ok) throw new Error(body?.error?.message || 'Unable to update users.');
  return body;
}
const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'student',
  studentType: 'it',
  studentYear: 1,
  temporaryPassword: '',
  reason: '',
};
export function AdminUsers({ currentUserId }) {
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({
    loading: true,
    data: [],
    total: 0,
    error: '',
  });
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [replacement, setReplacement] = useState('');
  const [lecturers, setLecturers] = useState([]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        setState((current) => ({ ...current, loading: true, error: '' }));
        const query =
          search || page > 1
            ? `?search=${encodeURIComponent(search)}&page=${page}`
            : '';
        api(`/users${query}`)
          .then((body) => {
            if (active)
              setState({
                loading: false,
                error: '',
                data: body.data || [],
                total: body.pagination?.total || body.data?.length || 0,
              });
          })
          .catch(
            (e) =>
              active &&
              setState({
                loading: false,
                data: [],
                total: 0,
                error: e.message,
              }),
          );
      },
      search ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, page, refresh]);
  useEffect(() => {
    let active = true;
    if (target?.role === 'lecturer')
      api('/users?role=lecturer&pageSize=100')
        .then(
          (b) =>
            active &&
            setLecturers(
              (b.data || []).filter(
                (u) =>
                  u.user_id !== target.user_id && u.account_status === 'active',
              ),
            ),
        )
        .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [target]);
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const create = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body = await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          lastName: form.lastName.trim() || undefined,
        }),
      });
      setMessage(
        `${body.user.full_name} was added. Share the temporary password privately and ask them to change it in Profile.`,
      );
      setForm(emptyForm);
      setAdding(false);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const action = async (user, kind) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/users/${user.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: kind,
          reason:
            kind === 'revoke_sessions'
              ? 'Security session reset'
              : 'Account administration',
        }),
      });
      setMessage('User updated.');
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (event) => {
    event.preventDefault();
    if (busy || !target) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/users/${target.user_id}`, {
        method: 'DELETE',
        body: JSON.stringify({
          confirmationEmail: confirmation,
          reason: deleteReason,
          ...(replacement ? { replacementLecturerId: replacement } : {}),
        }),
      });
      setMessage(
        'User deleted. Access and personal details were removed; academic records were retained.',
      );
      setTarget(null);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="admin-users" aria-label="User management">
      <div className="section-heading">
        <h3>Platform users</h3>
        <button
          className="primary"
          onClick={() => {
            setAdding((v) => !v);
            setError('');
          }}
        >
          {adding ? 'Close add user' : 'Add user'}
        </button>
      </div>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {adding && (
        <form className="card account-form" onSubmit={create}>
          <h3>Add a user</h3>
          <label>
            First name
            <input
              value={form.firstName}
              onChange={(e) => change('firstName', e.target.value)}
              required
              maxLength={50}
            />
          </label>
          <label>
            Last name
            <input
              value={form.lastName}
              onChange={(e) => change('lastName', e.target.value)}
              maxLength={50}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => change('email', e.target.value)}
              required
              maxLength={254}
            />
          </label>
          <label>
            Role
            <select
              value={form.role}
              onChange={(e) => change('role', e.target.value)}
            >
              <option value="student">Student</option>
              <option value="lecturer">Lecturer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          {form.role === 'student' && (
            <>
              <label>
                Student type
                <select
                  value={form.studentType}
                  onChange={(e) => change('studentType', e.target.value)}
                >
                  <option value="it">IT</option>
                  <option value="business">Business</option>
                </select>
              </label>
              <label>
                Year of study
                <select
                  value={form.studentYear}
                  onChange={(e) =>
                    change('studentYear', Number(e.target.value))
                  }
                >
                  {[1, 2, 3].map((y) => (
                    <option value={y} key={y}>
                      Year {y}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            Temporary password
            <input
              type="password"
              autoComplete="new-password"
              value={form.temporaryPassword}
              onChange={(e) => change('temporaryPassword', e.target.value)}
              required
              minLength={10}
              maxLength={200}
            />
          </label>
          <p className="muted">
            Use at least 10 characters with uppercase and lowercase letters, a
            number and a special character. Avoid the user’s name.
          </p>
          <label>
            Reason
            <textarea
              value={form.reason}
              onChange={(e) => change('reason', e.target.value)}
              required
              minLength={3}
              maxLength={500}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Adding…' : 'Create user'}
          </button>
        </form>
      )}
      <label>
        Search users
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Name or email"
          maxLength={100}
        />
      </label>
      {state.loading ? (
        <p role="status">Loading users…</p>
      ) : state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : (
        <>
          <div className="card admin-table-wrap">
            <table className="admin-table">
              <caption>Platform users</caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      {user.full_name}
                      <small>{user.email}</small>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.account_status}</td>
                    <td className="admin-actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          action(
                            user,
                            user.account_status === 'active'
                              ? 'suspend'
                              : 'activate',
                          )
                        }
                      >
                        {user.account_status === 'active'
                          ? 'Suspend'
                          : 'Activate'}
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => action(user, 'revoke_sessions')}
                      >
                        Revoke sessions
                      </button>
                      <button
                        className="danger"
                        disabled={busy || user.user_id === currentUserId}
                        aria-label={`Delete ${user.full_name}`}
                        onClick={() => {
                          setTarget(user);
                          setConfirmation('');
                          setDeleteReason('');
                          setReplacement('');
                          setError('');
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!state.data.length && (
              <p className="empty-state">No users match your search.</p>
            )}
          </div>
          <div className="pagination">
            <button
              className="secondary"
              disabled={page === 1 || busy}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous users
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(state.total / 20))}
            </span>
            <button
              className="secondary"
              disabled={page * 20 >= state.total || busy}
              onClick={() => setPage((v) => v + 1)}
            >
              Next users
            </button>
          </div>
        </>
      )}
      {target && (
        <form
          className="card delete-confirmation"
          onSubmit={remove}
          aria-label="Confirm user deletion"
        >
          <h3>Delete {target.full_name}?</h3>
          <p>
            This removes sign-in access and personal details. Existing quiz
            results and shared academic records are retained.
          </p>
          {target.role === 'lecturer' && (
            <label>
              Transfer modules to
              <select
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              >
                <option value="">Choose if this lecturer owns modules</option>
                {lecturers.map((u) => (
                  <option value={u.user_id} key={u.user_id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Confirm email
            <input
              type="email"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              placeholder={target.email}
            />
          </label>
          <label>
            Deletion reason
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              required
              minLength={3}
              maxLength={500}
            />
          </label>
          <div className="button-row">
            <button
              className="danger"
              disabled={
                busy ||
                confirmation.trim().toLowerCase() !== target.email.toLowerCase()
              }
            >
              {busy ? 'Deleting…' : 'Delete user'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              Cancel deletion
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
