// @ts-nocheck
import request from 'supertest';
import { beforeAll, describe, it, expect } from 'vitest';
import { sessionFixture, validSession } from './helpers/session-cases.js';
import { generateSessionReminders } from '../src/groups/sessions.js';
process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');
describe('study session invariants', () => {
  let f;
  beforeAll(async () => {
    f = await sessionFixture(pool);
  });
  const call = (role, method, url, body) => {
    const agent = request(app);
    return agent[method](url)
      .set('Cookie', f[role].cookie)
      .send(body || {});
  };
  const create = async (data = {}) => {
    const r = await call('leader', 'post', f.base, {
      ...validSession(),
      ...data,
    });
    expect(r.status).toBe(201);
    return r.body;
  };
  it('generates twelve individually editable weeks and reports group clashes', async () => {
    const result = await create({ weeks: 12 });
    expect(result.sessions).toHaveLength(12);
    expect(
      Date.parse(result.sessions[1].starts_at) -
        Date.parse(result.sessions[0].starts_at),
    ).toBe(604800000);
    expect((await create()).warnings.length).toBeGreaterThan(0);
  });
  it('refuses past starts, durations over eight hours, unsafe URLs and foreign resources', async () => {
    for (const data of [
      { startsAt: '2000-01-01T00:00:00Z' },
      { endsAt: new Date(Date.now() + 50 * 3600000).toISOString() },
      { mode: 'online', location: 'http://example.com' },
      { location: 'javascript:alert(1)' },
      { resourceIds: ['00000000-0000-0000-0000-000000000000'] },
    ]) {
      const r = await call('leader', 'post', f.base, {
        ...validSession(),
        ...data,
      });
      expect(r.status).toBe(422);
      expect(r.body.error.message).toBeTruthy();
    }
  });
  it('allows co-leaders and module lecturer reads but no lecturer edits or RSVP', async () => {
    const r = await call('coLeader', 'post', f.base, validSession());
    expect(r.status).toBe(201);
    const id = r.body.sessions[0].session_id;
    expect((await call('lecturer', 'get', `${f.base}/${id}`)).status).toBe(200);
    expect(
      (await call('lecturer', 'patch', `${f.base}/${id}`, validSession()))
        .status,
    ).toBe(403);
  });
  it('shows RSVP counts to members and names only to leaders', async () => {
    const s = (await create()).sessions[0];
    expect(
      (
        await call('member', 'put', `${f.base}/${s.session_id}/rsvp`, {
          response: 'maybe',
        })
      ).status,
    ).toBe(200);
    const member = await call('member', 'get', `${f.base}/${s.session_id}`);
    expect(member.body.counts).toEqual([{ response: 'maybe', count: 1 }]);
    expect(member.body).not.toHaveProperty('names');
    const leader = await call('leader', 'get', `${f.base}/${s.session_id}`);
    expect(leader.body.names).toEqual([
      { full_name: 'Study member', response: 'maybe' },
    ]);
    const lecturer = await call('lecturer', 'get', `${f.base}/${s.session_id}`);
    expect(lecturer.body).not.toHaveProperty('names');
  });
  it('cancels visibly with a reason and refuses further RSVPs', async () => {
    const s = (await create()).sessions[0];
    expect(
      (
        await call('leader', 'post', `${f.base}/${s.session_id}/cancel`, {
          reason: '',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call('leader', 'post', `${f.base}/${s.session_id}/cancel`, {
          reason: 'Room unavailable',
        })
      ).body.session.status,
    ).toBe('cancelled');
    expect(
      (await call('member', 'get', f.base)).body.data.some(
        (x) =>
          x.session_id === s.session_id &&
          x.cancel_reason === 'Room unavailable',
      ),
    ).toBe(true);
    expect(
      (
        await call('member', 'put', `${f.base}/${s.session_id}/rsvp`, {
          response: 'going',
        })
      ).status,
    ).toBe(422);
  });
  it('creates each reminder once across repeated worker passes and skips cancelled sessions', async () => {
    const s = (
      await create({
        startsAt: new Date(Date.now() + 1800000).toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
      })
    ).sessions[0];
    await call('member', 'put', `${f.base}/${s.session_id}/rsvp`, {
      response: 'going',
    });
    await generateSessionReminders(pool);
    await generateSessionReminders(pool);
    const r = await pool.query(
      "SELECT kind FROM notifications WHERE session_id=$1 AND user_id=$2 AND kind LIKE 'reminder%' ORDER BY kind",
      [s.session_id, f.member.id],
    );
    expect(r.rows.map((x) => x.kind)).toEqual(['reminder_1h', 'reminder_24h']);
  });
  it('refuses a real foreign-module preparation resource and a resource for another group', async () => {
    const other = await sessionFixture(pool);
    expect(
      (
        await call('leader', 'post', f.base, {
          ...validSession(),
          resourceIds: [other.resourceId],
        })
      ).status,
    ).toBe(422);
    const hidden = (
      await pool.query(
        "INSERT INTO study_groups(module_id,created_by,group_name) VALUES($1,$2,'Private revision') RETURNING group_id",
        [f.moduleId, f.leader.id],
      )
    ).rows[0].group_id;
    await pool.query('UPDATE resources SET group_id=$1 WHERE resource_id=$2', [
      hidden,
      f.resourceId,
    ]);
    expect(
      (
        await call('leader', 'post', f.base, {
          ...validSession(),
          resourceIds: [f.resourceId],
        })
      ).status,
    ).toBe(422);
    await pool.query(
      'UPDATE resources SET group_id=NULL WHERE resource_id=$1',
      [f.resourceId],
    );
  });
  it('warns about another going session across groups without blocking an RSVP', async () => {
    const other = await sessionFixture(pool);
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [f.member.id, other.moduleId],
    );
    await pool.query(
      'INSERT INTO group_members(group_id,student_id) VALUES($1,$2)',
      [other.groupId, f.member.id],
    );
    const first = (
      await request(app)
        .post(other.base)
        .set('Cookie', other.leader.cookie)
        .send(validSession())
    ).body.sessions[0];
    expect(
      (
        await call('member', 'put', `${other.base}/${first.session_id}/rsvp`, {
          response: 'going',
        })
      ).status,
    ).toBe(200);
    const second = (await create()).sessions[0];
    const result = await call(
      'member',
      'put',
      `${f.base}/${second.session_id}/rsvp`,
      { response: 'going' },
    );
    expect(result.status).toBe(200);
    expect(
      result.body.warnings.some((w) => w.session_id === first.session_id),
    ).toBe(true);
  });
  it('links next-up updates only to sessions in that group', async () => {
    const s = (await create()).sessions[0];
    const linked = await call(
      'leader',
      'post',
      `/api/v1/groups/${f.groupId}/updates`,
      { kind: 'next_up', text: 'Next revision', sessionId: s.session_id },
    );
    expect(linked.status).toBe(201);
    expect(linked.body.update.session_id).toBe(s.session_id);
    const invalid = await call(
      'leader',
      'post',
      `/api/v1/groups/${f.groupId}/updates`,
      {
        kind: 'next_up',
        text: 'Next revision',
        sessionId: '00000000-0000-0000-0000-000000000000',
      },
    );
    expect(invalid.status).toBe(422);
  });
  it('database rejects invalid times, cancellation without reason and invisible preparation links', async () => {
    const s = (await create()).sessions[0];
    await expect(
      pool.query(
        'UPDATE group_sessions SET ends_at=starts_at WHERE session_id=$1',
        [s.session_id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        "UPDATE group_sessions SET status='cancelled',cancel_reason=NULL WHERE session_id=$1",
        [s.session_id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const other = await sessionFixture(pool);
    await expect(
      pool.query('INSERT INTO session_preparation_resources VALUES($1,$2)', [
        s.session_id,
        other.resourceId,
      ]),
    ).rejects.toBeTruthy();
  });
  it('removes RSVPs and access when a student leaves the group', async () => {
    const s = (await create()).sessions[0];
    await call('member', 'put', `${f.base}/${s.session_id}/rsvp`, {
      response: 'going',
    });
    expect(
      (await call('member', 'post', `/api/v1/groups/${f.groupId}/leave`))
        .status,
    ).toBe(200);
    expect(
      (await call('member', 'get', `${f.base}/${s.session_id}`)).status,
    ).toBe(403);
    expect(
      (
        await pool.query(
          'SELECT r.* FROM session_rsvps r JOIN group_sessions s USING(session_id) WHERE r.student_id=$1 AND s.group_id=$2',
          [f.member.id, f.groupId],
        )
      ).rowCount,
    ).toBe(0);
  });
});
