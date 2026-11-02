// @ts-nocheck
import 'dotenv/config';
import { extractResourceText } from './extract-resource.js';
import { selectSourceText } from './ai-source.js';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { containsProfanity } from '../src/profanity/index.js';

/**
 * Persistent AI job worker.
 * Claims queued jobs, calls the local-only AI service with its shared secret,
 * validates again in the backend, and persists each complete quiz atomically.
 */

const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const aiServiceToken = process.env.AI_SERVICE_TOKEN || '';
const maxAttempts = 3;
const staleRunningMinutes = 15;
const localModel = /127\.0\.0\.1|localhost/.test(process.env.AI_BASE_URL || '');
const maxSourceCharacters = Number(
  process.env.AI_MAX_SOURCE_CHARS || (localModel ? 6000 : 60000),
);
const instructionPattern =
  /\b(ignore|follow|obey|disregard)\b.{0,40}\b(instruction|prompt|rule)s?\b|\bsystem prompt\b|\breveal secrets?\b/i;

const validExplanation = (value) => {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text || text.length > 300 || instructionPattern.test(text)) return false;
  const sentences = text.split(/[.!?]+/).filter((part) => part.trim());
  return sentences.length >= 1 && sentences.length <= 2;
};

export const validateAiOutput = (output) => {
  if (
    !output ||
    typeof output.title !== 'string' ||
    !output.title.trim() ||
    !Array.isArray(output.questions) ||
    !output.questions.length
  )
    return false;
  const questionTexts = output.questions.map((question) =>
    String(question?.question_text || '')
      .trim()
      .toLocaleLowerCase(),
  );
  if (new Set(questionTexts).size !== questionTexts.length) return false;
  return output.questions.every((question) => {
    if (
      typeof question.question_text !== 'string' ||
      typeof question.topic !== 'string' ||
      !(Number(question.marks) > 0) ||
      !Number.isInteger(question.difficulty_level) ||
      question.difficulty_level < 1 ||
      question.difficulty_level > 5 ||
      !validExplanation(question.explanation) ||
      !Array.isArray(question.options) ||
      question.options.length < 2 ||
      question.options.length > 6
    )
      return false;
    const texts = question.options.map((option) =>
      String(option.option_text).toLocaleLowerCase(),
    );
    return (
      question.options.filter((option) => option.is_correct === true).length ===
        1 &&
      new Set(texts).size === texts.length &&
      question.options.every(
        (option) =>
          typeof option.option_text === 'string' &&
          typeof option.is_correct === 'boolean',
      )
    );
  });
};

