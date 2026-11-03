// @ts-nocheck
import 'dotenv/config';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { sessionFixture } from './helpers/session-cases.js';
process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');
let f;
const call = (role, method, url, body = {}) => {
  const r = request(app)[method](url).set('Cookie', f[role].cookie);
  return method === 'get' ? r.query(body) : r.send(body);
};
const create = async (a = 'leader', b = 'member') => {
  const r = await call(a, 'post', '/api/v1/direct-conversations', {
    studentId: f[b].id,
  });
  expect(r.status).toBe(201);
  return r.body.conversation.conversation_id;
};
const enrol = () =>
  pool.query('INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)', [
    f.outsider.id,
    f.moduleId,
  ]);
const invite = () =>
  call('leader', 'post', `/api/v1/groups/${f.groupId}/invitations`, {
    studentId: f.outsider.id,
  });
beforeEach(async () => {
  f = await sessionFixture(pool);
});
describe('student directory and private messages', () => {
  it('prevents browser and intermediary caching of authenticated API responses and auth errors', async () => {
    const profile = await call('leader', 'get', '/api/v1/auth/me');
    expect(profile.status).toBe(200);
    expect(profile.headers['cache-control']).toBe('private, no-store');
    const denied = await request(app).get('/api/v1/auth/me');
    expect(denied.status).toBe(401);
    expect(denied.headers['cache-control']).toBe('private, no-store');
  });
  it('exposes student names without email or credentials and enforces module enrolment', async () => {
    const r = await call('leader', 'get', '/api/v1/students', {
      moduleId: f.moduleId,
    });
    expect(r.status).toBe(200);
    expect(r.body.data.map((x) => x.user_id)).toContain(f.member.id);
    expect(r.body.data.map((x) => x.user_id)).not.toContain(f.leader.id);
    expect(JSON.stringify(r.body)).not.toMatch(/email|password|token/);
    expect((await call('lecturer', 'get', '/api/v1/students')).status).toBe(
      403,
    );
    expect(
      (
        await call('outsider', 'get', '/api/v1/students', {
          moduleId: f.moduleId,
        })
      ).status,
    ).toBe(403);
  });
  it('canonicalizes pairs and rejects self, nonstudent and inactive recipients', async () => {
    const id = await create();
    const reverse = await call(
      'member',
      'post',
      '/api/v1/direct-conversations',
      { studentId: f.leader.id.toUpperCase() },
    );
    expect(reverse.status).toBe(201);
    expect(reverse.body.conversation.conversation_id).toBe(id);
    expect(
      (
        await call('leader', 'post', '/api/v1/direct-conversations', {
          studentId: f.leader.id.toUpperCase(),
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call('leader', 'post', '/api/v1/direct-conversations', {
          studentId: f.lecturer.id,
        })
      ).status,
    ).toBe(404);
    await pool.query(
      "UPDATE users SET account_status='suspended' WHERE user_id=$1",
      [f.member.id],
    );
    expect(
      (
        await call('leader', 'post', '/api/v1/direct-conversations', {
          studentId: f.member.id,
        })
      ).status,
    ).toBe(404);
  });
  it('limits conversations and message reads/writes to the two participants', async () => {
    const id = await create();
    const url = `/api/v1/direct-conversations/${id}/messages`;
    expect(
      (await call('leader', 'post', url, { body: 'Hello from study group' }))
        .status,
    ).toBe(201);
    for (const method of ['get', 'post'])
      expect(
        (
          await call(
            'outsider',
            method,
            url,
            method === 'post' ? { body: 'Cannot read this' } : {},
          )
        ).status,
      ).toBe(404);
    expect((await call('lecturer', 'get', url)).status).toBe(403);
    expect(
      (await call('outsider', 'get', '/api/v1/direct-conversations')).body.data,
    ).toHaveLength(0);
    const r = await call('member', 'get', url);
    expect(r.body.data[0].body).toBe('Hello from study group');
    expect(r.headers['cache-control']).toContain('no-store');
  });
  it('validates text, marks only fetched incoming messages read, and paginates without gaps', async () => {
    const id = await create();
    const url = `/api/v1/direct-conversations/${id}/messages`;
    for (const body of ['', 'x'.repeat(1001), 'hello\u0000', 'fuck'])
      expect((await call('leader', 'post', url, { body })).status).toBe(422);
    await pool.query(
      "INSERT INTO direct_messages(conversation_id,sender_id,message_order,body) SELECT $1,$2,n,'Message '||n FROM generate_series(1,70) n",
      [id, f.leader.id],
    );
    const recent = await call('member', 'get', url);
    expect(recent.body.data).toHaveLength(50);
    expect(Number(recent.body.data[0].message_order)).toBe(21);
    const count = await pool.query(
      'SELECT count(*)::int n FROM direct_messages WHERE conversation_id=$1 AND read_at IS NULL',
      [id],
    );
    expect(count.rows[0].n).toBe(20);
    const earlier = await call('member', 'get', url, {
      before: recent.body.data[0].message_id,
    });
    expect(earlier.body.data).toHaveLength(20);
    expect(Number(earlier.body.data[0].message_order)).toBe(1);
    const other = await create('leader', 'outsider');
    const sent = await call(
      'outsider',
      'post',
      `/api/v1/direct-conversations/${other}/messages`,
      { body: 'Foreign cursor' },
    );
    expect(
      (
        await call('member', 'get', url, {
          after: sent.body.message.message_id,
        })
      ).status,
    ).toBe(422);
    const unread = await call('member', 'get', '/api/v1/direct-conversations');
    expect(unread.body.data[0].unread_count).toBe(0);
  });
  it('serializes sends and enforces a database-backed per-sender limit', async () => {
    const id = await create();
    const url = `/api/v1/direct-conversations/${id}/messages`;
    const sent = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        call('leader', 'post', url, { body: `Concurrent ${i}` }),
      ),
    );
    expect(sent.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(sent.map((r) => r.body.message.message_order)).size).toBe(5);
    await pool.query(
      "INSERT INTO direct_messages(conversation_id,sender_id,message_order,body) SELECT $1,$2,n,'Limit fixture' FROM generate_series(6,30) n",
      [id, f.leader.id],
    );
    expect(
      (await call('leader', 'post', url, { body: 'Wait for limit' })).status,
    ).toBe(429);
    expect(
      (await call('member', 'post', url, { body: 'Other sender works' }))
        .status,
    ).toBe(201);
    await pool.query(
      "UPDATE users SET account_status='suspended' WHERE user_id=$1",
      [f.member.id],
    );
    expect(
      (await call('leader', 'post', url, { body: 'Unavailable recipient' }))
        .status,
    ).toBe(409);
  });
});
describe('study group membership', () => {
  it('prevents implicit enrolment and joining private groups through a known UUID', async () => {
    expect(
      (
        await call('outsider', 'post', `/api/v1/modules/${f.moduleId}/groups`, {
          name: 'New group',
          groupName: 'New group',
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await pool.query(
          'SELECT 1 FROM enrollments WHERE student_id=$1 AND module_id=$2',
          [f.outsider.id, f.moduleId],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (await call('outsider', 'post', `/api/v1/groups/${f.groupId}/join`))
        .status,
    ).toBe(403);
    await enrol();
    await pool.query(
      "UPDATE study_groups SET visibility='private' WHERE group_id=$1",
      [f.groupId],
    );
    expect(
      (await call('outsider', 'post', `/api/v1/groups/${f.groupId}/join`))
        .status,
    ).toBe(403);
  });
  it('requires membership and enrolment for invitations and recipient consent for joining', async () => {
    expect((await invite()).status).toBe(422);
    await enrol();
    expect(
      (
        await call(
          'outsider',
          'post',
          `/api/v1/groups/${f.groupId}/invitations`,
          { studentId: f.member.id },
        )
      ).status,
    ).toBe(404);
    const r = await invite();
    expect(r.status).toBe(201);
    const id = r.body.invitation.invitation_id;
    expect((await invite()).status).toBe(409);
    expect(
      (
        await pool.query(
          'SELECT 1 FROM group_members WHERE student_id=$1 AND group_id=$2',
          [f.outsider.id, f.groupId],
        )
      ).rowCount,
    ).toBe(0);
    const inbox = await call('outsider', 'get', '/api/v1/group-invitations');
    expect(inbox.body.data[0].invitation_id).toBe(id);
    const url = `/api/v1/group-invitations/${id}/respond`;
    expect((await call('member', 'post', url, { accept: true })).status).toBe(
      404,
    );
    expect((await call('outsider', 'post', url, { accept: true })).status).toBe(
      200,
    );
    expect((await call('outsider', 'post', url, { accept: true })).status).toBe(
      409,
    );
    expect(
      (await call('outsider', 'get', `/api/v1/groups/${f.groupId}/members`))
        .status,
    ).toBe(200);
  });
  it('supports declining and refuses stale invitations when inviter leaves', async () => {
    await enrol();
    let r = await invite();
    expect(
      (
        await call(
          'outsider',
          'post',
          `/api/v1/group-invitations/${r.body.invitation.invitation_id}/respond`,
          { accept: false },
        )
      ).body.joined,
    ).toBe(false);
    r = await invite();
    await pool.query(
      'DELETE FROM enrollments WHERE student_id=$1 AND module_id=$2',
      [f.outsider.id, f.moduleId],
    );
    expect(
      (
        await call(
          'outsider',
          'post',
          `/api/v1/group-invitations/${r.body.invitation.invitation_id}/respond`,
          { accept: true },
        )
      ).status,
    ).toBe(409);
  });
  it('protects the roster, transfers primary leadership and lets the former leader leave', async () => {
    const url = `/api/v1/groups/${f.groupId}`;
    expect((await call('outsider', 'get', `${url}/members`)).status).toBe(404);
    expect(
      (
        await call('member', 'post', `${url}/leadership`, {
          studentId: f.coLeader.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('leader', 'post', `${url}/leadership`, {
          studentId: f.coLeader.id,
        })
      ).status,
    ).toBe(200);
    expect((await call('leader', 'post', `${url}/leave`)).status).toBe(200);
    const roster = await call('coLeader', 'get', `${url}/members`);
    expect(roster.body.data.find((x) => x.user_id === f.coLeader.id).role).toBe(
      'leader',
    );
    expect(roster.body.data.some((x) => x.user_id === f.leader.id)).toBe(false);
  });
  it('filters joined and available group discovery', async () => {
    await enrol();
    const mine = await call('leader', 'get', '/api/v1/groups', {
      moduleId: f.moduleId,
      membership: 'joined',
    });
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((x) => x.group_id)).toContain(f.groupId);
    const available = await call('outsider', 'get', '/api/v1/groups', {
      moduleId: f.moduleId,
      membership: 'available',
    });
    expect(available.status).toBe(200);
    expect(available.body.data.map((x) => x.group_id)).toContain(f.groupId);
  });
});
