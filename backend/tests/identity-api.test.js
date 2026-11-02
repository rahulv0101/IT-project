// @ts-nocheck
import 'dotenv/config';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
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
      lastName: 'Duplicate',
      studentType: 'it',
    });
    expect(duplicate.status).toBe(409);
  });

  it('accepts an OTP once, rejects OTP reuse, and keeps link compatibility', async () => {
    const user = (
      await pool.query('SELECT user_id FROM users WHERE email=$1', [email])
    ).rows[0];
    const generatedMail = await readFile(`docs/dev-mail/${user.user_id}.txt`, 'utf8');
    const code = generatedMail.match(/code is (\d{6})/)?.[1];
    expect(code).toMatch(/^\d{6}$/);
    const otp = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ code });
    expect(otp.status).toBe(200);
    const reusedOtp = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ code });
    expect(reusedOtp.status).toBe(422);

    const raw = 'identity-verification-token-1234567890';
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
});
