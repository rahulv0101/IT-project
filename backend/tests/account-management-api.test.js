// @ts-nocheck
import 'dotenv/config';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionFixture } from './helpers/session-cases.js';
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
let f, admin;
async function administrator() {
  const token = crypto.randomUUID(),
    email = `account-admin-${crypto.randomUUID()}@example.com`;
  const id = (
    await pool.query(
      "INSERT INTO users(email,password_hash,role,full_name,email_verified_at) VALUES($1,'unused','admin','Account Admin',now()) RETURNING user_id",
      [email],
    )
  ).rows[0].user_id;
  await pool.query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",
    [id, crypto.createHash('sha256').update(token).digest('hex')],
  );
  return { id, email, cookie: `eduquest_session=${token}` };
}
const call = (actor, method, url, body = {}) =>
  request(app)[method](url).set('Cookie', actor.cookie).send(body);
const body = (role = 'student') => ({
  email: `managed-${crypto.randomUUID()}@example.com`,
  temporaryPassword: 'TemporarySecure99!',
  firstName: 'Test',
  lastName: 'Person',
  role,
  reason: 'Provision a testing account',
});
const remove = async (user, extra = {}) => {
  const email = (
    await pool.query('SELECT email FROM users WHERE user_id=$1', [user.id])
  ).rows[0].email;
  return call(admin, 'delete', `/api/v1/admin/users/${user.id}`, {
    confirmationEmail: email,
    reason: 'Delete disposable testing account',
    ...extra,
  });
};
beforeEach(async () => {
  f = await sessionFixture(pool);
  admin = await administrator();
});
describe('administrator account creation and removal', () => {
  it('requires OTP before every newly created role can access account functions', async () => {
    for (const role of ['student', 'lecturer', 'admin']) {
      const data = body(role);
      const r = await call(admin, 'post', '/api/v1/admin/users', data);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.user.role).toBe(role);
      expect(r.body.user.requires_password_reset).toBe(true);
      expect(JSON.stringify(r.body)).not.toMatch(
        /hash|temporaryPassword|secret/,
      );
      const stored = (
        await pool.query(
          'SELECT email_verified_at,password_hash,student_type,requires_email_verification FROM users WHERE user_id=$1',
          [r.body.user.user_id],
        )
      ).rows[0];
      expect(stored.email_verified_at).toBeNull();
      expect(stored.requires_email_verification).toBe(true);
      expect(stored.password_hash).not.toBe(data.temporaryPassword);
      expect(stored.student_type).toBe(role === 'student' ? 'it' : null);
      const agent = request.agent(app);
      const login = await agent
        .post('/api/v1/auth/login')
        .send({ email: data.email, password: data.temporaryPassword });
      expect(login.status).toBe(200);
      expect(login.body.user.needs_email_verification).toBe(true);
      const endpoint =
        role === 'admin'
          ? '/api/v1/admin/dashboard'
          : role === 'lecturer'
            ? '/api/v1/modules'
            : '/api/v1/me/modules';
      const blocked = await agent.get(endpoint);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');
      expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
      const code = (
        await readFile(`docs/dev-mail/${r.body.user.user_id}.txt`, 'utf8')
      ).match(/verification code: (\d{6})/)[1];
      expect(
        (
          await agent
            .post('/api/v1/auth/verify-email')
            .send({ code: code === '000000' ? '000001' : '000000' })
        ).status,
      ).toBe(422);
      expect((await agent.get(endpoint)).status).toBe(403);
      expect(
        (await agent.post('/api/v1/auth/verify-email').send({ code })).status,
      ).toBe(200);
      expect((await agent.get(endpoint)).status).toBe(200);

      expect(
        (await call(admin, 'post', '/api/v1/admin/users', data)).status,
      ).toBe(409);
    }
  });
  it('rejects other roles, weak passwords, unknown fields, and self deletion', async () => {
    expect(
      (await call(f.lecturer, 'post', '/api/v1/admin/users', body())).status,
    ).toBe(403);
    expect(
      (
        await call(admin, 'post', '/api/v1/admin/users', {
          ...body(),
          temporaryPassword: 'weak',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call(admin, 'post', '/api/v1/admin/users', {
          ...body(),
          unknown: true,
        })
      ).status,
    ).toBe(422);
    expect((await remove(admin)).status).toBe(409);
    expect(
      (
        await call(admin, 'delete', `/api/v1/admin/users/${f.member.id}`, {
          confirmationEmail: 'wrong@example.com',
          reason: 'Confirm deletion',
        })
      ).status,
    ).toBe(422);
  });
  it('makes an account inactive without changing personal details, credentials or memberships and permits reactivation', async () => {
    const before = (
      await pool.query('SELECT * FROM users WHERE user_id=$1', [f.member.id])
    ).rows[0];
    const memberships = (
      await pool.query('SELECT * FROM group_members WHERE student_id=$1', [
        f.member.id,
      ])
    ).rows;
    const r = await remove(f.member);
    expect(r.status).toBe(204);
    expect((await call(f.member, 'get', '/api/v1/auth/me')).status).toBe(401);
    const after = (
      await pool.query('SELECT * FROM users WHERE user_id=$1', [f.member.id])
    ).rows[0];
    expect(after).toEqual({ ...before, account_status: 'inactive' });
    expect(
      (
        await pool.query('SELECT * FROM group_members WHERE student_id=$1', [
          f.member.id,
        ])
      ).rows,
    ).toEqual(memberships);
    expect(
      (
        await pool.query('SELECT 1 FROM enrollments WHERE student_id=$1', [
          f.member.id,
        ])
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM admin_audit_logs WHERE target_id=$1 AND action='user.deactivate'",
          [f.member.id],
        )
      ).rowCount,
    ).toBe(1);
    const users = await request(app)
      .get('/api/v1/admin/users')
      .set('Cookie', admin.cookie)
      .query({ search: before.email });
    expect(users.body.data).toHaveLength(1);
    expect(users.body.data[0].account_status).toBe('inactive');
    expect(
      (
        await call(admin, 'patch', `/api/v1/admin/users/${f.member.id}`, {
          action: 'activate',
          reason: 'Restore access',
        })
      ).status,
    ).toBe(200);
    expect(
      (await pool.query('SELECT * FROM users WHERE user_id=$1', [f.member.id]))
        .rows[0],
    ).toEqual(before);
    expect((await call(f.member, 'get', '/api/v1/auth/me')).status).toBe(401);
  });
  it('retains lecturer ownership without requiring or applying reassignment', async () => {
    const replacement = await call(
      admin,
      'post',
      '/api/v1/admin/users',
      body('lecturer'),
    );
    expect(
      (
        await remove(f.lecturer, {
          replacementLecturerId: replacement.body.user.user_id,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await pool.query('SELECT lecturer_id FROM modules WHERE module_id=$1', [
          f.moduleId,
        ])
      ).rows[0].lecturer_id,
    ).toBe(f.lecturer.id);
  });
  it('preserves group leadership, memberships and visibility when members become inactive', async () => {
    const before = {
      leaders: (
        await pool.query(
          'SELECT * FROM group_leaders WHERE group_id=$1 ORDER BY student_id',
          [f.groupId],
        )
      ).rows,
      members: (
        await pool.query(
          'SELECT * FROM group_members WHERE group_id=$1 ORDER BY student_id',
          [f.groupId],
        )
      ).rows,
      group: (
        await pool.query('SELECT * FROM study_groups WHERE group_id=$1', [
          f.groupId,
        ])
      ).rows[0],
    };
    for (const actor of [f.member, f.coLeader, f.leader])
      expect((await remove(actor)).status).toBe(204);
    expect(
      (
        await pool.query(
          'SELECT * FROM group_leaders WHERE group_id=$1 ORDER BY student_id',
          [f.groupId],
        )
      ).rows,
    ).toEqual(before.leaders);
    expect(
      (
        await pool.query(
          'SELECT * FROM group_members WHERE group_id=$1 ORDER BY student_id',
          [f.groupId],
        )
      ).rows,
    ).toEqual(before.members);
    expect(
      (
        await pool.query('SELECT * FROM study_groups WHERE group_id=$1', [
          f.groupId,
        ])
      ).rows[0],
    ).toEqual(before.group);
  });
  it('revokes sessions without blocking fresh login, suspends and reactivates, then deactivates with all data intact', async () => {
    const data = body();
    const created = await call(admin, 'post', '/api/v1/admin/users', data);
    const id = created.body.user.user_id;
    const login = () =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: data.email, password: data.temporaryPassword });
    const session = await login();
    const cookie = session.headers['set-cookie'][0].split(';')[0];
    const code = (await readFile(`docs/dev-mail/${id}.txt`, 'utf8')).match(
      /verification code: (\d{6})/,
    )[1];
    expect(
      (
        await request(app)
          .post('/api/v1/auth/verify-email')
          .set('Cookie', cookie)
          .send({ code })
      ).status,
    ).toBe(200);

    expect(
      (
        await call(admin, 'patch', `/api/v1/admin/users/${id}`, {
          action: 'revoke_sessions',
          reason: 'Security review',
        })
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status,
    ).toBe(401);
    expect((await login()).status).toBe(200);
    expect(
      (
        await call(admin, 'patch', `/api/v1/admin/users/${id}`, {
          action: 'suspend',
          reason: 'Temporary suspension',
        })
      ).status,
    ).toBe(200);
    expect((await login()).status).toBe(403);
    expect(
      (
        await call(admin, 'patch', `/api/v1/admin/users/${id}`, {
          action: 'activate',
          reason: 'Restore access',
        })
      ).status,
    ).toBe(200);
    expect((await login()).status).toBe(200);
    expect(
      (
        await call(admin, 'patch', `/api/v1/admin/users/${id}`, {
          action: 'deactivate',
          reason: 'Retain historical data',
        })
      ).status,
    ).toBe(200);
    const blocked = await login();
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_INACTIVE');
    expect(
      (
        await call(admin, 'patch', `/api/v1/admin/users/${id}`, {
          action: 'activate',
          reason: 'Restore account',
        })
      ).status,
    ).toBe(200);
    expect((await login()).status).toBe(200);
  });
  it('rolls back deactivation when session revocation fails', async () => {
    await pool.query(
      "CREATE FUNCTION test_deactivate_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test revocation failure'; END $$",
    );
    await pool.query(
      'CREATE TRIGGER test_deactivate_failure BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION test_deactivate_failure()',
    );
    try {
      expect((await remove(f.member)).status).toBe(500);
      expect(
        (
          await pool.query(
            'SELECT account_status FROM users WHERE user_id=$1',
            [f.member.id],
          )
        ).rows[0].account_status,
      ).toBe('active');
      expect((await call(f.member, 'get', '/api/v1/auth/me')).status).toBe(200);
    } finally {
      await pool.query('DROP TRIGGER test_deactivate_failure ON sessions');
      await pool.query('DROP FUNCTION test_deactivate_failure()');
    }
  });
  it('serializes competing administrator suspensions and rechecks the acting administrator', async () => {
    const other = await administrator();
    const responses = await Promise.all([
      call(admin, 'patch', `/api/v1/admin/users/${other.id}`, {
        action: 'suspend',
        reason: 'Concurrent access review',
      }),
      call(other, 'patch', `/api/v1/admin/users/${admin.id}`, {
        action: 'suspend',
        reason: 'Concurrent access review',
      }),
    ]);
    expect(
      responses.map((r) => r.status).filter((s) => s === 200),
    ).toHaveLength(1);
    expect(
      responses.map((r) => r.status).some((s) => [401, 403].includes(s)),
    ).toBe(true);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM users WHERE user_id=ANY($1::uuid[]) AND account_status='active'",
          [[admin.id, other.id]],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('accepts signup-style fields for every role with matching passwords and automatic audit reason', async () => {
    for (const role of ['student', 'lecturer', 'admin']) {
      const legacy = body(role);
      const { temporaryPassword, reason: _reason, ...identity } = legacy;
      const result = await call(admin, 'post', '/api/v1/admin/users', {
        ...identity,
        password: temporaryPassword,
        confirmPassword: temporaryPassword,
      });
      expect(result.status, JSON.stringify(result.body)).toBe(201);
      expect(result.body.user.role).toBe(role);
      const audit = (
        await pool.query(
          "SELECT reason FROM admin_audit_logs WHERE target_id=$1 AND action='user.created'",
          [result.body.user.user_id],
        )
      ).rows[0];
      expect(audit.reason).toBe('Account created by an administrator');
    }
  });
  it('rejects invalid email domains and temporary DNS failure for every admin-created role before inserting users or audits', async () => {
    for (const role of ['student', 'lecturer', 'admin'])
      for (const code of ['ENOTFOUND', 'ETIMEOUT']) {
        const data = body(role);
        emailDns.resolveMx.mockRejectedValueOnce(
          Object.assign(new Error(code), { code }),
        );
        const r = await call(admin, 'post', '/api/v1/admin/users', data);
        expect(r.status).toBe(code === 'ENOTFOUND' ? 422 : 503);
        expect(r.body.error.fields.email).toBeTruthy();
        expect(
          (await pool.query('SELECT 1 FROM users WHERE email=$1', [data.email]))
            .rowCount,
        ).toBe(0);
      }
  });
  it('rejects malformed emails, missing signup names, mismatched confirmations, conflicting password fields and common passwords', async () => {
    const { temporaryPassword, reason: _reason, ...data } = body();
    const valid = {
      ...data,
      password: temporaryPassword,
      confirmPassword: temporaryPassword,
    };
    for (const [update, field] of [
      [{ email: 'invalid-email' }, 'email'],
      [{ lastName: undefined }, 'lastName'],
      [{ confirmPassword: undefined }, 'confirmPassword'],
      [{ confirmPassword: 'DifferentPassword9!' }, 'confirmPassword'],
      [{ temporaryPassword }, 'password'],
      [
        { password: 'Password123!', confirmPassword: 'Password123!' },
        'password',
      ],
    ]) {
      const result = await call(admin, 'post', '/api/v1/admin/users', {
        ...valid,
        ...update,
      });
      expect(result.status).toBe(422);
      expect(result.body.error.fields[field]).toBeTruthy();
    }
    expect(
      (await pool.query('SELECT 1 FROM users WHERE email=$1', [data.email]))
        .rowCount,
    ).toBe(0);
  });
  it('does not let the older lecturer creation route bypass email domain checks', async () => {
    const {
      role: _role,
      studentType: _studentType,
      studentYear: _studentYear,
      ...data
    } = body('lecturer');
    emailDns.resolveMx.mockRejectedValueOnce(
      Object.assign(new Error('No mail route'), { code: 'ENOTFOUND' }),
    );
    const result = await call(admin, 'post', '/api/v1/admin/lecturers', data);
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('INVALID_EMAIL_DOMAIN');
    expect(
      (await pool.query('SELECT 1 FROM users WHERE email=$1', [data.email]))
        .rowCount,
    ).toBe(0);
  });
  it('keeps verification mandatory after admin activation and protects its scope from request bodies', async () => {
    const data = body('admin');
    const r = await call(admin, 'post', '/api/v1/admin/users', data);
    expect(r.status).toBe(201);
    const id = r.body.user.user_id;
    await call(admin, 'patch', `/api/v1/admin/users/${id}`, {
      action: 'suspend',
      reason: 'Pending account review',
    });
    await call(admin, 'patch', `/api/v1/admin/users/${id}`, {
      action: 'activate',
      reason: 'Restore pending account',
    });
    const agent = request.agent(app);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: data.email, password: data.temporaryPassword });
    expect((await agent.get('/api/v1/admin/users')).body.error.code).toBe(
      'EMAIL_NOT_VERIFIED',
    );
    expect(
      (await agent.put('/api/v1/auth/me').send({ firstName: 'Changed' }))
        .status,
    ).toBe(403);
    const forged = await call(admin, 'post', '/api/v1/admin/users', {
      ...body(),
      requires_email_verification: false,
      email_verified_at: new Date().toISOString(),
    });
    expect(forged.status).toBe(422);
  });
  it('keeps an account blocked if email delivery fails and permits verification after a resend', async () => {
    const transport = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error('Simulated mail outage')),
    });
    vi.stubEnv('EMAIL_DELIVERY', 'smtp');
    vi.stubEnv('SMTP_HOST', 'localhost');
    vi.stubEnv('SMTP_FROM', 'EduQuest Test <test@example.com>');
    let result;
    const data = body('lecturer');
    try {
      result = await call(admin, 'post', '/api/v1/admin/users', data);
      expect(result.status).toBe(201);
      expect(result.body.user.verification_delivery).toBe('unavailable');
    } finally {
      transport.mockRestore();
      vi.unstubAllEnvs();
    }
    const agent = request.agent(app);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: data.email, password: data.temporaryPassword });
    expect((await agent.get('/api/v1/modules')).body.error.code).toBe(
      'EMAIL_NOT_VERIFIED',
    );
    await pool.query(
      "UPDATE email_verification_codes SET created_at=now()-interval '2 minutes' WHERE user_id=$1",
      [result.body.user.user_id],
    );
    expect(
      (await agent.post('/api/v1/auth/resend-verification').send({})).status,
    ).toBe(200);
    const code = (
      await readFile(`docs/dev-mail/${result.body.user.user_id}.txt`, 'utf8')
    ).match(/verification code: (\d{6})/)[1];
    expect(
      (await agent.post('/api/v1/auth/verify-email').send({ code })).status,
    ).toBe(200);
    expect((await agent.get('/api/v1/modules')).status).toBe(200);
  });
});
