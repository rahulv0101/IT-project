// @ts-nocheck
import 'dotenv/config';
import crypto from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { sessionFixture } from './helpers/session-cases.js';
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
  it('creates every supported role with a verified email and required password reset', async () => {
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
          'SELECT email_verified_at,password_hash,student_type FROM users WHERE user_id=$1',
          [r.body.user.user_id],
        )
      ).rows[0];
      expect(stored.email_verified_at).toBeTruthy();
      expect(stored.password_hash).not.toBe(data.temporaryPassword);
      expect(stored.student_type).toBe(role === 'student' ? 'it' : null);
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
  it('anonymizes deletion, revokes sessions, audits the action, and prevents reactivation', async () => {
    const r = await remove(f.member);
    expect(r.status, JSON.stringify(r.body)).toBe(204);
    expect((await call(f.member, 'get', '/api/v1/auth/me')).status).toBe(401);
    const user = (
      await pool.query(
        'SELECT email,full_name,account_status FROM users WHERE user_id=$1',
        [f.member.id],
      )
    ).rows[0];
    expect(user.account_status).toBe('deleted');
    expect(user.full_name).toBe('Deleted user');
    expect(user.email).toMatch(/@accounts.invalid$/);
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
          "SELECT 1 FROM admin_audit_logs WHERE target_id=$1 AND action='user.deleted'",
          [f.member.id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await call(admin, 'patch', `/api/v1/admin/users/${f.member.id}`, {
          action: 'activate',
          reason: 'Cannot reactivate deleted user',
        })
      ).status,
    ).toBe(404);
    const users = await request(app)
      .get('/api/v1/admin/users')
      .set('Cookie', admin.cookie)
      .query({ search: user.email });
    expect(users.body.data).toHaveLength(0);
  });
  it('requires lecturer reassignment before deletion and transfers modules atomically', async () => {
    expect((await remove(f.lecturer)).status).toBe(409);
    expect(
      (
        await pool.query('SELECT lecturer_id FROM modules WHERE module_id=$1', [
          f.moduleId,
        ])
      ).rows[0].lecturer_id,
    ).toBe(f.lecturer.id);
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
    ).toBe(replacement.body.user.user_id);
  });
  it('hands group leadership to an active member when deleting the original leader', async () => {
    expect((await remove(f.leader)).status).toBe(204);
    const leader = (
      await pool.query(
        "SELECT student_id FROM group_leaders WHERE group_id=$1 AND role='leader'",
        [f.groupId],
      )
    ).rows[0];
    expect([f.member.id, f.coLeader.id]).toContain(leader.student_id);
    expect(
      (
        await pool.query(
          'SELECT 1 FROM group_members WHERE group_id=$1 AND student_id=$2',
          [f.groupId, f.leader.id],
        )
      ).rowCount,
    ).toBe(0);
  });
  it('makes a group private when its last active member is deleted', async () => {
    await remove(f.member);
    await remove(f.coLeader);
    expect((await remove(f.leader)).status).toBe(204);
    expect(
      (
        await pool.query(
          'SELECT visibility FROM study_groups WHERE group_id=$1',
          [f.groupId],
        )
      ).rows[0].visibility,
    ).toBe('private');
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
});
