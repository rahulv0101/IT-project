// @ts-nocheck - Express/SQL inputs are validated with Zod.
import bcrypt from 'bcryptjs';
import { emailDomainValidation } from '../validation/email-domain.js';
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
  deliverVerification,
}) {
  const parse = (schema, input, req, res) => {
    const p = schema.safeParse(input);
    if (p.success) return p.data;
    const fields = {};
    for (const issue of p.error.issues)
      if (issue.path.length === 1) fields[issue.path[0]] ??= issue.message;
    error(
      res,
      422,
      'VALIDATION_ERROR',
      p.error.issues[0]?.message || 'Please check the submitted fields.',
      requestId(req),
      fields,
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
          temporaryPassword: passwordSchema.optional(),
          password: passwordSchema.optional(),
          confirmPassword: z.string().max(200).optional(),
          firstName: personNameSchema,
          lastName: personNameSchema.optional(),
          role: z.enum(['student', 'lecturer', 'admin']),
          studentType: z.enum(['it', 'business']).default('it'),
          studentYear: z.number().int().min(1).max(3).default(1),
          reason: reason
            .optional()
            .default('Account created by an administrator'),
        })
        .strict()
        .superRefine((data, ctx) => {
          if (!data.password && !data.temporaryPassword)
            ctx.addIssue({
              code: 'custom',
              message: 'Password is required.',
              path: ['password'],
            });
          if (
            data.password !== undefined &&
            data.temporaryPassword !== undefined
          )
            ctx.addIssue({
              code: 'custom',
              message: 'Supply only one password field.',
              path: ['password'],
            });
          if (data.password !== undefined && !data.lastName)
            ctx.addIssue({
              code: 'custom',
              message: 'Last name is required.',
              path: ['lastName'],
            });
          if (
            (data.password !== undefined ||
              data.confirmPassword !== undefined) &&
            data.confirmPassword !== (data.password ?? data.temporaryPassword)
          )
            ctx.addIssue({
              code: 'custom',
              message: 'Passwords do not match.',
              path: ['confirmPassword'],
            });
        }),
      req.body,
      req,
      res,
    );
    if (!data) return;
    const password = data.password ?? data.temporaryPassword;
    const passwordField =
      data.password !== undefined ? 'password' : 'temporaryPassword';
    if (!passwordIsAllowed(password, data.email, data.firstName))
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Choose a less common password that does not contain your email or first name.',
        requestId(req),
        {
          [passwordField]:
            'Choose a less common password that does not contain your email or first name.',
        },
      );
    const domainIssue = await emailDomainValidation(data.email);
    if (domainIssue)
      return error(
        res,
        domainIssue.status,
        domainIssue.code,
        domainIssue.message,
        requestId(req),
        { email: domainIssue.message },
      );
    const hash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    let createdUser;
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
          `INSERT INTO users(email,password_hash,role,full_name,first_name,last_name,student_type,student_year,email_verified_at,requires_password_reset,requires_email_verification)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL,true,true) RETURNING user_id,email,full_name,role,account_status,requires_password_reset`,
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
      createdUser = user;
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505')
        return error(
          res,
          409,
          'EMAIL_EXISTS',
          'An account with that email already exists.',
          requestId(req),
          { email: 'An account with that email already exists.' },
        );
      next(e);
      return;
    } finally {
      client.release();
    }
    if (createdUser)
      res.status(201).json({ user: await deliverVerification(createdUser) });
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
            "SELECT user_id,email,role,account_status,requires_email_verification,email_verified_at FROM users WHERE user_id=$1 AND account_status<>'deleted' FOR UPDATE",
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
          (!target.requires_email_verification || target.email_verified_at) &&
          (
            await client.query(
              "SELECT count(*)::int n FROM users WHERE role='admin' AND account_status='active' AND (NOT requires_email_verification OR email_verified_at IS NOT NULL)",
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
