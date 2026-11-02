// @ts-nocheck - PostgreSQL transaction rows are validated at the API boundary.
import crypto from 'node:crypto';

export function hashEmailCode(userId, challengeId, code) {
  const key = process.env.EMAIL_OTP_SECRET || process.env.AI_SERVICE_TOKEN;
  if (!key) throw new Error('Email verification secret is not configured.');
  return crypto
    .createHmac('sha256', key)
    .update(`eduquest.email-code.v1:${userId}:${challengeId}:${code}`)
    .digest('hex');
}

export async function issueEmailCode(client, userId, targetEmail) {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const challengeId = crypto.randomUUID();
  const issued = await client.query(
    `INSERT INTO email_verification_codes(user_id,challenge_id,code_hash,target_email,expires_at)
     VALUES($1,$2,$3,$4,now()+interval '10 minutes')
     ON CONFLICT(user_id) DO UPDATE SET challenge_id=EXCLUDED.challenge_id,code_hash=EXCLUDED.code_hash,
       target_email=EXCLUDED.target_email,expires_at=EXCLUDED.expires_at,failed_attempts=0,used_at=NULL,created_at=now()
     WHERE email_verification_codes.created_at < now()-interval '60 seconds'
       OR email_verification_codes.used_at IS NOT NULL
       OR email_verification_codes.target_email IS DISTINCT FROM EXCLUDED.target_email
     RETURNING user_id`,
    [
      userId,
      challengeId,
      hashEmailCode(userId, challengeId, code),
      targetEmail,
    ],
  );
  if (!issued.rowCount)
    throw Object.assign(
      new Error('Wait a minute before requesting another code.'),
      { code: 'VERIFICATION_COOLDOWN' },
    );
  return code;
}

export async function verifyEmailCode(pool, userId, code) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (
      await client.query(
        `SELECT * FROM email_verification_codes WHERE user_id=$1 FOR UPDATE`,
        [userId],
      )
    ).rows[0];
    if (
      !row ||
      row.used_at ||
      new Date(row.expires_at).getTime() <= Date.now() ||
      row.failed_attempts >= 5
    ) {
      await client.query('ROLLBACK');
      return null;
    }
    if (
      !crypto.timingSafeEqual(
        Buffer.from(row.code_hash, 'hex'),
        Buffer.from(hashEmailCode(userId, row.challenge_id, code), 'hex'),
      )
    ) {
      await client.query(
        'UPDATE email_verification_codes SET failed_attempts=failed_attempts+1 WHERE user_id=$1',
        [userId],
      );
      await client.query('COMMIT');
      return null;
    }
    const user = (
      await client.query(
        'SELECT email,pending_email FROM users WHERE user_id=$1 FOR UPDATE',
        [userId],
      )
    ).rows[0];
    if (row.target_email && row.target_email !== user.pending_email) {
      await client.query(
        'UPDATE email_verification_codes SET used_at=now() WHERE user_id=$1',
        [userId],
      );
      await client.query('COMMIT');
      return null;
    }
    await client.query(
      'UPDATE email_verification_codes SET used_at=now() WHERE user_id=$1',
      [userId],
    );
    await client.query(
      'UPDATE email_verification_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1',
      [userId],
    );
    const verified = await client.query(
      `UPDATE users SET email=COALESCE($2,email),pending_email=NULL,email_verified_at=now()
       WHERE user_id=$1 RETURNING user_id,role,full_name,first_name,last_name,student_type,student_year,email,email_verified_at`,
      [userId, row.target_email],
    );
    await client.query('COMMIT');
    return { ...verified.rows[0], needs_email_verification: false };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Legacy links and six-digit codes use the same lock order and invalidate each
// other, so opening a link while submitting its code cannot verify twice.
export async function verifyEmailLink(pool, token) {
  const client = await pool.connect();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    await client.query('BEGIN');
    const pending = (
      await client.query(
        'SELECT user_id,target_email FROM email_verification_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()',
        [tokenHash],
      )
    ).rows[0];
    if (!pending) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      'SELECT user_id FROM email_verification_codes WHERE user_id=$1 FOR UPDATE',
      [pending.user_id],
    );
    const user = (
      await client.query(
        'SELECT pending_email FROM users WHERE user_id=$1 FOR UPDATE',
        [pending.user_id],
      )
    ).rows[0];
    const consumed = await client.query(
      'UPDATE email_verification_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id',
      [tokenHash],
    );
    if (!consumed.rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    if (pending.target_email && pending.target_email !== user.pending_email) {
      await client.query('COMMIT');
      return false;
    }
    await client.query(
      'UPDATE email_verification_codes SET used_at=COALESCE(used_at,now()) WHERE user_id=$1',
      [pending.user_id],
    );
    await client.query(
      'UPDATE email_verification_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1',
      [pending.user_id],
    );
    await client.query(
      'UPDATE users SET email=COALESCE($2,email),pending_email=NULL,email_verified_at=now() WHERE user_id=$1',
      [pending.user_id, pending.target_email],
    );
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
