// @ts-nocheck
import crypto from 'node:crypto';
import path from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import multer from 'multer';
import { persistUpload, readUpload, removeUpload } from '../file-storage.js';
import { resourceYearScope } from '../resource-visibility.js';
import { z } from 'zod';
import { containsProfanity } from '../profanity/index.js';

const control = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clean = (value) =>
  String(value ?? '')
    .replace(control, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
const text = (max) =>
  z
    .string()
    .transform(clean)
    .pipe(
      z
        .string()
        .min(1)
        .max(max)
        .refine(
          (v) => !containsProfanity(v),
          "That text isn't allowed. Please choose different wording.",
        ),
    );
const messageSchema = z
  .object({
    body: text(1000),
    kind: z.enum(['message', 'announcement']).default('message'),
    replyToId: z.string().uuid().nullable().optional(),
    attachmentIds: z.array(z.string().uuid()).max(5).default([]),
  })
  .strict();
const updateSchema = z.object({ body: text(1000) }).strict();
const reportSchema = z.object({ reason: text(500) }).strict();
const muteSchema = z
  .object({ duration: z.enum(['1h', '1d', '1w']), reason: text(300) })
  .strict();
const readSchema = z.object({ messageId: z.string().uuid() }).strict();
const reportStatusSchema = z
  .object({ status: z.enum(['actioned', 'dismissed']) })
  .strict();
const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(50),
    after: z.string().uuid().optional(),
  })
  .strict();

const safeMessage = (row) => ({
  message_id: row.message_id,
  group_id: row.group_id,
  author_id: row.author_id,
  author_name: clean(row.author_name),
  kind: row.kind,
  body: row.deleted_at ? 'Message removed by a leader' : clean(row.body),
  reply_to_id: row.reply_to_id,
  pinned: Boolean(row.pinned),
  created_at: row.created_at,
  edited_at: row.edited_at,
  deleted_at: row.deleted_at,
  attachments: row.attachments || [],
});
const etag = (rows) =>
  `W/"${crypto
    .createHash('sha1')
    .update(
      rows
        .map(
          (x) =>
            `${x.message_id}:${x.edited_at || x.created_at}:${x.deleted_at || ''}`,
        )
        .join('|'),
    )
    .digest('hex')}"`;

