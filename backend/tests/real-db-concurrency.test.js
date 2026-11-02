// @ts-nocheck - explicit real PostgreSQL integration check, never part of PGlite gates.
import crypto from 'node:crypto';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { beforeAll, describe, it, expect } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.REAL_TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');
let cookie, quizId, questionId, optionId, attemptId;

describe.sequential('real PostgreSQL simultaneous requests', () => {
  beforeAll(async () => {
    expect(Number(pool.options.max)).toBeGreaterThan(1);
    expect((await pool.query('SELECT version()')).rows[0].version).toContain(
      'PostgreSQL',
    );
    const suffix = crypto.randomUUID();
    const hash = await bcrypt.hash('ConcurrencyCheck9!', 12);
    const lecturer = (
      await pool.query(
        `INSERT INTO users(email,password_hash,role,full_name)
      VALUES($1,$2,'lecturer','Concurrency Lecturer') RETURNING user_id`,
        [`lecturer-${suffix}@example.test`, hash],
      )
    ).rows[0].user_id;
    const email = `student-${suffix}@example.test`;
    const student = (
      await pool.query(
        `INSERT INTO users(email,password_hash,role,full_name)
      VALUES($1,$2,'student','Concurrency Student') RETURNING user_id`,
        [email, hash],
      )
    ).rows[0].user_id;
    const module = (
      await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
      VALUES($1,$2,'Concurrency module',$3) RETURNING module_id`,
        [lecturer, `RACE-${suffix}`, suffix],
      )
    ).rows[0].module_id;
    await pool.query(
      'INSERT INTO enrollments(module_id,student_id) VALUES($1,$2)',
      [module, student],
    );
    quizId = (
      await pool.query(
        `INSERT INTO quizzes(module_id,created_by,title,status,is_competitive)
      VALUES($1,$2,'Concurrency quiz','published',true) RETURNING quiz_id`,
        [module, lecturer],
      )
    ).rows[0].quiz_id;
    questionId = (
      await pool.query(
        `INSERT INTO questions(quiz_id,question_text,marks,difficulty_level)
      VALUES($1,'Which database stores rows?',5,1) RETURNING question_id`,
        [quizId],
      )
    ).rows[0].question_id;
    optionId = (
      await pool.query(
        `INSERT INTO question_options(question_id,option_text,is_correct)
      VALUES($1,'Relational database',true) RETURNING option_id`,
        [questionId],
      )
    ).rows[0].option_id;
    await pool.query(
      `INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,'Image editor',false)`,
      [questionId],
    );
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'ConcurrencyCheck9!' });
    expect(login.status).toBe(200);
    cookie = login.headers['set-cookie'][0].split(';')[0];
  });

  it('starts exactly one scored attempt across eight simultaneous requests', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .post(`/api/v1/quizzes/${quizId}/attempts`)
          .set('Cookie', cookie)
          .send({}),
      ),
    );
    expect(
      responses.filter((response) => response.status === 201),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(7);
    attemptId = responses.find((response) => response.status === 201).body
      .attempt.attempt_id;
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM quiz_attempts WHERE quiz_id=$1',
          [quizId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it('scores one submission once when eight deliveries arrive together', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .post(`/api/v1/attempts/${attemptId}/submit`)
          .set('Cookie', cookie)
          .send({ answers: [{ questionId, optionId }] }),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(
      responses.filter((response) => response.body.alreadySubmitted),
    ).toHaveLength(7);
    expect(
      responses.map((response) =>
        Number(response.body.result?.score ?? response.body.score),
      ),
    ).toEqual(Array(8).fill(5));
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM student_answers WHERE attempt_id=$1',
          [attemptId],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await pool.query(
          'SELECT score,is_scored FROM quiz_attempts WHERE attempt_id=$1',
          [attemptId],
        )
      ).rows[0],
    ).toMatchObject({ score: '5.00', is_scored: true });
  });

  it('allows only one correct option under simultaneous conflicting writes', async () => {
    const id = (
      await pool.query(
        `INSERT INTO questions(quiz_id,question_text,marks,difficulty_level)
      VALUES($1,'Concurrent option constraint',1,1) RETURNING question_id`,
        [quizId],
      )
    ).rows[0].question_id;
    const results = await Promise.allSettled(
      ['One', 'Two'].map((text) =>
        pool.query(
          'INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,$2,true)',
          [id, text],
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected').reason.code,
    ).toBe('23505');
  });
});
