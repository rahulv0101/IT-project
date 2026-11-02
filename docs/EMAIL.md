# Email verification

Registration uses a six-digit, single-use code that expires after ten minutes.
The code screen supports verification, resend, delivery failures and refresh.
It matches the registration branch while keeping existing MFA login intact.

Codes are bound to the signed-in account and stored only as keyed HMACs. Five
incorrect guesses lock a challenge; resends have a database-enforced sixty
second cooldown. No recipient or account ID is accepted from the client.

Legacy single-use verification links remain in the email for compatibility and
pending email changes. Code and link consumption are transactional and invalidate
each other. See [the OTP validation report](REGISTRATION_OTP_2026-11-03.md).

## Development

With SMTP unconfigured, messages are written to the ignored
`docs/dev-mail/<user-id>.txt` directory with owner-only permissions. They contain
the code and legacy link. Offline tests explicitly force this delivery mode.
`PUBLIC_APP_URL` defaults to `http://localhost:5173`; set it to the actual frontend
URL for another deployment. Production never falls back to local files.

## SMTP

Production is configured with Gmail SMTP on port 465 using implicit TLS. Actual
credentials stay in the ignored environment and encrypted Vercel variables.
The live inbox-code verification test passed.

Other SMTP providers can use the same settings:

```dotenv
PUBLIC_APP_URL=https://eduquest.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-mail-user
SMTP_PASSWORD=your-mail-password
SMTP_FROM=EduQuest <verify@example.com>
```

Port 587 uses mandatory STARTTLS. For implicit TLS, typically port 465, set
`SMTP_SECURE=true`. Transport passwords are passed unchanged. For a Gmail app
password, enter its sixteen characters without the display grouping spaces.
Production requires an HTTPS application URL, SMTP host and sender.

The code HMAC uses `EMAIL_OTP_SECRET` when configured, otherwise the existing
`AI_SERVICE_TOKEN`. Keep this server secret stable across deployments.

Delivery failure preserves the account/session and shows retry guidance rather
than claiming an email was sent. Verification remains pending until the user
supplies a valid code or legacy link.
