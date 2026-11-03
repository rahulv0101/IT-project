import { randomUUID } from 'node:crypto';
import { readFile, rm, stat } from 'node:fs/promises';
import nodemailer from 'nodemailer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sendVerificationEmail,
  verificationMailFailure,
} from '../src/email.js';

const userId = `mailer-${randomUUID()}`;
const mail = {
  userId,
  email: 'student@example.com',
  token: 'long-opaque-token-with-safe-entropy',
};
const file = `docs/dev-mail/${userId}.txt`;
/** @type {import('vitest').MockInstance} */
let createTransport;
/** @type {import('vitest').Mock} */
let sendMail;
beforeEach(() => {
  for (const key of [
    'SMTP_HOST',
    'SMTP_FROM',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'PUBLIC_APP_URL',
  ])
    vi.stubEnv(key, '');
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('EMAIL_DELIVERY', 'development-file');
  vi.stubEnv('SMTP_PORT', '587');
  vi.stubEnv('SMTP_SECURE', 'false');
  sendMail = vi.fn().mockResolvedValue({});
  createTransport = vi
    .spyOn(nodemailer, 'createTransport')
    .mockReturnValue(/** @type {any} */ ({ sendMail }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(file, { force: true });
});

describe('verification email delivery', () => {
  it('writes a private local link without contacting SMTP in development', async () => {
    expect(await sendVerificationEmail(mail)).toEqual({
      delivery: 'development-file',
    });
    const body = await readFile(file, 'utf8');
    expect(body).toContain(
      `http://localhost:5173/verify-email?token=${mail.token}`,
    );
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(createTransport).not.toHaveBeenCalled();
  });
  it('sends the same opaque verification link over TLS and preserves password whitespace', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_DELIVERY', 'smtp');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_FROM', 'EduQuest <verify@example.com>');
    vi.stubEnv('SMTP_USER', 'mailer');
    vi.stubEnv('SMTP_PASSWORD', ' a secret with spaces ');
    vi.stubEnv('PUBLIC_APP_URL', 'https://eduquest.example.com');
    expect(await sendVerificationEmail({ ...mail, code: '123456' })).toEqual({
      delivery: 'smtp',
    });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: false,
        requireTLS: true,
        auth: { user: 'mailer', pass: ' a secret with spaces ' },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: mail.email,
        text: expect.stringContaining(
          `https://eduquest.example.com/verify-email?token=${mail.token}`,
        ),
      }),
    );
    expect(sendMail.mock.calls[0][0].text).toContain(
      'verification code: 123456',
    );
    expect(sendMail.mock.calls[0][0].text).toContain(
      'code expires in 10 minutes',
    );
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('refuses production file delivery and missing SMTP configuration', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PUBLIC_APP_URL', 'https://eduquest.example.com');
    await expect(sendVerificationEmail(mail)).rejects.toThrow(
      'required in production',
    );
    expect(createTransport).not.toHaveBeenCalled();
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it.each(['http://eduquest.example.com', 'javascript:alert(1)', 'invalid'])(
    'rejects an unsafe production application URL %s',
    async (url) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('PUBLIC_APP_URL', url);
      await expect(sendVerificationEmail(mail)).rejects.toThrow(
        'production requires HTTPS',
      );
      expect(createTransport).not.toHaveBeenCalled();
    },
  );
  it('propagates SMTP failures without writing a fallback verification token to disk', async () => {
    vi.stubEnv('EMAIL_DELIVERY', 'smtp');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_FROM', 'verify@example.com');
    sendMail.mockRejectedValue(new Error('SMTP failed'));
    await expect(sendVerificationEmail(mail)).rejects.toThrow('SMTP failed');
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('retries a transient connection failure once, using the same code', async () => {
    vi.stubEnv('EMAIL_DELIVERY', 'smtp');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_FROM', 'verify@example.com');
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error('Connection timed out'), {
        code: 'ETIMEDOUT',
        command: 'CONN',
      }),
    );
    expect(await sendVerificationEmail({ ...mail, code: '123456' })).toEqual({
      delivery: 'smtp',
    });
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0]).toEqual(sendMail.mock.calls[1]);
  });
  it.each([
    ['EAUTH', 'AUTH', 1],
    ['ETIMEDOUT', 'DATA', 1],
    ['ETIMEDOUT', 'CONN', 2],
  ])('limits retries for %s during %s', async (code, command, calls) => {
    vi.stubEnv('EMAIL_DELIVERY', 'smtp');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_FROM', 'verify@example.com');
    sendMail.mockRejectedValue(
      Object.assign(new Error('Failed'), { code, command }),
    );
    await expect(sendVerificationEmail(mail)).rejects.toThrow('Failed');
    expect(sendMail).toHaveBeenCalledTimes(calls);
  });
  it('reports only SMTP failure metadata without credentials, address or OTP', () => {
    expect(
      verificationMailFailure({
        code: 'EAUTH',
        command: 'AUTH',
        responseCode: 535,
        message: 'secret password and student@example.com code 123456',
        response: 'private server response',
      }),
    ).toEqual({
      code: 'VERIFICATION_DELIVERY_FAILED',
      smtpCode: 'EAUTH',
      smtpPhase: 'AUTH',
      smtpStatus: 535,
    });
    expect(
      verificationMailFailure({
        code: 'private@example.com',
        command: 'AUTH secret',
      }),
    ).toMatchObject({ smtpCode: 'UNKNOWN', smtpPhase: 'UNKNOWN' });
  });
});
