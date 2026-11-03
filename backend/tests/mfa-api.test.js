// @ts-nocheck
import 'dotenv/config';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { totpAt } from '../src/mfa.js';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

const password = 'MfaUserPassword9!';
const email = `mfa-${Date.now()}@example.com`;
let agent;
let setupKey;
let recoveryCodes;

describe('MFA backend', () => {
  beforeAll(async () => {
    await pool.query('DELETE FROM users WHERE email=$1', [email]);
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,email_verified_at) VALUES($1,$2,'student','MFA User','MFA','it',now())`,
      [email, hash],
    );
    agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await pool.query('DELETE FROM users WHERE email=$1', [email]);
  });

  it('enrols only a verified user and returns setup material once', async () => {
    const result = await agent.post('/api/v1/mfa/enrol').send({});
    expect(result.status).toBe(200);
    expect(result.body.otpauthUri).toMatch(/^otpauth:\/\//);
    expect(result.body.qrCode).toMatch(/^data:image\//);
    expect(result.body.setupKey).toMatch(/^[A-Z2-7]+$/);
    setupKey = result.body.setupKey;
    expect(JSON.stringify(result.body)).not.toContain('encrypted_secret');
    const second = await agent.post('/api/v1/mfa/enrol').send({});
    expect(second.status).toBe(200);
    expect(second.body.setupKey).toBe(result.body.setupKey);
    expect(second.body.qrCode).toBe(result.body.qrCode);
  });

  it('confirms a valid fixed-clock code and rejects an invalid code', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const invalid = await agent
      .post('/api/v1/mfa/confirm')
      .send({ code: '000000' });
    expect(invalid.status).toBe(401);
    const code = totpAt(setupKey, Date.now());
    const confirmed = await agent.post('/api/v1/mfa/confirm').send({ code });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.recoveryCodes).toHaveLength(10);
    recoveryCodes = confirmed.body.recoveryCodes;
    expect(JSON.stringify(confirmed.body)).not.toContain(setupKey);
  });

  it('requires a code for login, accepts TOTP once, and refuses challenge replay', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(login.status).toBe(202);
    const code = totpAt(setupKey, Date.now());
    const completed = await request(app).post('/api/v1/auth/login/mfa').send({
      challengeId: login.body.challengeId,
      code,
    });
    expect(completed.status).toBe(200);
    const replay = await request(app).post('/api/v1/auth/login/mfa').send({
      challengeId: login.body.challengeId,
      code,
    });
    expect(replay.status).toBe(401);
  });

  it('uses a recovery code once and locks a challenge after five wrong codes', async () => {
    const recoveryLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    const recovery = await request(app).post('/api/v1/auth/login/mfa').send({
      challengeId: recoveryLogin.body.challengeId,
      recoveryCode: recoveryCodes[0],
    });
    expect(recovery.status).toBe(200);
    const reusedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    const reused = await request(app).post('/api/v1/auth/login/mfa').send({
      challengeId: reusedLogin.body.challengeId,
      recoveryCode: recoveryCodes[0],
    });
    expect(reused.status).toBe(401);
    const lockedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    for (let index = 0; index < 5; index += 1)
      await request(app).post('/api/v1/auth/login/mfa').send({
        challengeId: lockedLogin.body.challengeId,
        code: '111111',
      });
    const locked = await request(app).post('/api/v1/auth/login/mfa').send({
      challengeId: lockedLogin.body.challengeId,
      code: '111111',
    });
    expect(locked.status).toBe(429);
  });

  it('disables and regenerates recovery codes with the password and MFA factor', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:30.000Z'));
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    const code = totpAt(setupKey, Date.now());
    const disabled = await agent
      .post('/api/v1/mfa/disable')
      .send({ password, code });
    expect(disabled.status).toBe(200);
    const noMfa = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(noMfa.status).toBe(200);
    const enrol = await agent.post('/api/v1/mfa/enrol').send({});
    expect(enrol.status).toBe(200);
    setupKey = enrol.body.setupKey;
    const confirmed = await agent
      .post('/api/v1/mfa/confirm')
      .send({ code: totpAt(setupKey) });
    expect(confirmed.status).toBe(200);
    const regenerated = await agent
      .post('/api/v1/mfa/recovery-codes/regenerate')
      .send({
        password,
        code: totpAt(setupKey),
      });
    expect(regenerated.status).toBe(200);
    expect(regenerated.body.recoveryCodes).toHaveLength(10);
    expect(login.body).not.toHaveProperty('setupKey');
  });
});
