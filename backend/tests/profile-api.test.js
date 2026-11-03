// @ts-nocheck
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

const email = `profile-${Date.now()}@example.com`;
const otherEmail = `profile-other-${Date.now()}@example.com`;
const password = 'ProfileCurrent9!';

async function login(address = email, secret = password) {
  const result = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: address, password: secret });
  expect(result.status).toBe(200);
  return result.headers['set-cookie'][0].split(';')[0];
}

describe('profile management API', () => {
  let userId;
  beforeAll(async () => {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,first_name,last_name,student_type,email_verified_at)
       VALUES($1,$2,'student','Profile User','Profile','User','it',now()) RETURNING user_id`,
      [email, hash],
    );
    userId = result.rows[0].user_id;
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,first_name,email_verified_at) VALUES($1,$2,'student','Other User','Other',now())`,
      [otherEmail, hash],
    );
  });
  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email LIKE $1', [
      'profile-%@example.com',
    ]);
  });

  it('gets and updates the own profile, preferred languages, and student type', async () => {
    const agent = request.agent(app);
    expect(
      (await agent.post('/api/v1/auth/login').send({ email, password })).status,
    ).toBe(200);
    const before = await agent.get('/api/v1/me/profile');
    expect(before.status).toBe(200);
    expect(before.body.languages).toEqual(
      expect.arrayContaining(['JavaScript', 'Python', 'SQL']),
    );
    const saved = await agent.patch('/api/v1/me/profile').send({
      firstName: 'Updated',
      lastName: 'Learner',
      studentType: 'business',
      preferredLanguages: ['Python', 'SQL'],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.profile).toMatchObject({
      first_name: 'Updated',
      last_name: 'Learner',
      student_type: 'business',
      preferred_languages: ['Python', 'SQL'],
    });
  });

  it('rejects profanity, invalid languages, unknown fields, and lecturer-only student type changes', async () => {
    const cookie = await login();
    expect(
      (
        await request(app)
          .patch('/api/v1/me/profile')
          .set('Cookie', cookie)
          .send({ role: 'lecturer' })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .patch('/api/v1/me/profile')
          .set('Cookie', cookie)
          .send({ firstName: 'fuck' })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .patch('/api/v1/me/profile')
          .set('Cookie', cookie)
          .send({ preferredLanguages: ['Cobol'] })
      ).status,
    ).toBe(422);
    const lecturer = await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,first_name) VALUES($1,$2,'lecturer','Profile Lecturer','Profile') RETURNING user_id`,
      [`${email}.lecturer`, await bcrypt.hash(password, 12)],
    );
    const lecturerCookie = await login(`${email}.lecturer`);
    expect(
      (
        await request(app)
          .patch('/api/v1/me/profile')
          .set('Cookie', lecturerCookie)
          .send({ studentType: 'it' })
      ).status,
    ).toBe(422);
    await pool.query('DELETE FROM users WHERE user_id=$1', [
      lecturer.rows[0].user_id,
    ]);
  });

  it('refuses unauthenticated access and another user cannot edit this profile', async () => {
    expect((await request(app).get('/api/v1/me/profile')).status).toBe(401);
    const otherCookie = await login(otherEmail);
    const own = await request(app)
      .get('/api/v1/me/profile')
      .set('Cookie', otherCookie);
    expect(own.status).toBe(200);
    expect(own.body.profile.user_id).not.toBe(userId);
    const edited = await request(app)
      .patch('/api/v1/me/profile')
      .set('Cookie', otherCookie)
      .send({ firstName: 'OtherUpdated' });
    expect(edited.status).toBe(200);
    const target = await pool.query(
      'SELECT first_name FROM users WHERE user_id=$1',
      [userId],
    );
    expect(target.rows[0].first_name).toBe('Updated');
  });

  it('applies the shared name rules and rejects protected profile fields', async () => {
    const cookie = await login();
    for (const firstName of ['A1', 'A!', 'A'.repeat(51)]) {
      const result = await request(app)
        .patch('/api/v1/me/profile')
        .set('Cookie', cookie)
        .send({ firstName });
      expect(result.status).toBe(422);
    }
    for (const field of ['userId', 'emailVerifiedAt', 'mfaEnabled', 'id']) {
      const result = await request(app)
        .patch('/api/v1/me/profile')
        .set('Cookie', cookie)
        .send({ [field]: 'protected' });
      expect(result.status).toBe(422);
    }
  });

  it('rolls back the password hash when revoking other sessions fails', async () => {
    const current = await login();
    const other = await login();
    const before = (
      await pool.query('SELECT password_hash FROM users WHERE user_id=$1', [
        userId,
      ])
    ).rows[0].password_hash;
    await pool.query(`CREATE FUNCTION test_password_revoke_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.revoked_at IS NOT NULL THEN
          RAISE EXCEPTION 'simulated session revocation failure';
        END IF;
        RETURN NEW;
      END $$`);
    await pool.query(
      'CREATE TRIGGER test_password_revoke_failure BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION test_password_revoke_failure()',
    );
    try {
      const result = await request(app)
        .post('/api/v1/me/password')
        .set('Cookie', current)
        .send({
          password,
          newPassword: 'RollbackSecret9!',
          confirmPassword: 'RollbackSecret9!',
        });
      expect(result.status).toBe(500);
      expect(
        (
          await pool.query('SELECT password_hash FROM users WHERE user_id=$1', [
            userId,
          ])
        ).rows[0].password_hash,
      ).toBe(before);
      expect(
        (await request(app).get('/api/v1/me/profile').set('Cookie', other))
          .status,
      ).toBe(200);
    } finally {
      await pool.query('DROP TRIGGER test_password_revoke_failure ON sessions');
      await pool.query('DROP FUNCTION test_password_revoke_failure()');
    }
  });

  it('changes password under the shared policy and revokes every other session only', async () => {
    const current = await login();
    const other = await login();
    await pool.query(
      'UPDATE users SET requires_password_reset=true WHERE user_id=$1',
      [userId],
    );
    const changed = await request(app)
      .post('/api/v1/me/password')
      .set('Cookie', current)
      .send({
        password,
        newPassword: 'ProfileNew9@',
        confirmPassword: 'ProfileNew9@',
      });
    expect(changed.status).toBe(200);
    expect(
      (
        await pool.query(
          'SELECT requires_password_reset FROM users WHERE user_id=$1',
          [userId],
        )
      ).rows[0].requires_password_reset,
    ).toBe(false);
    expect(
      (await request(app).post('/api/v1/auth/login').send({ email, password }))
        .status,
    ).toBe(401);

    expect(
      (await request(app).get('/api/v1/me/profile').set('Cookie', current))
        .status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/v1/me/profile').set('Cookie', other))
        .status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: 'ProfileNew9@' })
      ).status,
    ).toBe(200);
  });

  it('attaches password failures to the correct fields without changing credentials or sessions', async () => {
    const cookie = await login(email, 'ProfileNew9@');
    const other = await login(email, 'ProfileNew9@');
    const before = (
      await pool.query('SELECT password_hash FROM users WHERE user_id=$1', [
        userId,
      ])
    ).rows[0].password_hash;
    const cases = [
      [
        {
          password: 'wrong',
          newPassword: 'AnotherNew9@',
          confirmPassword: 'AnotherNew9@',
        },
        401,
        'password',
      ],
      [
        {
          password: 'ProfileNew9@',
          newPassword: 'AnotherNew9@',
          confirmPassword: 'Mismatch9@',
        },
        422,
        'confirmPassword',
      ],
      [
        {
          password: 'ProfileNew9@',
          newPassword: 'short',
          confirmPassword: 'short',
        },
        422,
        'newPassword',
      ],
      [
        {
          password: 'ProfileNew9@',
          newPassword: 'UpdatedSecure9@',
          confirmPassword: 'UpdatedSecure9@',
        },
        422,
        'newPassword',
      ],
      [
        {
          password: 'ProfileNew9@',
          newPassword: 'AnotherNew9@',
          confirmPassword: 'AnotherNew9@',
          role: 'admin',
        },
        422,
        null,
      ],
    ];
    for (const [body, status, field] of cases) {
      const result = await request(app)
        .post('/api/v1/me/password')
        .set('Cookie', cookie)
        .send(body);
      expect(result.status).toBe(status);
      if (field) expect(result.body.error.fields[field]).toBeTruthy();
    }
    expect(
      (
        await pool.query('SELECT password_hash FROM users WHERE user_id=$1', [
          userId,
        ])
      ).rows[0].password_hash,
    ).toBe(before);
    expect(
      (await request(app).get('/api/v1/me/profile').set('Cookie', other))
        .status,
    ).toBe(200);
  });

  it('keeps the old email active until the new email is verified', async () => {
    const cookie = await login(email, 'ProfileNew9@');
    const wrongPassword = await request(app)
      .post('/api/v1/me/email')
      .set('Cookie', cookie)
      .send({
        password: 'WrongCurrent9!',
        email: `wrong-${Date.now()}@example.com`,
      });
    expect(wrongPassword.status).toBe(401);
    const changed = await request(app)
      .post('/api/v1/me/email')
      .set('Cookie', cookie)
      .send({
        password: 'ProfileNew9@',
        email: `profile-new-${Date.now()}@example.com`,
      });
    expect(changed.status).toBe(200);
    const row = await pool.query(
      'SELECT email,pending_email,email_verified_at FROM users WHERE user_id=$1',
      [userId],
    );
    expect(row.rows[0].email).toBe(email);
    expect(row.rows[0].pending_email).toBeTruthy();
    expect(changed.body).not.toHaveProperty('token');
  });

  it('completes profile email change verification and rejects expired or reused links', async () => {
    const verifyEmail = `profile-verify-${Date.now()}@example.com`;
    const replacementEmail = `profile-verified-${Date.now()}@example.com`;
    const hash = await bcrypt.hash(password, 12);
    const inserted = await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,email_verified_at)
       VALUES($1,$2,'student','Verification User','Verification','it',now()) RETURNING user_id`,
      [verifyEmail, hash],
    );
    const verifyUserId = inserted.rows[0].user_id;
    const cookie = await login(verifyEmail);
    expect(
      (
        await request(app)
          .post('/api/v1/me/email')
          .set('Cookie', cookie)
          .send({ password, email: replacementEmail })
      ).status,
    ).toBe(200);

    const mail = await readFile(`docs/dev-mail/${verifyUserId}.txt`, 'utf8');
    const token = mail.match(/token=([^\s]+)/)?.[1];
    expect(token).toBeTruthy();
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: verifyEmail, password })
      ).status,
    ).toBe(200);

    expect(
      (await request(app).get('/api/v1/auth/verify-email').query({ token }))
        .status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/v1/auth/verify-email').query({ token }))
        .status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: verifyEmail, password })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: replacementEmail, password })
      ).status,
    ).toBe(200);

    const expiredToken = `expired-profile-${Date.now()}`;
    await pool.query(
      `INSERT INTO email_verification_tokens(user_id,token_hash,target_email,expires_at)
       VALUES($1,$2,$3,now()-interval '1 minute')`,
      [
        verifyUserId,
        crypto.createHash('sha256').update(expiredToken).digest('hex'),
        `expired-${Date.now()}@example.com`,
      ],
    );
    expect(
      (
        await request(app)
          .get('/api/v1/auth/verify-email')
          .query({ token: expiredToken })
      ).status,
    ).toBe(422);
  });

  it('enforces every new-password policy rule server-side', async () => {
    const cookie = await login(email, 'ProfileNew9@');
    for (const newPassword of [
      'short',
      'lowercaseonly1!',
      'UPPERCASEONLY1!',
      'NoNumber!!',
      'NoSpecial123',
    ]) {
      const result = await request(app)
        .post('/api/v1/me/password')
        .set('Cookie', cookie)
        .send({
          password: 'ProfileNew9@',
          newPassword,
          confirmPassword: newPassword,
        });
      expect(result.status).toBe(422);
    }
  });

  it('never returns password hashes, MFA secrets, or tokens', async () => {
    const cookie = await login(email, 'ProfileNew9@');
    const result = await request(app)
      .get('/api/v1/me/profile')
      .set('Cookie', cookie);
    const body = JSON.stringify(result.body);
    expect(body).not.toMatch(
      /password_hash|encrypted_secret|token_hash|setupKey|recoveryCode/i,
    );
  });
});
