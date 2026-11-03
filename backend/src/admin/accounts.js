// @ts-nocheck - Express/SQL inputs are validated with Zod.
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  personNameSchema,
  passwordSchema,
  passwordIsAllowed,
  emailSchema,
} from '../validation/identity.js';
export const accountManagementRoutes = {
  'POST /api/v1/admin/users': { auth: 'admin' },
  'DELETE /api/v1/admin/users/:userId': { auth: 'admin' },
};
export function registerAccountManagement({
  app,
  pool,
  admin,
  error,
  requestId,
  audit,
  reason,
}) {
  const parse = (schema, input, req, res) => {
    const p = schema.safeParse(input);
    if (p.success) return p.data;
    error(
      res,
      422,
      'VALIDATION_ERROR',
      p.error.issues[0]?.message || 'Please check the submitted fields.',
      requestId(req),
    );
    return null;
  };
  const activeAdministrator = async (client, req) => {
    await client.query(
      "SELECT user_id FROM users WHERE role='admin' ORDER BY user_id FOR UPDATE",
    );
    return (
      (
        await client.query(
          "SELECT 1 FROM users WHERE user_id=$1 AND role='admin' AND account_status='active'",
          [req.user.userId],
        )
      ).rowCount > 0
    );
  };
  app.post('/api/v1/admin/users', ...admin, async (req, res, next) => {
    const data = parse(
      z
        .object({
          email: emailSchema,
          temporaryPassword: passwordSchema,
          firstName: personNameSchema,
          lastName: personNameSchema.optional(),
          role: z.enum(['student', 'lecturer', 'admin']),
          studentType: z.enum(['it', 'business']).default('it'),
          studentYear: z.number().int().min(1).max(3).default(1),
          reason,
        })
        .strict(),
      req.body,
      req,
      res,
    );
    if (!data) return;
    if (!passwordIsAllowed(data.temporaryPassword, data.email, data.firstName))
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Choose a password that does not contain the user’s name or email.',
        requestId(req),
      );
    const hash = await bcrypt.hash(data.temporaryPassword, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await activeAdministrator(client, req))) {
        await client.query('ROLLBACK');
        return error(
          res,
          403,
          'FORBIDDEN',
          'Administrator access is required.',
          requestId(req),
        );
      }
      const user = (
        await client.query(
          `INSERT INTO users(email,password_hash,role,full_name,first_name,last_name,student_type,student_year,email_verified_at,requires_password_reset)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),true) RETURNING user_id,email,full_name,role,account_status,requires_password_reset`,
          [
            data.email,
            hash,
            data.role,
            [data.firstName, data.lastName].filter(Boolean).join(' '),
            data.firstName,
            data.lastName || null,
            data.role === 'student' ? data.studentType : null,
            data.role === 'student' ? data.studentYear : null,
          ],
        )
      ).rows[0];
      await audit(
        req,
        'user.created',
        'user',
        user.user_id,
        data.reason,
        { role: data.role },
        client,
      );
      await client.query('COMMIT');
      res.status(201).json({ user });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505')
        return error(
          res,
          409,
          'EMAIL_EXISTS',
          'An account with that email already exists.',
          requestId(req),
        );
      next(e);
    } finally {
      client.release();
    }
  });
  app.delete(
    '/api/v1/admin/users/:userId',
    ...admin,
    async (req, res, next) => {
      const userId = parse(z.string().uuid(), req.params.userId, req, res);
      const data = parse(
        z
          .object({
            reason,
            confirmationEmail: emailSchema,
            replacementLecturerId: z.string().uuid().optional(),
          })
          .strict(),
        req.body,
        req,
        res,
      );
      if (!userId || !data) return;
      if (userId.toLowerCase() === req.user.userId)
        return error(
          res,
          409,
          'SELF_DEACTIVATE',
          'You cannot deactivate your own account.',
          requestId(req),
        );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (!(await activeAdministrator(client, req))) {
          await client.query('ROLLBACK');
          return error(
            res,
            403,
            'FORBIDDEN',
            'Administrator access is required.',
            requestId(req),
          );
        }
        const target = (
          await client.query(
            "SELECT user_id,email,role,account_status FROM users WHERE user_id=$1 AND account_status<>'deleted' FOR UPDATE",
            [userId],
          )
        ).rows[0];
        if (!target) {
          await client.query('ROLLBACK');
          return error(
            res,
            404,
            'NOT_FOUND',
            'User not found.',
            requestId(req),
          );
        }
        if (target.email.toLowerCase() !== data.confirmationEmail) {
          await client.query('ROLLBACK');
          return error(
            res,
            422,
            'CONFIRMATION_MISMATCH',
            'Type the user’s email address to confirm deactivation.',
            requestId(req),
          );
        }
        if (
          target.role === 'admin' &&
          target.account_status === 'active' &&
          (
            await client.query(
              "SELECT count(*)::int n FROM users WHERE role='admin' AND account_status='active'",
            )
          ).rows[0].n <= 1
        ) {
          await client.query('ROLLBACK');
          return error(
            res,
            409,
            'LAST_ADMIN',
            'The final active administrator cannot be deactivated.',
            requestId(req),
          );
        }
        await client.query(
          "UPDATE users SET account_status='inactive' WHERE user_id=$1",
          [userId],
        );
        await client.query(
          'UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',
          [userId],
        );
        await audit(
          req,
          'user.deactivate',
          'user',
          userId,
          data.reason,
          {
            previousRole: target.role,
            previousStatus: target.account_status,
            dataRetained: true,
          },
          client,
        );
        await client.query('COMMIT');
        res.status(204).end();
      } catch (e) {
        await client.query('ROLLBACK');
        next(e);
      } finally {
        client.release();
      }
    },
  );
}
