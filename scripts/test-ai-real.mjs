// @ts-nocheck - explicit paid integration check owns its temporary database and processes.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { resolvePython } from './python-runtime.mjs';

const provider = process.env.AI_PROVIDER || 'mock';
assert.notEqual(
  provider,
  'mock',
  'Configure a real AI provider before this paid check',
);
assert.ok(process.env.AI_MODEL, 'AI_MODEL is required');
const credential = {
  openai_compatible: 'AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
}[provider];
assert.ok(
  credential && process.env[credential],
  'Provider credentials are missing',
);
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const temporary = await mkdtemp(path.join(os.tmpdir(), 'eduquest-live-'));
process.env.PGLITE_SUITE_PORT = String(await freePort());
process.env.AI_SERVICE_URL = `http://127.0.0.1:${await freePort()}`;
process.env.UPLOAD_DIR = path.join(temporary, 'uploads');
process.env.NODE_ENV = 'development';
process.env.EMAIL_DELIVERY = 'development-file';
process.env.COOKIE_SECURE = 'false';
process.env.AI_SERVICE_TOKEN ||= randomBytes(32).toString('hex');
const password = 'PipelineCheck123!';
let cleanupDatabase, ai, pool;
const started = Date.now();
try {
  const { default: setup } =
    await import('../backend/tests/helpers/pglite-global-setup.js');
  cleanupDatabase = await setup();
  ai = spawn(resolvePython(), ['ai-service/run.py'], {
    env: { ...process.env, AI_PORT: new URL(process.env.AI_SERVICE_URL).port },
    stdio: 'ignore',
    windowsHide: true,
  });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    if (ai.exitCode !== null)
      throw new Error('AI service exited during startup');
    try {
      ready = (
        await fetch(`${process.env.AI_SERVICE_URL}/health`, {
          headers: { 'x-ai-service-token': process.env.AI_SERVICE_TOKEN },
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {}
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'AI service did not become ready');
  ({ pool } = await import('../backend/db.js'));
  const { app } = await import('../backend/src/app.js');
  const { once } = await import('../backend/scripts/ai-worker.js');
  await pool.query(
    `INSERT INTO users(email,password_hash,role,full_name,first_name,email_verified_at)
    VALUES('pipeline-lecturer@example.test',$1,'lecturer','Pipeline Lecturer','Pipeline',now())`,
    [await bcrypt.hash(password, 12)],
  );
  const lecturer = request.agent(app);
  assert.equal(
    (
      await lecturer
        .post('/api/v1/auth/login')
        .send({ email: 'pipeline-lecturer@example.test', password })
    ).status,
    200,
  );
  const created = await lecturer
    .post('/api/v1/modules')
    .send({ moduleCode: 'LIVE101', moduleName: 'Database foundations' });
  assert.equal(created.status, 201);
  const module = created.body.module;
  const pdfPath = path.join(temporary, 'source.pdf');
  const pdf = spawnSync(
    resolvePython(),
    [
      '-c',
      String.raw`
import sys
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
lines=[
'Relational databases organize information in tables with rows and columns.',
'A primary key uniquely identifies each row in a table.',
'Foreign keys link records between tables and enforce referential integrity.',
'Normalization reduces duplicate data and prevents update anomalies.',
'SELECT retrieves data and WHERE filters matching rows.',
'INNER JOIN combines records with matching values from two tables.',
'An index speeds up lookups but requires storage and maintenance during writes.',
'A transaction groups changes into one atomic operation.',
'COMMIT saves changes and ROLLBACK discards transaction changes.',
'Parameterized queries bind data separately from SQL to prevent SQL injection.',
'NOT NULL prevents missing values and UNIQUE prevents duplicate values.']
w=PdfWriter()
p=w.add_blank_page(width=800,height=800)
font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
p[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})
stream=DecodedStreamObject()
stream.set_data(('BT /F1 10 Tf 30 750 Td 16 TL '+''.join('('+line+') Tj T* ' for line in lines)+'ET').encode('ascii'))
p[NameObject('/Contents')]=w._add_object(stream)
w.write(sys.argv[1])
`,
      pdfPath,
    ],
    { encoding: 'utf8', timeout: 15000 },
  );
  assert.equal(pdf.status, 0, 'PDF fixture creation failed');
  const uploaded = await lecturer
    .post(`/api/v1/modules/${module.module_id}/resources`)
    .field('title', 'Database source')
    .attach('file', pdfPath);
  assert.equal(uploaded.status, 201);
  const queued = await lecturer
    .post(
      `/api/v1/resources/${uploaded.body.resource.resource_id}/generation-jobs`,
    )
    .send({ questionCount: 8, quizMode: 'practice', difficulty: 'mixed' });
  assert.equal(queued.status, 202);
  await once();
  const job = (
    await pool.query(
      'SELECT status,error_code,quiz_id FROM ai_generation_jobs WHERE job_id=$1',
      [queued.body.job.job_id],
    )
  ).rows[0];
  assert.equal(
    job.status,
    'succeeded',
    `Real generation did not succeed: ${job.error_code || job.status}`,
  );
  assert.equal(
    (
      await pool.query(
        'SELECT count(*)::int AS count FROM questions WHERE quiz_id=$1',
        [job.quiz_id],
      )
    ).rows[0].count,
    8,
  );
  assert.equal(
    (await lecturer.post(`/api/v1/quizzes/${job.quiz_id}/publish`).send({}))
      .status,
    200,
  );
  const student = request.agent(app);
  assert.equal(
    (
      await student.post('/api/v1/auth/register').send({
        email: 'pipeline-student@example.test',
        password,
        confirmPassword: password,
        firstName: 'Learner',
        studentType: 'it',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await student
        .post('/api/v1/enrollments')
        .send({ joinCode: module.join_code })
    ).status,
    201,
  );
  const attempt = await student
    .post(`/api/v1/quizzes/${job.quiz_id}/attempts`)
    .send({});
  assert.equal(attempt.status, 201);
  assert.equal(attempt.body.questions.length, 8);
  assert.ok(
    attempt.body.questions.every((question) =>
      question.options.every((option) => !('is_correct' in option)),
    ),
  );
  const correct = await pool.query(
    'SELECT q.question_id,o.option_id FROM questions q JOIN question_options o USING(question_id) WHERE q.quiz_id=$1 AND o.is_correct=true',
    [job.quiz_id],
  );
  const submitted = await student
    .post(`/api/v1/attempts/${attempt.body.attempt.attempt_id}/submit`)
    .send({
      answers: correct.rows.map((row) => ({
        questionId: row.question_id,
        optionId: row.option_id,
      })),
    });
  assert.equal(submitted.status, 200);
  const expected = (
    await pool.query(
      'SELECT sum(marks)::float AS score FROM questions WHERE quiz_id=$1',
      [job.quiz_id],
    )
  ).rows[0].score;
  assert.equal(Number(submitted.body.result.score), expected);
  assert.equal(submitted.body.unansweredCount, 0);
  console.log(
    JSON.stringify({
      provider,
      model: process.env.AI_MODEL,
      questions: 8,
      pdfUpload: true,
      persisted: true,
      published: true,
      studentSubmission: true,
      elapsedSeconds: (Date.now() - started) / 1000,
    }),
  );
} finally {
  ai?.kill('SIGTERM');
  if (pool) await pool.end();
  if (cleanupDatabase) await cleanupDatabase();
  await rm(temporary, { recursive: true, force: true });
}
