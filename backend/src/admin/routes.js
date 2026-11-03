// @ts-nocheck - Express route dependencies and PostgreSQL rows are runtime-shaped.
import bcrypt from 'bcryptjs';
import { registerAccountManagement } from './accounts.js';
import { z } from 'zod';
import { noProfanity, profanityMessage } from '../profanity/index.js';

/**
 * Administrator API: safe summaries and audited platform controls.
 * Mutations require an explicit reason, and no route is allowed to edit scores.
 */

const pageQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
  })
  .strict();
const reason = z
  .string()
  .trim()
  .min(3)
  .max(500)
  .refine(noProfanity(), { message: profanityMessage });
const personName = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[\p{L}][\p{L}\p{M} '-]*$/u)
  .refine(noProfanity(), { message: profanityMessage });

export function registerAdminRoutes({
  app,
  pool,
  requireAuth,
  error,
  requestId,
}) {
  const parse = (schema, value, req, res) => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    const profanity = result.error.issues.some(
      (issue) => issue.message === profanityMessage,
    );
    error(
      res,
      422,
      profanity ? 'TEXT_NOT_ALLOWED' : 'VALIDATION_ERROR',
      profanity ? profanityMessage : 'Please check the submitted fields.',
      requestId(req),
    );
    return null;
  };
  const requireAdmin = async (req, res, next) => {
    if (req.user?.role !== 'admin')
      return error(
        res,
        403,
        'FORBIDDEN',
        'Administrator access is required.',
        requestId(req),
      );
    next();
  };
  const audit = async (
    req,
    action,
    targetType,
    targetId,
    why,
    details = {},
    db = pool,
  ) =>
    db.query(
      `INSERT INTO admin_audit_logs(admin_id,action,target_type,target_id,reason,details,request_id)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        req.user.userId,
        action,
        targetType,
        targetId,
        why,
        details,
        requestId(req),
      ],
    );
  const admin = [requireAuth, requireAdmin];

  registerAccountManagement({
    app,
    pool,
    admin,
    error,
    requestId,
    audit,
    reason,
  });

  app.get('/api/v1/admin/dashboard', ...admin, async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.query, req, res)) return;
      const [users, modules, quizzes, jobs, reports, storage] =
        await Promise.all([
          pool.query(
            `SELECT count(*)::int total,
              count(*) FILTER (WHERE role='student')::int students,
              count(*) FILTER (WHERE role='lecturer')::int lecturers,
              count(*) FILTER (WHERE role='admin')::int admins,
              count(*) FILTER (WHERE account_status='suspended')::int suspended
             FROM users WHERE account_status<>'deleted'`,
          ),
          pool.query('SELECT count(*)::int total FROM modules'),
          pool.query(
            `SELECT count(*)::int total,count(*) FILTER (WHERE status='published')::int published FROM quizzes`,
          ),
          pool.query(
            `SELECT status,count(*)::int count FROM ai_generation_jobs GROUP BY status`,
          ),
          pool.query(
            `SELECT count(*)::int total FROM message_reports WHERE status='open'`,
          ),
          pool.query(
            'SELECT COALESCE(sum(file_size_bytes),0)::bigint bytes FROM resources',
          ),
        ]);
      res.json({
        users: users.rows[0],
        modules: modules.rows[0].total,
        quizzes: quizzes.rows[0],
        aiJobs: Object.fromEntries(
          jobs.rows.map((row) => [row.status, row.count]),
        ),
        openReports: reports.rows[0].total,
        storageBytes: Number(storage.rows[0].bytes),
      });
    } catch (cause) {
      next(cause);
    }
  });

  app.get('/api/v1/admin/users', ...admin, async (req, res, next) => {
    try {
      const query = parse(
        pageQuery.extend({
          role: z.enum(['student', 'lecturer', 'admin']).optional(),
        }),
        req.query,
        req,
        res,
      );
      if (!query) return;
      const search = query.search ? `%${query.search}%` : null;
      const result = await pool.query(
        `SELECT u.user_id,u.email,u.full_name,u.role,u.account_status,u.email_verified_at,
                u.requires_password_reset,u.created_date,
                false AS mfa_enabled,
                count(*) OVER()::int total
           FROM users u
          WHERE u.account_status<>'deleted' AND ($1::text IS NULL OR u.email ILIKE $1 OR u.full_name ILIKE $1) AND ($4::text IS NULL OR u.role::text=$4)
          ORDER BY u.created_date DESC,u.user_id
          LIMIT $2 OFFSET $3`,
        [
          search,
          query.pageSize,
          (query.page - 1) * query.pageSize,
          query.role || null,
        ],
      );
      res.json({
        data: result.rows.map(({ total: _total, ...row }) => row),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.rows[0]?.total || 0,
        },
      });
    } catch (cause) {
      next(cause);
    }
  });

  app.post('/api/v1/admin/lecturers', ...admin, async (req, res, next) => {
    try {
      const data = parse(
        z
          .object({
            email: z.string().trim().toLowerCase().email().max(254),
            temporaryPassword: z
              .string()
              .min(10)
              .max(200)
              .regex(/[A-Z]/)
              .regex(/[a-z]/)
              .regex(/[0-9]/)
              .regex(/[^A-Za-z0-9]/),
            firstName: personName,
            lastName: personName.optional(),
            reason,
          })
          .strict(),
        req.body,
        req,
        res,
      );
      if (!data) return;
      const fullName = [data.firstName, data.lastName]
        .filter(Boolean)
        .join(' ');
      const hash = await bcrypt.hash(data.temporaryPassword, 12);
      const created = await pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,last_name,email_verified_at,requires_password_reset)
         VALUES($1,$2,'lecturer',$3,$4,$5,now(),true)
         RETURNING user_id,email,full_name,role,account_status,requires_password_reset`,
        [data.email, hash, fullName, data.firstName, data.lastName || null],
      );
      await audit(
        req,
        'lecturer.created',
        'user',
        created.rows[0].user_id,
        data.reason,
      );
      res.status(201).json({ user: created.rows[0] });
    } catch (cause) {
      if (cause.code === '23505')
        return error(
          res,
          409,
          'EMAIL_EXISTS',
          'An account with that email already exists.',
          requestId(req),
        );
      next(cause);
    }
  });

  app.patch('/api/v1/admin/users/:userId', ...admin, async (req, res, next) => {
    const client = await pool.connect();
    let transactionOpen = false;
    try {
      const params = parse(
        z.object({ userId: z.string().uuid() }).strict(),
        req.params,
        req,
        res,
      );
      const data = parse(
        z
          .object({
            action: z.enum([
              'activate',
              'suspend',
              'deactivate',
              'revoke_sessions',
              'require_password_reset',
            ]),
            reason,
          })
          .strict(),
        req.body,
        req,
        res,
      );
      if (!params || !data) return;
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query(
        "SELECT user_id FROM users WHERE role='admin' ORDER BY user_id FOR UPDATE",
      );
      if (
        !(
          await client.query(
            "SELECT 1 FROM users WHERE user_id=$1 AND account_status='active'",
            [req.user.userId],
          )
        ).rowCount
      ) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return error(
          res,
          403,
          'FORBIDDEN',
          'Administrator access is required.',
          requestId(req),
        );
      }
      if (
        params.userId.toLowerCase() === req.user.userId &&
        ['suspend', 'deactivate'].includes(data.action)
      )
        return error(
          res,
          409,
          'SELF_SUSPEND',
          'You cannot suspend or deactivate your own account.',
          requestId(req),
        );
      const target = await client.query(
        "SELECT user_id,role,account_status FROM users WHERE user_id=$1 AND account_status<>'deleted' FOR UPDATE",
        [params.userId],
      );
      if (!target.rowCount)
        return error(res, 404, 'NOT_FOUND', 'User not found.', requestId(req));
      if (
        ['suspend', 'deactivate'].includes(data.action) &&
        target.rows[0].role === 'admin' &&
        target.rows[0].account_status === 'active'
      ) {
        const active = await client.query(
          "SELECT count(*)::int count FROM users WHERE role='admin' AND account_status='active'",
        );
        if (active.rows[0].count <= 1)
          return error(
            res,
            409,
            'LAST_ADMIN',
            'The final active administrator cannot be suspended or deactivated.',
            requestId(req),
          );
      }
      if (data.action === 'activate')
        await client.query(
          "UPDATE users SET account_status='active' WHERE user_id=$1",
          [params.userId],
        );
      if (['suspend', 'deactivate'].includes(data.action)) {
        await client.query(
          'UPDATE users SET account_status=$2 WHERE user_id=$1',
          [params.userId, data.action === 'suspend' ? 'suspended' : 'inactive'],
        );
        await client.query(
          'UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',
          [params.userId],
        );
      }
      if (data.action === 'revoke_sessions')
        await client.query(
          'UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',
          [params.userId],
        );
      if (data.action === 'require_password_reset')
        await client.query(
          'UPDATE users SET requires_password_reset=true WHERE user_id=$1',
          [params.userId],
        );
      await audit(
        req,
        `user.${data.action}`,
        'user',
        params.userId,
        data.reason,
        {},
        client,
      );
      await client.query('COMMIT');
      transactionOpen = false;
      res.json({ success: true });
    } catch (cause) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      next(cause);
    } finally {
      if (transactionOpen) await client.query('ROLLBACK');
      client.release();
    }
  });

  app.get('/api/v1/admin/modules', ...admin, async (req, res, next) => {
    try {
      const query = parse(pageQuery, req.query, req, res);
      if (!query) return;
      const search = query.search ? `%${query.search}%` : null;
      const result = await pool.query(
        `SELECT m.module_id,m.module_code,m.module_name,m.year,m.programme,m.offering,
                u.user_id lecturer_id,u.full_name lecturer_name,
                count(DISTINCT e.enrolment_id)::int enrolments,count(*) OVER()::int total
           FROM modules m JOIN users u ON u.user_id=m.lecturer_id
           LEFT JOIN enrollments e ON e.module_id=m.module_id
          WHERE ($1::text IS NULL OR m.module_code ILIKE $1 OR m.module_name ILIKE $1)
          GROUP BY m.module_id,u.user_id
          ORDER BY m.module_code LIMIT $2 OFFSET $3`,
        [search, query.pageSize, (query.page - 1) * query.pageSize],
      );
      res.json({
        data: result.rows.map(({ total: _total, ...row }) => row),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.rows[0]?.total || 0,
        },
      });
    } catch (cause) {
      next(cause);
    }
  });

  app.patch(
    '/api/v1/admin/modules/:moduleId/lecturer',
    ...admin,
    async (req, res, next) => {
      try {
        const params = parse(
          z.object({ moduleId: z.string().uuid() }).strict(),
          req.params,
          req,
          res,
        );
        const data = parse(
          z.object({ lecturerId: z.string().uuid(), reason }).strict(),
          req.body,
          req,
          res,
        );
        if (!params || !data) return;
        const changed = await pool.query(
          `UPDATE modules SET lecturer_id=$1 WHERE module_id=$2
           AND EXISTS(SELECT 1 FROM users WHERE user_id=$1 AND role='lecturer' AND account_status='active')
           RETURNING module_id,lecturer_id`,
          [data.lecturerId, params.moduleId],
        );
        if (!changed.rowCount)
          return error(
            res,
            404,
            'NOT_FOUND',
            'Module or active lecturer not found.',
            requestId(req),
          );
        await audit(
          req,
          'module.lecturer_transferred',
          'module',
          params.moduleId,
          data.reason,
          { lecturerId: data.lecturerId },
        );
        res.json({ module: changed.rows[0] });
      } catch (cause) {
        next(cause);
      }
    },
  );

  app.get('/api/v1/admin/reports', ...admin, async (req, res, next) => {
    try {
      const query = parse(pageQuery, req.query, req, res);
      if (!query) return;
      const result = await pool.query(
        `SELECT mr.report_id,mr.reason,mr.status,mr.created_at,gm.message_id,gm.body,
                gm.group_id,author.full_name author_name,sg.group_name,count(*) OVER()::int total
           FROM message_reports mr JOIN group_messages gm ON gm.message_id=mr.message_id
           JOIN study_groups sg ON sg.group_id=gm.group_id
           JOIN users author ON author.user_id=gm.author_id
          WHERE mr.status='open' ORDER BY mr.created_at
          LIMIT $1 OFFSET $2`,
        [query.pageSize, (query.page - 1) * query.pageSize],
      );
      res.json({
        data: result.rows.map(({ total: _total, ...row }) => row),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.rows[0]?.total || 0,
        },
      });
    } catch (cause) {
      next(cause);
    }
  });

  app.patch(
    '/api/v1/admin/reports/:reportId',
    ...admin,
    async (req, res, next) => {
      try {
        const params = parse(
          z.object({ reportId: z.string().uuid() }).strict(),
          req.params,
          req,
          res,
        );
        const data = parse(
          z
            .object({ status: z.enum(['actioned', 'dismissed']), reason })
            .strict(),
          req.body,
          req,
          res,
        );
        if (!params || !data) return;
        const updated = await pool.query(
          `UPDATE message_reports SET status=$1 WHERE report_id=$2 AND status='open' RETURNING report_id,status`,
          [data.status, params.reportId],
        );
        if (!updated.rowCount)
          return error(
            res,
            404,
            'NOT_FOUND',
            'Open report not found.',
            requestId(req),
          );
        await audit(
          req,
          `report.${data.status}`,
          'message_report',
          params.reportId,
          data.reason,
        );
        res.json({ report: updated.rows[0] });
      } catch (cause) {
        next(cause);
      }
    },
  );

  app.get('/api/v1/admin/system', ...admin, async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.query, req, res)) return;
      const migration = await pool.query(
        'SELECT version,applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 1',
      );
      const jobs = await pool.query(
        `SELECT count(*) FILTER (WHERE status='queued')::int queued,
                count(*) FILTER (WHERE status='running')::int running,
                count(*) FILTER (WHERE status='failed')::int failed
           FROM ai_generation_jobs`,
      );
      res.json({
        database: { healthy: true, migration: migration.rows[0] || null },
        ai: {
          provider: process.env.AI_PROVIDER || 'mock',
          modelConfigured: Boolean(process.env.AI_MODEL),
          apiKeyConfigured: Boolean(
            process.env.AI_API_KEY ||
            process.env.OPENAI_API_KEY ||
            process.env.ANTHROPIC_API_KEY,
          ),
          jobs: jobs.rows[0],
        },
      });
    } catch (cause) {
      next(cause);
    }
  });

  app.get('/api/v1/admin/audit', ...admin, async (req, res, next) => {
    try {
      const query = parse(pageQuery, req.query, req, res);
      if (!query) return;
      const result = await pool.query(
        `SELECT al.audit_id,al.action,al.target_type,al.target_id,al.reason,al.details,
                al.request_id,al.created_at,u.full_name admin_name,count(*) OVER()::int total
           FROM admin_audit_logs al JOIN users u ON u.user_id=al.admin_id
          ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`,
        [query.pageSize, (query.page - 1) * query.pageSize],
      );
      res.json({
        data: result.rows.map(({ total: _total, ...row }) => row),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.rows[0]?.total || 0,
        },
      });
    } catch (cause) {
      next(cause);
    }
  });
}
