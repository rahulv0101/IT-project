// @ts-nocheck - Nodemailer transport configuration is runtime-driven by deployment env.
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import nodemailer from 'nodemailer';

const smtpConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_FROM,
);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD?.replace(/\s+/g, ''),
          }
        : undefined,
    })
  : null;

export const sendVerificationCode = async ({ userId, email, code }) => {
  const subject = 'Your EduQuest verification code';
  const text = `Verify your EduQuest email. Your verification code is ${code}. It expires in 10 minutes.`;

  if (transporter) {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject,
      text,
    });
    return { delivery: 'smtp' };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SMTP_HOST and SMTP_FROM are required in production.');
  }

  const mailDir = path.resolve('docs/dev-mail');
  await mkdir(mailDir, { recursive: true });
  await writeFile(
    path.join(mailDir, `${userId}.txt`),
    `To: ${email}\nSubject: ${subject}\n\n${text}\n`,
    'utf8',
  );
  return { delivery: 'development-file' };
};
