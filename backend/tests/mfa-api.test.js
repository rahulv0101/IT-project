// @ts-nocheck - verifies retirement against stale credentials from old deployments.
import 'dotenv/config';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { beforeAll, describe, expect, it } from 'vitest';
process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');
const password = 'PasswordOnlyAccess9!';
const users = {};
const retired = [
  '/api/v1/mfa/enrol',
  '/api/v1/mfa/confirm',
  '/api/v1/mfa/disable',
  '/api/v1/mfa/recovery-codes/regenerate',
];
const login = async (role) => {
  const agent = request.agent(app);
  const r = await agent
    .post('/api/v1/auth/login')
    .send({ email: users[role].email, password });
  expect(r.status).toBe(200);
  expect(r.body).not.toHaveProperty('mfaRequired');
  expect(r.body).not.toHaveProperty('challengeId');
  return agent;
};
beforeAll(async () => {
  const hash = await bcrypt.hash(password, 4);
  for (const role of ['student', 'lecturer', 'admin']) {
    const email = `password-only-${role}-${crypto.randomUUID()}@example.com`;
    const user = (
      await pool.query(
        'INSERT INTO users(email,password_hash,role,full_name,email_verified_at) VALUES($1,$2,$3,$4,now()) RETURNING user_id',
        [email, hash, role, `Password ${role}`],
      )
    ).rows[0];
    users[role] = { id: user.user_id, email };
    await pool.query(
      "INSERT INTO mfa_credentials(user_id,encrypted_secret,enabled,confirmed_at) VALUES($1,'obsolete-credential',true,now())",
      [user.user_id],
    );
    await pool.query(
      "INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,'obsolete-recovery-hash')",
      [user.user_id],
    );
  }
});
describe('password-only authentication after MFA removal', () => {
  it.each(['student', 'lecturer', 'admin'])(
    'signs in %s using only the password despite legacy enabled MFA rows',
    async (role) => {
      const agent = await login(role);
      const me = await agent.get('/api/v1/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.user.role).toBe(role);
      const profile = await agent.get('/api/v1/me/profile');
      expect(profile.status).toBe(200);
      expect(profile.body.profile.mfa_enabled).toBe(false);
    },
  );
  it('allows production administrator access without MFA while retaining role checks', async () => {
    const admin = await login('admin'),
      student = await login('student'),
      lecturer = await login('lecturer');
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect((await admin.get('/api/v1/admin/dashboard')).status).toBe(200);
      expect((await student.get('/api/v1/admin/dashboard')).status).toBe(403);
      expect((await lecturer.get('/api/v1/admin/dashboard')).status).toBe(403);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
  it('retains password verification, account status and session revocation', async () => {
    const invalid = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: users.student.email, password: 'WrongPassword1!' });
    expect(invalid.status).toBe(401);
    expect(invalid.headers['set-cookie']).toBeUndefined();
    const agent = await login('student');
    expect((await agent.post('/api/v1/auth/logout').send({})).status).toBe(204);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    await pool.query(
      "UPDATE users SET account_status='suspended' WHERE user_id=$1",
      [users.student.id],
    );
    try {
      expect(
        (
          await request(app)
            .post('/api/v1/auth/login')
            .send({ email: users.student.email, password })
        ).status,
      ).toBe(403);
    } finally {
      await pool.query(
        "UPDATE users SET account_status='active' WHERE user_id=$1",
        [users.student.id],
      );
    }
  });
  it('retires enrolment and recovery endpoints without creating secrets or sessions', async () => {
    const agent = await login('admin');
    for (const endpoint of retired) {
      expect((await request(app).post(endpoint).send({})).status).toBe(401);
      const r = await agent.post(endpoint).send({});
      expect(r.status).toBe(410);
      expect(r.body.error.code).toBe('MFA_REMOVED');
      expect(r.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(r.body)).not.toMatch(
        /setupKey|recoveryCodes|otpauthUri/,
      );
    }
    const before = (await pool.query('SELECT count(*)::int n FROM sessions'))
      .rows[0].n;
    const old = await request(app)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeId: crypto.randomUUID(), code: '123456' });
    expect(old.status).toBe(410);
    expect(old.headers['set-cookie']).toBeUndefined();
    expect(
      (await pool.query('SELECT count(*)::int n FROM sessions')).rows[0].n,
    ).toBe(before);
  });
  it('migration removes legacy MFA material while preserving accounts and password hashes', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const before = (
        await client.query(
          'SELECT user_id,password_hash,role,email FROM users ORDER BY user_id',
        )
      ).rows;
      await client.query(
        await readFile('db/migrations/031_remove_mfa.sql', 'utf8'),
      );
      for (const table of [
        'mfa_credentials',
        'mfa_recovery_codes',
        'mfa_login_challenges',
      ])
        expect(
          (await client.query(`SELECT count(*)::int n FROM ${table}`)).rows[0]
            .n,
        ).toBe(0);
      expect(
        (
          await client.query(
            'SELECT user_id,password_hash,role,email FROM users ORDER BY user_id',
          )
        ).rows,
      ).toEqual(before);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
