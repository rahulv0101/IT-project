// @ts-nocheck - integration tests exercise runtime Express and PostgreSQL behavior.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { emailDns } from '../src/validation/email-domain.js';
vi.spyOn(emailDns, 'resolveMx').mockResolvedValue([
  { exchange: 'mx.example.com', priority: 0 },
]);
process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

const password = 'AdminIntegration1!';
let admin;
let student;
let lecturer;
let moduleId;

async function createUser(email, role, name) {
  const hash = await bcrypt.hash(password, 4);
  return (
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,email_verified_at)
       VALUES($1,$2,$3,$4,now()) RETURNING user_id`,
      [email, hash, role, name],
    )
  ).rows[0].user_id;
}

async function login(email) {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/v1/auth/login')
    .send({ email, password });
  expect(response.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  await pool.query(
    "DELETE FROM users WHERE email LIKE 'admin-api-%@example.com'",
  );
  admin = await createUser(
    'admin-api-admin@example.com',
    'admin',
    'API Administrator',
  );
  student = await createUser(
    'admin-api-student@example.com',
    'student',
    'API Student',
  );
  lecturer = await createUser(
    'admin-api-lecturer@example.com',
    'lecturer',
    'API Lecturer',
  );
  moduleId = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,'ADMINAPI','Admin API Module','ADMINAPIMODULE') RETURNING module_id`,
      [lecturer],
    )
  ).rows[0].module_id;
});

describe('administrator foundation', () => {
  it('returns platform counts without secrets and rejects non-admin roles', async () => {
    const studentAgent = await login('admin-api-student@example.com');
    expect((await studentAgent.get('/api/v1/admin/dashboard')).status).toBe(
      403,
    );
    const response = await (
      await login('admin-api-admin@example.com')
    ).get('/api/v1/admin/dashboard');
    expect(response.status).toBe(200);
    expect(response.body.users.students).toBeGreaterThan(0);
    expect(response.body.modules).toBeGreaterThan(0);
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|token|secret|api.?key/i,
    );
  });

  it('suspends a user, revokes sessions and records an append-only audit event', async () => {
    const studentAgent = await login('admin-api-student@example.com');
    const adminAgent = await login('admin-api-admin@example.com');
    const response = await adminAgent
      .patch(`/api/v1/admin/users/${student}`)
      .send({ action: 'suspend', reason: 'Account security investigation' });
    expect(response.status).toBe(200);
    expect((await studentAgent.get('/api/v1/auth/me')).status).toBe(401);
    const audit = await pool.query(
      `SELECT action,reason FROM admin_audit_logs WHERE target_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [student],
    );
    expect(audit.rows[0]).toEqual({
      action: 'user.suspend',
      reason: 'Account security investigation',
    });
    await expect(
      pool.query('DELETE FROM admin_audit_logs WHERE target_id=$1', [student]),
    ).rejects.toThrow(/append-only/i);
  });

  it('creates a lecturer safely and never returns its password hash', async () => {
    const response = await (
      await login('admin-api-admin@example.com')
    )
      .post('/api/v1/admin/lecturers')
      .send({
        email: 'admin-api-new-lecturer@example.com',
        temporaryPassword: 'TemporaryLecturer1!',
        firstName: 'New',
        lastName: 'Lecturer',
        reason: 'Lecturer appointment approved',
      });
    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('lecturer');
    expect(response.body.user.requires_password_reset).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(
      /password_hash|token_hash|encrypted_secret/i,
    );
  });

  it('transfers module ownership only to an active lecturer and audits it', async () => {
    const replacement = await createUser(
      'admin-api-replacement@example.com',
      'lecturer',
      'Replacement Lecturer',
    );
    const response = await (
      await login('admin-api-admin@example.com')
    )
      .patch(`/api/v1/admin/modules/${moduleId}/lecturer`)
      .send({ lecturerId: replacement, reason: 'Approved staffing change' });
    expect(response.status).toBe(200);
    expect(response.body.module.lecturer_id).toBe(replacement);
    expect(
      (
        await pool.query(
          `SELECT count(*)::int count FROM admin_audit_logs WHERE target_id=$1 AND action='module.lecturer_transferred'`,
          [moduleId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it('refuses self-suspension, the final active admin suspension and unknown fields', async () => {
    const agent = await login('admin-api-admin@example.com');
    expect(
      (
        await agent.patch(`/api/v1/admin/users/${admin}`).send({
          action: 'suspend',
          reason: 'Attempted self suspension',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await agent.patch(`/api/v1/admin/users/${lecturer}`).send({
          action: 'activate',
          reason: 'Account support',
          role: 'admin',
        })
      ).status,
    ).toBe(422);
  });
});
