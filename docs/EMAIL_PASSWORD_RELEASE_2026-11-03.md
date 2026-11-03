# Email and password correction release — 2026-11-03

The owner authorized publishing the changes prepared in another chat to `rahulv0101/IT-project` and updating the existing production site. The GitHub CLI authenticated as `rahulv0101`; local master matched origin before this release.

Registration now checks domain mail routing, rejects unroutable/null-MX domains and distinguishes temporary DNS failures. Mailbox ownership still requires email verification. Profile password changes have independent visibility controls, field-associated errors and success feedback. Password/reset-flag updates and other-session revocation use one transaction and lock the user row, preserving the current session and rolling back on failure. DNS fixtures exist only in isolated tests.

Validation: 665 automated tests passed (279 unit/component and 386 API), with no skips. Chromium at 390px/1280px and Firefox at 390px passed the real registration → email OTP → profile password change → new-password sign-in flow, including accessibility checks. Lint, type checking, formatting and production build passed. No schema migration or AI-service change is needed.
