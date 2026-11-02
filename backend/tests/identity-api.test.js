// @ts-nocheck
import 'dotenv/config';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { hashEmailCode } from '../src/email-codes.js';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

const strong = 'CorrectHorse9!';
const email = `identity-${Date.now()}@example.com`;

describe('identity registration and verification', () => {
  beforeAll(async () => {
    await pool.query('DELETE FROM users WHERE email LIKE $1', [
      'identity-%@example.com',
    ]);
  });

  it('registers a student with split names and student type', async () => {
    const result = await request(app).post('/api/v1/auth/register').send({
      email,
      password: strong,
      confirmPassword: strong,
      firstName: 'Zoë',
      lastName: 'Van-Dyk',
      studentType: 'business',
    });
    expect(result.status).toBe(201);
    expect(result.body.user).toMatchObject({
      first_name: 'Zoë',
      last_name: 'Van-Dyk',
      student_type: 'business',
      needs_email_verification: true,
    });
  });

  it.each([
    ['', null],
    ['   ', null],
  ])('accepts an optional blank surname %j', async (lastName, expected) => {
    const result = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `identity-optional-${crypto.randomUUID()}@example.com`,
        password: strong,
        confirmPassword: strong,
        firstName: 'Single',
        lastName,
        studentType: 'it',
      });
    expect(result.status).toBe(201);
    expect(result.body.user.last_name).toBe(expected);
  });

  it.each([
    ['digits', 'A1'],
    ['symbols', 'A!'],
    ['too long', 'A'.repeat(51)],
  ])('rejects name with %s', async (_label, firstName) => {
    const result = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `bad-${Date.now()}-${Math.random()}@example.com`,
        password: strong,
        confirmPassword: strong,
        firstName,
        studentType: 'it',
      });
    expect(result.status).toBe(422);
  });

  it('rejects weak, matching and identity-containing passwords', async () => {
    for (const password of ['short', 'lowercaseonly1!', 'CorrectHorse9!']) {
      const result = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `password-${Date.now()}-${Math.random()}@example.com`,
          password,
          confirmPassword: 'Different9!',
          firstName: 'Password',
          studentType: 'it',
        });
      expect([400, 422]).toContain(result.status);
    }
    const containsName = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `contains-${Date.now()}@example.com`,
        password: 'PasswordName9!',
        confirmPassword: 'PasswordName9!',
        firstName: 'Name',
        studentType: 'it',
      });
    expect(containsName.status).toBe(422);
  });

  it('requires student type and rejects duplicate email case-insensitively', async () => {
    const missing = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `missing-${Date.now()}@example.com`,
        password: strong,
        confirmPassword: strong,
        firstName: 'Single',
      });
    expect(missing.status).toBe(422);
    const duplicate = await request(app).post('/api/v1/auth/register').send({
      email: email.toUpperCase(),
      password: strong,
      confirmPassword: strong,
      firstName: 'Another',
      studentType: 'it',
    });
    expect(duplicate.status).toBe(409);
  });

  it('accepts a verification token once and rejects reuse', async () => {
    const raw = 'identity-verification-token-1234567890';
    const user = (
      await pool.query('SELECT user_id FROM users WHERE email=$1', [email])
    ).rows[0];
    await pool.query(
      `INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')`,
      [user.user_id, crypto.createHash('sha256').update(raw).digest('hex')],
    );
    const first = await request(app)
      .get('/api/v1/auth/verify-email')
      .query({ token: raw });
    expect(first.status).toBe(200);
    const second = await request(app)
      .get('/api/v1/auth/verify-email')
      .query({ token: raw });
    expect(second.status).toBe(422);
    const mail = await readFile(`docs/dev-mail/${user.user_id}.txt`, 'utf8');
    expect(mail).toContain('Verify your EduQuest email');
  });
  it('resends verification only for the authenticated account and preserves pending address changes', async () => {
    const agent = request.agent(app);
    const address = `identity-resend-${crypto.randomUUID()}@example.com`;
    const registered = await agent.post('/api/v1/auth/register').send({
      email: address,
      password: strong,
      confirmPassword: strong,
      firstName: 'Single',
      studentType: 'it',
    });
    expect(registered.status).toBe(201);
    const id = registered.body.user.user_id;
    expect(
      (await agent.post('/api/v1/auth/resend-verification').send({ email }))
        .status,
    ).toBe(400);
    await pool.query(
      "UPDATE email_verification_codes SET created_at=now()-interval '61 seconds' WHERE user_id=$1",
      [id],
    );
    expect(
      (await agent.post('/api/v1/auth/resend-verification').send({})).status,
    ).toBe(200);
    let mail = await readFile(`docs/dev-mail/${id}.txt`, 'utf8');
    const token = new URL(mail.match(/https?:\/\/\S+/)[0]).searchParams.get(
      'token',
    );
    expect(
      (await agent.get('/api/v1/auth/verify-email').query({ token })).status,
    ).toBe(200);
    const count = (
      await pool.query(
        'SELECT count(*)::int AS n FROM email_verification_tokens WHERE user_id=$1',
        [id],
      )
    ).rows[0].n;
    await pool.query(
      "UPDATE email_verification_codes SET created_at=now()-interval '61 seconds' WHERE user_id=$1",
      [id],
    );
    expect(
      (await agent.post('/api/v1/auth/resend-verification').send({})).status,
    ).toBe(200);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM email_verification_tokens WHERE user_id=$1',
          [id],
        )
      ).rows[0].n,
    ).toBe(count);
    const target = `identity-pending-${crypto.randomUUID()}@example.com`;
    expect(
      (
        await agent
          .post('/api/v1/me/email')
          .send({ password: strong, email: target })
      ).status,
    ).toBe(200);
    await pool.query(
      "UPDATE email_verification_codes SET created_at=now()-interval '61 seconds' WHERE user_id=$1",
      [id],
    );
    expect(
      (await agent.post('/api/v1/auth/resend-verification').send({})).status,
    ).toBe(200);
    mail = await readFile(`docs/dev-mail/${id}.txt`, 'utf8');
    expect(mail).toContain(`To: ${target}`);
    const pendingToken = new URL(
      mail.match(/https?:\/\/\S+/)[0],
    ).searchParams.get('token');
    expect(
      (
        await agent
          .get('/api/v1/auth/verify-email')
          .query({ token: pendingToken })
      ).status,
    ).toBe(200);
    expect(
      (
        await pool.query(
          'SELECT email,pending_email FROM users WHERE user_id=$1',
          [id],
        )
      ).rows[0],
    ).toEqual({ email: target, pending_email: null });
  });

  it('keeps registration and its session usable when delivery fails, with a safe retry error', async () => {
    vi.stubEnv('EMAIL_DELIVERY', 'smtp');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_FROM', 'verify@example.com');
    const transport = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error('private SMTP error')),
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const agent = request.agent(app);
      const registered = await agent.post('/api/v1/auth/register').send({
        email: `identity-failure-${crypto.randomUUID()}@example.com`,
        password: strong,
        confirmPassword: strong,
        firstName: 'Single',
        studentType: 'it',
      });
      expect(registered.status).toBe(201);
      expect(registered.body.user.verification_delivery).toBe('unavailable');
      expect((await agent.get('/api/v1/me/profile')).status).toBe(200);
      await pool.query(
        "UPDATE email_verification_codes SET created_at=now()-interval '61 seconds' WHERE user_id=$1",
        [registered.body.user.user_id],
      );
      const retry = await agent
        .post('/api/v1/auth/resend-verification')
        .send({});
      expect(retry.status).toBe(503);
      expect(retry.body.error.code).toBe('EMAIL_UNAVAILABLE');
      expect(JSON.stringify(retry.body)).not.toContain('private SMTP');
      expect(JSON.stringify(log.mock.calls)).not.toContain('private SMTP');
    } finally {
      transport.mockRestore();
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });
  const codeAccount = async () => {
    const agent = request.agent(app);
    const registered = await agent.post('/api/v1/auth/register').send({
      email: `identity-code-${crypto.randomUUID()}@example.com`,
      password: strong,
      confirmPassword: strong,
      firstName: 'Learner',
      lastName: 'Example',
      studentType: 'it',
    });
    expect(registered.status).toBe(201);
    const id = registered.body.user.user_id;
    const mail = await readFile(`docs/dev-mail/${id}.txt`, 'utf8');
    const code = mail.match(/verification code: (\d{6})/)[1];
    return { agent, id, code };
  };

  it('binds codes to the authenticated account, stores only a keyed hash, and accepts a code once', async () => {
    const a = await codeAccount();
    const b = await codeAccount();
    const row = (
      await pool.query(
        'SELECT * FROM email_verification_codes WHERE user_id=$1',
        [a.id],
      )
    ).rows[0];
    expect(row.code_hash).toHaveLength(64);
    expect(row.code_hash).not.toBe(a.code);
    const different = a.code === '000000' ? '000001' : '000000';
    const challenge = crypto.randomUUID();
    await pool.query(
      'UPDATE email_verification_codes SET challenge_id=$2,code_hash=$3 WHERE user_id=$1',
      [b.id, challenge, hashEmailCode(b.id, challenge, different)],
    );
    expect(
      (
        await request(app)
          .post('/api/v1/auth/verify-email')
          .send({ code: a.code })
      ).status,
    ).toBe(401);
    expect(
      (await b.agent.post('/api/v1/auth/verify-email').send({ code: a.code }))
        .status,
    ).toBe(422);
    expect(
      (
        await a.agent
          .post('/api/v1/auth/verify-email')
          .send({ code: a.code, email: 'other@example.com' })
      ).status,
    ).toBe(422);
    const verified = await a.agent
      .post('/api/v1/auth/verify-email')
      .send({ code: a.code });
    expect(verified.status).toBe(200);
    expect(verified.body.user.needs_email_verification).toBe(false);
    expect(
      (await a.agent.post('/api/v1/auth/verify-email').send({ code: a.code }))
        .status,
    ).toBe(422);
    expect(
      (
        await b.agent
          .post('/api/v1/auth/verify-email')
          .send({ code: different })
      ).status,
    ).toBe(200);
  });

  it('limits guesses and resends persistently, invalidates the previous code, and rejects expiry', async () => {
    const a = await codeAccount();
    const cooldown = await a.agent
      .post('/api/v1/auth/resend-verification')
      .send({});
    expect(cooldown.status).toBe(429);
    expect(cooldown.headers['retry-after']).toBe('60');
    const wrong = a.code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++)
      expect(
        (await a.agent.post('/api/v1/auth/verify-email').send({ code: wrong }))
          .status,
      ).toBe(422);
    expect(
      (await a.agent.post('/api/v1/auth/verify-email').send({ code: a.code }))
        .status,
    ).toBe(422);
    expect(
      (
        await pool.query(
          'SELECT failed_attempts FROM email_verification_codes WHERE user_id=$1',
          [a.id],
        )
      ).rows[0].failed_attempts,
    ).toBe(5);
    await pool.query(
      "UPDATE email_verification_codes SET created_at=now()-interval '61 seconds' WHERE user_id=$1",
      [a.id],
    );
    expect(
      (await a.agent.post('/api/v1/auth/resend-verification').send({})).status,
    ).toBe(200);
    const latest = (await readFile(`docs/dev-mail/${a.id}.txt`, 'utf8')).match(
      /verification code: (\d{6})/,
    )[1];
    await pool.query(
      "UPDATE email_verification_codes SET expires_at=now()-interval '1 second' WHERE user_id=$1",
      [a.id],
    );
    expect(
      (await a.agent.post('/api/v1/auth/verify-email').send({ code: latest }))
        .status,
    ).toBe(422);
  });

  it('commits only one successful verification for simultaneous submissions', async () => {
    const a = await codeAccount();
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        a.agent.post('/api/v1/auth/verify-email').send({ code: a.code }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 422)).toHaveLength(2);
  });
  it('verifies a pending email change with the current account code', async () => {
    const a = await codeAccount();
    expect(
      (await a.agent.post('/api/v1/auth/verify-email').send({ code: a.code }))
        .status,
    ).toBe(200);
    const replacement = `identity-code-new-${crypto.randomUUID()}@example.com`;
    expect(
      (
        await a.agent
          .post('/api/v1/me/email')
          .send({ password: strong, email: replacement })
      ).status,
    ).toBe(200);
    const latest = (await readFile(`docs/dev-mail/${a.id}.txt`, 'utf8')).match(
      /verification code: (\d{6})/,
    )[1];
    const result = await a.agent
      .post('/api/v1/auth/verify-email')
      .send({ code: latest });
    expect(result.status).toBe(200);
    expect(result.body.user.email).toBe(replacement);
    expect(
      (
        await pool.query('SELECT pending_email FROM users WHERE user_id=$1', [
          a.id,
        ])
      ).rows[0].pending_email,
    ).toBeNull();
  });

  it('accepts only one verification when a legacy link and its code race', async () => {
    const a = await codeAccount();
    const mail = await readFile(`docs/dev-mail/${a.id}.txt`, 'utf8');
    const token = new URL(mail.match(/https?:\/\/\S+/)[0]).searchParams.get(
      'token',
    );
    const results = await Promise.all([
      a.agent.post('/api/v1/auth/verify-email').send({ code: a.code }),
      request(app).get('/api/v1/auth/verify-email').query({ token }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 422)).toHaveLength(1);
  });
});
