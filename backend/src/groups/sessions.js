// @ts-nocheck
import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { resourceYearScope } from '../resource-visibility.js';
import { readUpload } from '../file-storage.js';
import { containsProfanity } from '../profanity/index.js';

const text = (max, required = false) =>
  z
    .string()
    .trim()
    .min(required ? 1 : 0)
    .max(max)
    .refine(
      (v) =>
        !containsProfanity(v) &&
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
      "That text isn't allowed. Please choose different wording.",
    );
export const sessionSchema = z
  .object({
    title: text(120, true),
    topic: text(200, true),
    topicRef: z.string().uuid().nullable().default(null),
    description: text(2000).default(''),
    preparationNotes: text(2000).default(''),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    mode: z.enum(['in_person', 'online']),
    location: text(500, true),
    resourceIds: z.array(z.string().uuid()).max(20).default([]),
    weeks: z.number().int().min(1).max(12).default(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    const duration = Date.parse(v.endsAt) - Date.parse(v.startsAt);
    if (duration <= 0 || duration > 8 * 3600000)
      ctx.addIssue({
        code: 'custom',
        message: 'Sessions must last more than zero and at most eight hours.',
      });
    const looksLikeUrl = /^[a-z][a-z0-9+.-]*:/i.test(v.location);
    if (v.mode === 'online' || looksLikeUrl) {
      try {
        const u = new URL(v.location);
        if (u.protocol !== 'https:' || u.username || u.password) throw Error();
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'Online locations must be HTTPS links.',
        });
      }
    }
  });
