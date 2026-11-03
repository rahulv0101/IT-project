// @ts-nocheck - Express/SQL inputs are validated with Zod.
import crypto from 'node:crypto';
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
          'SELF_DELETE',
          'You cannot delete your own account.',
          requestId(req),
        );
      const disabledHash = await bcrypt.hash(
        crypto.randomBytes(32).toString('hex'),
        10,
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
            'Type the user’s email address to confirm deletion.',
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
            'The final active administrator cannot be deleted.',
            requestId(req),
          );
        }
        if (target.role === 'lecturer') {
          const owned = await client.query(
            'SELECT module_id FROM modules WHERE lecturer_id=$1 FOR UPDATE',
            [userId],
          );
          if (owned.rowCount) {
            const replacement =
              data.replacementLecturerId &&
              (
                await client.query(
                  "SELECT user_id FROM users WHERE user_id=$1 AND role='lecturer' AND account_status='active' AND user_id<>$2",
                  [data.replacementLecturerId, userId],
                )
              ).rows[0];
            if (!replacement) {
              await client.query('ROLLBACK');
              return error(
                res,
                409,
                'MODULE_REASSIGNMENT_REQUIRED',
                'Select another active lecturer to take over this user’s modules.',
                requestId(req),
              );
            }
            await client.query(
              'UPDATE modules SET lecturer_id=$2 WHERE lecturer_id=$1',
              [userId, replacement.user_id],
            );
          }
        }
        // Retain historical group/session references, transferring active leadership.
        const groups = await client.query(
          "SELECT group_id FROM group_leaders WHERE student_id=$1 AND role='leader' ORDER BY group_id FOR UPDATE",
          [userId],
        );
        for (const { group_id } of groups.rows) {
          const successor = (
            await client.query(
              "SELECT gm.student_id FROM group_members gm JOIN users u ON u.user_id=gm.student_id WHERE gm.group_id=$1 AND gm.student_id<>$2 AND u.account_status='active' ORDER BY gm.joined_date,gm.student_id LIMIT 1",
              [group_id, userId],
            )
          ).rows[0];
          if (successor) {
            await client.query(
              "DELETE FROM group_leaders WHERE group_id=$1 AND student_id=$2 AND role='co-leader'",
              [group_id, successor.student_id],
            );
            await client.query(
              "UPDATE group_leaders SET student_id=$3 WHERE group_id=$1 AND student_id=$2 AND role='leader'",
              [group_id, userId, successor.student_id],
            );
          } else
            await client.query(
              "UPDATE study_groups SET visibility='private' WHERE group_id=$1",
              [group_id],
            );
        }
        await client.query(
          "DELETE FROM group_leaders WHERE student_id=$1 AND role='co-leader'",
          [userId],
        );
        await client.query('DELETE FROM group_members WHERE student_id=$1', [
          userId,
        ]);
        await client.query(
          "UPDATE group_invitations SET status='revoked',responded_at=now() WHERE status='pending' AND (inviter_id=$1 OR invitee_id=$1)",
          [userId],
        );
        await client.query(
          'UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',
          [userId],
        );
        for (const table of [
          'email_verification_tokens',
          'email_verification_codes',
          'mfa_recovery_codes',
          'mfa_credentials',
          'mfa_login_challenges',
          'user_preferred_languages',
        ])
          await client.query(`DELETE FROM ${table} WHERE user_id=$1`, [userId]);
        await client.query(
          `UPDATE users SET email=$2,password_hash=$3,full_name='Deleted user',first_name='Deleted',last_name='User',
        pending_email=NULL,email_verified_at=NULL,account_status='deleted',requires_password_reset=false WHERE user_id=$1`,
          [userId, `deleted-${userId}@accounts.invalid`, disabledHash],
        );
        await audit(
          req,
          'user.deleted',
          'user',
          userId,
          data.reason,
          { previousRole: target.role, academicRecordsRetained: true },
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
