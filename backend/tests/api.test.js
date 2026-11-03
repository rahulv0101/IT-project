// @ts-nocheck - Supertest agents and dynamic API fixtures are runtime values.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { emailDns } from '../src/validation/email-domain.js';
vi.spyOn(emailDns, 'resolveMx').mockResolvedValue([
  { exchange: 'mx.example.com', priority: 0 },
]);

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

describe('Milestones 2–5 API authorization and profanity boundary', () => {
  let lecturerAgent;
  let studentAgent;
  let studentTwoAgent;
  let studentThreeAgent;
  let moduleRecord;
  let resourceRecord;
  let groupRecord;
  let quizRecord;
  let attemptRecord;
  let questionRecords;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongLecturerPassword1!', 12);
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name) VALUES ('api-lecturer@example.com',$1,'lecturer','API Lecturer') ON CONFLICT DO NOTHING`,
      [passwordHash],
    );
    lecturerAgent = request.agent(app);
    studentAgent = request.agent(app);
    studentTwoAgent = request.agent(app);
    studentThreeAgent = request.agent(app);
    await lecturerAgent.post('/api/v1/auth/login').send({
      email: 'api-lecturer@example.com',
      password: 'StrongLecturerPassword1!',
    });
    await studentAgent.post('/api/v1/auth/register').send({
      email: 'api-student@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'API Student',
    });
    await studentTwoAgent.post('/api/v1/auth/register').send({
      email: 'api-student-two@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'API Student Two',
    });
    await studentThreeAgent.post('/api/v1/auth/register').send({
      email: 'api-student-three@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'API Student Three',
    });
  });

  it('rejects unauthenticated protected access with 401', async () => {
    expect((await request(app).get('/api/v1/modules')).status).toBe(401);
  });

  it('rejects wrong-role module creation with 403', async () => {
    expect(
      (
        await studentAgent
          .post('/api/v1/modules')
          .send({ moduleCode: 'API101', moduleName: 'API Databases' })
      ).status,
    ).toBe(403);
  });

  it('rejects profanity directly at the backend boundary with generic 422', async () => {
    const result = await request(app).post('/api/v1/auth/register').send({
      email: 'bad-text@example.com',
      password: 'StrongStudentPassword1!',
      fullName: 'fuck',
    });
    expect(result.status).toBe(422);
    expect(JSON.stringify(result.body)).not.toContain('fuck');
  });

  it('enforces the shared profanity boundary on every covered API text field', async () => {
    const profile = await studentAgent
      .put('/api/v1/auth/me')
      .send({ fullName: 'fuck' });
    expect(profile.status).toBe(422);
    const module = await lecturerAgent
      .post('/api/v1/modules')
      .send({ moduleCode: 'BADTEXT', moduleName: 'fuck' });
    expect(module.status).toBe(422);
    const group = await studentAgent
      .post('/api/v1/modules/no-module/groups')
      .send({ groupName: 'fuck' });
    expect(group.status).toBe(422);
    const resource = await lecturerAgent
      .post('/api/v1/modules/no-module/resources')
      .field('title', 'fuck')
      .attach('file', Buffer.from('%PDF-1.4'), 'text.pdf');
    expect(resource.status).toBe(422);
    const quiz = await lecturerAgent.post('/api/v1/quizzes').send({
      moduleId: '00000000-0000-0000-0000-000000000000',
      title: 'Valid',
      questions: [
        {
          questionText: 'fuck',
          topic: 'fuck',
          marks: 1,
          difficultyLevel: 3,
          options: [
            { optionText: 'A', isCorrect: true },
            { optionText: 'B', isCorrect: false },
          ],
        },
      ],
    });
    expect(quiz.status).toBe(422);
  });

  it('creates a lecturer-owned module with a join code', async () => {
    const result = await lecturerAgent
      .post('/api/v1/modules')
      .send({ moduleCode: 'API101', moduleName: 'API Databases' });
    expect(result.status).toBe(201);
    expect(result.body.module.join_code).toHaveLength(16);
    moduleRecord = result.body.module;
    const optionText = await lecturerAgent.post('/api/v1/quizzes').send({
      moduleId: moduleRecord.module_id,
      title: 'Valid',
      questions: [
        {
          questionText: 'Valid question',
          marks: 1,
          difficultyLevel: 3,
          options: [
            { optionText: 'fuck', isCorrect: true },
            { optionText: 'B', isCorrect: false },
          ],
        },
      ],
    });
    expect(optionText.status).toBe(422);
  });

  it('enrols a student using the join code and lists the module', async () => {
    expect(
      (
        await studentAgent
          .post('/api/v1/enrollments')
          .send({ joinCode: moduleRecord.join_code })
      ).status,
    ).toBe(201);
    const result = await studentAgent.get('/api/v1/modules');
    expect(result.status).toBe(200);
    expect(
      result.body.data.some(
        (module) => module.module_id === moduleRecord.module_id,
      ),
    ).toBe(true);
  });

  it('rejects missing or invalid question difficulty levels without persistence [INV-11]', async () => {
    const before = Number(
      (
        await pool.query(
          `SELECT count(*) AS count FROM quizzes WHERE module_id=$1`,
          [moduleRecord.module_id],
        )
      ).rows[0].count,
    );
    for (const difficultyLevel of [undefined, 0, 6, 2.5]) {
      const question = {
        questionText: 'Difficulty validation question',
        marks: 1,
        options: [
          { optionText: 'Correct', isCorrect: true },
          { optionText: 'Wrong', isCorrect: false },
        ],
      };
      if (difficultyLevel !== undefined)
        question.difficultyLevel = difficultyLevel;
      const response = await lecturerAgent.post('/api/v1/quizzes').send({
        moduleId: moduleRecord.module_id,
        title: 'Invalid difficulty quiz',
        questions: [question],
      });
      expect(response.status).toBe(400);
    }
    const after = Number(
      (
        await pool.query(
          `SELECT count(*) AS count FROM quizzes WHERE module_id=$1`,
          [moduleRecord.module_id],
        )
      ).rows[0].count,
    );
    expect(after).toBe(before);
  });

  it('creates a competitive quiz for quiz-engine tests', async () => {
    const response = await lecturerAgent.post('/api/v1/quizzes').send({
      moduleId: moduleRecord.module_id,
      title: 'API Competitive Quiz',
      isCompetitive: true,
      questions: [
        {
          questionText: 'Which layer stores data?',
          marks: 1,
          difficultyLevel: 2,
          options: [
            { optionText: 'Database', isCorrect: true },
            { optionText: 'Presentation', isCorrect: false },
          ],
        },
        {
          questionText: 'Which command reads rows?',
          marks: 1,
          difficultyLevel: 4,
          options: [
            { optionText: 'SELECT', isCorrect: true },
            { optionText: 'DROP', isCorrect: false },
          ],
        },
      ],
    });
    expect(response.status).toBe(201);
    quizRecord = response.body.quiz;
  });

  it('starts an attempt transactionally without exposing correctness', async () => {
    const response = await studentAgent.post(
      `/api/v1/quizzes/${quizRecord.quiz_id}/attempts`,
    );
    expect(response.status).toBe(201);
    expect(JSON.stringify(response.body)).not.toContain('isCorrect');
    attemptRecord = response.body.attempt;
    questionRecords = await pool.query(
      `SELECT q.question_id, q.marks, o.option_id, o.is_correct FROM questions q JOIN question_options o ON o.question_id=q.question_id WHERE q.quiz_id=$1 ORDER BY q.question_id, o.option_id`,
      [quizRecord.quiz_id],
    );
    expect(response.body.questions).toHaveLength(2);
  });

  it('rejects forged score fields and options belonging to another question', async () => {
    const rows = questionRecords.rows;
    const first = rows[0];
    const otherQuestionOption = rows.find(
      (row) => row.question_id !== first.question_id,
    );
    expect(
      (
        await studentAgent
          .post(`/api/v1/attempts/${attemptRecord.attempt_id}/submit`)
          .send({
            score: 999,
            isCorrect: true,
            answers: [],
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await studentAgent
          .post(`/api/v1/attempts/${attemptRecord.attempt_id}/submit`)
          .send({
            answers: [
              {
                questionId: first.question_id,
                optionId: otherQuestionOption.option_id,
              },
            ],
          })
      ).status,
    ).toBe(400);
  });

  it('scores on the server, counts unanswered questions, and makes submit idempotent', async () => {
    const correct = questionRecords.rows.find((row) => row.is_correct);
    const result = await studentAgent
      .post(`/api/v1/attempts/${attemptRecord.attempt_id}/submit`)
      .send({
        answers: [
          { questionId: correct.question_id, optionId: correct.option_id },
        ],
      });
    expect(result.status).toBe(200);
    expect(Number(result.body.result.score)).toBe(1);
    expect(result.body.unansweredCount).toBe(1);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM student_answers WHERE attempt_id=$1',
          [attemptRecord.attempt_id],
        )
      ).rows[0].count,
    ).toBe(1);
    const replay = await studentAgent
      .post(`/api/v1/attempts/${attemptRecord.attempt_id}/submit`)
      .send({ answers: [] });
    expect(replay.status).toBe(200);
    expect(replay.body.alreadySubmitted).toBe(true);
    expect(Number(replay.body.score)).toBe(1);
  });

  it('scores short answers with normalization, punctuation rules, marks and safe storage', async () => {
    const created = await lecturerAgent.post('/api/v1/quizzes/manual').send({
      moduleId: moduleRecord.module_id,
      title: 'Short answer scoring quiz',
      status: 'published',
      questions: [
        {
          questionType: 'short_answer',
          questionText: 'Name the primary city.',
          marks: 3,
          difficultyLevel: 2,
          acceptedAnswers: ['Cape Town', 'Kaapstad'],
          ignorePunctuation: true,
        },
      ],
    });
    expect(created.status).toBe(201);
    const quizId = created.body.quiz.quiz_id;
    const started = await studentAgent.post(
      `/api/v1/quizzes/${quizId}/attempts`,
    );
    expect(started.status).toBe(201);
    expect(JSON.stringify(started.body)).not.toContain('Cape Town');
    const questionId = started.body.questions[0].question_id;
    const submitted = await studentAgent
      .post(`/api/v1/attempts/${started.body.attempt.attempt_id}/submit`)
      .send({
        answers: [{ questionId, answerText: '  KAAPSTAD!  ' }],
      });
    expect(submitted.status).toBe(200);
    expect(Number(submitted.body.result.score)).toBe(3);
    expect(submitted.body.feedback[0].correct_answer).toBe('Cape Town');
    const stored = await pool.query(
      'SELECT answer_text FROM student_answers WHERE attempt_id=$1',
      [started.body.attempt.attempt_id],
    );
    expect(stored.rows[0].answer_text).toBe('KAAPSTAD!');
    const replay = await studentAgent
      .post(`/api/v1/attempts/${started.body.attempt.attempt_id}/submit`)
      .send({ answers: [] });
    expect(replay.body.alreadySubmitted).toBe(true);
    expect(Number(replay.body.score)).toBe(3);
  });

  it('counts blank, wrong and overlong short answers as unanswered or validation failures', async () => {
    const created = await lecturerAgent.post('/api/v1/quizzes/manual').send({
      moduleId: moduleRecord.module_id,
      title: 'Short answer edge cases',
      status: 'published',
      questions: [
        {
          questionType: 'short_answer',
          questionText: 'What is SQL?',
          marks: 2,
          difficultyLevel: 3,
          acceptedAnswers: ['Structured Query Language'],
        },
      ],
    });
    const started = await studentAgent.post(
      `/api/v1/quizzes/${created.body.quiz.quiz_id}/attempts`,
    );
    const questionId = started.body.questions[0].question_id;
    const tooLong = await studentAgent
      .post(`/api/v1/attempts/${started.body.attempt.attempt_id}/submit`)
      .send({ answers: [{ questionId, answerText: 'x'.repeat(2001) }] });
    expect(tooLong.status).toBe(400);
    const blankQuiz = await lecturerAgent.post('/api/v1/quizzes/manual').send({
      moduleId: moduleRecord.module_id,
      title: 'Blank short answer',
      status: 'published',
      questions: [
        {
          questionType: 'short_answer',
          questionText: 'Blank?',
          marks: 2,
          difficultyLevel: 3,
          acceptedAnswers: ['yes'],
        },
      ],
    });
    const blankAttempt = await studentAgent.post(
      `/api/v1/quizzes/${blankQuiz.body.quiz.quiz_id}/attempts`,
    );
    const blank = await studentAgent
      .post(`/api/v1/attempts/${blankAttempt.body.attempt.attempt_id}/submit`)
      .send({
        answers: [
          {
            questionId: blankAttempt.body.questions[0].question_id,
            answerText: '   ',
          },
        ],
      });
    expect(blank.status).toBe(200);
    expect(blank.body.unansweredCount).toBe(1);
    expect(Number(blank.body.result.score)).toBe(0);
  });

  it('runs a lecturer publish dry run and blocks unanswerable drafts', async () => {
    const draft = await lecturerAgent.post('/api/v1/quizzes/manual').send({
      moduleId: moduleRecord.module_id,
      title: 'Dry run checklist quiz',
      status: 'draft',
      questions: [],
    });
    expect(draft.status).toBe(201);
    const blocked = await lecturerAgent
      .post(`/api/v1/quizzes/${draft.body.quiz.quiz_id}/publish-check`)
      .send({});
    expect(blocked.status).toBe(200);
    expect(blocked.body.checklist.ok).toBe(false);
    expect(blocked.body.checklist.issues[0].path).toEqual(['questions']);

    const valid = await lecturerAgent
      .post(`/api/v1/quizzes/${quizRecord.quiz_id}/publish-check`)
      .send({});
    expect(valid.status).toBe(200);
    expect(valid.body.checklist.ok).toBe(true);
    expect(JSON.stringify(valid.body)).not.toMatch(
      /acceptedAnswers|password_hash|token_hash/i,
    );
  });

  it('blocks a second competitive attempt and rejects a late submission', async () => {
    expect(
      (
        await studentAgent.post(
          `/api/v1/quizzes/${quizRecord.quiz_id}/attempts`,
        )
      ).status,
    ).toBe(409);
    const lateQuiz = await lecturerAgent.post('/api/v1/quizzes').send({
      moduleId: moduleRecord.module_id,
      title: 'Late Quiz',
      isCompetitive: false,
      closesAt: new Date(Date.now() + 60_000).toISOString(),
      questions: [
        {
          questionText: 'Late question',
          marks: 1,
          difficultyLevel: 3,
          options: [
            { optionText: 'Yes', isCorrect: true },
            { optionText: 'No', isCorrect: false },
          ],
        },
      ],
    });
    const lateAttempt = await studentAgent.post(
      `/api/v1/quizzes/${lateQuiz.body.quiz.quiz_id}/attempts`,
    );
    expect(lateAttempt.status).toBe(201);
    await pool.query(
      "UPDATE quizzes SET closes_at=now()-interval '1 second' WHERE quiz_id=$1",
      [lateQuiz.body.quiz.quiz_id],
    );
    expect(
      (
        await studentAgent
          .post(
            `/api/v1/attempts/${lateAttempt.body.attempt.attempt_id}/submit`,
          )
          .send({ answers: [] })
      ).status,
    ).toBe(409);
  });

  it('returns competition ranking and scoped analytics with role boundaries', async () => {
    if (!groupRecord) {
      const group = await studentAgent
        .post(`/api/v1/modules/${moduleRecord.module_id}/groups`)
        .send({ groupName: 'Analytics Group' });
      expect(group.status).toBe(201);
      groupRecord = group.body.group;
    }
    const leaderboard = await studentAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/leaderboard`,
    );
    expect(leaderboard.status).toBe(200);
    expect(leaderboard.body.data[0].rank).toBe('1');
    const groupLeaderboard = await studentAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/leaderboard?groupId=${groupRecord.group_id}`,
    );
    expect(groupLeaderboard.status).toBe(200);
    expect(groupLeaderboard.body.data).toHaveLength(1);
    expect((await studentAgent.get('/api/v1/me/analytics')).status).toBe(200);
    expect(
      (
        await studentAgent.get(
          `/api/v1/modules/${moduleRecord.module_id}/analytics`,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await lecturerAgent.get(
          `/api/v1/modules/${moduleRecord.module_id}/analytics`,
        )
      ).status,
    ).toBe(200);
    const groupAnalytics = await lecturerAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/groups/${groupRecord.group_id}/analytics`,
    );
    expect(groupAnalytics.status).toBe(200);
    expect(groupAnalytics.body.data.students).toBe(1);
  });

  it('creates and joins a study group as an enrolled student', async () => {
    const created = await studentAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/groups`)
      .send({ groupName: 'API Study Group' });
    expect(created.status).toBe(201);
    groupRecord = created.body.group;
    expect(
      (
        await studentTwoAgent
          .post('/api/v1/enrollments')
          .send({ joinCode: moduleRecord.join_code })
      ).status,
    ).toBe(201);
    expect(
      (
        await studentTwoAgent.post(
          `/api/v1/groups/${created.body.group.group_id}/join`,
        )
      ).status,
    ).toBe(201);
  });

  it('requires lecturer ownership for resource upload', async () => {
    const response = await studentAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Notes')
      .attach('file', Buffer.from('%PDF-1.4'), 'notes.pdf');
    expect(response.status).toBe(403);
  });

  it('accepts a lecturer resource within the configured size limit', async () => {
    const response = await lecturerAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Revision Notes')
      .attach('file', Buffer.from('%PDF-1.4'), 'notes.pdf');
    expect(response.status).toBe(201);
    resourceRecord = response.body.resource;
  });

  it('rejects a spoofed file whose extension does not match its magic bytes', async () => {
    const response = await lecturerAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Spoofed Notes')
      .attach('file', Buffer.from('not a PDF'), 'spoof.pdf');
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('enforces group-scoped resource visibility', async () => {
    const groupResource = await lecturerAgent
      .post(`/api/v1/modules/${moduleRecord.module_id}/resources`)
      .field('title', 'Group Notes')
      .field('groupId', groupRecord.group_id)
      .attach('file', Buffer.from('group notes'), 'group.txt');
    expect(groupResource.status).toBe(201);
    await studentThreeAgent
      .post('/api/v1/enrollments')
      .send({ joinCode: moduleRecord.join_code });
    const outsider = await studentThreeAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/resources`,
    );
    expect(outsider.status).toBe(200);
    expect(
      outsider.body.data.some(
        (item) => item.resource_id === groupResource.body.resource.resource_id,
      ),
    ).toBe(false);
  });

  it('paginates and searches quizzes newest first without flooding the response', async () => {
    const response = await lecturerAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/quizzes?page=1&pageSize=1&search=API`,
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toContain('API');
    expect(response.body.pagination).toEqual(
      expect.objectContaining({ page: 1, pageSize: 1, total: 1, pages: 1 }),
    );
  });

  it('returns a lecturer-only aggregate game activity projection without student state', async () => {
    const response = await lecturerAgent.get(
      `/api/v1/modules/${moduleRecord.module_id}/games/activity`,
    );
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    for (const row of response.body.data) {
      expect(row).toEqual(
        expect.objectContaining({
          key: expect.any(String),
          display_name: expect.any(String),
          plays: expect.any(Number),
          completions: expect.any(Number),
        }),
      );
      expect(row.plays).toBeGreaterThanOrEqual(row.completions);
    }
    expect(JSON.stringify(response.body)).not.toMatch(
      /student|question|option|state|password/i,
    );
    expect(
      (
        await studentAgent.get(
          `/api/v1/modules/${moduleRecord.module_id}/games/activity`,
        )
      ).status,
    ).toBe(403);
  });

  it('queues an AI job and restricts polling to its requester', async () => {
    const queued = await lecturerAgent
      .post(`/api/v1/resources/${resourceRecord.resource_id}/generation-jobs`)
      .send({ questionCount: 7, difficulty: 'hard', quizMode: 'practice' });
    expect(queued.status).toBe(202);
    expect(queued.body.job.status).toBe('queued');
    expect(queued.body.job.question_count).toBe(7);
    expect(queued.body.job.difficulty).toBe('hard');
    const status = await lecturerAgent.get(
      `/api/v1/ai-generation-jobs/${queued.body.job.job_id}`,
    );
    expect(status.status).toBe(200);
    expect(status.body.job.status).toBe('queued');
    expect(
      (
        await studentAgent.get(
          `/api/v1/ai-generation-jobs/${queued.body.job.job_id}`,
        )
      ).status,
    ).toBe(404);
  });

  it('validates and stores quiz mode, title and closing time for generation jobs', async () => {
    const invalid = await lecturerAgent
      .post(`/api/v1/resources/${resourceRecord.resource_id}/generation-jobs`)
      .send({ questionCount: 5, difficulty: 'mixed' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const closesAt = '2030-01-01T12:00:00.000Z';
    const created = await lecturerAgent
      .post(`/api/v1/resources/${resourceRecord.resource_id}/generation-jobs`)
      .send({
        questionCount: 5,
        difficulty: 'mixed',
        quizMode: 'competitive',
        title: 'Timed database revision',
        closesAt,
      });
    expect(created.status).toBe(202);
    expect(created.body.job.quiz_mode).toBe('competitive');
    expect(created.body.job.quiz_title).toBe('Timed database revision');
    expect(new Date(created.body.job.closes_at).toISOString()).toBe(closesAt);
  });

  it('reports AI status and supports cancelling then retrying a generation job', async () => {
    const status = await lecturerAgent.get('/api/v1/ai-status');
    expect(status.status).toBe(200);
    expect(status.body).toEqual(
      expect.objectContaining({
        provider: expect.any(String),
        configured: expect.any(Boolean),
        reachable: expect.any(Boolean),
        host: expect.any(String),
        model: expect.any(String),
      }),
    );
    expect(JSON.stringify(status.body)).not.toMatch(/api[_-]?key|token/i);

    const created = await lecturerAgent
      .post(`/api/v1/resources/${resourceRecord.resource_id}/generation-jobs`)
      .send({ questionCount: 5, difficulty: 'mixed', quizMode: 'practice' });
    const jobId = created.body.job.job_id;
    const cancelled = await lecturerAgent
      .post(`/api/v1/ai-generation-jobs/${jobId}/cancel`)
      .send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.job.status).toBe('failed');
    expect(cancelled.body.job.error_code).toBe('CANCELLED');

    const retried = await lecturerAgent
      .post(`/api/v1/ai-generation-jobs/${jobId}/retry`)
      .send({});
    expect(retried.status).toBe(202);
    expect(retried.body.job.status).toBe('queued');
    expect(retried.body.job.error_code).toBeNull();
  });

  it('serves a data-driven game chooser with availability, search and resume-safe data', async () => {
    const unauthenticated = await request(app).get('/api/v1/games/catalogue');
    expect(unauthenticated.status).toBe(401);
    const catalogue = await studentAgent.get('/api/v1/games/catalogue');
    expect(catalogue.status).toBe(200);
    expect(catalogue.body.data.map((game) => game.key)).toEqual(
      expect.arrayContaining([
        'infected',
        'island_escape',
        'memory_match',
        'boss_battle',
        'pixel_racer',
        'timer_trivia',
      ]),
    );
    for (const game of catalogue.body.data) {
      expect(game.description).toEqual(expect.any(String));
      expect(game.minimum_questions).toBeGreaterThan(0);
    }
    const picker = await studentAgent.get(
      '/api/v1/games/quiz-picker?page=1&pageSize=1&search=API%20Competitive',
    );
    expect(picker.status).toBe(200);
    expect(picker.body.data).toHaveLength(1);
    expect(picker.body.pagination).toMatchObject({ page: 1, pageSize: 1 });
    const availability = await studentAgent.get(
      `/api/v1/games/availability/${quizRecord.quiz_id}`,
    );
    expect(availability.status).toBe(200);
    const infected = availability.body.data.find(
      (game) => game.key === 'infected',
    );
    expect(infected).toMatchObject({
      available: false,
      reason:
        'Not enough questions for this game yet. At least 6 are required.',
      hasInProgressPlay: false,
    });
    expect(JSON.stringify(availability.body)).not.toMatch(
      /question_text|option_text|is_correct|state/i,
    );
    const plays = await studentAgent.get('/api/v1/games/in-progress');
    expect(plays.status).toBe(200);
    expect(Array.isArray(plays.body.data)).toBe(true);
    expect(JSON.stringify(plays.body)).not.toMatch(
      /question_text|option_text|is_correct|state/i,
    );
  });

  it('revokes the server-side session on logout', async () => {
    expect((await lecturerAgent.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await lecturerAgent.get('/api/v1/modules')).status).toBe(401);
    await lecturerAgent.post('/api/v1/auth/login').send({
      email: 'api-lecturer@example.com',
      password: 'StrongLecturerPassword1!',
    });
  });

  it('rejects invalid login without revealing account state', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'api-lecturer@example.com', password: 'wrong-password' });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Email or password is incorrect.');
  });
});