const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export function calendarIcs(sessions, now = new Date()) {
  const escape = (v) =>
    String(v ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  const date = (v) =>
    new Date(v)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EduQuest//Study sessions//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const s of sessions)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.session_id}@eduquest.local`,
      `DTSTAMP:${date(now)}`,
      `DTSTART:${date(s.starts_at)}`,
      `DTEND:${date(s.ends_at)}`,
      `SUMMARY:${escape(s.title)}`,
      `DESCRIPTION:${escape([s.topic, s.description, s.preparation_notes, s.cancel_reason].filter(Boolean).join('\n'))}`,
      `LOCATION:${escape(s.location)}`,
      `STATUS:${s.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  lines.push('END:VCALENDAR');
  return (
    lines
      .map((line) => {
        let result = '',
          part = '';
        for (const char of line) {
          if (Buffer.byteLength(part + char) > 73) {
            result += part + '\r\n ';
            part = '';
          }
          part += char;
        }
        return result + part;
      })
      .join('\r\n') + '\r\n'
  );
}
export async function generateSessionReminders(db, now = new Date()) {
  let count = 0;
  for (const [kind, hours] of [
    ['reminder_24h', 24],
    ['reminder_1h', 1],
  ]) {
    const result = await db.query(
      `INSERT INTO notifications(user_id,session_id,kind,payload,dedup_key)
      SELECT r.student_id,s.session_id,$2,jsonb_build_object('title',s.title,'groupId',s.group_id,'startsAt',s.starts_at),s.session_id::text||':'||$2||':'||s.starts_at::text
      FROM group_sessions s JOIN session_rsvps r USING(session_id) JOIN group_members gm ON gm.group_id=s.group_id AND gm.student_id=r.student_id
      WHERE s.status='scheduled' AND r.response IN ('going','maybe') AND s.starts_at>$1 AND s.starts_at<=$1::timestamptz+($3::int*interval '1 hour')
      ON CONFLICT(user_id,dedup_key) DO NOTHING`,
      [now, kind, hours],
    );
    count += result.rowCount;
  }
  return count;
}
export function registerSessionRoutes({
  app,
  pool,
  requireAuth,
  error,
  requestId,
}) {
  const fail = (req, res, status, message) =>
    error(
      res,
      status,
      status === 422 ? 'VALIDATION_ERROR' : 'FORBIDDEN',
      message,
      requestId(req),
    );
  const parse = (schema, value, req, res) => {
    const p = schema.safeParse(value);
    if (!p.success) {
      fail(req, res, 422, 'Please check the submitted fields.');
      return null;
    }
    return p.data;
  };
  const authorize = async (db, req, res, write = false) => {
    if (!z.string().uuid().safeParse(req.params.groupId).success) {
      fail(req, res, 422, 'Please check the group.');
      return null;
    }
    const g = (
      await db.query(
        `SELECT g.*,m.lecturer_id,EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=g.group_id AND gm.student_id=$2) member,EXISTS(SELECT 1 FROM group_leaders gl WHERE gl.group_id=g.group_id AND gl.student_id=$2) leader FROM study_groups g JOIN modules m USING(module_id) WHERE g.group_id=$1`,
        [req.params.groupId, req.user.userId],
      )
    ).rows[0];
    if (
      !g ||
      !(
        g.member ||
        (req.user.role === 'lecturer' && g.lecturer_id === req.user.userId)
      ) ||
      (write && (!g.member || !g.leader || req.user.role !== 'student'))
    ) {
      fail(req, res, 403, 'You do not have access to this group action.');
      return null;
    }
    return g;
  };
  const session = async (db, req, res) => {
    if (!z.string().uuid().safeParse(req.params.sessionId).success) {
      fail(req, res, 422, 'Please check the session.');
      return null;
    }
    const s = (
      await db.query(
        'SELECT * FROM group_sessions WHERE session_id=$1 AND group_id=$2',
        [req.params.sessionId, req.params.groupId],
      )
    ).rows[0];
    if (!s) {
      fail(req, res, 403, 'You do not have access to this session.');
      return null;
    }
    return s;
  };
  const notify = async (db, s, kind) =>
    db.query(
      `INSERT INTO notifications(user_id,session_id,kind,payload,dedup_key) SELECT student_id,$2,$3,jsonb_build_object('title',$4::text,'groupId',$1::uuid,'startsAt',$5::timestamptz),$6 FROM group_members WHERE group_id=$1 ON CONFLICT DO NOTHING`,
      [
        s.group_id,
        s.session_id,
        kind,
        s.title,
        s.starts_at,
        crypto.randomUUID(),
      ],
    );
  const clashes = async (db, s, userId) =>
    (
      await db.query(
        `SELECT s.session_id,s.title,s.starts_at,s.ends_at FROM group_sessions s WHERE s.status='scheduled' AND s.session_id<>$1 AND s.starts_at<$3 AND s.ends_at>$2 AND (s.group_id=$4 OR EXISTS(SELECT 1 FROM session_rsvps r WHERE r.session_id=s.session_id AND r.student_id=$5 AND r.response='going'))`,
        [s.session_id, s.starts_at, s.ends_at, s.group_id, userId],
      )
    ).rows;
  const scope = async (db, g, data, req, res) => {
    if (
      data.topicRef &&
      !(
        await db.query(
          'SELECT 1 FROM topics WHERE topic_id=$1 AND module_id=$2',
          [data.topicRef, g.module_id],
        )
      ).rowCount
    ) {
      fail(req, res, 422, 'Choose a topic from this module.');
      return false;
    }
    const ids = [...new Set(data.resourceIds)];
    if (
      ids.length &&
      (
        await db.query(
          `SELECT resource_id FROM resources r WHERE resource_id=ANY($1::uuid[]) AND module_id=$2 AND (group_id IS NULL OR group_id=$3) AND ${resourceYearScope('r', '$4')}`,
          [ids, g.module_id, g.group_id, req.user.userId],
        )
      ).rowCount !== ids.length
    ) {
      fail(
        req,
        res,
        422,
        'Preparation resources must be visible to this group in its module.',
      );
      return false;
    }
    return true;
  };
  const writeSession = async (req, res, next, operation) => {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const g = await authorize(db, req, res, true);
      if (!g) return;
      await db.query(
        'SELECT group_id FROM study_groups WHERE group_id=$1 FOR UPDATE',
        [g.group_id],
      );
      if (!(await authorize(db, req, res, true))) return;
      let old = null;
      if (operation !== 'create') {
        old = await session(db, req, res);
        if (!old) return;
      }
      if (operation === 'cancel') {
        const data = parse(
          z.object({ reason: text(500, true) }).strict(),
          req.body,
          req,
          res,
        );
        if (!data) return;
        const s = (
          await db.query(
            "UPDATE group_sessions SET status='cancelled',cancel_reason=$1,updated_at=now() WHERE session_id=$2 RETURNING *",
            [data.reason, old.session_id],
          )
        ).rows[0];
        await notify(db, s, 'cancelled');
        await db.query('COMMIT');
        return res.json({ session: s });
      }
      let input = req.body;
      if (operation === 'duplicate') {
        const dates = parse(
          z
            .object({
              startsAt: z.string().datetime({ offset: true }),
              endsAt: z.string().datetime({ offset: true }),
            })
            .strict(),
          req.body,
          req,
          res,
        );
        if (!dates) return;
        input = {
          title: old.title,
          topic: old.topic,
          topicRef: old.topic_ref,
          description: old.description,
          preparationNotes: old.preparation_notes,
          mode: old.mode,
          location: old.location,
          ...dates,
          resourceIds: (
            await db.query(
              'SELECT resource_id FROM session_preparation_resources WHERE session_id=$1',
              [old.session_id],
            )
          ).rows.map((r) => r.resource_id),
        };
      }
      const data = parse(sessionSchema, input, req, res);
      if (!data) return;
      if (Date.parse(data.startsAt) <= Date.now()) {
        fail(req, res, 422, 'Choose a future start time.');
        return;
      }
      if (operation === 'edit' && data.weeks !== 1) {
        fail(req, res, 422, 'Edit recurring sessions individually.');
        return;
      }
      if (!(await scope(db, g, data, req, res))) return;
      const result = [];
      const warnings = [];
      for (let week = 0; week < data.weeks; week++) {
        const values = [
          g.group_id,
          req.user.userId,
          data.title,
          data.topic,
          data.topicRef,
          data.description,
          data.preparationNotes,
          new Date(Date.parse(data.startsAt) + week * 604800000),
          new Date(Date.parse(data.endsAt) + week * 604800000),
          data.mode,
          data.location,
        ];
        const s = (
          await db.query(
            operation === 'edit'
              ? `UPDATE group_sessions SET title=$3,topic=$4,topic_ref=$5,description=$6,preparation_notes=$7,starts_at=$8,ends_at=$9,mode=$10,location=$11,updated_at=now() WHERE group_id=$1 AND created_by IS NOT NULL AND $2::uuid IS NOT NULL AND session_id=$12 RETURNING *`
              : `INSERT INTO group_sessions(group_id,created_by,title,topic,topic_ref,description,preparation_notes,starts_at,ends_at,mode,location) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            operation === 'edit' ? [...values, old.session_id] : values,
          )
        ).rows[0];
        await db.query(
          'DELETE FROM session_preparation_resources WHERE session_id=$1',
          [s.session_id],
        );
        for (const id of new Set(data.resourceIds))
          await db.query(
            'INSERT INTO session_preparation_resources VALUES($1,$2)',
            [s.session_id, id],
          );
        warnings.push(...(await clashes(db, s, req.user.userId)));
        await notify(db, s, operation === 'edit' ? 'changed' : 'created');
        result.push(s);
      }
      await db.query('COMMIT');
      res
        .status(operation === 'edit' ? 200 : 201)
        .json({ sessions: result, warnings });
    } catch (e) {
      next(e);
    } finally {
      await db.query('ROLLBACK');
      db.release();
    }
  };
  const list = async (req, res, next) => {
    try {
      if (req.params.groupId && !(await authorize(pool, req, res))) return;
      const p = parse(pageSchema, req.query, req, res);
      if (!p) return;
      const params = [
        req.user.userId,
        req.params.groupId || null,
        p.from || new Date().toISOString(),
        p.to || '9999-01-01T00:00:00Z',
        p.pageSize,
        (p.page - 1) * p.pageSize,
      ];
      const data = await pool.query(
        `SELECT s.*,g.group_name,count(*) OVER()::int total FROM group_sessions s JOIN study_groups g USING(group_id) JOIN modules m USING(module_id) WHERE ($2::uuid IS NULL OR s.group_id=$2) AND (EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=s.group_id AND gm.student_id=$1) OR m.lecturer_id=$1) AND s.ends_at>=$3 AND s.starts_at<$4 ORDER BY s.starts_at,s.session_id LIMIT $5 OFFSET $6`,
        params,
      );
      res.json({
        data: data.rows,
        pagination: {
          page: p.page,
          pageSize: p.pageSize,
          total: data.rows[0]?.total || 0,
        },
      });
    } catch (e) {
      next(e);
    }
  };
  app.get('/api/v1/me/sessions', requireAuth, list);
  app.get('/api/v1/groups/:groupId/sessions', requireAuth, list);
  app.post('/api/v1/groups/:groupId/sessions', requireAuth, (req, res, next) =>
    writeSession(req, res, next, 'create'),
  );
  app.patch(
    '/api/v1/groups/:groupId/sessions/:sessionId',
    requireAuth,
    (req, res, next) => writeSession(req, res, next, 'edit'),
  );
  app.post(
    '/api/v1/groups/:groupId/sessions/:sessionId/cancel',
    requireAuth,
    (req, res, next) => writeSession(req, res, next, 'cancel'),
  );
  app.post(
    '/api/v1/groups/:groupId/sessions/:sessionId/duplicate',
    requireAuth,
    (req, res, next) => writeSession(req, res, next, 'duplicate'),
  );
  const download = async (req, res, next) => {
    try {
      if (!(await authorize(pool, req, res))) return;
      if (!parse(z.object({}).strict(), req.query, req, res)) return;
      const rows = req.params.sessionId
        ? [await session(pool, req, res)]
        : (
            await pool.query(
              'SELECT * FROM group_sessions WHERE group_id=$1 ORDER BY starts_at',
              [req.params.groupId],
            )
          ).rows;
      if (!rows[0] && req.params.sessionId) return;
      res
        .type('text/calendar')
        .attachment('study-sessions.ics')
        .send(calendarIcs(rows));
    } catch (e) {
      next(e);
    }
  };
  app.get(
    '/api/v1/groups/:groupId/sessions/calendar.ics',
    requireAuth,
    download,
  );
  app.get(
    '/api/v1/groups/:groupId/sessions/preparation-options',
    requireAuth,
    async (req, res, next) => {
      try {
        const g = await authorize(pool, req, res);
        if (!g) return;
        if (!parse(z.object({}).strict(), req.query, req, res)) return;
        res.json({
          canManage: Boolean(
            g.member && g.leader && req.user.role === 'student',
          ),
          resources: (
            await pool.query(
              `SELECT resource_id,title FROM resources r WHERE module_id=$1 AND (group_id IS NULL OR group_id=$2) AND ($3::text<>'student' OR ${resourceYearScope('r', '$4')}) ORDER BY title`,
              [g.module_id, g.group_id, req.user.role, req.user.userId],
            )
          ).rows,
          topics: (
            await pool.query(
              'SELECT topic_id,name FROM topics WHERE module_id=$1 ORDER BY name',
              [g.module_id],
            )
          ).rows,
        });
      } catch (e) {
        next(e);
      }
    },
  );
  app.get(
    '/api/v1/groups/:groupId/sessions/:sessionId/resources/:resourceId',
    requireAuth,
    async (req, res, next) => {
      try {
        const g = await authorize(pool, req, res);
        if (!g) return;
        const s = await session(pool, req, res);
        if (!s) return;
        if (
          !parse(z.string().uuid(), req.params.resourceId, req, res) ||
          !parse(z.object({}).strict(), req.query, req, res)
        )
          return;
        const r = (
          await pool.query(
            `SELECT r.file_location FROM resources r JOIN session_preparation_resources p USING(resource_id) WHERE p.session_id=$1 AND r.resource_id=$2 AND r.module_id=$3 AND (r.group_id IS NULL OR r.group_id=$4) AND ($5::text<>'student' OR ${resourceYearScope('r', '$6')})`,
            [
              s.session_id,
              req.params.resourceId,
              g.module_id,
              g.group_id,
              req.user.role,
              req.user.userId,
            ],
          )
        ).rows[0];
        if (!r)
          return fail(
            req,
            res,
            403,
            'Resource is not available to this group.',
          );
        const root = path.resolve(process.env.UPLOAD_DIR || 'uploads');
        const file = path.resolve(r.file_location);
        if (!file.startsWith(root + path.sep))
          return fail(req, res, 403, 'Resource is not available.');
        try {
          res
            .set(
              'Content-Disposition',
              'attachment; filename="preparation-resource"',
            )
            .type(path.extname(file) || 'application/octet-stream')
            .send(await readUpload(file));
        } catch {
          return fail(req, res, 404, 'Resource file is unavailable.');
        }
      } catch (e) {
        next(e);
      }
    },
  );
  app.get(
    '/api/v1/groups/:groupId/sessions/:sessionId/calendar.ics',
    requireAuth,
    download,
  );
  app.get(
    '/api/v1/groups/:groupId/sessions/:sessionId',
    requireAuth,
    async (req, res, next) => {
      try {
        const g = await authorize(pool, req, res);
        if (!g) return;
        if (!parse(z.object({}).strict(), req.query, req, res)) return;
        const s = await session(pool, req, res);
        if (!s) return;
        const resources = (
          await pool.query(
            `SELECT r.resource_id,r.title FROM session_preparation_resources p JOIN resources r USING(resource_id) WHERE p.session_id=$1 AND r.module_id=$2 AND (r.group_id IS NULL OR r.group_id=$3) AND ($4::text<>'student' OR ${resourceYearScope('r', '$5')})`,
            [
              s.session_id,
              g.module_id,
              g.group_id,
              req.user.role,
              req.user.userId,
            ],
          )
        ).rows;
        const counts = (
          await pool.query(
            'SELECT response,count(*)::int count FROM session_rsvps WHERE session_id=$1 GROUP BY response',
            [s.session_id],
          )
        ).rows;
        const own =
          (
            await pool.query(
              'SELECT response FROM session_rsvps WHERE session_id=$1 AND student_id=$2',
              [s.session_id, req.user.userId],
            )
          ).rows[0]?.response || null;
        const names = g.leader
          ? (
              await pool.query(
                'SELECT u.full_name,r.response FROM session_rsvps r JOIN users u ON u.user_id=r.student_id WHERE r.session_id=$1',
                [s.session_id],
              )
            ).rows
          : undefined;
        const leaders = (
          await pool.query(
            'SELECT u.full_name FROM group_leaders gl JOIN users u ON u.user_id=gl.student_id WHERE gl.group_id=$1',
            [g.group_id],
          )
        ).rows;
        res.json({
          session: s,
          resources,
          counts,
          response: own,
          names,
          leaders,
          canManage: g.member && g.leader,
          canRsvp: req.user.role === 'student' && g.member,
          warnings: await clashes(pool, s, req.user.userId),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  app.put(
    '/api/v1/groups/:groupId/sessions/:sessionId/rsvp',
    requireAuth,
    async (req, res, next) => {
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const g = await authorize(db, req, res);
        if (!g) return;
        if (req.user.role !== 'student' || !g.member) {
          fail(req, res, 403, 'Only group members can RSVP.');
          return;
        }
        const membership = await db.query(
          'SELECT student_id FROM group_members WHERE group_id=$1 AND student_id=$2 FOR UPDATE',
          [g.group_id, req.user.userId],
        );
        if (!membership.rowCount)
          return fail(req, res, 403, 'Only group members can RSVP.');
        const s = await session(db, req, res);
        if (!s) return;
        const locked = await db.query(
          'SELECT status FROM group_sessions WHERE session_id=$1 FOR UPDATE',
          [s.session_id],
        );
        const data = parse(
          z
            .object({ response: z.enum(['going', 'maybe', 'not_going']) })
            .strict(),
          req.body,
          req,
          res,
        );
        if (!data) return;
        if (locked.rows[0]?.status !== 'scheduled') {
          fail(req, res, 422, 'This session is cancelled.');
          return;
        }
        await db.query(
          'INSERT INTO session_rsvps(session_id,student_id,response) VALUES($1,$2,$3) ON CONFLICT(session_id,student_id) DO UPDATE SET response=excluded.response,updated_at=now()',
          [s.session_id, req.user.userId, data.response],
        );
        const warnings = await clashes(db, s, req.user.userId);
        await db.query('COMMIT');
        res.json({ response: data.response, warnings });
      } catch (e) {
        next(e);
      } finally {
        await db.query('ROLLBACK');
        db.release();
      }
    },
  );
  app.get('/api/v1/me/notifications', requireAuth, async (req, res, next) => {
    try {
      const p = parse(pageSchema, req.query, req, res);
      if (!p) return;
      // Hosted functions do not run the local polling daemon. Catch up due,
      // idempotent in-app reminders whenever notifications are requested.
      if (process.env.VERCEL) await generateSessionReminders(pool);
      const visible = `FROM notifications n JOIN group_sessions s USING(session_id) WHERE n.user_id=$1 AND EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=s.group_id AND gm.student_id=$1)`;
      const data = (
        await pool.query(
          `SELECT n.* ${visible} ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`,
          [req.user.userId, p.pageSize, (p.page - 1) * p.pageSize],
        )
      ).rows;
      const counts = (
        await pool.query(
          `SELECT count(*)::int total,count(*) FILTER(WHERE n.read_at IS NULL)::int unread ${visible}`,
          [req.user.userId],
        )
      ).rows[0];
      res.json({ data, ...counts, page: p.page });
    } catch (e) {
      next(e);
    }
  });
  app.post(
    '/api/v1/me/notifications/:notificationId/read',
    requireAuth,
    async (req, res, next) => {
      try {
        if (
          !parse(z.string().uuid(), req.params.notificationId, req, res) ||
          !parse(z.object({}).strict(), req.body, req, res)
        )
          return;
        const result = await pool.query(
          'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE notification_id=$1 AND user_id=$2 RETURNING notification_id,read_at',
          [req.params.notificationId, req.user.userId],
        );
        if (!result.rowCount)
          return fail(
            req,
            res,
            403,
            'You do not have access to this notification.',
          );
        res.json({ notification: result.rows[0] });
      } catch (e) {
        next(e);
      }
    },
  );
}
