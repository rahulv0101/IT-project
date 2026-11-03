import { appFetch } from './http.js';
import React, { useState } from 'react';
export function AdminAccessSetup({ onComplete }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const call = async (path, data = {}) => {
    const r = await appFetch(`/api/v1/mfa/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const b = await r.json();
    if (!r.ok)
      throw Error(
        b.error?.message || 'Unable to secure this administrator account.',
      );
    return b;
  };
  const begin = async () => {
    setBusy(true);
    setError('');
    try {
      setSetup(await call('enrol'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const b = await call('confirm', { code });
      setRecovery(b.recoveryCodes || []);
      setSetup(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="card account-form"
      aria-labelledby="admin-security-heading"
    >
      <h3 id="admin-security-heading">Secure administrator access</h3>
      <p>
        Administrator accounts use an authenticator to protect user-management
        controls.
      </p>
      {!setup && !recovery.length && (
        <button className="secondary" onClick={begin} disabled={busy}>
          {busy ? 'Preparing…' : 'Set up administrator sign-in'}
        </button>
      )}
      {setup && (
        <form onSubmit={confirm}>
          <img
            src={setup.qrCode}
            width="180"
            height="180"
            alt="Add this administrator account to your authenticator"
          />
          <p>
            Setup key: <code>{setup.setupKey}</code>
          </p>
          <label>
            Authenticator code
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              pattern="[0-9]{6}"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </label>
          <button className="primary" disabled={busy || code.length !== 6}>
            Confirm administrator sign-in
          </button>
        </form>
      )}
      {recovery.length > 0 && (
        <>
          <p>
            Save these single-use recovery codes somewhere private before
            continuing.
          </p>
          <ul>
            {recovery.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <button className="primary" onClick={onComplete}>
            I saved my recovery codes
          </button>
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
