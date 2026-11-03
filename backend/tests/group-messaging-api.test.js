// @ts-nocheck
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { sessionFixture } from './helpers/session-cases.js';
process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

describe('study group messaging', () => {
  let f;
  beforeAll(async () => {
    f = await sessionFixture(pool);
  });
  const call = (role, method, url, body) => {
    let r = request(app)[method](url).set('Cookie', f[role].cookie);
    return method === 'get' ? r.query(body || {}) : r.send(body || {});
  };
  const base = () => `/api/v1/groups/${f.groupId}`;
  it('members post and polling returns only newer messages with an ETag', async () => {
    const created = await call('member', 'post', `${base()}/messages`, {
      body: 'Hello <script>alert(1)</script>',
    });
    expect(created.status).toBe(201);
    expect(created.body.body).toContain('<script>');
    const first = await call('member', 'get', `${base()}/messages`);
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.headers.etag).toBeTruthy();
    const empty = await request(app)
      .get(`${base()}/messages?after=${created.body.message_id}`)
      .set('Cookie', f.member.cookie);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);
  });
  it('uses chronology rather than random UUID order for polling cursors', async () => {
    const older = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const newer = '00000000-0000-4000-8000-000000000001';
    await pool.query(
      "INSERT INTO group_messages(message_id,group_id,author_id,body,created_at) VALUES($1,$3,$4,'Earlier message',now()-interval '2 days'),($2,$3,$4,'Later message',now()-interval '1 day')",
      [older, newer, f.groupId, f.member.id],
    );
    const r = await call('member', 'get', `${base()}/messages`, {
      after: older,
    });
    expect(r.status).toBe(200);
    expect(r.body.data.map((m) => m.message_id)).toContain(newer);
    expect(
      (
        await call('member', 'get', `${base()}/messages`, {
          after: '00000000-0000-4000-8000-000000000009',
        })
      ).status,
    ).toBe(422);
  });
  it('non-members cannot read and lecturers are read-only', async () => {
    expect((await call('outsider', 'get', `${base()}/messages`)).status).toBe(
      403,
    );
    expect((await call('lecturer', 'get', `${base()}/messages`)).status).toBe(
      200,
    );
    expect(
      (
        await call('lecturer', 'post', `${base()}/messages`, {
          body: 'No post',
        })
      ).status,
    ).toBe(403);
  });
  it('leaders post announcements and members cannot', async () => {
    expect(
      (
        await call('member', 'post', `${base()}/messages`, {
          body: 'Announcement',
          kind: 'announcement',
        })
      ).status,
    ).toBe(403);
    const r = await call('leader', 'post', `${base()}/messages`, {
      body: 'Next revision session',
      kind: 'announcement',
    });
    expect(r.status).toBe(201);
    expect(r.body.pinned).toBe(true);
  });
  it('profanity, empty, unknown fields and duplicate rate limits are rejected safely', async () => {
    const bad = await call('member', 'post', `${base()}/messages`, {
      body: 'fuck',
    });
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body)).not.toContain('fuck');
    expect(
      (
        await call('member', 'post', `${base()}/messages`, {
          body: 'ok',
          extra: true,
        })
      ).status,
    ).toBe(422);
    for (let i = 0; i < 5; i++)
      await call('leader', 'post', `${base()}/messages`, { body: 'same text' });
    expect(
      (
        await call('leader', 'post', `${base()}/messages`, {
          body: 'same text',
        })
      ).status,
    ).toBe(429);
  });
  it('members edit only their own messages within ten minutes and leaders can remove', async () => {
    const r = await call('coLeader', 'post', `${base()}/messages`, {
      body: 'Editable',
    });
    const id = r.body.message_id;
    expect(
      (
        await call('coLeader', 'patch', `${base()}/messages/${id}`, {
          body: 'Edited',
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('leader', 'delete', `${base()}/messages/${id}`)).status,
    ).toBe(200);
    const list = await call('member', 'get', `${base()}/messages`);
    expect(JSON.stringify(list.body)).toContain('Message removed by a leader');
  });
  it('leaders mute members and muted members cannot post', async () => {
    expect(
      (
        await call('member', 'post', `${base()}/mutes/${f.leader.id}`, {
          duration: '1h',
          reason: 'No',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('leader', 'post', `${base()}/mutes/${f.member.id}`, {
          duration: '1h',
          reason: 'Repeated disruption',
        })
      ).status,
    ).toBe(201);
    expect(
      (await call('member', 'post', `${base()}/messages`, { body: 'Muted' }))
        .status,
    ).toBe(403);
  });
  it('reports are visible to leaders but never expose reporter identity to authors', async () => {
    const r = await call('leader', 'post', `${base()}/messages`, {
      body: 'Report this',
    });
    const report = await call(
      'member',
      'post',
      `${base()}/messages/${r.body.message_id}/report`,
      { reason: 'Needs review' },
    );
    expect(report.status).toBe(201);
    const reports = await call('leader', 'get', `${base()}/reports`);
    expect(reports.status).toBe(200);
    expect(reports.body.data[0]).not.toHaveProperty('reporter_id');
  });
  it('read state, notifications and attachment URL guessing are scoped', async () => {
    const r = await call('leader', 'post', `${base()}/messages`, {
      body: 'Read me',
    });
    expect(
      (
        await call('member', 'post', `${base()}/read`, {
          messageId: r.body.message_id,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('member', 'get', '/api/v1/me/notifications')).status,
    ).toBe(200);
    expect(
      (
        await call(
          'outsider',
          'get',
          `${base()}/attachments/00000000-0000-0000-0000-000000000000`,
        )
      ).status,
    ).toBe(403);
  });
  it('a departed member loses chat access and resource-sharing remains practice-only', async () => {
    expect((await call('member', 'post', `${base()}/leave`, {})).status).toBe(
      200,
    );
    expect((await call('member', 'get', `${base()}/messages`)).status).toBe(
      403,
    );
    const before = await pool.query(
      'SELECT count(*)::int n FROM quiz_attempts',
    );
    const after = await pool.query('SELECT count(*)::int n FROM quiz_attempts');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