const claimJob = async () => {
  await pool.query(
    `UPDATE ai_generation_jobs
     SET status='failed', error_code='QUEUE_TIMEOUT', updated_at=now()
     WHERE status='queued' AND updated_at < now() - interval '10 minutes'`,
  );
  // Recover a worker that disappeared while an upstream model request was in flight.
  await pool.query(
    `UPDATE ai_generation_jobs
     SET status='failed', error_code='WORKER_TIMEOUT', updated_at=now()
     WHERE status='running' AND updated_at < now() - ($1 || ' minutes')::interval`,
    [staleRunningMinutes],
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT j.*, r.file_location, r.resource_type
       FROM ai_generation_jobs j JOIN resources r ON r.resource_id=j.resource_id
       WHERE j.status='queued' AND j.attempts < $1
       ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      [maxAttempts],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }
    const job = await client.query(
      `UPDATE ai_generation_jobs SET status='running', attempts=attempts+1, updated_at=now() WHERE job_id=$1 RETURNING *`,
      [result.rows[0].job_id],
    );
    await client.query('COMMIT');
    return { ...result.rows[0], ...job.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const processJob = async (job) => {
  try {
    const extractedText = await extractResourceText(job);
    const sourceText = selectSourceText(extractedText, maxSourceCharacters);
    const response = await fetch(`${aiUrl}/generate-quiz`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ai-service-token': aiServiceToken,
      },
      signal: AbortSignal.timeout(
        Number(process.env.AI_WORKER_TIMEOUT_MS || 360000),
      ),
      body: JSON.stringify({
        extracted_text: sourceText,
        question_count: job.question_count,
        difficulty: job.difficulty,
      }),
    });
    if (!response.ok)
      throw new Error(
        response.status === 504 ? 'AI_TIMEOUT' : 'AI_PROVIDER_ERROR',
      );
    const output = await response.json();
    if (
      !validateAiOutput(output) ||
      output.questions.length !== job.question_count ||
      containsProfanity(output.title) ||
      output.questions.some(
        (question) =>
          containsProfanity(question.question_text) ||
          containsProfanity(question.topic) ||
          containsProfanity(question.explanation) ||
          question.options.some((option) =>
            containsProfanity(option.option_text),
          ),
      )
    ) {
      throw new Error('AI_OUTPUT_TEXT_NOT_ALLOWED');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const active = await client.query(
        'SELECT status FROM ai_generation_jobs WHERE job_id=$1 FOR UPDATE',
        [job.job_id],
      );
      if (active.rows[0]?.status !== 'running') {
        await client.query('ROLLBACK');
        return;
      }
      const quiz = await client.query(
        `INSERT INTO quizzes(module_id,resource_id,created_by,title,is_competitive,closes_at,status)
         SELECT module_id,$1,$2,$3,$4,$5,'draft' FROM resources WHERE resource_id=$1
         RETURNING quiz_id,module_id`,
        [
          job.resource_id,
          job.requested_by,
          job.quiz_title || output.title,
          job.quiz_mode === 'competitive',
          job.closes_at || null,
        ],
      );
      for (const question of output.questions) {
        const topic = await client.query(
          `INSERT INTO topics(module_id,name) VALUES($1,$2) ON CONFLICT(module_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING topic_id`,
          [quiz.rows[0].module_id, question.topic],
        );
        const inserted = await client.query(
          `INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation) VALUES($1,$2,$3,$4,$5,$6) RETURNING question_id`,
          [
            quiz.rows[0].quiz_id,
            topic.rows[0].topic_id,
            question.question_text,
            question.marks,
            question.difficulty_level,
            question.explanation,
          ],
        );
        for (const option of question.options)
          await client.query(
            `INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,$2,$3)`,
            [
              inserted.rows[0].question_id,
              option.option_text,
              option.is_correct,
            ],
          );
      }
      await client.query(
        `UPDATE ai_generation_jobs SET status='succeeded',quiz_id=$1,error_code=NULL,updated_at=now() WHERE job_id=$2`,
        [quiz.rows[0].quiz_id, job.job_id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const nextStatus = job.attempts >= maxAttempts ? 'failed' : 'queued';
    const errorCode =
      error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'AI_TIMEOUT'
        : error.message;
    await pool.query(
      `UPDATE ai_generation_jobs SET status=$1,error_code=$2,updated_at=now() WHERE job_id=$3 AND status='running'`,
      [
        nextStatus,
        [
          'AI_OUTPUT_TEXT_NOT_ALLOWED',
          'AI_TIMEOUT',
          'AI_PROVIDER_ERROR',
          'DOCUMENT_EXTRACTION_FAILED',
          'DOCUMENT_HAS_NO_TEXT',
          'DOCUMENT_TYPE_NOT_SUPPORTED',
        ].includes(errorCode)
          ? errorCode
          : 'GENERATION_FAILED',
        job.job_id,
      ],
    );
  }
};

export const once = async () => {
  const job = await claimJob();
  if (job) await processJob(job);
  return Boolean(job);
};

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain && process.argv.includes('--once')) {
  await once();
  await pool.end();
} else if (isMain) {
  console.log('EduQuest AI worker polling');
  while (true) {
    const worked = await once();
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
