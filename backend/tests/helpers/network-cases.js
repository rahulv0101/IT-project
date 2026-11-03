// @ts-nocheck
import request from 'supertest';
import { expect } from 'vitest';
import { studentNetworkRoutes } from '../../src/groups/student-network.js';
import { sessionFixture } from './session-cases.js';
export const networkRouteSpecs = Object.fromEntries(
  Object.keys(studentNetworkRoutes).map((r) => [
    r,
    [r.split(' ')[1], 'student'],
  ]),
);
export async function assertNetworkRoute(route, app, pool) {
  const f = await sessionFixture(pool);
  await pool.query(
    'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
    [f.outsider.id, f.moduleId],
  );
  const call = (role, method, url, body = {}) => {
    let r = request(app)[method](url);
    if (role) r = r.set('Cookie', f[role]?.cookie || role);
    return method === 'get' ? r.query(body) : r.send(body);
  };
  const c = await call('leader', 'post', '/api/v1/direct-conversations', {
    studentId: f.member.id,
  });
  expect(c.status).toBe(201);
  const i = await call(
    'leader',
    'post',
    `/api/v1/groups/${f.groupId}/invitations`,
    { studentId: f.outsider.id },
  );
  expect(i.status).toBe(201);
  const [method, template] = route.split(' ');
  const verb = method.toLowerCase();
  const url = template
    .replace(':conversationId', c.body.conversation.conversation_id)
    .replace(':groupId', f.groupId)
    .replace(':invitationId', i.body.invitation.invitation_id);
  let body = {};
  if (
    route === 'POST /api/v1/direct-conversations' ||
    route.endsWith('/leadership')
  )
    body = { studentId: f.member.id };
  if (route.endsWith('/invitations')) body = { studentId: f.outsider.id };
  if (route === 'POST /api/v1/direct-conversations/:conversationId/messages')
    body = { body: 'Matrix private message' };
  if (route.endsWith('/respond')) body = { accept: true };
  const role = route.endsWith('/respond') ? 'outsider' : 'leader';
  expect((await call(null, verb, url, body)).status).toBe(401);
  expect((await call('eduquest_session=revoked', verb, url, body)).status).toBe(
    401,
  );
  expect((await call('lecturer', verb, url, body)).status).toBe(403);
  expect(
    (await call(role, verb, url, { ...body, unexpected: true })).status,
  ).toBe(422);
  if (route.endsWith('/invitations'))
    await pool.query('DELETE FROM group_invitations WHERE invitation_id=$1', [
      i.body.invitation.invitation_id,
    ]);
  const ok = await call(role, verb, url, body);
  expect(ok.status, JSON.stringify(ok.body)).toBeGreaterThanOrEqual(200);
  expect(ok.status).toBeLessThan(300);
  expect(JSON.stringify(ok.body)).not.toMatch(
    /password_hash|token_hash|encrypted_secret|@example.com/,
  );
}
