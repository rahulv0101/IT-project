import { appFetch } from './http.js';
import React, { useEffect, useState } from 'react';
import { PasswordInput, PasswordRequirements } from './password-fields.jsx';

async function api(path, options = {}) {
  const r = await appFetch(`/api/v1/admin${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json' },
  });
  const body = r.status === 204 ? null : await r.json();
  if (!r.ok)
    throw Object.assign(
      new Error(body?.error?.message || 'Unable to update users.'),
      { fields: body?.error?.fields || {} },
    );
  return body;
}
const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'student',
  studentType: 'it',
  studentYear: 1,
  password: '',
  confirmPassword: '',
};
export function AdminUsers({ currentUserId }) {
  const [form, setForm] = useState(emptyForm);
  const [fields, setFields] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
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
  const change = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFields((current) => ({
      ...current,
      [key]: '',
      ...(key === 'password' ? { confirmPassword: '' } : {}),
    }));
    setError('');
  };
  const fieldProps = (key) => ({
    'aria-invalid': Boolean(fields[key]),
    'aria-describedby': fields[key] ? `admin-add-${key}-error` : undefined,
  });
  const fieldError = (key) =>
    fields[key] && (
      <small className="field-error" id={`admin-add-${key}-error`}>
        {fields[key]}
      </small>
    );
  const create = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setFields({});
    setMessage('');
    if (form.password !== form.confirmPassword) {
      setFields({ confirmPassword: 'Passwords do not match.' });
      setError('Please correct the highlighted field.');
      return;
    }
    setBusy(true);
    try {
      const body = await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
          confirmPassword: form.confirmPassword,
          role: form.role,
          ...(form.role === 'student'
            ? { studentType: form.studentType, studentYear: form.studentYear }
            : {}),
        }),
      });
      setMessage(
        `${body.user.full_name} was added. ${body.user.verification_delivery === 'unavailable' ? 'The verification email could not be sent; they can request a new code when signing in.' : 'A verification email has been sent. They must verify their email before account access.'} Share the initial password privately and ask them to change it in Profile.`,
      );
      setForm(emptyForm);
      setShowPassword(false);
      setShowConfirmation(false);
      setFields({});
      setAdding(false);
      setRefresh((v) => v + 1);
    } catch (e) {
      setFields(e.fields || {});
      setError(
        Object.keys(e.fields || {}).length
          ? 'Please correct the highlighted fields.'
          : e.message,
      );
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
      setMessage(
        kind === 'revoke_sessions'
          ? `${user.full_name} was signed out of all sessions. They can sign in again.`
          : kind === 'suspend'
            ? `${user.full_name} is suspended. Sign-in is blocked and existing sessions were revoked.`
            : `${user.full_name} is active and can sign in again.`,
      );
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
        }),
      });
      setMessage(
        'Account made inactive. Sign-in is blocked; the user’s details and all linked data are retained.',
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
        <form
          className="card account-form"
          onSubmit={create}
          aria-label="Add a user"
        >
          <h3>Add a user</h3>
          {[
            ['firstName', 'First name', 'given-name'],
            ['lastName', 'Last name', 'family-name'],
          ].map(([key, label, autoComplete]) => (
            <div className="field-group" key={key}>
              <label htmlFor={`admin-add-${key}`}>{label}</label>
              <input
                id={`admin-add-${key}`}
                value={form[key]}
                onChange={(e) => change(key, e.target.value)}
                required
                autoComplete={autoComplete}
                maxLength={50}
                {...fieldProps(key)}
              />
              {fieldError(key)}
            </div>
          ))}
          <div className="field-group">
            <label htmlFor="admin-add-email">Email</label>
            <input
              id="admin-add-email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => change('email', e.target.value)}
              required
              maxLength={254}
              {...fieldProps('email')}
            />
            {fieldError('email')}
          </div>
          <div className="field-group">
            <label htmlFor="admin-add-password">Password</label>
            <PasswordInput
              id="admin-add-password"
              label="password"
              show={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => change('password', e.target.value)}
              required
              minLength={10}
              maxLength={200}
              {...fieldProps('password')}
            />
            <PasswordRequirements password={form.password} />
            {fieldError('password')}
          </div>
          <div className="field-group">
            <label htmlFor="admin-add-confirmPassword">Confirm password</label>
            <PasswordInput
              id="admin-add-confirmPassword"
              label="confirmation password"
              show={showConfirmation}
              onToggle={() => setShowConfirmation(!showConfirmation)}
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => change('confirmPassword', e.target.value)}
              required
              maxLength={200}
              {...fieldProps('confirmPassword')}
            />
            {fieldError('confirmPassword')}
          </div>
          <div className="field-group">
            <label htmlFor="admin-add-role">Role</label>
            <select
              id="admin-add-role"
              value={form.role}
              onChange={(e) => change('role', e.target.value)}
              required
              {...fieldProps('role')}
            >
              <option value="student">Student</option>
              <option value="lecturer">Lecturer</option>
              <option value="admin">Admin</option>
            </select>
            {fieldError('role')}
          </div>
          {form.role === 'student' && (
            <>
              <div className="field-group">
                <label htmlFor="admin-add-studentType">Student type</label>
                <select
                  id="admin-add-studentType"
                  value={form.studentType}
                  onChange={(e) => change('studentType', e.target.value)}
                  {...fieldProps('studentType')}
                >
                  <option value="it">IT</option>
                  <option value="business">Business</option>
                </select>
                {fieldError('studentType')}
              </div>
              <div className="field-group">
                <label htmlFor="admin-add-studentYear">Year of study</label>
                <select
                  id="admin-add-studentYear"
                  value={form.studentYear}
                  onChange={(e) =>
                    change('studentYear', Number(e.target.value))
                  }
                  {...fieldProps('studentYear')}
                >
                  {[1, 2, 3].map((year) => (
                    <option key={year} value={year}>
                      Year {year}
                    </option>
                  ))}
                </select>
                {fieldError('studentYear')}
              </div>
            </>
          )}
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
                    <td>
                      {user.account_status === 'active' &&
                      user.requires_email_verification &&
                      !user.email_verified_at
                        ? 'Pending email verification'
                        : user.account_status}
                    </td>
                    <td className="admin-actions">
                      <button
                        className="secondary"
                        disabled={busy || user.user_id === currentUserId}
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
                        disabled={
                          busy ||
                          user.user_id === currentUserId ||
                          user.account_status === 'inactive'
                        }
                        aria-label={`Deactivate ${user.full_name}`}
                        onClick={() => {
                          setTarget(user);
                          setConfirmation('');
                          setDeleteReason('');
                          setError('');
                        }}
                      >
                        Deactivate
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
          aria-label="Confirm account deactivation"
        >
          <h3>Deactivate {target.full_name}?</h3>
          <p>
            This makes the account inactive and signs the user out. Their
            personal details, results, memberships and other data stay on the
            system. You can activate the account again later.
          </p>
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
            Deactivation reason
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
              {busy ? 'Deactivating…' : 'Deactivate account'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              Cancel deactivation
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
