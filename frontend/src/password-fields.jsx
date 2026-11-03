import React from 'react';

export function PasswordInput({ show, onToggle, label, ...props }) {
  return (
    <span className="password-input-wrap">
      <input type={show ? 'text' : 'password'} {...props} />
      <button
        type="button"
        className="password-toggle"
        onClick={onToggle}
        aria-label={`${show ? 'Hide' : 'Show'} ${label}`}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}
export function PasswordRequirements({ password }) {
  const rules = [
    ['At least 10 characters', password.length >= 10],
    ['At least one uppercase letter', /[A-Z]/.test(password)],
    ['At least one lowercase letter', /[a-z]/.test(password)],
    ['At least one number', /[0-9]/.test(password)],
    ['At least one special character', /[^A-Za-z0-9]/.test(password)],
  ];
  return (
    <>
      <p className="sr-only">
        Password strength: {rules.filter(([, met]) => met).length} of 5 rules
        met
      </p>
      <ul className="password-rules" aria-label="Password requirements">
        {rules.map(([label, met]) => (
          <li key={label} className={met ? 'met' : 'unmet'}>
            <span aria-hidden="true">{met ? '✓' : '○'} </span>
            {label}
            <span className="sr-only"> {met ? 'met' : 'unmet'}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
