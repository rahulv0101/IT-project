// @ts-nocheck - Express and PostgreSQL values are checked at the route boundary.
import { z } from 'zod';
import { noProfanity, profanityMessage } from '../profanity/index.js';

export const studentNetworkRoutes = {
  'GET /api/v1/groups/:groupId/members': { auth: 'student' },
  'POST /api/v1/groups/:groupId/leadership': { auth: 'student' },
  'GET /api/v1/students': { auth: 'student' },
  'GET /api/v1/direct-conversations': { auth: 'student' },
  'POST /api/v1/direct-conversations': { auth: 'student' },
  'GET /api/v1/direct-conversations/:conversationId/messages': {
    auth: 'student',
  },
  'POST /api/v1/direct-conversations/:conversationId/messages': {
    auth: 'student',
  },
  'GET /api/v1/group-invitations': { auth: 'student' },
  'POST /api/v1/groups/:groupId/invitations': { auth: 'student' },
  'POST /api/v1/group-invitations/:invitationId/respond': { auth: 'student' },
};
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const messageSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .refine(
        (value) =>
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
        'Remove control characters.',
      )
      .refine(noProfanity(), { message: profanityMessage }),
  })
  .strict();

export function registerStudentNetworkRoutes({
  app,
  pool,
  requireAuth,
  error,
  requestId,
}) {
  const fail = (req, res, status, code, message) =>
    error(res, status, code, message, requestId(req));
  const parse = (schema, input, req, res) => {
    const r = schema.safeParse(input);
    if (r.success) return r.data;
    fail(
      req,
      res,
      422,
      'VALIDATION_ERROR',
      r.error.issues.some((x) => x.message === profanityMessage)
        ? profanityMessage
        : 'Please check the submitted fields.',
    );
    return null;
  };
  const student = (req, res, next) =>
    req.user.role === 'student'
      ? next()
      : fail(req, res, 403, 'FORBIDDEN', 'Student access is required.');
  const guards = [requireAuth, student];
  const conversation = async (req, res, db = pool) => {
    if (!parse(id, req.params.conversationId, req, res)) return null;
    const row = (
      await db.query(
        `SELECT c.*,u.user_id AS peer_id,u.full_name AS peer_name,u.account_status AS peer_status
      FROM direct_conversations c JOIN users u ON u.user_id=CASE WHEN c.student_one=$2 THEN c.student_two ELSE c.student_one END
      WHERE c.conversation_id=$1 AND $2 IN (c.student_one,c.student_two) ${db === pool ? '' : 'FOR UPDATE OF c'}`,
        [req.params.conversationId, req.user.userId],
      )
    ).rows[0];
    if (!row) fail(req, res, 404, 'NOT_FOUND', 'Conversation not found.');
    return row;
  };

  app.get('/api/v1/students', ...guards, async (req, res, next) => {
    try {
      const q = parse(
        page
          .extend({
            search: z.string().trim().max(100).default(''),
            moduleId: id.optional(),
          })
          .strict(),
        req.query,
        req,
        res,
      );
      if (!q) return;
      if (
        q.moduleId &&
        !(
          await pool.query(
            'SELECT 1 FROM enrollments WHERE student_id=$1 AND module_id=$2',
            [req.user.userId, q.moduleId],
          )
        ).rowCount
      )
        return fail(
          req,
          res,
          403,
          'FORBIDDEN',
          'Enrol in this module before browsing its students.',
        );
      const result = await pool.query(
        `SELECT u.user_id,u.full_name,u.first_name,u.last_name,u.student_type,u.student_year,count(*) OVER()::int total
        FROM users u WHERE u.role='student' AND u.account_status='active' AND u.user_id<>$1
        AND ($2='' OR u.full_name ILIKE '%'||$2||'%')
        AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=u.user_id AND e.module_id=$3))
        ORDER BY u.full_name,u.user_id LIMIT $4 OFFSET $5`,
        [
          req.user.userId,
          q.search,
          q.moduleId || null,
          q.pageSize,
          (q.page - 1) * q.pageSize,
        ],
      );
      res.set('Cache-Control', 'private, no-store').json({
        data: result.rows.map(({ total: _total, ...row }) => row),
        pagination: {
          page: q.page,
          pageSize: q.pageSize,
          total: result.rows[0]?.total || 0,
        },
      });
    } catch (e) {
      next(e);
    }
  });
  app.post(
    '/api/v1/direct-conversations',
    ...guards,
    async (req, res, next) => {
      try {
        const data = parse(
          z.object({ studentId: id }).strict(),
          req.body,
          req,
          res,
        );
        if (!data) return;
        if (data.studentId === req.user.userId)
          return fail(
            req,
            res,
            422,
            'INVALID_RECIPIENT',
            'Choose another student.',
          );
        const peer = await pool.query(
          "SELECT 1 FROM users WHERE user_id=$1 AND role='student' AND account_status='active'",
          [data.studentId],
        );
        if (!peer.rowCount)
          return fail(req, res, 404, 'NOT_FOUND', 'Student not found.');
        const pair = [req.user.userId, data.studentId].sort();
        const row = (
          await pool.query(
            `INSERT INTO direct_conversations(student_one,student_two) VALUES($1,$2)
        ON CONFLICT(student_one,student_two) DO UPDATE SET student_one=EXCLUDED.student_one RETURNING conversation_id`,
            pair,
          )
        ).rows[0];
        res.status(201).json({ conversation: row });
      } catch (e) {
        next(e);
      }
    },
  );
  app.get('/api/v1/direct-conversations', ...guards, async (req, res, next) => {
    try {
      const q = parse(page.strict(), req.query, req, res);
      if (!q) return;
      const rows = await pool.query(
        `SELECT c.conversation_id,c.updated_at,u.user_id AS peer_id,u.full_name AS peer_name,u.account_status AS peer_status,
        (SELECT body FROM direct_messages d WHERE d.conversation_id=c.conversation_id ORDER BY d.message_order DESC LIMIT 1) AS last_message,
        (SELECT count(*)::int FROM direct_messages d WHERE d.conversation_id=c.conversation_id AND d.sender_id<>$1 AND d.read_at IS NULL) AS unread_count,
        count(*) OVER()::int total
        FROM direct_conversations c JOIN users u ON u.user_id=CASE WHEN c.student_one=$1 THEN c.student_two ELSE c.student_one END
        WHERE $1 IN(c.student_one,c.student_two) ORDER BY c.updated_at DESC,c.conversation_id LIMIT $2 OFFSET $3`,
        [req.user.userId, q.pageSize, (q.page - 1) * q.pageSize],
      );
      res.set('Cache-Control', 'private, no-store').json({
        data: rows.rows.map(({ total: _total, ...row }) => row),
        pagination: {
          page: q.page,
          pageSize: q.pageSize,
          total: rows.rows[0]?.total || 0,
        },
      });
    } catch (e) {
      next(e);
    }
  });
  app.get(
    '/api/v1/direct-conversations/:conversationId/messages',
    ...guards,
    async (req, res, next) => {
      try {
        const q = parse(
          z
            .object({
              after: id.optional(),
              before: id.optional(),
              pageSize: z.coerce.number().int().min(1).max(50).default(50),
            })
            .strict()
            .refine((x) => !(x.after && x.before)),
          req.query,
          req,
          res,
        );
        if (!q) return;
        const c = await conversation(req, res);
        if (!c) return;
        const cursor = q.after || q.before;
        if (
          cursor &&
          !(
            await pool.query(
              'SELECT 1 FROM direct_messages WHERE message_id=$1 AND conversation_id=$2',
              [cursor, c.conversation_id],
            )
          ).rowCount
        )
          return fail(
            req,
            res,
            422,
            'INVALID_CURSOR',
            'Refresh this conversation and try again.',
          );
        const rows = await pool.query(
          `SELECT d.message_id,d.message_order,d.sender_id,u.full_name AS sender_name,d.body,d.created_at,d.read_at
        FROM direct_messages d JOIN users u ON u.user_id=d.sender_id WHERE d.conversation_id=$1
        ${cursor ? `AND d.message_order ${q.after ? '>' : '<'} (SELECT message_order FROM direct_messages WHERE message_id=$2)` : ''}
        ORDER BY d.message_order ${q.after ? 'ASC' : 'DESC'} LIMIT $${cursor ? 3 : 2}`,
          cursor
            ? [c.conversation_id, cursor, q.pageSize]
            : [c.conversation_id, q.pageSize],
        );
        const data = q.after ? rows.rows : rows.rows.reverse();
        if (data.length)
          await pool.query(
            'UPDATE direct_messages SET read_at=COALESCE(read_at,now()) WHERE message_id=ANY($1::uuid[]) AND sender_id<>$2',
            [data.map((x) => x.message_id), req.user.userId],
          );
        res.set('Cache-Control', 'private, no-store').json({
          data,
          conversation: {
            conversation_id: c.conversation_id,
            peer_id: c.peer_id,
            peer_name: c.peer_name,
            peer_status: c.peer_status,
          },
          hasMore: rows.rowCount === q.pageSize,
        });
      } catch (e) {
        next(e);
      }
    },
  );
  app.post(
    '/api/v1/direct-conversations/:conversationId/messages',
    ...guards,
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const data = parse(messageSchema, req.body, req, res);
        if (!data) return;
        await client.query('BEGIN');
        const c = await conversation(req, res, client);
        if (!c) {
          await client.query('ROLLBACK');
          return;
        }
        if (c.peer_status !== 'active') {
          await client.query('ROLLBACK');
          return fail(
            req,
            res,
            409,
            'RECIPIENT_UNAVAILABLE',
            'This student is no longer available for messages.',
          );
        }
        const participants = await client.query(
          'SELECT user_id,account_status FROM users WHERE user_id=ANY($1::uuid[]) ORDER BY user_id FOR UPDATE',
          [[req.user.userId, c.peer_id]],
        );
        if (
          participants.rows.find((u) => u.user_id === req.user.userId)
            ?.account_status !== 'active'
        ) {
          await client.query('ROLLBACK');
          return fail(req, res, 401, 'UNAUTHORIZED', 'Please sign in again.');
        }
        if (
          participants.rows.find((u) => u.user_id === c.peer_id)
            ?.account_status !== 'active'
        ) {
          await client.query('ROLLBACK');
          return fail(
            req,
            res,
            409,
            'RECIPIENT_UNAVAILABLE',
            'This student is no longer available for messages.',
          );
        }
        const recent = (
          await client.query(
            "SELECT count(*)::int n FROM direct_messages WHERE sender_id=$1 AND created_at>now()-interval '1 minute'",
            [req.user.userId],
          )
        ).rows[0].n;
        if (recent >= 30) {
          await client.query('ROLLBACK');
          return fail(
            req,
            res,
            429,
            'MESSAGE_LIMIT',
            'Please wait a minute before sending more messages.',
          );
        }
        const sent = (
          await client.query(
            'INSERT INTO direct_messages(conversation_id,sender_id,body,message_order) SELECT $1,$2,$3,COALESCE(MAX(message_order),0)+1 FROM direct_messages WHERE conversation_id=$1 RETURNING message_id,message_order,sender_id,body,created_at',
            [c.conversation_id, req.user.userId, data.body],
          )
        ).rows[0];
        await client.query(
          'UPDATE direct_conversations SET updated_at=clock_timestamp() WHERE conversation_id=$1',
          [c.conversation_id],
        );
        await client.query('COMMIT');
        res.status(201).json({ message: sent });
      } catch (e) {
        await client.query('ROLLBACK');
        next(e);
      } finally {
        client.release();
      }
    },
  );
  app.get('/api/v1/group-invitations', ...guards, async (req, res, next) => {
    try {
      const q = parse(page.strict(), req.query, req, res);
      if (!q) return;
      const rows = await pool.query(
        `SELECT i.invitation_id,i.group_id,i.created_at,g.group_name,g.module_id,m.module_code,m.module_name,u.full_name AS inviter_name,count(*) OVER()::int total
        FROM group_invitations i JOIN study_groups g USING(group_id) JOIN modules m USING(module_id) JOIN users u ON u.user_id=i.inviter_id
        WHERE i.invitee_id=$1 AND i.status='pending' AND u.account_status='active' AND EXISTS(SELECT 1 FROM group_members alive WHERE alive.group_id=i.group_id AND alive.student_id=i.inviter_id) ORDER BY i.created_at DESC,i.invitation_id LIMIT $2 OFFSET $3`,
        [req.user.userId, q.pageSize, (q.page - 1) * q.pageSize],
      );
      res.set('Cache-Control', 'private, no-store').json({
        data: rows.rows.map(({ total: _total, ...row }) => row),
        pagination: {
          page: q.page,
          pageSize: q.pageSize,
          total: rows.rows[0]?.total || 0,
        },
      });
    } catch (e) {
      next(e);
    }
  });
  app.post(
    '/api/v1/groups/:groupId/invitations',
    ...guards,
    async (req, res, next) => {
      try {
        if (!parse(id, req.params.groupId, req, res)) return;
        const data = parse(
          z.object({ studentId: id }).strict(),
          req.body,
          req,
          res,
        );
        if (!data) return;
        if (data.studentId === req.user.userId)
          return fail(
            req,
            res,
            422,
            'INVALID_RECIPIENT',
            'Choose another student.',
          );
        const g = (
          await pool.query(
            'SELECT g.module_id FROM study_groups g JOIN group_members gm USING(group_id) WHERE g.group_id=$1 AND gm.student_id=$2',
            [req.params.groupId, req.user.userId],
          )
        ).rows[0];
        if (!g)
          return fail(
            req,
            res,
            404,
            'NOT_FOUND',
            'Join this group before inviting students.',
          );
        const eligible = await pool.query(
          "SELECT 1 FROM enrollments e JOIN users u ON u.user_id=e.student_id WHERE e.student_id=$1 AND e.module_id=$2 AND u.role='student' AND u.account_status='active'",
          [data.studentId, g.module_id],
        );
        if (!eligible.rowCount)
          return fail(
            req,
            res,
            422,
            'NOT_ENROLLED',
            'The student must be enrolled in this module first.',
          );
        if (
          (
            await pool.query(
              'SELECT 1 FROM group_members WHERE group_id=$1 AND student_id=$2',
              [req.params.groupId, data.studentId],
            )
          ).rowCount
        )
          return fail(
            req,
            res,
            409,
            'ALREADY_MEMBER',
            'This student is already in the group.',
          );
        const row = (
          await pool.query(
            `INSERT INTO group_invitations(group_id,inviter_id,invitee_id) VALUES($1,$2,$3)
        ON CONFLICT(group_id,invitee_id) WHERE status='pending' DO NOTHING RETURNING invitation_id`,
            [req.params.groupId, req.user.userId, data.studentId],
          )
        ).rows[0];
        if (!row)
          return fail(
            req,
            res,
            409,
            'ALREADY_INVITED',
            'An invitation is already pending for this student.',
          );
        res.status(201).json({ invitation: row });
      } catch (e) {
        next(e);
      }
    },
  );
  app.post(
    '/api/v1/group-invitations/:invitationId/respond',
    ...guards,
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        if (!parse(id, req.params.invitationId, req, res)) return;
        const data = parse(
          z.object({ accept: z.boolean() }).strict(),
          req.body,
          req,
          res,
        );
        if (!data) return;
        await client.query('BEGIN');
        const row = (
          await client.query(
            'SELECT * FROM group_invitations WHERE invitation_id=$1 AND invitee_id=$2 FOR UPDATE',
            [req.params.invitationId, req.user.userId],
          )
        ).rows[0];
        if (!row) {
          await client.query('ROLLBACK');
          return fail(req, res, 404, 'NOT_FOUND', 'Invitation not found.');
        }
        if (row.status !== 'pending') {
          await client.query('ROLLBACK');
          return fail(
            req,
            res,
            409,
            'ALREADY_RESPONDED',
            'This invitation has already been answered.',
          );
        }
        if (data.accept) {
          const eligible = await client.query(
            `SELECT 1 FROM study_groups g JOIN enrollments e ON e.module_id=g.module_id AND e.student_id=$2
          JOIN group_members gm ON gm.group_id=g.group_id AND gm.student_id=$3 JOIN users inviter ON inviter.user_id=gm.student_id AND inviter.account_status='active' WHERE g.group_id=$1`,
            [row.group_id, req.user.userId, row.inviter_id],
          );
          if (!eligible.rowCount) {
            await client.query('ROLLBACK');
            return fail(
              req,
              res,
              409,
              'INVITATION_UNAVAILABLE',
              'The invitation is no longer available. Check your module enrolment or ask for a new invitation.',
            );
          }
          await client.query(
            'INSERT INTO group_members(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [row.group_id, req.user.userId],
          );
        }
        await client.query(
          'UPDATE group_invitations SET status=$2,responded_at=now() WHERE invitation_id=$1',
          [row.invitation_id, data.accept ? 'accepted' : 'declined'],
        );
        await client.query('COMMIT');
        res.json({ joined: data.accept, groupId: row.group_id });
      } catch (e) {
        await client.query('ROLLBACK');
        next(e);
      } finally {
        client.release();
      }
    },
  );
  app.get(
    '/api/v1/groups/:groupId/members',
    ...guards,
    async (req, res, next) => {
      try {
        if (!parse(id, req.params.groupId, req, res)) return;
        if (!parse(z.object({}).strict(), req.query, req, res)) return;
        if (
          !(
            await pool.query(
              'SELECT 1 FROM group_members WHERE group_id=$1 AND student_id=$2',
              [req.params.groupId, req.user.userId],
            )
          ).rowCount
        )
          return fail(req, res, 404, 'NOT_FOUND', 'Study group not found.');
        const rows = await pool.query(
          `SELECT u.user_id,u.full_name,gl.role FROM group_members gm JOIN users u ON u.user_id=gm.student_id
        LEFT JOIN group_leaders gl ON gl.group_id=gm.group_id AND gl.student_id=gm.student_id
        WHERE gm.group_id=$1 AND u.account_status='active' ORDER BY CASE gl.role WHEN 'leader' THEN 0 WHEN 'co-leader' THEN 1 ELSE 2 END,u.full_name,u.user_id`,
          [req.params.groupId],
        );
        res.set('Cache-Control', 'private, no-store').json({ data: rows.rows });
      } catch (e) {
        next(e);
      }
    },
  );
  app.post(
    '/api/v1/groups/:groupId/leadership',
    ...guards,
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        if (!parse(id, req.params.groupId, req, res)) return;
        const data = parse(
          z.object({ studentId: id }).strict(),
          req.body,
          req,
          res,
        );
        if (!data) return;
        if (data.studentId === req.user.userId)
          return fail(
            req,
            res,
            422,
            'INVALID_SUCCESSOR',
            'Choose another group member.',
          );
        await client.query('BEGIN');
        await client.query(
          'SELECT group_id FROM study_groups WHERE group_id=$1 FOR UPDATE',
          [req.params.groupId],
        );
        if (
          !(
            await client.query(
              "SELECT 1 FROM group_leaders WHERE group_id=$1 AND student_id=$2 AND role='leader'",
              [req.params.groupId, req.user.userId],
            )
          ).rowCount
        ) {
          await client.query('ROLLBACK');
          return fail(
            req,
            res,
            403,
            'FORBIDDEN',
            'Only the current group leader can transfer leadership.',
          );
        }
        if (
          !(
            await client.query(
              "SELECT 1 FROM group_members gm JOIN users u ON u.user_id=gm.student_id WHERE gm.group_id=$1 AND gm.student_id=$2 AND u.account_status='active'",
              [req.params.groupId, data.studentId],
            )
          ).rowCount
        ) {
          await client.query('ROLLBACK');
          return fail(
            req,
            res,
            422,
            'INVALID_SUCCESSOR',
            'Choose an active member of this group.',
          );
        }
        await client.query(
          "DELETE FROM group_leaders WHERE group_id=$1 AND student_id=$2 AND role='co-leader'",
          [req.params.groupId, data.studentId],
        );
        await client.query(
          "UPDATE group_leaders SET student_id=$3 WHERE group_id=$1 AND student_id=$2 AND role='leader'",
          [req.params.groupId, req.user.userId, data.studentId],
        );
        await client.query(
          "INSERT INTO group_leaders(group_id,student_id,role) VALUES($1,$2,'co-leader')",
          [req.params.groupId, req.user.userId],
        );
        await client.query('COMMIT');
        res.json({ transferred: true });
      } catch (e) {
        await client.query('ROLLBACK');
        next(e);
      } finally {
        client.release();
      }
    },
  );
}
