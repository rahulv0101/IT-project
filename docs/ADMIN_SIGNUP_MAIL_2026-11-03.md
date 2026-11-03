# Admin signup and verification mail — 2026-11-03

Admin Add user now matches signup's name/password fields, password confirmation, strength guidance, show/hide controls and inline errors. It adds the requested Student/Lecturer/Admin selector and student-specific type/year. Email validation runs on the server, including mail-domain routing. DNS validity cannot establish individual mailbox ownership; OTP provides that check.

Every new admin-created account requires email OTP before protected account access. Pending verification is visible in the user list. OTP delivery occurs after account/audit commit and database connection release. Failed delivery is reported without losing the account, and resend can recover it. Existing users retain their previous state and access through additive migration 035.

## Delivery investigation

- Gmail SMTP credentials authenticated successfully. Some local pre-authentication connections failed, so sending now retries once for connection-stage transient errors only. No automatic retry occurs after DATA, on invalid credentials, or on recipient rejection.
- A fresh production signup to a Gmail alias of the previously supplied EduQuest demo inbox returned HTTP 201 with `verification_delivery: sent` and `needs_email_verification: true`. Gmail accepted that verification email. This confirms SMTP submission, not inbox placement or reading of the email.
- The user's earlier missing-email attempt could not be correlated because its address/time was unavailable. No claim is made that a specific historical failure was reproduced. New safe SMTP diagnostics cover public signup, resend and managed account delivery without exposing email addresses, credentials or codes.
- The distinct QA account is made inactive and its sessions revoked after validation, preserving its record. Original users are not modified.

## Validation

- 288 unit/component and 397 API tests passed, no skips.
- Nine browser scenarios passed across Chromium mobile/desktop and Firefox mobile: public signup and OTP; signup-style managed creation with every role and OTP access gating; session revocation/suspension/inactivity with data retention.
- Lint, type checking, formatting and production build passed.
- A private 48-table backup was taken before migration. Existing user rows are compared before/after the additive schema change.

Deployment verification is appended after the release completes.

## Live release verification

- Source commit `92cfc0f` was pushed to Rahul's master branch and deployed successfully to https://eduquest-dun.vercel.app (deployment `dpl_DxHNgUv2XkeWkTminkbem6y4c7or`).
- Migration 035 committed successfully after the private backup. All 25 original user rows were identical after excluding the new default-false flag. The distinct delivery QA record remains retained but inactive, with sessions revoked and its temporary plaintext password removed locally.
- The canonical site serves the new client bundle, pending-verification indicator, password confirmation and matching PWA asset manifest. Backend health passed.
- An existing lecturer successfully signed in, fetched their identity and protected module list, signed out with the documented 204 response, then received 401 on the protected identity route. No original account password, status, academic data or verification state was changed.
- TLS certificate verification remained enabled. This workstation's default Vercel edge was intermittently unreachable, so read-only live requests used another Vercel edge with the canonical hostname and certificate checks intact.
