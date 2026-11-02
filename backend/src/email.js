// @ts-nocheck - Nodemailer options are supplied by deployment configuration.
import path from 'node:path';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import nodemailer from 'nodemailer';

export async function sendVerificationEmail({
  userId,
  email,
  token,
  code = '',
}) {
  const production = process.env.NODE_ENV === 'production';
  const localDelivery = process.env.EMAIL_DELIVERY === 'development-file';
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_FROM,
  );
  const appUrl =
    process.env.PUBLIC_APP_URL || (production ? '' : 'http://localhost:5173');
  let link;
  try {
    const base = new URL(appUrl);
    if (
      !['http:', 'https:'].includes(base.protocol) ||
      (production && base.protocol !== 'https:')
    )
      throw new Error();
    link = new URL('/verify-email', base);
    link.searchParams.set('token', token);
  } catch {
    throw new Error(
      'PUBLIC_APP_URL must be a valid application URL; production requires HTTPS.',
    );
  }
  const subject = 'Verify your EduQuest email';
  const text = `${code ? `Your EduQuest verification code: ${code}\nThe code expires in 10 minutes and can only be used once.\n\n` : ''}Verify your EduQuest email: ${link.href}\nThis link expires in 24 hours and can only be used once.`;
  if (production && (localDelivery || !smtpConfigured))
    throw new Error('SMTP_HOST and SMTP_FROM are required in production.');
  if (!localDelivery && smtpConfigured) {
    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('SMTP_PORT must be a valid port.');
    const secure = process.env.SMTP_SECURE === 'true';
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      requireTLS: !secure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject,
      text,
    });
    return { delivery: 'smtp' };
  }
  const directory = path.resolve('docs/dev-mail');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${userId}.txt`);
  await writeFile(file, `To: ${email}\nSubject: ${subject}\n\n${text}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(file, 0o600);
  return { delivery: 'development-file' };
}
