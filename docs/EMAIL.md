# Verification email

EduQuest uses single-use, 24-hour verification links backed by hashed random
32-byte tokens. Registration and pending email changes share this delivery path.
An authenticated student or lecturer can resend a link from Profile; the server
chooses the account's current or pending address. Clients cannot choose a recipient.
The endpoint shares the authentication rate limiter.

## Development

With SMTP unconfigured, messages are written to the ignored
`docs/dev-mail/<user-id>.txt` directory with owner-only file permissions.
Open the link to verify the account. `PUBLIC_APP_URL` defaults to
`http://localhost:5173`; set it to your actual frontend URL when using another
address. Registration still succeeds if mail delivery fails, and Profile offers
a resend action. Production never falls back to local files.

## SMTP

Configure these variables in the ignored deployment environment:

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
`SMTP_SECURE=true`. Passwords are passed unchanged, including whitespace.
Production requires an HTTPS application URL, SMTP host and sender.

Automated suites force `EMAIL_DELIVERY=development-file`; SMTP-specific tests
mock Nodemailer's transport. Do not set that override in production. Real SMTP
credentials and inbox delivery have not been configured or verified here.