export function registerMessagingRoutes({
  app,
  pool,
  requireAuth,
  error,
  requestId,
}) {
  const fail = (req, res, status, code, message) =>
    error(res, status, code, message, requestId(req));
  const parse = (schema, value, req, res) => {
    const p = schema.safeParse(value);
    if (!p.success) {
      fail(
        req,
        res,
        422,
        'VALIDATION_ERROR',
        'Please check the submitted fields.',
      );
      return null;
    }
    return p.data;
  };
  async function groupAccess(db, req, res, write = false) {
    if (!z.string().uuid().safeParse(req.params.groupId).success) {
      fail(req, res, 422, 'VALIDATION_ERROR', 'Please check the group.');
      return null;
    }
    const row = (
      await db.query(
        `SELECT g.group_id,g.module_id,m.lecturer_id,EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=g.group_id AND gm.student_id=$2) AS member,EXISTS(SELECT 1 FROM group_leaders gl WHERE gl.group_id=g.group_id AND gl.student_id=$2) AS leader FROM study_groups g JOIN modules m USING(module_id) WHERE g.group_id=$1`,
        [req.params.groupId, req.user.userId],
      )
    ).rows[0];
    if (
      !row ||
      (write
        ? !(row.member && req.user.role === 'student')
        : !(
            row.member ||
            (req.user.role === 'lecturer' &&
              row.lecturer_id === req.user.userId)
          ))
    ) {
      fail(req, res, 403, 'FORBIDDEN', 'You do not have access to this group.');
      return null;
    }
    return row;
  }
  async function leaderAccess(db, req, res) {
    const g = await groupAccess(db, req, res, true);
    if (g && !g.leader) {
      fail(req, res, 403, 'FORBIDDEN', 'Only group leaders can do that.');
      return null;
    }
    return g;
  }
  const selectSql = (viewerParameter) =>
    `SELECT m.*,u.full_name AS author_name,COALESCE((SELECT json_agg(json_build_object('attachment_id',a.attachment_id,'resource_id',a.resource_id,'name',COALESCE(a.original_name,r.title),'type',a.mime_type,'size',a.size_bytes) ORDER BY a.created_at) FROM group_message_attachments a LEFT JOIN resources r ON r.resource_id=a.resource_id WHERE a.message_id=m.message_id ${viewerParameter ? `AND (a.resource_id IS NULL OR ${resourceYearScope('r', viewerParameter)})` : ''}),'[]'::json) AS attachments FROM group_messages m JOIN users u ON u.user_id=m.author_id`;

  app.get(
    '/api/v1/groups/:groupId/messages',
    requireAuth,
    async (req, res, next) => {
      try {
        const db = pool;
        if (!(await groupAccess(db, req, res))) return;
        const q = parse(pageSchema, req.query, req, res);
        if (!q) return;
        const params = [
          req.params.groupId,
          q.pageSize,
          (q.page - 1) * q.pageSize,
        ];
        if (
          q.after &&
          !(
            await db.query(
              'SELECT 1 FROM group_messages WHERE group_id=$1 AND message_id=$2',
              [req.params.groupId, q.after],
            )
          ).rowCount
        )
          return error(
            res,
            422,
            'INVALID_CURSOR',
            'Refresh the group chat and try again.',
            requestId(req),
          );
        const viewerParameter = req.user.role === 'student' ? '$4' : null;
        if (viewerParameter) params.push(req.user.userId);
        const cursorParameter = `$${params.length + 1}`;
        const after = q.after
          ? `AND (m.created_at,m.message_id)>(SELECT created_at,message_id FROM group_messages WHERE message_id=${cursorParameter} AND group_id=$1)`
          : '';
        if (q.after) params.push(q.after);
        const rows = (
          await db.query(
            `${selectSql(viewerParameter)} WHERE m.group_id=$1 ${after} ORDER BY m.pinned DESC,m.created_at DESC,m.message_id DESC LIMIT $2 OFFSET $3`,
            params,
          )
        ).rows;
        const tag = etag(rows);
        if (req.headers['if-none-match'] === tag) return res.status(304).end();
        res.set('ETag', tag).json({
          data: rows.map(safeMessage),
          nextAfter: rows.at(-1)?.message_id || null,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  app.post(
    '/api/v1/groups/:groupId/messages',
    requireAuth,
    async (req, res, next) => {
      try {
        const db = pool;
        const g = await groupAccess(db, req, res, true);
        if (!g) return;
        const data = parse(messageSchema, req.body, req, res);
        if (!data) return;
        if (data.kind === 'announcement' && !g.leader) {
          fail(
            req,
            res,
            403,
            'FORBIDDEN',
            'Only group leaders can post announcements.',
          );
          return;
        }
        const muted = (
          await db.query(
            'SELECT 1 FROM group_mutes WHERE group_id=$1 AND user_id=$2 AND muted_until>now()',
            [g.group_id, req.user.userId],
          )
        ).rowCount;
        if (muted) {
          fail(req, res, 403, 'MUTED', 'You cannot post while muted.');
          return;
        }
        const repeat = (
          await db.query(
            `SELECT count(*)::int AS n FROM group_messages WHERE group_id=$1 AND author_id=$2 AND body=$3 AND created_at>now()-interval '1 minute'`,
            [g.group_id, req.user.userId, data.body],
          )
        ).rows[0].n;
        if (repeat >= 5) {
          fail(
            req,
            res,
            429,
            'RATE_LIMITED',
            'Please slow down before posting the same message again.',
          );
          return;
        }
        const count = (
          await db.query(
            `SELECT count(*)::int AS n FROM group_messages WHERE group_id=$1 AND author_id=$2 AND created_at>now()-interval '1 minute'`,
            [g.group_id, req.user.userId],
          )
        ).rows[0].n;
        if (count >= 20) {
          fail(
            req,
            res,
            429,
            'RATE_LIMITED',
            'Please slow down before posting more messages.',
          );
          return;
        }
        if (
          data.replyToId &&
          (
            await db.query(
              'SELECT 1 FROM group_messages WHERE message_id=$1 AND group_id=$2',
              [data.replyToId, g.group_id],
            )
          ).rowCount === 0
        ) {
          fail(
            req,
            res,
            422,
            'VALIDATION_ERROR',
            'That reply target is not in this group.',
          );
          return;
        }
        const tx = await pool.connect();
        try {
          await tx.query('BEGIN');
          if (data.kind === 'announcement' && g.leader) {
            const pinned = await tx.query(
              `SELECT count(*)::int AS n FROM group_messages WHERE group_id=$1 AND pinned=true AND deleted_at IS NULL`,
              [g.group_id],
            );
            if (pinned.rows[0].n >= 3) {
              await tx.query('ROLLBACK');
              fail(
                req,
                res,
                422,
                'VALIDATION_ERROR',
                'This group already has three pinned announcements.',
              );
              return;
            }
          }
          const row = (
            await tx.query(
              `INSERT INTO group_messages(group_id,author_id,kind,body,reply_to_id,pinned) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
              [
                g.group_id,
                req.user.userId,
                data.kind,
                data.body,
                data.replyToId || null,
                data.kind === 'announcement' && g.leader,
              ],
            )
          ).rows[0];
          if (data.attachmentIds.length) {
            await tx.query(
              'UPDATE group_message_attachments SET message_id=$1 WHERE attachment_id=ANY($2::uuid[]) AND message_id IS NULL',
              [row.message_id, data.attachmentIds],
            );
          }
          await tx.query(
            `INSERT INTO notifications(user_id,message_id,kind,payload,dedup_key) SELECT gm.student_id,$1,$2,jsonb_build_object('groupId',$3::uuid,'messageId',$1::uuid),$1::text||':'||gm.student_id::text FROM group_members gm JOIN users recipient ON recipient.user_id=gm.student_id WHERE gm.group_id=$3 AND gm.student_id<>$4 AND ($5='announcement' OR $5='reply' OR $6 ILIKE '%'||'@'||recipient.full_name||'%') ON CONFLICT DO NOTHING`,
            [
              row.message_id,
              data.kind === 'announcement'
                ? 'announcement'
                : data.replyToId
                  ? 'reply'
                  : 'message',
              g.group_id,
              req.user.userId,
              data.kind === 'announcement'
                ? 'announcement'
                : data.replyToId
                  ? 'reply'
                  : 'message',
              data.body,
            ],
          );
          await tx.query('COMMIT');
          res.status(201).json(
            safeMessage({
              ...row,
              author_name: req.user.fullName,
              attachments: [],
            }),
          );
        } catch (e) {
          await tx.query('ROLLBACK');
          throw e;
        } finally {
          tx.release();
        }
      } catch (e) {
        next(e);
      }
    },
  );

  app.patch(
    '/api/v1/groups/:groupId/messages/:messageId',
    requireAuth,
    async (req, res, next) => {
      try {
        const g = await groupAccess(pool, req, res, true);
        if (!g) return;
        const d = parse(updateSchema, req.body, req, res);
        if (!d) return;
        const r = await pool.query(
          `UPDATE group_messages SET body=$1,edited_at=now() WHERE message_id=$2 AND group_id=$3 AND author_id=$4 AND deleted_at IS NULL AND created_at>now()-interval '10 minutes' RETURNING *`,
          [d.body, req.params.messageId, g.group_id, req.user.userId],
        );
        if (!r.rowCount) {
          fail(
            req,
            res,
            403,
            'FORBIDDEN',
            'Only your recent messages can be edited.',
          );
          return;
        }
        res.json({
          message: safeMessage({
            ...r.rows[0],
            author_name: req.user.fullName,
            attachments: [],
          }),
        });
      } catch (e) {
        next(e);
      }
    },
  );
  app.delete(
    '/api/v1/groups/:groupId/messages/:messageId',
    requireAuth,
    async (req, res, next) => {
      try {
        if (Object.keys(req.body || {}).length) {
          fail(
            req,
            res,
            422,
            'VALIDATION_ERROR',
            'Please check the submitted fields.',
          );
          return;
        }
        const g = await groupAccess(pool, req, res, true);
        if (!g) return;
        const r = await pool.query(
          `UPDATE group_messages SET deleted_at=now(),deleted_by=$1 WHERE message_id=$2 AND group_id=$3 AND (author_id=$1 OR EXISTS(SELECT 1 FROM group_leaders WHERE group_id=$3 AND student_id=$1)) RETURNING message_id`,
          [req.user.userId, req.params.messageId, g.group_id],
        );
        if (!r.rowCount) {
          fail(req, res, 403, 'FORBIDDEN', 'You cannot remove that message.');
          return;
        }
        res.json({ deleted: true });
      } catch (e) {
        next(e);
      }
    },
  );

  app.post(
    '/api/v1/groups/:groupId/messages/:messageId/report',
    requireAuth,
    async (req, res, next) => {
      try {
        if (!(await groupAccess(pool, req, res, true))) return;
        const d = parse(reportSchema, req.body, req, res);
        if (!d) return;
        const r = await pool.query(
          `INSERT INTO message_reports(message_id,reporter_id,reason) SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM group_messages WHERE message_id=$1 AND group_id=$4) RETURNING report_id,status`,
          [req.params.messageId, req.user.userId, d.reason, req.params.groupId],
        );
        if (!r.rowCount) {
          fail(req, res, 404, 'NOT_FOUND', 'Message not found.');
          return;
        }
        res.status(201).json(r.rows[0]);
      } catch (e) {
        next(e);
      }
    },
  );
  app.get(
    '/api/v1/groups/:groupId/reports',
    requireAuth,
    async (req, res, next) => {
      try {
        const g = await leaderAccess(pool, req, res);
        if (!g) return;
        if (Object.keys(req.query).length) {
          fail(
            req,
            res,
            422,
            'VALIDATION_ERROR',
            'Please check the submitted fields.',
          );
          return;
        }
        const rows = (
          await pool.query(
            `SELECT r.report_id,r.message_id,r.reason,r.status,r.created_at,m.body FROM message_reports r JOIN group_messages m USING(message_id) WHERE m.group_id=$1 AND r.status='open' ORDER BY r.created_at DESC`,
            [g.group_id],
          )
        ).rows;
        res.json({ data: rows.map((x) => ({ ...x, body: clean(x.body) })) });
      } catch (e) {
        next(e);
      }
    },
  );
  app.patch(
    '/api/v1/groups/:groupId/reports/:reportId',
    requireAuth,
    async (req, res, next) => {
      try {
        const g = await leaderAccess(pool, req, res);
        if (!g) return;
        const data = parse(reportStatusSchema, req.body, req, res);
        if (!data) return;
        const result = await pool.query(
          `UPDATE message_reports r SET status=$1 FROM group_messages m WHERE r.report_id=$2 AND r.message_id=m.message_id AND m.group_id=$3 RETURNING r.report_id,r.status`,
          [data.status, req.params.reportId, g.group_id],
        );
        if (!result.rowCount) {
          fail(req, res, 404, 'NOT_FOUND', 'Report not found.');
          return;
        }
        res.json(result.rows[0]);
      } catch (e) {
        next(e);
      }
    },
  );
  app.post(
    '/api/v1/groups/:groupId/mutes/:studentId',
    requireAuth,
    async (req, res, next) => {
      try {
        const g = await leaderAccess(pool, req, res);
        if (!g) return;
        const d = parse(muteSchema, req.body, req, res);
        if (!d) return;
        const duration = { '1h': '1 hour', '1d': '1 day', '1w': '1 week' }[
          d.duration
        ];
        await pool.query(
          `INSERT INTO group_mutes(group_id,user_id,muted_until,muted_by,reason) VALUES($1,$2,now()+$3::interval,$4,$5) ON CONFLICT(group_id,user_id) DO UPDATE SET muted_until=EXCLUDED.muted_until,muted_by=EXCLUDED.muted_by,reason=EXCLUDED.reason`,
          [
            g.group_id,
            req.params.studentId,
            duration,
            req.user.userId,
            d.reason,
          ],
        );
        res.status(201).json({ muted: true });
      } catch (e) {
        next(e);
      }
    },
  );
  app.post(
    '/api/v1/groups/:groupId/read',
    requireAuth,
    async (req, res, next) => {
      try {
        const g = await groupAccess(pool, req, res);
        if (!g) return;
        const d = parse(readSchema, req.body, req, res);
        if (!d) return;
        await pool.query(
          `INSERT INTO group_message_reads(group_id,user_id,last_read_message_id) VALUES($1,$2,$3) ON CONFLICT(group_id,user_id) DO UPDATE SET last_read_message_id=EXCLUDED.last_read_message_id`,
          [g.group_id, req.user.userId, d.messageId],
        );
        res.json({ read: true });
      } catch (e) {
        next(e);
      }
    },
  );

  const messageUpload = multer({
    dest: path.resolve(process.env.UPLOAD_DIR || './uploads'),
    limits: {
      fileSize: Math.min(
        5 * 1024 * 1024,
        Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024),
      ),
    },
  });
  app.post(
    '/api/v1/groups/:groupId/messages/:messageId/attachments',
    requireAuth,
    messageUpload.single('file'),
    async (req, res, next) => {
      try {
        const g = await groupAccess(pool, req, res, true);
        if (!g) return;
        if (!req.file && req.body.resourceId) {
          if (Object.keys(req.body).some((key) => key !== 'resourceId')) {
            fail(
              req,
              res,
              422,
              'VALIDATION_ERROR',
              'Please check the submitted fields.',
            );
            return;
          }
          const r = await pool.query(
            `INSERT INTO group_message_attachments(message_id,resource_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM group_messages WHERE message_id=$1 AND group_id=$3 AND author_id=$4) AND EXISTS(SELECT 1 FROM resources r WHERE r.resource_id=$2 AND r.module_id=$5 AND (r.group_id IS NULL OR r.group_id=$3) AND ${resourceYearScope('r', '$4')}) RETURNING attachment_id`,
            [
              req.params.messageId,
              req.body.resourceId,
              g.group_id,
              req.user.userId,
              g.module_id,
            ],
          );
          if (!r.rowCount) {
            fail(
              req,
              res,
              403,
              'FORBIDDEN',
              'That resource is not available to this group.',
            );
            return;
          }
          return res.status(201).json(r.rows[0]);
        }
        if (!req.file) {
          fail(req, res, 422, 'VALIDATION_ERROR', 'A file is required.');
          return;
        }
        const ext = path.extname(req.file.originalname).toLowerCase();
        const allowed = {
          '.pdf': 'application/pdf',
          '.docx':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.pptx':
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          '.txt': 'text/plain',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
        };
        if (
          !allowed[ext] ||
          !String(req.file.mimetype).startsWith(allowed[ext].split('/')[0])
        ) {
          await unlink(req.file.path).catch(() => {});
          fail(
            req,
            res,
            422,
            'VALIDATION_ERROR',
            'This file type is not allowed.',
          );
          return;
        }
        const bytes = await readFile(req.file.path);
        const magicOk =
          ext === '.pdf'
            ? bytes.subarray(0, 5).toString() === '%PDF-'
            : ['.docx', '.pptx'].includes(ext)
              ? bytes.subarray(0, 4).toString('hex') === '504b0304'
              : ext === '.png'
                ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
                : ['.jpg', '.jpeg'].includes(ext)
                  ? bytes.subarray(0, 3).toString('hex') === 'ffd8ff'
                  : !bytes.subarray(0, 1024).includes(0);
        if (!magicOk) {
          await unlink(req.file.path).catch(() => {});
          fail(
            req,
            res,
            422,
            'FILE_TYPE_NOT_ALLOWED',
            'That file type is not allowed.',
          );
          return;
        }
        const ownedMessage = await pool.query(
          'SELECT 1 FROM group_messages WHERE message_id=$1 AND group_id=$2 AND author_id=$3',
          [req.params.messageId, g.group_id, req.user.userId],
        );
        if (!ownedMessage.rowCount) {
          await unlink(req.file.path).catch(() => {});
          fail(
            req,
            res,
            403,
            'FORBIDDEN',
            'You cannot attach to that message.',
          );
          return;
        }
        await persistUpload(req.file.path, bytes);
        const r = await pool.query(
          `INSERT INTO group_message_attachments(message_id,stored_name,original_name,mime_type,size_bytes) SELECT $1,$2,$3,$4,$5 WHERE EXISTS(SELECT 1 FROM group_messages WHERE message_id=$1 AND group_id=$6 AND author_id=$7) RETURNING attachment_id`,
          [
            req.params.messageId,
            path.basename(req.file.path),
            clean(req.file.originalname),
            allowed[ext],
            req.file.size,
            g.group_id,
            req.user.userId,
          ],
        );
        if (!r.rowCount) {
          await removeUpload(req.file.path).catch(() => {});
          fail(
            req,
            res,
            403,
            'FORBIDDEN',
            'You cannot attach to that message.',
          );
          return;
        }
        res.status(201).json(r.rows[0]);
      } catch (e) {
        next(e);
      }
    },
  );
  app.get(
    '/api/v1/groups/:groupId/attachments/:attachmentId',
    requireAuth,
    async (req, res, next) => {
      try {
        const g = await groupAccess(pool, req, res);
        if (!g) return;
        if (Object.keys(req.query).length) {
          fail(
            req,
            res,
            422,
            'VALIDATION_ERROR',
            'Please check the submitted fields.',
          );
          return;
        }
        const r = (
          await pool.query(
            `SELECT a.*,r.title AS resource_name,r.file_location AS resource_file FROM group_message_attachments a JOIN group_messages m USING(message_id) LEFT JOIN resources r USING(resource_id) WHERE a.attachment_id=$1 AND m.group_id=$2 AND ($3::text<>'student' OR a.resource_id IS NULL OR ${resourceYearScope('r', '$4')})`,
            [
              req.params.attachmentId,
              g.group_id,
              req.user.role,
              req.user.userId,
            ],
          )
        ).rows[0];
        if (!r) {
          fail(req, res, 404, 'NOT_FOUND', 'Attachment not found.');
          return;
        }
        if (r.resource_id) {
          return res
            .type(path.extname(r.resource_file) || 'application/octet-stream')
            .send(await readUpload(path.resolve(r.resource_file)));
        }
        res
          .type(r.mime_type || 'application/octet-stream')
          .send(
            await readUpload(
              path.resolve(
                process.env.UPLOAD_DIR || './uploads',
                r.stored_name,
              ),
            ),
          );
      } catch (e) {
        next(e);
      }
    },
  );
}
