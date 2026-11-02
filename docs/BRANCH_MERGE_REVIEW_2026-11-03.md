# External branch compatibility review — 3 November 2026

Follow-up: the requested OTP registration experience is now included via an
account-scoped implementation. See [the current OTP report](REGISTRATION_OTP_2026-11-03.md).
The review below records the earlier integration checkpoint.

Reviewed all fetched branches from `origin` (`rahulv0101/IT-project`). The only
external feature branch was `origin/Register-page-fixed` at `ea59f75`, based on
an older master (`a985f36`). There were no open or closed pull requests.
The existing local `merge-register-page-fixed` checkout at `0f23f35` was reviewed
as an earlier integration of that same branch, not as a separate feature.
That checkout remains untouched.

The validated workspace was first checkpointed on master as `94c6e5f`. The
external branch is integrated with a two-parent merge and explicit conflict
resolutions against that checkpoint.

## Included

- Password visibility controls, independently labelled for password and
  confirmation, plus individual live password requirements.
- Clearer person-name validation text and the optional PowerShell editor
  launch configuration.
- Nodemailer SMTP delivery, adapted to master's existing opaque verification
  links and pending-address workflow. Development files are private, TLS is
  required for SMTP, and production cannot fall back to writing tokens locally.
- Authenticated, rate-limited resend with server-selected recipients, safe
  delivery errors, and a Profile action. A mail outage preserves the newly
  registered account and its session so the user can retry delivery.
- Regression checks for delivery configuration/failure, password visibility,
  optional surnames, scoped resend, pending address changes, role authorization
  and complete browser verification.

## Excluded or resolved in favor of master

- Mandatory surnames conflict with master's intentionally optional surname.
- The branch's unauthenticated six-digit email-code flow performs a global
  token-hash lookup without binding the code to an account. It is excluded;
  existing high-entropy links, MFA challenges and recovery codes are retained.
- Older Ollama/phi3 defaults and launch scripts would replace the requested
  OpenRouter/Claude Haiku 5.5 setup and current portable runtime fixes.
- Existing account-field error handling, MFA/profile actions, database isolation
  and backup/restore repairs are retained rather than replaced by older code.
- SMTP passwords are not whitespace-stripped, and sample SMTP hosts remain
  blank in `.env.example` so copying it cannot activate email delivery.

## Validation

All checks below passed on the combined merge tree:

| Check                                                           | Result                                            |
| --------------------------------------------------------------- | ------------------------------------------------- |
| ESLint, Prettier, project type-check, frontend production build | Passed                                            |
| JavaScript unit/component tests                                 | 238 passed, zero skipped                          |
| PGlite database/API tests                                       | 338 passed, zero skipped                          |
| Offline Python tests                                            | 59 passed, zero skipped                           |
| Chromium and Firefox browser matrix                             | 162 passed in one run (9.9 minutes), zero skipped |

Browser checks cover 390px, 768px and 1280px viewports, including password
visibility, optional surnames, registration errors, authenticated resend,
verification, MFA and every role's navigation pages with accessibility checks.
The type-check follows the existing backend/scripts configuration; it does not
claim full frontend TypeScript coverage.

The earlier system-wide PostgreSQL, native backup and live OpenRouter evidence remains in
[the system validation report](VALIDATION_2026-11-02.md). This integration changes
no database schema or AI provider behavior and does not repeat paid AI calls.
SMTP assertions use mocked transport; no real inbox delivery is claimed.

See [email configuration](EMAIL.md) for the optional deployment settings.
