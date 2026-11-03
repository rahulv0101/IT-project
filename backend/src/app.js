// @ts-nocheck
/**
 * EduQuest HTTP application.
 *
 * Route groups follow the product journey from identity to learning content,
 * assessment, games, and reporting. The server remains authoritative for
 * roles, ownership, scores, attempts, game state, and answer correctness.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { registerStudentNetworkRoutes } from './groups/student-network.js';
import { emailDomainValidation } from './validation/email-domain.js';
import { sendVerificationEmail, verificationMailFailure } from './email.js';
import {
  issueEmailCode,
  verifyEmailCode,
  verifyEmailLink,
} from './email-codes.js';
import { readUpload, persistUpload } from './file-storage.js';
import {
  emailSchema,
  normalizePersonName,
  passwordIsAllowed,
  passwordSchema,
  personNameSchema,
  splitLegacyName,
} from './validation/identity.js';
import { pool } from '../db.js';
import {
  noProfanity,
  profanityMessage,
  containsProfanity,
} from './profanity/index.js';
import {
  recordProfanityViolation,
  isProfanityCooldownActive,
} from './profanity/rate-limit.js';
import { resourceYearScope } from './resource-visibility.js';
import { createAiHealthProbe } from './ai-health.js';
import { getGameAvailability } from './games/availability.js';
import { validateScenarioConfig } from './labs/scenario.js';
import { evaluateCell } from './labs/formula.js';
import {
  authorQuizSchema,
  authorQuestionSchema,
  matchesShortAnswer,
  publishChecklist,
} from './quizzes/validation.js';
import { registerInfectedRoutes } from './games/infected/routes.js';
import { registerIslandEscapeRoutes } from './games/island_escape/routes.js';
import { registerMemoryMatchRoutes } from './games/memory_match/routes.js';
import { memoryCountSql } from './games/memory_match/eligibility.js';
import { registerBossBattleRoutes } from './games/boss_battle/routes.js';
import { registerPixelRacerRoutes } from './games/pixel_racer/routes.js';
import { registerTimerTriviaRoutes } from './games/timer_trivia/routes.js';
import { recommendationReason, scoreGroup } from './groups/recommendations.js';
import { registerSessionRoutes } from './groups/sessions.js';
import { registerMessagingRoutes } from './groups/messaging.js';
import { registerAdminRoutes } from './admin/routes.js';

const app = express();
const cookieSecure =
  process.env.COOKIE_SECURE !== 'false' ||
  process.env.NODE_ENV !== 'development';
if (
  process.env.NODE_ENV === 'production' &&
  process.env.COOKIE_SECURE === 'false'
)
  throw new Error('COOKIE_SECURE=false is not allowed in production');
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
await mkdir(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_BYTES || 20 * 1024 * 1024),
  },
});
const allowedExtensions = new Set(['.pdf', '.docx', '.pptx', '.txt', '.md']);
const hasAllowedMagic = (extension, bytes) =>
  extension === '.pdf'
    ? bytes.subarray(0, 5).toString() === '%PDF-'
    : ['.docx', '.pptx'].includes(extension)
      ? bytes.subarray(0, 4).toString('hex') === '504b0304'
      : !bytes.subarray(0, 1024).includes(0);

app.use(helmet());
app.use('/api/v1', (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
app.use(
  cors({
    origin: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 30),
  standardHeaders: true,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sign-in attempts. Please wait and try again.',
    },
  },
});
app.use(
  [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/resend-verification',
    '/api/v1/auth/verify-email',
  ],
  authLimiter,
);

// This endpoint exists only for the isolated browser-test process. It resets
// the in-memory limiter between independent browser tests; production never
// mounts it and therefore keeps the normal brute-force protection intact.
if (process.env.E2E_TEST_MODE === '1')
  app.post('/api/v1/__test/reset-auth-state', async (req, res) => {
    await authLimiter.resetKey(req.ip);
    res.status(204).end();
  });

const sessionHash = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');
const error = (res, status, code, message, requestId, fields) =>
  res.status(status).json({
    error: { code, message, requestId, ...(fields ? { fields } : {}) },
  });
const requestId = (req) => req.id || crypto.randomUUID();
const visibleText = (field, req, res, value) => {
  if (!containsProfanity(value)) return true;
  if (req.user?.userId) recordProfanityViolation(req.user.userId);
  error(res, 422, 'TEXT_NOT_ALLOWED', profanityMessage, requestId(req));
  return false;
};
const labText = z
  .string()
  .trim()
  .min(1)
  .max(5000)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    {
      message: 'Please remove control characters.',
    },
  )
  .refine(noProfanity(), { message: profanityMessage });
const labTitle = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    {
      message: 'Please remove control characters.',
    },
  )
  .refine(noProfanity(), { message: profanityMessage });
const codeText = z
  .string()
  .max(20_000)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    {
      message: 'Please remove control characters.',
    },
  );
const labCheck = z
  .object({
    type: z.enum([
      'element_exists',
      'text_contains',
      'attribute_equals',
      'computed_style_equals',
      'element_count',
      'function_returns',
    ]),
    selector: z.string().trim().max(300).optional(),
    text: z.string().max(500).optional(),
    attribute: z.string().trim().max(100).optional(),
    expected: z
      .union([z.string().max(500), z.number(), z.boolean()])
      .optional(),
    property: z.string().trim().max(100).optional(),
    functionName: z
      .string()
      .regex(/^[A-Za-z_$][\w$]*$/)
      .optional(),
    args: z
      .array(z.union([z.string().max(200), z.number(), z.boolean()]))
      .max(5)
      .optional(),
    hint: z
      .string()
      .max(300)
      .refine(noProfanity(), { message: profanityMessage })
      .optional(),
  })
  .strict();
const codeLabConfig = z
  .object({
    starterHtml: codeText.default(''),
    starterCss: codeText.default(''),
    starterJs: codeText.default(''),
    checks: z.array(labCheck).max(10).default([]),
    modelSolution: z
      .object({ html: codeText, css: codeText, js: codeText })
      .strict()
      .optional(),
    allowModelSolution: z.boolean().default(false),
  })
  .strict();
const spreadsheetCheck = z
  .object({
    cell: z.string().regex(/^[A-Z]{1,2}[1-9][0-9]?$/),
    expected: z.number(),
    tolerance: z.number().min(0).max(1_000_000).default(0.01),
    requiresFormula: z.boolean().default(false),
    hint: z
      .string()
      .max(300)
      .refine(noProfanity(), { message: profanityMessage })
      .optional(),
  })
  .strict();
const spreadsheetConfig = z
  .object({
    startingGrid: z
      .record(
        z.string().regex(/^[A-Z]{1,2}[1-9][0-9]?$/),
        z.union([z.string().max(500), z.number()]),
      )
      .refine((value) => Object.keys(value).length <= 1300)
      .default({}),
    lockedCells: z
      .array(z.string().regex(/^[A-Z]{1,2}[1-9][0-9]?$/))
      .max(1300)
      .default([]),
    checks: z.array(spreadsheetCheck).max(15).default([]),
    currencySymbol: z.string().max(5).default('R'),
    formats: z
      .record(z.string(), z.enum(['currency', 'percentage', 'decimal']))
      .default({}),
  })
  .strict();
const calculatorConfig = z
  .object({
    template: z.enum([
      'break_even',
      'roi',
      'loan_repayment',
      'gross_profit_margin',
      'vat',
    ]),
    inputs: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
            label: labText,
            defaultValue: z.number(),
            unit: z.string().max(20).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    outputs: z
      .array(
        z
          .object({
            key: z.string(),
            label: labText,
            formula: z.string().max(500),
            explanation: labText,
          })
          .strict(),
      )
      .min(1)
      .max(8),
    vatRate: z.number().min(0).max(100).optional(),
  })
  .strict();
const scenarioConfig = z
  .object({
    meters: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z][a-z0-9_]{1,20}$/),
            label: labText,
            initial: z.number(),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    nodes: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9_-]{1,30}$/),
            text: labText,
            choices: z
              .array(
                z
                  .object({
                    label: labText,
                    next: z.string(),
                    changes: z.record(z.string(), z.number()),
                  })
                  .strict(),
              )
              .min(0)
              .max(5),
            terminal: z.boolean().default(false),
            reflection: labText.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
const sanitizeSubmission = (value) => {
  const text = JSON.stringify(value);
  if (text.length > 65_000) throw new Error('LAB_SUBMISSION_TOO_LARGE');
  return value;
};
const parse = (schema, value, req, res, validationStatus = 400) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const hasProfanity = result.error.issues.some(
      (issue) => issue.message === profanityMessage,
    );
    res.status(hasProfanity ? 422 : validationStatus).json({
      error: {
        code: hasProfanity ? 'TEXT_NOT_ALLOWED' : 'VALIDATION_ERROR',
        message: hasProfanity
          ? profanityMessage
          : 'Please check the submitted fields.',
        requestId: requestId(req),
        fields: Object.fromEntries(
          result.error.issues
            .filter((issue) => issue.path.length === 1)
            .map((issue) => [issue.path[0], issue.message]),
        ),
      },
    });
    return null;
  }
  return result.data;
};
const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.eduquest_session;
    if (!token)
      return error(
        res,
        401,
        'UNAUTHENTICATED',
        'Please sign in to continue.',
        requestId(req),
      );
    const result = await pool.query(
      `SELECT u.user_id, u.role, u.full_name, u.first_name, u.last_name, u.student_type, u.student_year, u.email, u.email_verified_at,u.requires_email_verification FROM sessions s JOIN users u ON u.user_id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.account_status='active'`,
      [sessionHash(token)],
    );
    if (!result.rowCount)
      return error(
        res,
        401,
        'UNAUTHENTICATED',
        'Please sign in to continue.',
        requestId(req),
      );
    req.user = {
      userId: result.rows[0].user_id,
      role: result.rows[0].role,
      fullName: result.rows[0].full_name,
      firstName: result.rows[0].first_name,
      lastName: result.rows[0].last_name,
      studentType: result.rows[0].student_type,
      studentYear: result.rows[0].student_year,
      emailVerifiedAt: result.rows[0].email_verified_at,
      needsEmailVerification: !result.rows[0].email_verified_at,
      email: result.rows[0].email,
    };
    const verificationRoute =
      (req.method === 'GET' && req.path === '/api/v1/auth/me') ||
      (req.method === 'POST' &&
        [
          '/api/v1/auth/verify-email',
          '/api/v1/auth/resend-verification',
          '/api/v1/auth/logout',
        ].includes(req.path));
    if (
      result.rows[0].requires_email_verification &&
      !result.rows[0].email_verified_at &&
      !verificationRoute
    )
      return error(
        res,
        403,
        'EMAIL_NOT_VERIFIED',
        'Verify your email before accessing your account.',
        requestId(req),
      );
    if (isProfanityCooldownActive(req.user.userId))
      return error(
        res,
        429,
        'TEXT_COOLDOWN',
        'Please wait before submitting more text.',
        requestId(req),
      );
    next();
  } catch (e) {
    next(e);
  }
};
const requireRole = (role) => (req, res, next) =>
  req.user?.role === role
    ? next()
    : error(
        res,
        403,
        'FORBIDDEN',
        'You do not have access to this function.',
        requestId(req),
      );
const issueSession = async (userId, res) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query(
      'SELECT account_status FROM users WHERE user_id=$1 FOR UPDATE',
      [userId],
    );
    if (user.rows[0]?.account_status !== 'active') {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '8 hours')`,
      [userId, sessionHash(token)],
    );
    await client.query('COMMIT');
  } catch (cause) {
    await client.query('ROLLBACK');
    throw cause;
  } finally {
    client.release();
  }
  res.cookie('eduquest_session', token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
  });
  return true;
};
const issueVerificationMail = async (userId, email, targetEmail = null) => {
  const client = await pool.connect();
  let code;
  const token = crypto.randomBytes(32).toString('base64url');
  try {
    await client.query('BEGIN');
    code = await issueEmailCode(client, userId, targetEmail);
    await client.query(
      'UPDATE email_verification_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1',
      [userId],
    );
    await client.query(
      `INSERT INTO email_verification_tokens(user_id,token_hash,target_email,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')`,
      [userId, sessionHash(token), targetEmail],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await sendVerificationEmail({ userId, email, token, code });
};

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(noProfanity(), { message: profanityMessage });
const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().max(200).optional(),
    firstName: personNameSchema.optional(),
    lastName: z.preprocess(
      (value) => (typeof value === 'string' && !value.trim() ? null : value),
      personNameSchema.optional().nullable(),
    ),
    studentType: z.enum(['it', 'business']).optional(),
    studentYear: z.number().int().min(1).max(3).optional(),
    // Kept temporarily so existing users and offline fixtures can migrate safely.
    fullName: z.string().trim().max(101).optional(),
  })
  .strict()
  .refine((data) => data.firstName || data.fullName, {
    message: 'First name is required.',
    path: ['firstName'],
  })
  .refine(
    (data) =>
      data.confirmPassword === undefined ||
      data.password === data.confirmPassword,
    {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    },
  )
  .refine((data) => data.fullName || data.studentType, {
    message: 'Student type is required.',
    path: ['studentType'],
  });
const moduleSchema = z
  .object({
    moduleCode: z.string().trim().min(1).max(30),
    moduleName: nameSchema,
    description: z
      .string()
      .trim()
      .max(1000)
      .refine(noProfanity(), { message: profanityMessage })
      .optional(),
    year: z.number().int().min(1).max(3).optional(),
    programme: z.enum(['it', 'business', 'both']).optional(),
    offering: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
const groupSchema = z.object({ groupName: nameSchema }).strict();
const groupDetailsSchema = z
  .object({
    groupName: nameSchema,
    focus: z
      .string()
      .trim()
      .max(200)
      .refine(noProfanity(), { message: profanityMessage })
      .optional(),
    description: z
      .string()
      .trim()
      .max(500)
      .refine(noProfanity(), { message: profanityMessage })
      .optional(),
    visibility: z.enum(['module', 'members', 'private']).optional(),
    languages: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  })
  .strict();
const groupQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(100).optional(),
  moduleId: z.string().uuid().optional(),
  language: z.string().trim().max(300).optional(),
  recommended: z.enum(['true', 'false']).optional(),
  sort: z.enum(['recommended', 'newest', 'name']).default('recommended'),
  refresh: z.coerce.number().int().optional(),
  membership: z.enum(['all', 'joined', 'available']).default('all'),
});
const groupUpdateSchema = z
  .object({
    kind: z.enum(['doing_now', 'next_up']),
    text: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(noProfanity(), { message: profanityMessage }),
    topicId: z.string().uuid().optional().nullable(),
    plannedFor: z.string().datetime().optional().nullable(),
    sessionId: z.string().uuid().optional().nullable(),
  })
  .strict();
const titleSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(noProfanity(), { message: profanityMessage });

// ── Service health and account registration ────────────────────────────────
app.get('/health', async (_req, res) => {
  const result = await pool.query('SELECT 1 AS ok');
  res.json({ ok: result.rows[0].ok === 1 });
});
app.post('/api/v1/auth/register', async (req, res, next) => {
  try {
    const data = parse(registerSchema, req.body, req, res, 422);
    if (!data) return;
    const identity = data.firstName
      ? {
          firstName: normalizePersonName(data.firstName),
          lastName: data.lastName ? normalizePersonName(data.lastName) : null,
        }
      : splitLegacyName(data.fullName);
    if (!visibleText('firstName', req, res, identity.firstName)) return;
    if (
      identity.lastName &&
      !visibleText('lastName', req, res, identity.lastName)
    )
      return;
    if (!passwordIsAllowed(data.password, data.email, identity.firstName))
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Choose a less common password that does not contain your email or first name.',
        requestId(req),
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
    const hash = await bcrypt.hash(data.password, 12);
    const fullName = [identity.firstName, identity.lastName]
      .filter(Boolean)
      .join(' ');
    const result = await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name,first_name,last_name,student_type,student_year) VALUES($1,$2,'student',$3,$4,$5,$6,$7) RETURNING user_id,role,full_name,first_name,last_name,student_type,student_year,email,email_verified_at`,
      [
        data.email,
        hash,
        fullName,
        identity.firstName,
        identity.lastName,
        data.studentType || 'it',
        data.studentYear || 1,
      ],
    );
    let verificationDelivery = 'sent';
    try {
      await issueVerificationMail(result.rows[0].user_id, data.email);
    } catch (mailError) {
      verificationDelivery = 'unavailable';
      console.error(JSON.stringify(verificationMailFailure(mailError)));
    }
    if (!(await issueSession(result.rows[0].user_id, res)))
      return error(
        res,
        403,
        'ACCOUNT_INACTIVE',
        'This account is unavailable. Please contact an administrator.',
        requestId(req),
      );
    res.status(201).json({
      user: {
        ...result.rows[0],
        needs_email_verification: true,
        verification_delivery: verificationDelivery,
      },
    });
  } catch (e) {
    if (e.code === '23505')
      return error(
        res,
        409,
        'EMAIL_EXISTS',
        'An account with that email already exists.',
        requestId(req),
      );
    next(e);
  }
});
app.post(
  '/api/v1/auth/resend-verification',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res)) return;
      const user = (
        await pool.query(
          'SELECT email,email_verified_at,pending_email FROM users WHERE user_id=$1',
          [req.user.userId],
        )
      ).rows[0];
      if (user.email_verified_at && !user.pending_email)
        return res.json({ sent: true });
      try {
        await issueVerificationMail(
          req.user.userId,
          user.pending_email || user.email,
          user.pending_email || null,
        );
      } catch (mailError) {
        if (mailError.code === 'VERIFICATION_COOLDOWN') {
          res.set('Retry-After', '60');
          return error(
            res,
            429,
            'VERIFICATION_COOLDOWN',
            'Wait a minute before requesting another code.',
            requestId(req),
          );
        }
        console.error(JSON.stringify(verificationMailFailure(mailError)));
        return error(
          res,
          503,
          'EMAIL_UNAVAILABLE',
          'Verification email could not be sent. Please try again later.',
          requestId(req),
        );
      }
      res.json({ sent: true, retryAfter: 60 });
    } catch (e) {
      next(e);
    }
  },
);

app.post('/api/v1/auth/verify-email', requireAuth, async (req, res, next) => {
  try {
    const data = parse(
      z
        .object({
          code: z
            .string()
            .regex(/^\d{6}$/, 'Enter the 6-digit verification code.'),
        })
        .strict(),
      req.body,
      req,
      res,
      422,
    );
    if (!data) return;
    const user = await verifyEmailCode(pool, req.user.userId, data.code);
    if (!user)
      return error(
        res,
        422,
        'INVALID_VERIFICATION_CODE',
        'That code is invalid, expired or has already been used. Request a new code if needed.',
        requestId(req),
      );
    res.json({ verified: true, user });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/auth/verify-email', async (req, res, next) => {
  try {
    const data = parse(
      z.object({ token: z.string().min(20).max(200) }).strict(),
      req.query,
      req,
      res,
    );
    if (!data) return;
    const verified = await verifyEmailLink(pool, data.token);
    if (!verified)
      return error(
        res,
        422,
        'INVALID_VERIFICATION_TOKEN',
        'This verification link is invalid or expired.',
        requestId(req),
      );
    res.json({ verified: true });
  } catch (e) {
    next(e);
  }
});

// Former MFA URLs are retired; none can issue sessions or enable MFA.
const mfaRemoved = (req, res) =>
  error(
    res,
    410,
    'MFA_REMOVED',
    'Authenticator sign-in has been removed. Sign in again with your email and password.',
    requestId(req),
  );
for (const endpoint of [
  'enrol',
  'confirm',
  'disable',
  'recovery-codes/regenerate',
])
  app.post(`/api/v1/mfa/${endpoint}`, requireAuth, mfaRemoved);
app.post('/api/v1/auth/login/mfa', mfaRemoved);

const groupCreateSchema = groupDetailsSchema.extend({
  moduleId: z.string().uuid(),
});

const sanitizeGroupText = (value) =>
  typeof value === 'string'
    ? value
        .replace(/[<>]/g, '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    : value;
const sanitizeUpdate = (update) =>
  update && {
    ...update,
    text: sanitizeGroupText(update.text),
    topic: sanitizeGroupText(update.topic),
  };
const groupResponse = (row, student) => {
  const group = {
    ...row,
    group_name: sanitizeGroupText(row.group_name),
    focus: sanitizeGroupText(row.focus),
    description: sanitizeGroupText(row.description),
    leaders: row.leaders || [],
    languages: row.languages || [],
    latest_doing_now: sanitizeUpdate(row.latest_doing_now),
    next_up: (row.next_up || []).map(sanitizeUpdate),
    is_member: Boolean(row.is_member),
    can_join: !row.is_member,
  };
  group.recommendation_score = scoreGroup(student, group);
  group.recommendation_reason = recommendationReason(student, group);
  return group;
};

// ── Study groups, leaders, recommendations, and updates ────────────────────
app.get('/api/v1/groups', requireAuth, async (req, res, next) => {
  try {
    const query = parse(groupQuerySchema, req.query, req, res, 422);
    if (!query) return;
    const params = [req.user.userId];
    const conditions = [];
    if (req.user.role === 'student') {
      conditions.push(
        `EXISTS (SELECT 1 FROM enrollments en WHERE en.module_id=g.module_id AND en.student_id=$1)`,
      );
      conditions.push(
        `(g.visibility='module' OR EXISTS (SELECT 1 FROM group_members vm WHERE vm.group_id=g.group_id AND vm.student_id=$1))`,
      );
    } else {
      conditions.push(`m.lecturer_id=$1`);
    }
    if (query.membership === 'joined')
      conditions.push(
        'EXISTS (SELECT 1 FROM group_members mine WHERE mine.group_id=g.group_id AND mine.student_id=$1)',
      );
    if (query.membership === 'available')
      conditions.push(
        'NOT EXISTS (SELECT 1 FROM group_members mine WHERE mine.group_id=g.group_id AND mine.student_id=$1)',
      );
    if (query.moduleId) {
      params.push(query.moduleId);
      conditions.push(`g.module_id=$${params.length}`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(
        `(g.group_name ILIKE $${params.length} OR g.focus ILIKE $${params.length} OR g.description ILIKE $${params.length})`,
      );
    }
    const languageNames = query.language
      ? query.language
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    if (languageNames.length) {
      params.push(languageNames);
      conditions.push(
        `EXISTS (SELECT 1 FROM group_languages glf JOIN programming_languages plf ON plf.language_id=glf.language_id WHERE glf.group_id=g.group_id AND plf.name = ANY($${params.length}::text[]))`,
      );
    }
    const result = await pool.query(
      `SELECT g.group_id,g.module_id,g.group_name,g.focus,g.description,g.visibility,g.created_date,
        m.module_code,m.module_name,m.year,m.programme,
        (SELECT count(*)::int FROM group_members gm_count WHERE gm_count.group_id=g.group_id) AS member_count,
        EXISTS(SELECT 1 FROM group_members gm_me WHERE gm_me.group_id=g.group_id AND gm_me.student_id=$1) AS is_member,
        EXISTS(SELECT 1 FROM group_leaders gl_me WHERE gl_me.group_id=g.group_id AND gl_me.student_id=$1) AS is_leader,
        (SELECT COALESCE(json_agg(json_build_object('student_id',gl.student_id,'name',u.full_name,'role',gl.role) ORDER BY gl.role,u.full_name),'[]'::json) FROM group_leaders gl JOIN users u ON u.user_id=gl.student_id WHERE gl.group_id=g.group_id) AS leaders,
        (SELECT COALESCE(json_agg(pl.name ORDER BY pl.name),'[]'::json) FROM group_languages gl JOIN programming_languages pl ON pl.language_id=gl.language_id WHERE gl.group_id=g.group_id) AS languages,
        (SELECT json_build_object('update_id',gu.update_id,'text',gu.text,'planned_for',gu.planned_for,'created_at',gu.created_at,'topic',t.name) FROM group_updates gu LEFT JOIN topics t ON t.topic_id=gu.topic_id WHERE gu.group_id=g.group_id AND gu.kind='doing_now' ORDER BY gu.created_at DESC LIMIT 1) AS latest_doing_now,
        (SELECT COALESCE(json_agg(nu.item ORDER BY nu.planned_for NULLS LAST, nu.created_at DESC),'[]'::json) FROM (SELECT json_build_object('update_id',gu.update_id,'text',gu.text,'planned_for',gu.planned_for,'created_at',gu.created_at,'topic',t.name,'session_id',gu.session_id) AS item,gu.planned_for,gu.created_at FROM group_updates gu LEFT JOIN topics t ON t.topic_id=gu.topic_id WHERE gu.group_id=g.group_id AND gu.kind='next_up' ORDER BY gu.planned_for NULLS LAST,gu.created_at DESC LIMIT 3) nu) AS next_up
       FROM study_groups g JOIN modules m ON m.module_id=g.module_id
      WHERE ${conditions.join(' AND ')} ORDER BY g.created_date DESC LIMIT 500`,
      params,
    );
    const preferred = await pool.query(
      `SELECT pl.name FROM user_preferred_languages upl JOIN programming_languages pl ON pl.language_id=upl.language_id WHERE upl.user_id=$1 ORDER BY pl.name`,
      [req.user.userId],
    );
    const enrolled = await pool.query(
      `SELECT module_id FROM enrollments WHERE student_id=$1`,
      [req.user.userId],
    );
    const student = {
      ...req.user,
      moduleIds: enrolled.rows.map((row) => row.module_id),
      preferredLanguages: preferred.rows.map((row) => row.name),
    };
    let data = result.rows.map((row) => groupResponse(row, student));
    if (query.recommended === 'true' || query.sort === 'recommended')
      data.sort(
        (a, b) =>
          b.recommendation_score - a.recommendation_score ||
          a.group_name.localeCompare(b.group_name),
      );
    else if (query.sort === 'name')
      data.sort((a, b) => a.group_name.localeCompare(b.group_name));
    const total = data.length;
    const start = (query.page - 1) * query.pageSize;
    res.json({
      data: data.slice(start, start + query.pageSize),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  } catch (e) {
    next(e);
  }
});

app.post(
  '/api/v1/groups',
  requireAuth,
  requireRole('student'),
  async (req, res, next) => {
    const data = parse(groupCreateSchema, req.body, req, res, 422);
    if (!data) return;
    if (data.focus !== undefined && !visibleText('focus', req, res, data.focus))
      return;
    if (
      data.description !== undefined &&
      !visibleText('description', req, res, data.description)
    )
      return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const enrolled = await client.query(
        'SELECT 1 FROM enrollments WHERE student_id=$1 AND module_id=$2',
        [req.user.userId, data.moduleId],
      );
      if (!enrolled.rowCount) {
        await client.query('ROLLBACK');
        return error(
          res,
          403,
          'FORBIDDEN',
          'You are not enrolled in this module.',
          requestId(req),
        );
      }
      const languages = data.languages || [];
      const languageRows = languages.length
        ? await client.query(
            'SELECT language_id,name FROM programming_languages WHERE name = ANY($1::text[])',
            [languages],
          )
        : { rows: [] };
      if (languageRows.rows.length !== languages.length) {
        await client.query('ROLLBACK');
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'Choose languages from the available list.',
          requestId(req),
        );
      }
      const group = await client.query(
        `INSERT INTO study_groups(module_id,created_by,group_name,focus,description,visibility) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          data.moduleId,
          req.user.userId,
          data.groupName,
          data.focus || '',
          data.description || '',
          data.visibility || 'module',
        ],
      );
      const groupId = group.rows[0].group_id;
      await client.query(
        'INSERT INTO group_members(group_id,student_id) VALUES($1,$2)',
        [groupId, req.user.userId],
      );
      await client.query(
        `INSERT INTO group_leaders(group_id,student_id,role) VALUES($1,$2,'leader')`,
        [groupId, req.user.userId],
      );
      for (const language of languageRows.rows)
        await client.query(
          'INSERT INTO group_languages(group_id,language_id) VALUES($1,$2)',
          [groupId, language.language_id],
        );
      await client.query('COMMIT');
      res.status(201).json({ group: group.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      next(e);
    } finally {
      client.release();
    }
  },
);

app.patch('/api/v1/groups/:groupId', requireAuth, async (req, res, next) => {
  try {
    const data = parse(groupDetailsSchema.partial(), req.body, req, res, 422);
    if (!data) return;
    for (const [field, value] of [
      ['groupName', data.groupName],
      ['focus', data.focus],
      ['description', data.description],
    ])
      if (value !== undefined && !visibleText(field, req, res, value)) return;
    const leader = await pool.query(
      `SELECT 1 FROM group_leaders WHERE group_id=$1 AND student_id=$2`,
      [req.params.groupId, req.user.userId],
    );
    if (!leader.rowCount)
      return error(
        res,
        403,
        'FORBIDDEN',
        'Only group leaders can edit this group.',
        requestId(req),
      );
    const existing = await pool.query(
      'SELECT * FROM study_groups WHERE group_id=$1',
      [req.params.groupId],
    );
    if (!existing.rowCount)
      return error(
        res,
        404,
        'NOT_FOUND',
        'Study group not found.',
        requestId(req),
      );
    const languages = data.languages || null;
    if (languages) {
      const rows = await pool.query(
        'SELECT language_id,name FROM programming_languages WHERE name = ANY($1::text[])',
        [languages],
      );
      if (rows.rowCount !== languages.length)
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'Choose languages from the available list.',
          requestId(req),
        );
      await pool.query('DELETE FROM group_languages WHERE group_id=$1', [
        req.params.groupId,
      ]);
      for (const row of rows.rows)
        await pool.query(
          'INSERT INTO group_languages(group_id,language_id) VALUES($1,$2)',
          [req.params.groupId, row.language_id],
        );
    }
    const updated = await pool.query(
      `UPDATE study_groups SET group_name=COALESCE($1,group_name),focus=COALESCE($2,focus),description=COALESCE($3,description),visibility=COALESCE($4,visibility) WHERE group_id=$5 RETURNING *`,
      [
        data.groupName ?? null,
        data.focus ?? null,
        data.description ?? null,
        data.visibility ?? null,
        req.params.groupId,
      ],
    );
    res.json({ group: updated.rows[0] });
  } catch (e) {
    next(e);
  }
});

app.post(
  '/api/v1/groups/:groupId/leaders',
  requireAuth,
  async (req, res, next) => {
    try {
      const data = parse(
        z.object({ studentId: z.string().uuid() }).strict(),
        req.body,
        req,
        res,
        422,
      );
      if (!data) return;
      const leader = await pool.query(
        'SELECT 1 FROM group_leaders WHERE group_id=$1 AND student_id=$2',
        [req.params.groupId, req.user.userId],
      );
      if (!leader.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'Only group leaders can manage co-leaders.',
          requestId(req),
        );
      const member = await pool.query(
        'SELECT 1 FROM group_members WHERE group_id=$1 AND student_id=$2',
        [req.params.groupId, data.studentId],
      );
      if (!member.rowCount)
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'A co-leader must be a group member.',
          requestId(req),
        );
      const existing = await pool.query(
        'SELECT role FROM group_leaders WHERE group_id=$1 AND student_id=$2',
        [req.params.groupId, data.studentId],
      );
      if (existing.rowCount && existing.rows[0].role === 'leader')
        return res.status(200).json({
          leader: {
            group_id: req.params.groupId,
            student_id: data.studentId,
            role: 'leader',
          },
        });
      const result = await pool.query(
        `INSERT INTO group_leaders(group_id,student_id,role) VALUES($1,$2,'co-leader') ON CONFLICT (group_id,student_id) DO UPDATE SET role='co-leader' RETURNING *`,
        [req.params.groupId, data.studentId],
      );
      res.status(201).json({ leader: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  '/api/v1/groups/:groupId/leaders/:studentId',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const leader = await pool.query(
        'SELECT role FROM group_leaders WHERE group_id=$1 AND student_id=$2',
        [req.params.groupId, req.user.userId],
      );
      if (!leader.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'Only group leaders can manage co-leaders.',
          requestId(req),
        );
      const target = await pool.query(
        "DELETE FROM group_leaders WHERE group_id=$1 AND student_id=$2 AND role='co-leader' RETURNING student_id",
        [req.params.groupId, req.params.studentId],
      );
      if (!target.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Co-leader not found.',
          requestId(req),
        );
      res.json({ removed: true });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/groups/:groupId/updates',
  requireAuth,
  async (req, res, next) => {
    try {
      const data = parse(groupUpdateSchema, req.body, req, res, 422);
      if (!data) return;
      if (!visibleText('text', req, res, data.text)) return;
      const leader = await pool.query(
        'SELECT 1 FROM group_leaders WHERE group_id=$1 AND student_id=$2',
        [req.params.groupId, req.user.userId],
      );
      if (!leader.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'Only group leaders can post updates.',
          requestId(req),
        );
      if (
        data.sessionId &&
        !(
          await pool.query(
            'SELECT 1 FROM group_sessions WHERE session_id=$1 AND group_id=$2',
            [data.sessionId, req.params.groupId],
          )
        ).rowCount
      )
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'Choose a session in this group.',
          requestId(req),
        );
      const result = await pool.query(
        `INSERT INTO group_updates(group_id,author_id,kind,text,topic_id,planned_for,session_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING update_id,group_id,author_id,kind,text,topic_id,planned_for,session_id,created_at`,
        [
          req.params.groupId,
          req.user.userId,
          data.kind,
          data.text,
          data.topicId || null,
          data.plannedFor || null,
          data.sessionId || null,
        ],
      );
      res.status(201).json({ update: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  '/api/v1/groups/:groupId/updates/:updateId',
  requireAuth,
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const result = await pool.query(
        `DELETE FROM group_updates gu WHERE gu.update_id=$1 AND gu.group_id=$2 AND (gu.author_id=$3 OR EXISTS (SELECT 1 FROM group_leaders gl WHERE gl.group_id=gu.group_id AND gl.student_id=$3)) RETURNING update_id`,
        [req.params.updateId, req.params.groupId, req.user.userId],
      );
      if (!result.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You cannot remove this update.',
          requestId(req),
        );
      res.json({ removed: true });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/groups/:groupId/leave',
  requireAuth,
  requireRole('student'),
  async (req, res, next) => {
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT group_id FROM study_groups WHERE group_id=$1 FOR UPDATE',
        [req.params.groupId],
      );
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const member = await client.query(
        'SELECT 1 FROM group_members WHERE group_id=$1 AND student_id=$2',
        [req.params.groupId, req.user.userId],
      );
      if (!member.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You are not a member of this study group.',
          requestId(req),
        );
      const leader = await client.query(
        'SELECT role FROM group_leaders WHERE group_id=$1 AND student_id=$2',
        [req.params.groupId, req.user.userId],
      );
      if (leader.rowCount && leader.rows[0].role === 'leader')
        return error(
          res,
          409,
          'LEADER_HANDOVER_REQUIRED',
          'Hand over leadership before leaving this group.',
          requestId(req),
        );
      await client.query(
        "DELETE FROM group_leaders WHERE group_id=$1 AND student_id=$2 AND role='co-leader'",
        [req.params.groupId, req.user.userId],
      );
      await client.query(
        'DELETE FROM group_members WHERE group_id=$1 AND student_id=$2',
        [req.params.groupId, req.user.userId],
      );
      await client.query('COMMIT');
      committed = true;
      res.json({ left: true });
    } catch (e) {
      next(e);
    } finally {
      if (!committed) await client.query('ROLLBACK');
      client.release();
    }
  },
);

// ── Password sign-in, sessions, and logout ───────────────────────────────
app.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    const data = parse(
      z.object({ email: emailSchema, password: z.string() }).strict(),
      req.body,
      req,
      res,
    );
    if (!data) return;
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [
      data.email,
    ]);
    if (
      !result.rowCount ||
      !(await bcrypt.compare(data.password, result.rows[0].password_hash))
    )
      return error(
        res,
        401,
        'INVALID_LOGIN',
        'Email or password is incorrect.',
        requestId(req),
      );
    if (result.rows[0].account_status !== 'active')
      return error(
        res,
        403,
        result.rows[0].account_status === 'inactive'
          ? 'ACCOUNT_INACTIVE'
          : 'ACCOUNT_SUSPENDED',
        'This account is inactive or suspended. Please contact an administrator.',
        requestId(req),
      );
    if (!(await issueSession(result.rows[0].user_id, res)))
      return error(
        res,
        403,
        'ACCOUNT_INACTIVE',
        'This account is unavailable. Please contact an administrator.',
        requestId(req),
      );
    res.json({
      user: {
        user_id: result.rows[0].user_id,
        role: result.rows[0].role,
        full_name: result.rows[0].full_name,
        first_name: result.rows[0].first_name,
        last_name: result.rows[0].last_name,
        student_type: result.rows[0].student_type,
        email_verified_at: result.rows[0].email_verified_at,
        needs_email_verification: !result.rows[0].email_verified_at,
        email: result.rows[0].email,
      },
    });
  } catch (e) {
    next(e);
  }
});
app.post('/api/v1/auth/logout', requireAuth, async (req, res, next) => {
  try {
    if (!parse(z.object({}).strict(), req.body || {}, req, res)) return;
    await pool.query(
      'UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',
      [sessionHash(req.cookies.eduquest_session)],
    );
    res.clearCookie('eduquest_session');
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
app.get('/api/v1/auth/me', requireAuth, (req, res) =>
  res.json({ user: req.user }),
);
app.put('/api/v1/auth/me', requireAuth, async (req, res, next) => {
  try {
    const data = parse(
      z
        .object({
          firstName: personNameSchema.optional(),
          lastName: personNameSchema.optional().nullable(),
          fullName: z.string().trim().max(101).optional(),
        })
        .strict()
        .refine((value) => value.firstName || value.fullName, {
          message: 'First name is required.',
          path: ['firstName'],
        }),
      req.body,
      req,
      res,
    );
    if (!data) return;
    const identity = data.firstName
      ? {
          firstName: normalizePersonName(data.firstName),
          lastName: data.lastName ? normalizePersonName(data.lastName) : null,
        }
      : splitLegacyName(data.fullName);
    if (!visibleText('firstName', req, res, identity.firstName)) return;
    const result = await pool.query(
      'UPDATE users SET first_name=$1,last_name=$2,full_name=$3 WHERE user_id=$4 RETURNING user_id,role,full_name,first_name,last_name,student_type,email,email_verified_at',
      [
        identity.firstName,
        identity.lastName,
        [identity.firstName, identity.lastName].filter(Boolean).join(' '),
        req.user.userId,
      ],
    );
    res.json({ user: result.rows[0] });
  } catch (e) {
    next(e);
  }
});

const profileSchema = z
  .object({
    firstName: personNameSchema.optional(),
    lastName: personNameSchema.optional().nullable(),
    studentType: z.enum(['it', 'business']).optional(),
    studentYear: z.number().int().min(1).max(3).optional(),
    preferredLanguages: z
      .array(z.string().trim().min(1).max(40))
      .max(10)
      .optional(),
  })
  .strict();
const currentPasswordSchema = z
  .object({ password: z.string().min(1) })
  .strict();

const profileUser = async (userId) => {
  const result = await pool.query(
    `SELECT u.user_id,u.role,u.full_name,u.first_name,u.last_name,u.student_type,u.student_year,
            u.email,u.email_verified_at,u.pending_email,
            COALESCE(json_agg(pl.name ORDER BY pl.name) FILTER (WHERE pl.name IS NOT NULL), '[]') AS preferred_languages,
            false AS mfa_enabled
       FROM users u
       LEFT JOIN user_preferred_languages upl ON upl.user_id=u.user_id
       LEFT JOIN programming_languages pl ON pl.language_id=upl.language_id
      WHERE u.user_id=$1
      GROUP BY u.user_id`,
    [userId],
  );
  return result.rows[0];
};

// ── Current-user profile, password, and pending email changes ──────────────
app.get('/api/v1/me/profile', requireAuth, async (req, res, next) => {
  try {
    const [profile, languages] = await Promise.all([
      profileUser(req.user.userId),
      pool.query('SELECT name FROM programming_languages ORDER BY name'),
    ]);
    res.json({ profile, languages: languages.rows.map((row) => row.name) });
  } catch (e) {
    next(e);
  }
});

app.patch('/api/v1/me/profile', requireAuth, async (req, res, next) => {
  try {
    const data = parse(profileSchema, req.body, req, res, 422);
    if (!data) return;
    if (req.user.role !== 'student' && data.studentType !== undefined)
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Student type is only available for students.',
        requestId(req),
      );
    if (
      data.firstName !== undefined &&
      !visibleText('firstName', req, res, data.firstName)
    )
      return;
    if (data.lastName && !visibleText('lastName', req, res, data.lastName))
      return;
    const identity = {
      firstName: data.firstName
        ? normalizePersonName(data.firstName)
        : req.user.firstName,
      lastName:
        data.lastName === undefined
          ? req.user.lastName
          : data.lastName
            ? normalizePersonName(data.lastName)
            : null,
    };
    await pool.query(
      `UPDATE users SET first_name=$1,last_name=$2,full_name=$3,student_type=CASE WHEN role='student' THEN COALESCE($4,student_type) ELSE NULL END,student_year=CASE WHEN role='student' THEN COALESCE($5,student_year) ELSE NULL END WHERE user_id=$6`,
      [
        identity.firstName,
        identity.lastName,
        [identity.firstName, identity.lastName].filter(Boolean).join(' '),
        data.studentType ?? null,
        data.studentYear ?? null,
        req.user.userId,
      ],
    );
    if (data.preferredLanguages !== undefined) {
      const languages = await pool.query(
        'SELECT language_id,name FROM programming_languages WHERE name=ANY($1)',
        [data.preferredLanguages],
      );
      if (languages.rowCount !== data.preferredLanguages.length)
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'Choose languages from the available list.',
          requestId(req),
        );
      await pool.query(
        'DELETE FROM user_preferred_languages WHERE user_id=$1',
        [req.user.userId],
      );
      for (const language of languages.rows)
        await pool.query(
          'INSERT INTO user_preferred_languages(user_id,language_id) VALUES($1,$2)',
          [req.user.userId, language.language_id],
        );
    }
    res.json({
      profile: await profileUser(req.user.userId),
      message: 'Profile saved.',
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/v1/me/password', requireAuth, async (req, res, next) => {
  try {
    const data = parse(
      currentPasswordSchema
        .extend({
          newPassword: passwordSchema,
          confirmPassword: z.string().max(200),
        })
        .strict(),
      req.body,
      req,
      res,
      422,
    );
    if (!data) return;
    if (data.newPassword !== data.confirmPassword)
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Passwords do not match.',
        requestId(req),
        { confirmPassword: 'Passwords do not match.' },
      );
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const current = await client.query(
        'SELECT password_hash,first_name,email FROM users WHERE user_id=$1 FOR UPDATE',
        [req.user.userId],
      );
      if (
        !current.rowCount ||
        !(await bcrypt.compare(data.password, current.rows[0].password_hash))
      )
        return error(
          res,
          401,
          'INVALID_PASSWORD',
          'The current password is incorrect.',
          requestId(req),
          { password: 'The current password is incorrect.' },
        );
      if (
        !passwordIsAllowed(
          data.newPassword,
          current.rows[0].email,
          current.rows[0].first_name,
        )
      )
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'Choose a less common password that does not contain your email or first name.',
          requestId(req),
          {
            newPassword:
              'Choose a less common password that does not contain your email or first name.',
          },
        );
      await client.query(
        'UPDATE users SET password_hash=$1,requires_password_reset=false WHERE user_id=$2',
        [await bcrypt.hash(data.newPassword, 12), req.user.userId],
      );
      await client.query(
        'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL',
        [req.user.userId, sessionHash(req.cookies.eduquest_session)],
      );
      await client.query('COMMIT');
      committed = true;
      res.json({
        message: 'Password changed. Other sessions were signed out.',
      });
    } finally {
      try {
        if (!committed) await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  } catch (e) {
    next(e);
  }
});

app.post('/api/v1/me/email', requireAuth, async (req, res, next) => {
  try {
    const data = parse(
      currentPasswordSchema.extend({ email: emailSchema }).strict(),
      req.body,
      req,
      res,
      422,
    );
    if (!data) return;
    const current = await pool.query(
      'SELECT password_hash,email FROM users WHERE user_id=$1',
      [req.user.userId],
    );
    if (
      !current.rowCount ||
      !(await bcrypt.compare(data.password, current.rows[0].password_hash))
    )
      return error(
        res,
        401,
        'INVALID_PASSWORD',
        'The current password is incorrect.',
        requestId(req),
      );
    if (data.email === current.rows[0].email)
      return error(
        res,
        422,
        'VALIDATION_ERROR',
        'Choose a different email address.',
        requestId(req),
      );
    const duplicate = await pool.query(
      'SELECT 1 FROM users WHERE lower(email)=lower($1) OR lower(pending_email)=lower($1)',
      [data.email],
    );
    if (duplicate.rowCount)
      return error(
        res,
        409,
        'EMAIL_EXISTS',
        'An account with that email already exists.',
        requestId(req),
      );
    await pool.query('UPDATE users SET pending_email=$1 WHERE user_id=$2', [
      data.email,
      req.user.userId,
    ]);
    await issueVerificationMail(req.user.userId, data.email, data.email);
    res.json({ message: 'Check your new email to verify the change.' });
  } catch (e) {
    next(e);
  }
});

const catalogueQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    search: z.string().trim().max(100).default(''),
    sort: z.enum(['code', 'name', 'newest']).default('code'),
  })
  .strict();

const paged = (page, pageSize, total) => ({
  page,
  pageSize,
  total,
  pageCount: Math.max(1, Math.ceil(total / pageSize)),
});

// ── Student module catalogue and first-year look-ahead ─────────────────────
app.get('/api/v1/me/modules', requireAuth, async (req, res, next) => {
  try {
    const query = parse(catalogueQuerySchema, req.query, req, res, 422);
    if (!query) return;
    const offset = (query.page - 1) * query.pageSize;
    const ownership =
      req.user.role === 'lecturer'
        ? 'm.lecturer_id=$1'
        : 'EXISTS (SELECT 1 FROM enrollments me WHERE me.module_id=m.module_id AND me.student_id=$1)';
    const visibleResource =
      req.user.role === 'lecturer'
        ? ''
        : ` AND (r.group_id IS NULL OR EXISTS (SELECT 1 FROM group_members rgm WHERE rgm.group_id=r.group_id AND rgm.student_id=$1)) AND ${resourceYearScope('r', '$1')}`;
    const filter = query.search
      ? ` AND (m.module_code ILIKE $2 OR m.module_name ILIKE $2)`
      : '';
    const values = query.search
      ? [req.user.userId, `%${query.search}%`]
      : [req.user.userId];
    const count = await pool.query(
      `SELECT count(*)::int AS total FROM modules m WHERE ${ownership}${filter}`,
      values,
    );
    const order =
      query.sort === 'name'
        ? 'm.module_name ASC, m.module_code ASC'
        : query.sort === 'newest'
          ? 'm.created_date DESC, m.module_code ASC'
          : 'm.module_code ASC';
    const pageValues = [...values, query.pageSize, offset];
    const result = await pool.query(
      `SELECT m.module_id,m.module_code,m.module_name,m.description,m.year,m.programme,m.offering,
              ${req.user.role === 'lecturer' ? 'm.join_code,' : ''}
              u.full_name AS lecturer_name,
              (SELECT count(*)::int FROM quizzes q WHERE q.module_id=m.module_id AND q.status='published') AS quizzes_available,
              (SELECT count(*)::int FROM resources r WHERE r.module_id=m.module_id AND r.created_date >= now()-interval '14 days'${visibleResource}) AS new_resources_count,
              false AS has_in_progress_game
         FROM modules m JOIN users u ON u.user_id=m.lecturer_id
        WHERE ${ownership}${filter}
        ORDER BY ${order}
        LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    // Generic and game-specific plays are checked separately so this card never
    // exposes another student's play state.
    if (req.user.role === 'student' && result.rows.length) {
      const ids = result.rows.map((row) => row.module_id);
      const plays = await pool.query(
        `SELECT DISTINCT q.module_id FROM game_plays gp JOIN quizzes q ON q.quiz_id=gp.quiz_id WHERE gp.student_id=$1 AND gp.status='in_progress' AND q.module_id=ANY($2::uuid[])
         UNION
         SELECT DISTINCT q.module_id FROM game_sessions gs JOIN games g ON g.game_id=gs.game_id JOIN quizzes q ON q.quiz_id=g.quiz_id WHERE gs.student_id=$1 AND gs.status='in_progress' AND q.module_id=ANY($2::uuid[])`,
        [req.user.userId, ids],
      );
      const active = new Set(plays.rows.map((row) => row.module_id));
      for (const row of result.rows)
        row.has_in_progress_game = active.has(row.module_id);
    }
    res.json({
      data: result.rows,
      pagination: paged(query.page, query.pageSize, count.rows[0].total),
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/me/modules/lookahead', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'student')
      return error(res, 403, 'FORBIDDEN', 'Students only.', requestId(req));
    if (req.user.studentYear !== 1)
      return res.json({ data: [], preview: false });
    const result = await pool.query(
      `SELECT m.module_id,m.module_code,m.module_name,m.description,m.year,m.programme,m.offering,
              COALESCE(json_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '[]') AS topics,
              ARRAY[]::text[] AS prerequisite_hints
         FROM modules m LEFT JOIN topics t ON t.module_id=m.module_id
        WHERE m.year=2 AND (m.programme=$1 OR m.programme='both')
        GROUP BY m.module_id ORDER BY m.module_code`,
      [req.user.studentType],
    );
    res.json({ data: result.rows, preview: true });
  } catch (e) {
    next(e);
  }
});

// ── Module/resource summaries and secure resource access ──────────────────
app.get('/api/v1/resources/modules', requireAuth, async (req, res, next) => {
  try {
    const query = parse(catalogueQuerySchema, req.query, req, res, 422);
    if (!query) return;
    const offset = (query.page - 1) * query.pageSize;
    const ownership =
      req.user.role === 'lecturer'
        ? 'm.lecturer_id=$1'
        : 'EXISTS (SELECT 1 FROM enrollments e WHERE e.module_id=m.module_id AND e.student_id=$1)';
    const visibleResource =
      req.user.role === 'lecturer'
        ? ''
        : ` AND (r.group_id IS NULL OR EXISTS (SELECT 1 FROM group_members rgm WHERE rgm.group_id=r.group_id AND rgm.student_id=$1)) AND ${resourceYearScope('r', '$1')}`;
    const result = await pool.query(
      `SELECT m.module_id,m.module_code,m.module_name,count(r.resource_id)::int AS resource_count,
              max(r.created_date) AS last_updated
         FROM modules m LEFT JOIN resources r ON r.module_id=m.module_id${visibleResource}
        WHERE ${ownership}
        GROUP BY m.module_id ORDER BY m.module_code
        LIMIT $2 OFFSET $3`,
      [req.user.userId, query.pageSize, offset],
    );
    const count = await pool.query(
      `SELECT count(*)::int AS total FROM modules m WHERE ${ownership}`,
      [req.user.userId],
    );
    res.json({
      data: result.rows,
      pagination: paged(query.page, query.pageSize, count.rows[0].total),
    });
  } catch (e) {
    next(e);
  }
});

// ── Lecturer modules, enrolment, and module-scoped groups ─────────────────
app.get('/api/v1/modules', requireAuth, async (req, res, next) => {
  try {
    const result =
      req.user.role === 'lecturer'
        ? await pool.query(
            'SELECT * FROM modules WHERE lecturer_id=$1 ORDER BY module_code',
            [req.user.userId],
          )
        : await pool.query(
            'SELECT m.* FROM modules m JOIN enrollments e ON e.module_id=m.module_id WHERE e.student_id=$1 ORDER BY m.module_code',
            [req.user.userId],
          );
    res.json({ data: result.rows });
  } catch (e) {
    next(e);
  }
});
app.post(
  '/api/v1/modules',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const data = parse(moduleSchema, req.body, req, res);
      if (!data || !visibleText('moduleName', req, res, data.moduleName))
        return;
      if (
        data.description &&
        !visibleText('moduleDescription', req, res, data.description)
      )
        return;
      const joinCode = crypto.randomBytes(12).toString('base64url');
      const result = await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,description,year,programme,offering,join_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          req.user.userId,
          data.moduleCode,
          data.moduleName,
          data.description || '',
          data.year || 1,
          data.programme || 'both',
          data.offering || 'Semester 1',
          joinCode,
        ],
      );
      res.status(201).json({ module: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);
app.post('/api/v1/enrollments', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'student')
      return error(res, 403, 'FORBIDDEN', 'Students only.', requestId(req));
    const data = parse(
      z.object({ joinCode: z.string().min(12) }).strict(),
      req.body,
      req,
      res,
    );
    if (!data) return;
    const module = await pool.query(
      'SELECT module_id FROM modules WHERE join_code=$1',
      [data.joinCode],
    );
    if (!module.rowCount)
      return error(res, 404, 'NOT_FOUND', 'Module not found.', requestId(req));
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [req.user.userId, module.rows[0].module_id],
    );
    res.status(201).json({ enrolled: true });
  } catch (e) {
    next(e);
  }
});
app.post(
  '/api/v1/modules/:moduleId/groups',
  requireAuth,
  async (req, res, next) => {
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const data = parse(groupSchema, req.body, req, res);
      if (!data || !visibleText('groupName', req, res, data.groupName)) return;
      const mod = await client.query(
        'SELECT module_id,lecturer_id FROM modules WHERE module_id=$1',
        [req.params.moduleId],
      );
      if (!mod.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Module not found.',
          requestId(req),
        );
      if (
        req.user.role === 'lecturer' &&
        mod.rows[0].lecturer_id !== req.user.userId
      )
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      if (req.user.role === 'student') {
        const enrolled = await client.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [req.params.moduleId, req.user.userId],
        );
        if (!enrolled.rowCount)
          return error(
            res,
            403,
            'NOT_ENROLLED',
            'Enrol in the module before creating a study group.',
            requestId(req),
          );
      } else if (req.user.role !== 'lecturer')
        return error(
          res,
          403,
          'FORBIDDEN',
          'Student or lecturer access is required.',
          requestId(req),
        );
      const group = await client.query(
        'INSERT INTO study_groups(module_id,created_by,group_name) VALUES($1,$2,$3) RETURNING *',
        [req.params.moduleId, req.user.userId, data.groupName],
      );
      if (req.user.role === 'student')
        await client.query(
          'INSERT INTO group_members(group_id,student_id) VALUES($1,$2)',
          [group.rows[0].group_id, req.user.userId],
        );
      if (req.user.role === 'student')
        await client.query(
          `INSERT INTO group_leaders(group_id,student_id,role) VALUES($1,$2,'leader') ON CONFLICT DO NOTHING`,
          [group.rows[0].group_id, req.user.userId],
        );
      await client.query('COMMIT');
      committed = true;
      res.status(201).json({ group: group.rows[0] });
    } catch (e) {
      next(e);
    } finally {
      if (!committed) await client.query('ROLLBACK');
      client.release();
    }
  },
);
app.post(
  '/api/v1/groups/:groupId/join',
  requireAuth,
  requireRole('student'),
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res)) return;
      const group = await pool.query(
        'SELECT module_id,visibility FROM study_groups WHERE group_id=$1',
        [req.params.groupId],
      );
      if (!group.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Study group not found.',
          requestId(req),
        );
      const enrolled = await pool.query(
        'SELECT 1 FROM enrollments WHERE student_id=$1 AND module_id=$2',
        [req.user.userId, group.rows[0].module_id],
      );
      if (!enrolled.rowCount)
        return error(
          res,
          403,
          'NOT_ENROLLED',
          'Enrol in the module before joining its study groups.',
          requestId(req),
        );
      if (group.rows[0].visibility !== 'module') {
        const member = await pool.query(
          'SELECT 1 FROM group_members WHERE group_id=$1 AND student_id=$2',
          [req.params.groupId, req.user.userId],
        );
        if (!member.rowCount)
          return error(
            res,
            403,
            'INVITATION_REQUIRED',
            'Accept an invitation to join this private study group.',
            requestId(req),
          );
      }
      await pool.query(
        'INSERT INTO group_members(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [req.params.groupId, req.user.userId],
      );
      res.status(201).json({ joined: true });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/modules/:moduleId/resources',
  requireAuth,
  async (req, res, next) => {
    try {
      const query = parse(catalogueQuerySchema, req.query, req, res, 422);
      if (!query) return;
      const lecturer = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (!lecturer.rowCount && req.user.role === 'lecturer')
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      if (!lecturer.rowCount && req.user.role === 'student') {
        const enrolled = await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [req.params.moduleId, req.user.userId],
        );
        if (!enrolled.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You are not enrolled in this module.',
            requestId(req),
          );
      }
      const yearScope =
        req.user.role === 'student'
          ? ` AND ${resourceYearScope('r', '$2')}`
          : '';
      const search = query.search ? ' AND r.title ILIKE $3' : '';
      const baseValues = query.search
        ? [req.params.moduleId, req.user.userId, `%${query.search}%`]
        : [req.params.moduleId, req.user.userId];
      const count = await pool.query(
        `SELECT count(DISTINCT r.resource_id)::int AS total
           FROM resources r LEFT JOIN group_members gm ON gm.group_id=r.group_id AND gm.student_id=$2
          WHERE r.module_id=$1
            AND (r.group_id IS NULL OR gm.student_id IS NOT NULL OR EXISTS (SELECT 1 FROM modules m WHERE m.module_id=r.module_id AND m.lecturer_id=$2))${yearScope}${search}`,
        baseValues,
      );
      const result = await pool.query(
        `SELECT DISTINCT r.resource_id,r.uploaded_by,r.module_id,r.group_id,r.title,r.resource_type,r.file_size_bytes,r.created_date,r.target_year
           FROM resources r LEFT JOIN group_members gm ON gm.group_id=r.group_id AND gm.student_id=$2
          WHERE r.module_id=$1
            AND (r.group_id IS NULL OR gm.student_id IS NOT NULL OR EXISTS (SELECT 1 FROM modules m WHERE m.module_id=r.module_id AND m.lecturer_id=$2))${yearScope}${search}
          ORDER BY r.created_date DESC LIMIT $${baseValues.length + 1} OFFSET $${baseValues.length + 2}`,
        [...baseValues, query.pageSize, (query.page - 1) * query.pageSize],
      );
      res.json({
        data: result.rows,
        pagination: paged(query.page, query.pageSize, count.rows[0].total),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/resources/:resourceId/file',
  requireAuth,
  async (req, res, next) => {
    try {
      const params = parse(
        z.object({ resourceId: z.string().uuid() }).strict(),
        req.params,
        req,
        res,
        422,
      );
      if (!params) return;
      const result = await pool.query(
        `SELECT r.resource_id,r.title,r.resource_type,r.file_location
           FROM resources r
           JOIN modules m ON m.module_id=r.module_id
          WHERE r.resource_id=$1
            AND (
              (m.lecturer_id=$2 AND $3='lecturer')
              OR (
                $3='student'
                AND ${resourceYearScope('r', '$2')}
                AND EXISTS (SELECT 1 FROM enrollments e WHERE e.module_id=r.module_id AND e.student_id=$2)
                AND (r.group_id IS NULL OR EXISTS (
                  SELECT 1 FROM group_members gm WHERE gm.group_id=r.group_id AND gm.student_id=$2
                ))
              )
            )`,
        [params.resourceId, req.user.userId, req.user.role],
      );
      if (!result.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Resource not found.',
          requestId(req),
        );
      const resource = result.rows[0];
      const file = path.resolve(resource.file_location);
      let fileBytes;
      try {
        fileBytes = await readUpload(file);
      } catch {
        return error(
          res,
          404,
          'NOT_FOUND',
          'Resource file is unavailable.',
          requestId(req),
        );
      }
      const contentTypes = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        txt: 'text/plain; charset=utf-8',
        md: 'text/markdown; charset=utf-8',
      };
      const extension = String(resource.resource_type || 'bin').toLowerCase();
      const unicodeName = `${resource.title}.${extension}`;
      const asciiName = `${
        resource.title
          .replace(/[^A-Za-z0-9 ._-]/g, '')
          .trim()
          .slice(0, 100) || 'resource'
      }.${extension}`;
      res.set({
        'Content-Type': contentTypes[extension] || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(unicodeName)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.send(fileBytes);
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/modules/:moduleId/resources',
  requireAuth,
  requireRole('lecturer'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file)
        return error(
          res,
          400,
          'FILE_REQUIRED',
          'Please choose a file.',
          requestId(req),
        );
      const extension = path.extname(req.file.originalname).toLowerCase();
      const bytes = await readFile(req.file.path);
      if (
        !allowedExtensions.has(extension) ||
        !hasAllowedMagic(extension, bytes)
      ) {
        await unlink(req.file.path).catch(() => {});
        return error(
          res,
          422,
          'FILE_TYPE_NOT_ALLOWED',
          'That file type is not allowed.',
          requestId(req),
        );
      }
      const data = parse(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            targetYear: z.coerce.number().int().min(1).max(3).optional(),
            groupId: z.string().uuid().optional(),
          })
          .strict(),
        req.body,
        req,
        res,
        422,
      );
      if (!data) {
        await unlink(req.file.path).catch(() => {});
        return;
      }
      const title = data.title;
      if (!visibleText('resourceTitle', req, res, title)) {
        await unlink(req.file.path).catch(() => {});
        return;
      }
      const owner = await pool.query(
        'SELECT year FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (!owner.rowCount) {
        await unlink(req.file.path).catch(() => {});
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      }
      const groupId = data.groupId || null;
      if (
        groupId &&
        !(
          await pool.query(
            'SELECT 1 FROM study_groups WHERE group_id=$1 AND module_id=$2',
            [groupId, req.params.moduleId],
          )
        ).rowCount
      ) {
        await unlink(req.file.path).catch(() => {});
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'Choose a group in this module.',
          requestId(req),
        );
      }
      const targetYear = data.targetYear ?? owner.rows[0].year;
      await persistUpload(req.file.path, bytes);
      const result = await pool.query(
        `INSERT INTO resources(uploaded_by,module_id,group_id,title,resource_type,file_location,file_size_bytes,target_year) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          req.user.userId,
          req.params.moduleId,
          groupId,
          title,
          extension.slice(1),
          req.file.path,
          req.file.size,
          targetYear,
        ],
      );
      res.status(201).json({ resource: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

// ── Quiz listings and shared authoring workflow (manual and AI drafts) ─────
app.post(
  '/api/v1/quizzes',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const schema = z
        .object({
          moduleId: z.string().uuid(),
          title: titleSchema,
          isCompetitive: z.boolean().default(false),
          closesAt: z.string().datetime().nullable().optional(),
          questions: z
            .array(
              z
                .object({
                  questionText: z
                    .string()
                    .min(1)
                    .refine(noProfanity(), { message: profanityMessage }),
                  marks: z.number().positive(),
                  difficultyLevel: z.number().int().min(1).max(5),
                  explanation: z
                    .string()
                    .trim()
                    .min(1)
                    .max(300)
                    .refine(noProfanity(), { message: profanityMessage })
                    .nullable()
                    .optional(),
                  topicId: z.string().uuid().nullable().optional(),
                  topic: z
                    .string()
                    .min(1)
                    .max(200)
                    .refine(noProfanity(), { message: profanityMessage })
                    .optional(),
                  options: z
                    .array(
                      z
                        .object({
                          optionText: z.string().min(1).refine(noProfanity(), {
                            message: profanityMessage,
                          }),
                          isCorrect: z.boolean(),
                        })
                        .strict(),
                    )
                    .min(2)
                    .max(6),
                })
                .strict(),
            )
            .min(1),
        })
        .strict();
      const data = parse(schema, req.body, req, res);
      if (!data || !visibleText('quizTitle', req, res, data.title)) return;
      const ownedModule = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [data.moduleId, req.user.userId],
      );
      if (!ownedModule.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      for (const question of data.questions) {
        if (!visibleText('questionText', req, res, question.questionText))
          return;
        if (
          question.topic &&
          !visibleText('topicName', req, res, question.topic)
        )
          return;
        for (const option of question.options)
          if (!visibleText('optionText', req, res, option.optionText)) return;
        if (
          question.explanation &&
          !visibleText('explanation', req, res, question.explanation)
        )
          return;
      }
      const tx = await pool.connect();
      try {
        await tx.query('BEGIN');
        const quiz = await tx.query(
          `INSERT INTO quizzes(module_id,created_by,title,is_competitive,max_scored_attempts,status,closes_at) VALUES($1,$2,$3,$4,$5,'published',$6) RETURNING *`,
          [
            data.moduleId,
            req.user.userId,
            data.title,
            data.isCompetitive,
            data.isCompetitive ? 1 : 1,
            data.closesAt || null,
          ],
        );
        for (const question of data.questions) {
          let topicId = question.topicId || null;
          if (question.topic) {
            topicId = (
              await tx.query(
                `INSERT INTO topics(module_id,name) VALUES($1,$2) ON CONFLICT(module_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING topic_id`,
                [data.moduleId, question.topic],
              )
            ).rows[0].topic_id;
          }
          const q = await tx.query(
            `INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation) VALUES($1,$2,$3,$4,$5,$6) RETURNING question_id`,
            [
              quiz.rows[0].quiz_id,
              topicId,
              question.questionText,
              question.marks,
              question.difficultyLevel,
              question.explanation || null,
            ],
          );
          for (const option of question.options)
            await tx.query(
              `INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,$2,$3)`,
              [q.rows[0].question_id, option.optionText, option.isCorrect],
            );
        }
        await tx.query('COMMIT');
        res.status(201).json({ quiz: quiz.rows[0] });
      } catch (e) {
        await tx.query('ROLLBACK');
        throw e;
      } finally {
        tx.release();
      }
    } catch (e) {
      next(e);
    }
  },
);

async function lecturerQuizOwner(quizId, userId) {
  const result = await pool.query(
    'SELECT q.*,m.module_id,m.lecturer_id FROM quizzes q JOIN modules m ON m.module_id=q.module_id WHERE q.quiz_id=$1 AND m.lecturer_id=$2',
    [quizId, userId],
  );
  return result.rows[0] || null;
}

async function insertAuthorQuestion(client, quizId, question) {
  let topicId = question.topicId || null;
  if (question.topic) {
    topicId = (
      await client.query(
        'INSERT INTO topics(module_id,name) SELECT module_id,$1 FROM quizzes WHERE quiz_id=$2 ON CONFLICT(module_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING topic_id',
        [question.topic, quizId],
      )
    ).rows[0].topic_id;
  }
  const created = (
    await client.query(
      `INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation,question_type,accepted_answers,ignore_punctuation,code_language,code_before,code_after,expected_output,display_order)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING question_id`,
      [
        quizId,
        topicId,
        question.questionText,
        question.marks,
        question.difficultyLevel,
        question.explanation || null,
        question.questionType,
        JSON.stringify(question.acceptedAnswers || []),
        question.ignorePunctuation,
        question.codeLanguage || null,
        question.codeBefore || null,
        question.codeAfter || null,
        question.expectedOutput || null,
        question.displayOrder,
      ],
    )
  ).rows[0];
  for (const option of question.options || [])
    await client.query(
      'INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,$2,$3)',
      [created.question_id, option.optionText, option.isCorrect],
    );
  return created;
}

app.post(
  '/api/v1/quizzes/manual',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const data = parse(authorQuizSchema, req.body, req, res, 422);
      if (!data) return;
      if (!visibleText('quizTitle', req, res, data.title)) return;
      for (const question of data.questions) {
        if (!visibleText('questionText', req, res, question.questionText))
          return;
        if (
          question.topic &&
          !visibleText('topicName', req, res, question.topic)
        )
          return;
        if (
          question.explanation &&
          !visibleText('explanation', req, res, question.explanation)
        )
          return;
        for (const option of question.options)
          if (!visibleText('optionText', req, res, option.optionText)) return;
        for (const answer of question.acceptedAnswers)
          if (!visibleText('acceptedAnswer', req, res, answer)) return;
      }
      const owner = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [data.moduleId, req.user.userId],
      );
      if (!owner.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      if (data.status === 'published') {
        const checklist = publishChecklist(data);
        if (!checklist.ok)
          return error(
            res,
            422,
            'PUBLISH_CHECKLIST',
            'Complete the publish checklist before publishing.',
            requestId(req),
          );
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const quiz = (
          await client.query(
            `INSERT INTO quizzes(module_id,created_by,title,is_competitive,max_scored_attempts,status,closes_at) VALUES($1,$2,$3,$4,1,$5,$6) RETURNING *`,
            [
              data.moduleId,
              req.user.userId,
              data.title,
              data.isCompetitive,
              data.status,
              data.closesAt || null,
            ],
          )
        ).rows[0];
        for (const question of data.questions)
          await insertAuthorQuestion(client, quiz.quiz_id, question);
        await client.query('COMMIT');
        res.status(201).json({ quiz });
      } catch (caught) {
        await client.query('ROLLBACK');
        throw caught;
      } finally {
        client.release();
      }
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/quizzes/:quizId/publish',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const quiz = await lecturerQuizOwner(req.params.quizId, req.user.userId);
      if (!quiz)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      const rows = await pool.query(
        "SELECT q.*,json_agg(json_build_object('optionText',o.option_text,'isCorrect',o.is_correct)) FILTER (WHERE o.option_id IS NOT NULL) options FROM questions q LEFT JOIN question_options o ON o.question_id=q.question_id WHERE q.quiz_id=$1 GROUP BY q.question_id",
        [req.params.quizId],
      );
      const checklist = publishChecklist({
        moduleId: quiz.module_id,
        title: quiz.title,
        isCompetitive: quiz.is_competitive,
        closesAt: quiz.closes_at,
        questions: rows.rows.map((question) => ({
          questionText: question.question_text,
          questionType: question.question_type,
          difficultyLevel: question.difficulty_level,
          marks: Number(question.marks),
          options: question.options || [],
          acceptedAnswers: question.accepted_answers || [],
          ignorePunctuation: question.ignore_punctuation,
          codeLanguage: question.code_language,
          codeBefore: question.code_before,
          codeAfter: question.code_after,
          expectedOutput: question.expected_output,
          explanation: question.explanation,
          displayOrder: question.display_order,
          source: 'manual',
        })),
      });
      if (!checklist.ok)
        return error(
          res,
          422,
          'PUBLISH_CHECKLIST',
          'Complete the publish checklist before publishing.',
          requestId(req),
        );
      const updated = await pool.query(
        "UPDATE quizzes SET status='published' WHERE quiz_id=$1 RETURNING *",
        [req.params.quizId],
      );
      res.json({ quiz: updated.rows[0], checklist: { ok: true } });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/quizzes/:quizId/publish-check',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const quiz = await lecturerQuizOwner(req.params.quizId, req.user.userId);
      if (!quiz)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      const rows = await pool.query(
        "SELECT q.*,json_agg(json_build_object('optionText',o.option_text,'isCorrect',o.is_correct)) FILTER (WHERE o.option_id IS NOT NULL) options FROM questions q LEFT JOIN question_options o ON o.question_id=q.question_id WHERE q.quiz_id=$1 GROUP BY q.question_id ORDER BY q.display_order,q.question_id",
        [req.params.quizId],
      );
      const checklist = publishChecklist({
        moduleId: quiz.module_id,
        title: quiz.title,
        isCompetitive: quiz.is_competitive,
        closesAt: quiz.closes_at,
        questions: rows.rows.map((question) => ({
          questionId: question.question_id,
          questionText: question.question_text,
          questionType: question.question_type,
          difficultyLevel: question.difficulty_level,
          marks: Number(question.marks),
          options: question.options || [],
          acceptedAnswers: question.accepted_answers || [],
          ignorePunctuation: question.ignore_punctuation,
          codeLanguage: question.code_language,
          codeBefore: question.code_before,
          codeAfter: question.code_after,
          expectedOutput: question.expected_output,
          explanation: question.explanation,
          displayOrder: question.display_order,
          source: 'manual',
        })),
      });
      res.json({
        checklist: {
          ok: checklist.ok,
          issues: checklist.ok ? [] : checklist.issues,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/quizzes/:quizId/questions',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const data = parse(authorQuestionSchema, req.body, req, res, 422);
      if (!data) return;
      const quiz = await lecturerQuizOwner(req.params.quizId, req.user.userId);
      if (!quiz)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      const attempts = await pool.query(
        'SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 LIMIT 1',
        [req.params.quizId],
      );
      if (quiz.status === 'published' && attempts.rowCount)
        return error(
          res,
          409,
          'QUIZ_LOCKED',
          'Duplicate this quiz before editing attempted questions.',
          requestId(req),
        );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const question = await insertAuthorQuestion(
          client,
          req.params.quizId,
          data,
        );
        await client.query('COMMIT');
        res.status(201).json({ question });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  '/api/v1/quizzes/:quizId/questions/:questionId',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const data = parse(authorQuestionSchema, req.body, req, res, 422);
      if (!data) return;
      const quiz = await lecturerQuizOwner(req.params.quizId, req.user.userId);
      if (!quiz)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      const attempts = await pool.query(
        'SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 LIMIT 1',
        [req.params.quizId],
      );
      if (quiz.status === 'published' && attempts.rowCount)
        return error(
          res,
          409,
          'QUIZ_LOCKED',
          'Duplicate this quiz before editing attempted questions.',
          requestId(req),
        );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE questions SET question_text=$1,marks=$2,difficulty_level=$3,explanation=$4,question_type=$5,accepted_answers=$6,ignore_punctuation=$7,code_language=$8,code_before=$9,code_after=$10,expected_output=$11,display_order=$12 WHERE question_id=$13 AND quiz_id=$14',
          [
            data.questionText,
            data.marks,
            data.difficultyLevel,
            data.explanation || null,
            data.questionType,
            JSON.stringify(data.acceptedAnswers || []),
            data.ignorePunctuation,
            data.codeLanguage || null,
            data.codeBefore || null,
            data.codeAfter || null,
            data.expectedOutput || null,
            data.displayOrder,
            req.params.questionId,
            req.params.quizId,
          ],
        );
        await client.query(
          'DELETE FROM question_options WHERE question_id=$1',
          [req.params.questionId],
        );
        for (const option of data.options)
          await client.query(
            'INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,$2,$3)',
            [req.params.questionId, option.optionText, option.isCorrect],
          );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  '/api/v1/quizzes/:quizId/questions/:questionId',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const quiz = await lecturerQuizOwner(req.params.quizId, req.user.userId);
      if (!quiz)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      const attempts = await pool.query(
        'SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 LIMIT 1',
        [req.params.quizId],
      );
      if (quiz.status === 'published' && attempts.rowCount)
        return error(
          res,
          409,
          'QUIZ_LOCKED',
          'Duplicate this quiz before deleting questions.',
          requestId(req),
        );
      await pool.query(
        'DELETE FROM questions WHERE question_id=$1 AND quiz_id=$2',
        [req.params.questionId, req.params.quizId],
      );
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/quizzes/:quizId/questions/reorder',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const data = parse(
        z.object({ questionIds: z.array(z.string().uuid()).min(1) }).strict(),
        req.body,
        req,
        res,
        422,
      );
      if (!data) return;
      if (!(await lecturerQuizOwner(req.params.quizId, req.user.userId)))
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [index, id] of data.questionIds.entries())
          await client.query(
            'UPDATE questions SET display_order=$1 WHERE question_id=$2 AND quiz_id=$3',
            [index, id, req.params.quizId],
          );
        await client.query('COMMIT');
        res.json({ ok: true });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/quizzes/:quizId/duplicate',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const source = await lecturerQuizOwner(
        req.params.quizId,
        req.user.userId,
      );
      if (!source)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const copy = (
          await client.query(
            "INSERT INTO quizzes(module_id,created_by,title,is_competitive,max_scored_attempts,status,closes_at) VALUES($1,$2,$3,$4,1,'draft',$5) RETURNING *",
            [
              source.module_id,
              req.user.userId,
              `${source.title} (copy)`,
              source.is_competitive,
              source.closes_at,
            ],
          )
        ).rows[0];
        const qs = (
          await client.query(
            'SELECT * FROM questions WHERE quiz_id=$1 ORDER BY display_order,question_id',
            [req.params.quizId],
          )
        ).rows;
        for (const q of qs) {
          const nq = (
            await client.query(
              'INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation,question_type,accepted_answers,ignore_punctuation,code_language,code_before,code_after,expected_output,display_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING question_id',
              [
                copy.quiz_id,
                q.topic_id,
                q.question_text,
                q.marks,
                q.difficulty_level,
                q.explanation,
                q.question_type,
                q.accepted_answers,
                q.ignore_punctuation,
                q.code_language,
                q.code_before,
                q.code_after,
                q.expected_output,
                q.display_order,
              ],
            )
          ).rows[0];
          const os = await client.query(
            'SELECT option_text,is_correct FROM question_options WHERE question_id=$1',
            [q.question_id],
          );
          for (const o of os.rows)
            await client.query(
              'INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,$2,$3)',
              [nq.question_id, o.option_text, o.is_correct],
            );
        }
        await client.query('COMMIT');
        res.status(201).json({ quiz: copy });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  '/api/v1/quizzes/:quizId',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const quiz = await lecturerQuizOwner(req.params.quizId, req.user.userId);
      if (!quiz)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      const attempts = await pool.query(
        'SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 LIMIT 1',
        [req.params.quizId],
      );
      if (attempts.rowCount)
        return error(
          res,
          409,
          'QUIZ_LOCKED',
          'Attempted quizzes cannot be deleted.',
          requestId(req),
        );
      await pool.query('DELETE FROM quizzes WHERE quiz_id=$1', [
        req.params.quizId,
      ]);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/quizzes/:quizId/questions/:questionId/duplicate',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const quiz = await lecturerQuizOwner(req.params.quizId, req.user.userId);
      if (!quiz)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const q = (
          await client.query(
            'SELECT * FROM questions WHERE question_id=$1 AND quiz_id=$2',
            [req.params.questionId, req.params.quizId],
          )
        ).rows[0];
        if (!q) {
          await client.query('ROLLBACK');
          return error(
            res,
            404,
            'NOT_FOUND',
            'Question not found.',
            requestId(req),
          );
        }
        const nq = (
          await client.query(
            'INSERT INTO questions(quiz_id,topic_id,question_text,marks,difficulty_level,explanation,question_type,accepted_answers,ignore_punctuation,code_language,code_before,code_after,expected_output,display_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
            [
              q.quiz_id,
              q.topic_id,
              `${q.question_text} (copy)`,
              q.marks,
              q.difficulty_level,
              q.explanation,
              q.question_type,
              q.accepted_answers,
              q.ignore_punctuation,
              q.code_language,
              q.code_before,
              q.code_after,
              q.expected_output,
              q.display_order + 1,
            ],
          )
        ).rows[0];
        const os = await client.query(
          'SELECT option_text,is_correct FROM question_options WHERE question_id=$1',
          [q.question_id],
        );
        for (const o of os.rows)
          await client.query(
            'INSERT INTO question_options(question_id,option_text,is_correct) VALUES($1,$2,$3)',
            [nq.question_id, o.option_text, o.is_correct],
          );
        await client.query('COMMIT');
        res.status(201).json({ question: nq });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/modules/:moduleId/quizzes',
  requireAuth,
  async (req, res, next) => {
    try {
      const owner = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (!owner.rowCount && req.user.role === 'lecturer')
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      if (!owner.rowCount && req.user.role === 'student') {
        const enrolled = await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [req.params.moduleId, req.user.userId],
        );
        if (!enrolled.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You are not enrolled in this module.',
            requestId(req),
          );
      }
      const page = Math.max(
        1,
        Math.min(10000, Number.parseInt(req.query.page || '1', 10) || 1),
      );
      const pageSize = Math.max(
        1,
        Math.min(100, Number.parseInt(req.query.pageSize || '20', 10) || 20),
      );
      const search = String(req.query.search || '').trim();
      const result = await pool.query(
        `SELECT quiz_id,title,is_competitive,closes_at,status,EXISTS(SELECT 1 FROM ai_generation_jobs j WHERE j.quiz_id=quizzes.quiz_id AND j.status='succeeded') AS ai_generated
         FROM quizzes
         WHERE module_id=$1 AND ($5::boolean OR status='published')
           AND ($2='' OR title ILIKE '%' || $2 || '%')
         ORDER BY created_at DESC, quiz_id DESC
         LIMIT $3 OFFSET $4`,
        [
          req.params.moduleId,
          search,
          pageSize,
          (page - 1) * pageSize,
          req.user.role === 'lecturer',
        ],
      );
      const total = await pool.query(
        `SELECT count(*)::int AS count FROM quizzes
         WHERE module_id=$1 AND ($3::boolean OR status='published')
           AND ($2='' OR title ILIKE '%' || $2 || '%')`,
        [req.params.moduleId, search, req.user.role === 'lecturer'],
      );
      res.json({
        data: result.rows,
        pagination: {
          page,
          pageSize,
          total: total.rows[0].count,
          pages: Math.max(1, Math.ceil(total.rows[0].count / pageSize)),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

const generationJobView = (row) => {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(row.created_at).getTime()) / 1000),
  );
  return {
    ...row,
    elapsedSeconds,
    queuedMessage:
      row.status === 'queued' && elapsedSeconds >= 60
        ? 'This job has been queued for over a minute. The AI service may be unreachable, the model may be slow, or the worker may not be running.'
        : null,
    providerMode: process.env.AI_PROVIDER || 'mock',
  };
};

// ── Persistent AI-generation jobs; the worker owns provider interaction ───
app.post(
  '/api/v1/resources/:resourceId/generation-jobs',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const resource = await pool.query(
        'SELECT r.resource_id,r.title,r.resource_type FROM resources r JOIN modules m ON m.module_id=r.module_id WHERE r.resource_id=$1 AND m.lecturer_id=$2',
        [req.params.resourceId, req.user.userId],
      );
      if (!resource.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Resource not found.',
          requestId(req),
        );
      if (!['pdf', 'txt', 'md'].includes(resource.rows[0].resource_type))
        return error(
          res,
          422,
          'DOCUMENT_TYPE_NOT_SUPPORTED',
          'AI generation supports PDF and text files. Convert this document to a text-based PDF first.',
          requestId(req),
        );
      const options = parse(
        z
          .object({
            questionCount: z.number().int().min(1).max(50).default(5),
            difficulty: z.string().trim().min(1).max(40).default('mixed'),
            quizMode: z.enum(['practice', 'competitive']),
            title: titleSchema.optional(),
            closesAt: z.string().datetime().nullable().optional(),
          })
          .strict(),
        req.body || {},
        req,
        res,
        422,
      );
      if (!options) return;
      const job = await pool.query(
        `INSERT INTO ai_generation_jobs(requested_by,resource_id,question_count,difficulty,quiz_mode,quiz_title,closes_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          req.user.userId,
          req.params.resourceId,
          options.questionCount,
          options.difficulty,
          options.quizMode,
          options.title || resource.rows[0].title,
          options.closesAt || null,
        ],
      );
      res.status(202).json({
        job: {
          ...generationJobView(job.rows[0]),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/quizzes/:quizId',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT z.*, json_agg(json_build_object('questionId',q.question_id,'questionText',q.question_text,'marks',q.marks,'difficultyLevel',q.difficulty_level,'explanation',q.explanation,'questionType',q.question_type,'acceptedAnswers',q.accepted_answers,'ignorePunctuation',q.ignore_punctuation,'codeLanguage',q.code_language,'codeBefore',q.code_before,'codeAfter',q.code_after,'expectedOutput',q.expected_output,'displayOrder',q.display_order,'topic',t.name,'options',(SELECT json_agg(json_build_object('optionId',o.option_id,'optionText',o.option_text,'correct',o.is_correct)) FROM question_options o WHERE o.question_id=q.question_id))) FILTER (WHERE q.question_id IS NOT NULL) AS questions FROM quizzes z LEFT JOIN questions q ON q.quiz_id=z.quiz_id LEFT JOIN topics t ON t.topic_id=q.topic_id JOIN modules m ON m.module_id=z.module_id WHERE z.quiz_id=$1 AND m.lecturer_id=$2 GROUP BY z.quiz_id`,
        [req.params.quizId, req.user.userId],
      );
      if (!result.rowCount)
        return error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      res.json({ quiz: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.put(
  '/api/v1/quizzes/:quizId',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const schema = z
        .object({
          title: titleSchema,
          isCompetitive: z.boolean(),
          closesAt: z.string().datetime().nullable().optional(),
          status: z.enum(['draft', 'published']),
          questions: z
            .array(
              z
                .object({
                  questionId: z.string().uuid(),
                  difficultyLevel: z.number().int().min(1).max(5),
                  explanation: z
                    .string()
                    .trim()
                    .min(1)
                    .max(300)
                    .refine(noProfanity(), { message: profanityMessage }),
                })
                .strict(),
            )
            .optional(),
        })
        .strict();
      const data = parse(schema, req.body, req, res);
      if (!data) return;
      if (!visibleText('quizTitle', req, res, data.title)) return;
      for (const question of data.questions || [])
        if (!visibleText('explanation', req, res, question.explanation)) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `UPDATE quizzes z SET title=$1,is_competitive=$2,closes_at=$3,status=$4 FROM modules m WHERE z.quiz_id=$5 AND m.module_id=z.module_id AND m.lecturer_id=$6 RETURNING z.*`,
          [
            data.title,
            data.isCompetitive,
            data.closesAt || null,
            data.status,
            req.params.quizId,
            req.user.userId,
          ],
        );
        if (!result.rowCount) {
          await client.query('ROLLBACK');
          return error(
            res,
            404,
            'NOT_FOUND',
            'Quiz not found.',
            requestId(req),
          );
        }
        for (const question of data.questions || []) {
          const updated = await client.query(
            `UPDATE questions SET difficulty_level=$1,explanation=$2
             WHERE question_id=$3 AND quiz_id=$4 RETURNING question_id`,
            [
              question.difficultyLevel,
              question.explanation,
              question.questionId,
              req.params.quizId,
            ],
          );
          if (!updated.rowCount) throw new Error('QUIZ_QUESTION_NOT_FOUND');
        }
        await client.query('COMMIT');
        res.json({ quiz: result.rows[0] });
      } catch (caught) {
        await client.query('ROLLBACK').catch(() => {});
        throw caught;
      } finally {
        client.release();
      }
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/ai-generation-jobs/:jobId',
  requireAuth,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        'SELECT * FROM ai_generation_jobs WHERE job_id=$1 AND requested_by=$2',
        [req.params.jobId, req.user.userId],
      );
      if (!result.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Generation job not found.',
          requestId(req),
        );
      res.json({
        job: {
          ...generationJobView(result.rows[0]),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

const probeAiHealth = createAiHealthProbe();
app.get(
  '/api/v1/ai-status',
  requireAuth,
  requireRole('lecturer'),
  async (_req, res) => {
    const selected = (process.env.AI_PROVIDER || 'mock').toLowerCase();
    let host = 'local';
    try {
      if (process.env.AI_BASE_URL)
        host = new URL(process.env.AI_BASE_URL).hostname;
    } catch {
      host = 'invalid';
    }
    const configured =
      selected === 'mock' ||
      (selected === 'openai_compatible' &&
        Boolean(
          process.env.AI_BASE_URL &&
          process.env.AI_API_KEY &&
          process.env.AI_MODEL,
        ));
    const reachable =
      selected === 'mock' ||
      (configured &&
        (await probeAiHealth(
          process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000',
          process.env.AI_SERVICE_TOKEN || '',
        )));
    res.json({
      provider: selected,
      configured,
      reachable,
      host,
      model: process.env.AI_MODEL || 'mock',
      message:
        configured && reachable
          ? null
          : 'AI service is not reachable or is misconfigured.',
    });
  },
);

app.post(
  '/api/v1/ai-generation-jobs/:jobId/cancel',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const data = parse(z.object({}).strict(), req.body || {}, req, res);
      if (!data) return;
      const result = await pool.query(
        `UPDATE ai_generation_jobs SET status='failed',error_code='CANCELLED',updated_at=now()
       WHERE job_id=$1 AND requested_by=$2 AND status IN ('queued','running') RETURNING *`,
        [req.params.jobId, req.user.userId],
      );
      if (!result.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Generation job not found.',
          requestId(req),
        );
      res.json({ job: generationJobView(result.rows[0]) });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/ai-generation-jobs/:jobId/retry',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const data = parse(z.object({}).strict(), req.body || {}, req, res);
      if (!data) return;
      const result = await pool.query(
        `UPDATE ai_generation_jobs SET status='queued',error_code=NULL,attempts=0,updated_at=now()
       WHERE job_id=$1 AND requested_by=$2 AND status='failed' RETURNING *`,
        [req.params.jobId, req.user.userId],
      );
      if (!result.rowCount)
        return error(
          res,
          404,
          'NOT_FOUND',
          'Failed generation job not found.',
          requestId(req),
        );
      res.status(202).json({ job: generationJobView(result.rows[0]) });
    } catch (e) {
      next(e);
    }
  },
);

// ── Student attempts and authoritative transactional scoring ──────────────
app.post(
  '/api/v1/quizzes/:quizId/attempts',
  requireAuth,
  async (req, res, next) => {
    const requestData = parse(z.object({}).strict(), req.body || {}, req, res);
    if (!requestData) return;
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${req.params.quizId}:${req.user.userId}`,
      ]);
      const quiz = await tx.query(
        "SELECT * FROM quizzes WHERE quiz_id=$1 AND status='published' FOR SHARE",
        [req.params.quizId],
      );
      if (!quiz.rowCount) {
        await tx.query('ROLLBACK');
        return error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      }
      if (
        quiz.rows[0].closes_at &&
        new Date(quiz.rows[0].closes_at) < new Date()
      ) {
        await tx.query('ROLLBACK');
        return error(
          res,
          409,
          'QUIZ_CLOSED',
          'This quiz is closed.',
          requestId(req),
        );
      }
      if (req.user.role !== 'student') {
        await tx.query('ROLLBACK');
        return error(res, 403, 'FORBIDDEN', 'Students only.', requestId(req));
      }
      const enrolled = await tx.query(
        'SELECT 1 FROM enrollments WHERE student_id=$1 AND module_id=$2',
        [req.user.userId, quiz.rows[0].module_id],
      );
      if (!enrolled.rowCount) {
        await tx.query('ROLLBACK');
        return error(
          res,
          403,
          'FORBIDDEN',
          'You are not enrolled in this module.',
          requestId(req),
        );
      }
      const existing = await tx.query(
        'SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND ((is_scored) OR completion_time IS NULL) ORDER BY start_time LIMIT 1',
        [req.params.quizId, req.user.userId],
      );
      if (existing.rowCount) {
        await tx.query('ROLLBACK');
        return res.status(409).json({
          error: {
            code: 'ATTEMPT_EXISTS',
            message: 'You already have an attempt for this quiz.',
            requestId: requestId(req),
          },
          attempt: existing.rows[0],
        });
      }
      const attempt = await tx.query(
        'INSERT INTO quiz_attempts(quiz_id,student_id) VALUES($1,$2) RETURNING attempt_id,start_time',
        [req.params.quizId, req.user.userId],
      );
      const questions = await tx.query(
        "SELECT q.question_id,q.question_text,q.marks,q.topic_id,q.question_type,q.code_language,q.code_before,json_agg(json_build_object('optionId',o.option_id,'optionText',o.option_text)) FILTER (WHERE o.option_id IS NOT NULL) options FROM questions q LEFT JOIN question_options o ON o.question_id=q.question_id WHERE q.quiz_id=$1 GROUP BY q.question_id ORDER BY q.display_order,q.question_id",
        [req.params.quizId],
      );
      for (const question of questions.rows)
        question.options = question.options || [];
      await tx.query('COMMIT');
      res.status(201).json({
        attempt: attempt.rows[0],
        quiz: quiz.rows[0],
        questions: questions.rows,
      });
    } catch (e) {
      await tx.query('ROLLBACK').catch(() => {});
      next(e);
    } finally {
      tx.release();
    }
  },
);

app.post(
  '/api/v1/attempts/:attemptId/submit',
  requireAuth,
  async (req, res, next) => {
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      const attempt = await tx.query(
        `SELECT a.*,q.is_competitive,q.closes_at FROM quiz_attempts a JOIN quizzes q ON q.quiz_id=a.quiz_id WHERE a.attempt_id=$1 AND a.student_id=$2 FOR UPDATE`,
        [req.params.attemptId, req.user.userId],
      );
      if (!attempt.rowCount) {
        await tx.query('ROLLBACK');
        return error(
          res,
          404,
          'NOT_FOUND',
          'Attempt not found.',
          requestId(req),
        );
      }
      if (attempt.rows[0].completion_time) {
        await tx.query('ROLLBACK');
        return res.json({
          score: attempt.rows[0].score,
          alreadySubmitted: true,
        });
      }
      if (
        attempt.rows[0].closes_at &&
        new Date(attempt.rows[0].closes_at) < new Date()
      ) {
        await tx.query('ROLLBACK');
        return error(
          res,
          409,
          'QUIZ_CLOSED',
          'This quiz is closed.',
          requestId(req),
        );
      }
      const data = parse(
        z
          .object({
            answers: z.array(
              z.union([
                z
                  .object({
                    questionId: z.string().uuid(),
                    optionId: z.string().uuid(),
                  })
                  .strict(),
                z
                  .object({
                    questionId: z.string().uuid(),
                    answerText: z.string().max(2000),
                  })
                  .strict(),
              ]),
            ),
          })
          .strict(),
        req.body,
        req,
        res,
      );
      if (!data) {
        await tx.query('ROLLBACK');
        return;
      }
      const answers = new Set();
      let score = 0;
      for (const answer of data.answers) {
        if (answers.has(answer.questionId)) {
          await tx.query('ROLLBACK');
          return error(
            res,
            400,
            'DUPLICATE_ANSWER',
            'Each question may be answered once.',
            requestId(req),
          );
        }
        answers.add(answer.questionId);
        const question = await tx.query(
          'SELECT question_id,question_type,marks,accepted_answers,ignore_punctuation FROM questions WHERE quiz_id=$1 AND question_id=$2',
          [attempt.rows[0].quiz_id, answer.questionId],
        );
        if (!question.rowCount) {
          await tx.query('ROLLBACK');
          return error(
            res,
            400,
            'INVALID_ANSWER',
            'One or more answers are invalid.',
            requestId(req),
          );
        }
        let isCorrect = false;
        if (question.rows[0].question_type === 'short_answer') {
          if (!('answerText' in answer)) {
            await tx.query('ROLLBACK');
            return error(
              res,
              400,
              'INVALID_ANSWER',
              'One or more answers are invalid.',
              requestId(req),
            );
          }
          const submitted = answer.answerText
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
            .trim();
          if (submitted) {
            isCorrect = matchesShortAnswer(
              submitted,
              question.rows[0].accepted_answers || [],
              question.rows[0].ignore_punctuation,
            );
            if (isCorrect) score += Number(question.rows[0].marks);
            await tx.query(
              'INSERT INTO student_answers(attempt_id,question_id,answer_text,is_correct) VALUES($1,$2,$3,$4)',
              [req.params.attemptId, answer.questionId, submitted, isCorrect],
            );
          } else {
            answers.delete(answer.questionId);
          }
        } else {
          if (!('optionId' in answer)) {
            await tx.query('ROLLBACK');
            return error(
              res,
              400,
              'INVALID_ANSWER',
              'One or more answers are invalid.',
              requestId(req),
            );
          }
          const row = await tx.query(
            'SELECT o.option_id,o.is_correct FROM question_options o WHERE o.question_id=$1 AND o.option_id=$2',
            [answer.questionId, answer.optionId],
          );
          if (!row.rowCount) {
            await tx.query('ROLLBACK');
            return error(
              res,
              400,
              'INVALID_ANSWER',
              'One or more answers are invalid.',
              requestId(req),
            );
          }
          isCorrect = row.rows[0].is_correct;
          if (isCorrect) score += Number(question.rows[0].marks);
          await tx.query(
            'INSERT INTO student_answers(attempt_id,question_id,option_id,is_correct) VALUES($1,$2,$3,$4)',
            [
              req.params.attemptId,
              answer.questionId,
              answer.optionId,
              isCorrect,
            ],
          );
        }
      }
      const count = await tx.query(
        'SELECT count(*)::int AS total FROM questions WHERE quiz_id=$1',
        [attempt.rows[0].quiz_id],
      );
      const completed = await tx.query(
        'UPDATE quiz_attempts SET score=$1,completion_time=now(),is_scored=$2 WHERE attempt_id=$3 RETURNING *',
        [score, attempt.rows[0].is_competitive, req.params.attemptId],
      );
      const feedback = await tx.query(
        `SELECT q.question_id,q.explanation,q.code_after,q.expected_output,
          coalesce((SELECT option_text FROM question_options o WHERE o.question_id=q.question_id AND o.is_correct=true LIMIT 1), q.accepted_answers->>0) AS correct_answer
         FROM questions q WHERE q.quiz_id=$1 ORDER BY q.display_order,q.question_id`,
        [attempt.rows[0].quiz_id],
      );
      await tx.query('COMMIT');
      res.json({
        result: completed.rows[0],
        unansweredCount: count.rows[0].total - answers.size,
        feedback: feedback.rows,
      });
    } catch (e) {
      await tx.query('ROLLBACK');
      next(e);
    } finally {
      tx.release();
    }
  },
);

// ── Leaderboards and lecturer/student analytics ───────────────────────────
app.get(
  '/api/v1/modules/:moduleId/leaderboard',
  requireAuth,
  async (req, res, next) => {
    try {
      const ownership = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (req.user.role === 'lecturer' && !ownership.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      if (req.user.role === 'student') {
        const enrolled = await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [req.params.moduleId, req.user.userId],
        );
        if (!enrolled.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You are not enrolled in this module.',
            requestId(req),
          );
      }
      const groupId = req.query.groupId || null;
      if (groupId) {
        const group = await pool.query(
          'SELECT 1 FROM study_groups WHERE group_id=$1 AND module_id=$2',
          [groupId, req.params.moduleId],
        );
        if (!group.rowCount)
          return error(
            res,
            400,
            'VALIDATION_ERROR',
            'Please check the submitted fields.',
            requestId(req),
          );
        if (req.user.role === 'student') {
          const member = await pool.query(
            'SELECT 1 FROM group_members WHERE group_id=$1 AND student_id=$2',
            [groupId, req.user.userId],
          );
          if (!member.rowCount)
            return error(
              res,
              403,
              'FORBIDDEN',
              'You are not in this study group.',
              requestId(req),
            );
        }
      }
      const result = await pool.query(
        `SELECT a.student_id,u.full_name,a.score,a.completion_time,rank() over(order by a.score desc,a.completion_time asc) AS rank FROM quiz_attempts a JOIN quizzes q ON q.quiz_id=a.quiz_id JOIN users u ON u.user_id=a.student_id ${groupId ? 'JOIN group_members gm ON gm.student_id=a.student_id AND gm.group_id=$2' : ''} WHERE q.module_id=$1 AND a.is_scored=true AND a.completion_time IS NOT NULL ORDER BY rank,a.completion_time`,
        groupId ? [req.params.moduleId, groupId] : [req.params.moduleId],
      );
      res.json({ data: result.rows });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/me/analytics',
  requireAuth,
  requireRole('student'),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT t.topic_id,t.name,CASE WHEN count(sa.answer_id)=0 THEN NULL ELSE round(100.0*sum(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)/count(sa.answer_id),2) END AS correctness_percentage FROM topics t LEFT JOIN questions q ON q.topic_id=t.topic_id LEFT JOIN quizzes z ON z.quiz_id=q.quiz_id LEFT JOIN quiz_attempts a ON a.quiz_id=z.quiz_id AND a.student_id=$1 AND a.is_scored=true AND a.completion_time IS NOT NULL LEFT JOIN student_answers sa ON sa.question_id=q.question_id AND sa.attempt_id=a.attempt_id GROUP BY t.topic_id,t.name ORDER BY t.name`,
        [req.user.userId],
      );
      res.json({ data: result.rows });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/modules/:moduleId/groups/:groupId/analytics',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const owned = await pool.query(
        'SELECT 1 FROM study_groups g JOIN modules m ON m.module_id=g.module_id WHERE g.group_id=$1 AND g.module_id=$2 AND m.lecturer_id=$3',
        [req.params.groupId, req.params.moduleId, req.user.userId],
      );
      if (!owned.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this group.',
          requestId(req),
        );
      const result = await pool.query(
        `SELECT round(avg(a.score),2) AS average_score,count(DISTINCT a.student_id)::int AS students FROM quiz_attempts a JOIN quizzes q ON q.quiz_id=a.quiz_id JOIN group_members gm ON gm.student_id=a.student_id AND gm.group_id=$1 WHERE q.module_id=$2 AND a.is_scored=true AND a.completion_time IS NOT NULL`,
        [req.params.groupId, req.params.moduleId],
      );
      res.json({ data: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

// ── Practice-game catalogue, availability, resume, and aggregate activity ─
app.get('/api/v1/games/catalogue', requireAuth, async (req, res, next) => {
  try {
    const valid = parse(z.object({}).strict(), req.query, req, res);
    if (!valid) return;
    const result = await pool.query(
      `SELECT game_type_id,key,display_name,description,minimum_questions
         FROM game_types WHERE is_enabled=true
         ORDER BY CASE key WHEN 'infected' THEN 1 WHEN 'island_escape' THEN 2
           WHEN 'memory_match' THEN 3 WHEN 'boss_battle' THEN 4
           WHEN 'pixel_racer' THEN 5 WHEN 'timer_trivia' THEN 6 ELSE 100 END,key`,
    );
    res.json({ data: result.rows });
  } catch (e) {
    next(e);
  }
});

async function gameAvailabilityForQuiz(user, quiz) {
  const catalogue = await pool.query(
    `SELECT game_type_id,key,display_name,description,minimum_questions
     FROM game_types WHERE is_enabled=true
     ORDER BY CASE key WHEN 'infected' THEN 1 WHEN 'island_escape' THEN 2
       WHEN 'memory_match' THEN 3 WHEN 'boss_battle' THEN 4
       WHEN 'pixel_racer' THEN 5 WHEN 'timer_trivia' THEN 6 ELSE 100 END,key`,
  );
  const counts = (
    await pool.query(
      `SELECT count(q.question_id)::int AS question_count,
        (${memoryCountSql}) AS memory_eligible,
        count(q.question_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM question_options correct
          WHERE correct.question_id=q.question_id AND correct.is_correct=true
        ) AND q.question_type NOT IN ('short_answer','code') AND (SELECT count(*) FROM question_options options
          WHERE options.question_id=q.question_id)>=2)::int AS answerable
        ,count(q.question_id) FILTER (WHERE q.question_type IN ('short_answer','code'))::int AS unsupported_for_games
       FROM questions q WHERE q.quiz_id=$1`,
      [quiz.quiz_id],
    )
  ).rows[0];
  const enrolled =
    user.role === 'lecturer' ||
    Boolean(
      (
        await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [quiz.module_id, user.userId],
        )
      ).rowCount,
    );
  const scoredAttemptCompleted = Boolean(
    (
      await pool.query(
        'SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND is_scored=true AND completion_time IS NOT NULL',
        [quiz.quiz_id, user.userId],
      )
    ).rowCount,
  );
  const plays = await pool.query(
    `SELECT p.play_id,gt.key FROM game_plays p
     JOIN game_types gt ON gt.game_type_id=p.game_type_id
     WHERE p.quiz_id=$1 AND p.student_id=$2 AND p.status='in_progress'`,
    [quiz.quiz_id, user.userId],
  );
  const playByKey = new Map(plays.rows.map((row) => [row.key, row.play_id]));
  return catalogue.rows.map((game) => {
    const result = getGameAvailability({
      game,
      user,
      quiz,
      counts,
      enrolled,
      scoredAttemptCompleted,
      hasInProgressPlay: playByKey.has(game.key),
    });
    return {
      ...result,
      playId: playByKey.get(game.key) || null,
    };
  });
}

app.get(
  '/api/v1/games/availability/:quizId',
  requireAuth,
  async (req, res, next) => {
    try {
      const valid = parse(z.object({}).strict(), req.query, req, res);
      if (!valid) return;
      const quiz = await pool.query('SELECT * FROM quizzes WHERE quiz_id=$1', [
        req.params.quizId,
      ]);
      if (!quiz.rowCount)
        return error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      if (req.user.role === 'lecturer') {
        const owner = await pool.query(
          'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
          [quiz.rows[0].module_id, req.user.userId],
        );
        if (!owner.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You do not manage this quiz.',
            requestId(req),
          );
      } else {
        const enrolled = await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [quiz.rows[0].module_id, req.user.userId],
        );
        if (!enrolled.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You are not enrolled in this module.',
            requestId(req),
          );
      }
      res.json({ data: await gameAvailabilityForQuiz(req.user, quiz.rows[0]) });
    } catch (e) {
      next(e);
    }
  },
);

app.get('/api/v1/games/in-progress', requireAuth, async (req, res, next) => {
  try {
    const valid = parse(z.object({}).strict(), req.query, req, res);
    if (!valid) return;
    if (req.user.role === 'lecturer') return res.json({ data: [] });
    const result = await pool.query(
      `SELECT p.play_id,gt.key AS game_key,gt.display_name,q.quiz_id,q.title,m.module_id,m.module_name
         FROM game_plays p JOIN game_types gt ON gt.game_type_id=p.game_type_id
         JOIN quizzes q ON q.quiz_id=p.quiz_id JOIN modules m ON m.module_id=q.module_id
         WHERE p.student_id=$1 AND p.status='in_progress' ORDER BY p.updated_at DESC`,
      [req.user.userId],
    );
    res.json({ data: result.rows });
  } catch (e) {
    next(e);
  }
});

app.get('/api/v1/games/quiz-picker', requireAuth, async (req, res, next) => {
  try {
    const query = parse(
      z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          search: z.string().max(100).default(''),
        })
        .strict(),
      req.query,
      req,
      res,
    );
    if (!query) return;
    const scope =
      req.user.role === 'lecturer'
        ? 'm.lecturer_id=$1'
        : 'EXISTS (SELECT 1 FROM enrollments e WHERE e.module_id=m.module_id AND e.student_id=$1)';
    const params = [req.user.userId, `%${query.search.trim()}%`];
    const base = `FROM quizzes q JOIN modules m ON m.module_id=q.module_id
        WHERE ${scope} AND q.title ILIKE $2`;
    const total = await pool.query(
      `SELECT count(*)::int AS count ${base}`,
      params,
    );
    const quizzes = await pool.query(
      `SELECT q.quiz_id,q.title,q.is_competitive,q.status,q.closes_at,q.created_at,
                m.module_id,m.module_name
         ${base} ORDER BY q.created_at DESC,q.quiz_id DESC LIMIT $3 OFFSET $4`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    );
    const data = await Promise.all(
      quizzes.rows.map(async (quiz) => ({
        ...quiz,
        games: await gameAvailabilityForQuiz(req.user, quiz),
      })),
    );
    res.json({
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: total.rows[0].count,
        pages: Math.max(1, Math.ceil(total.rows[0].count / query.pageSize)),
      },
    });
  } catch (e) {
    next(e);
  }
});

app.get(
  '/api/v1/quizzes/:quizId/games',
  requireAuth,
  async (req, res, next) => {
    try {
      const quiz = await pool.query('SELECT * FROM quizzes WHERE quiz_id=$1', [
        req.params.quizId,
      ]);
      if (!quiz.rowCount)
        return error(res, 404, 'NOT_FOUND', 'Quiz not found.', requestId(req));
      const owner = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [quiz.rows[0].module_id, req.user.userId],
      );
      if (req.user.role === 'student') {
        const enrolled = await pool.query(
          'SELECT 1 FROM enrollments WHERE module_id=$1 AND student_id=$2',
          [quiz.rows[0].module_id, req.user.userId],
        );
        if (!enrolled.rowCount)
          return error(
            res,
            403,
            'FORBIDDEN',
            'You are not enrolled in this module.',
            requestId(req),
          );
      } else if (!owner.rowCount) {
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this quiz.',
          requestId(req),
        );
      }
      res.json({
        data: await gameAvailabilityForQuiz(req.user, quiz.rows[0]),
      });
    } catch (e) {
      next(e);
    }
  },
);
app.get(
  '/api/v1/modules/:moduleId/analytics',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const owned = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (!owned.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      const topics = await pool.query(
        `SELECT t.topic_id,t.name,CASE WHEN count(sa.answer_id)=0 THEN NULL ELSE round(100.0*sum(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)/count(sa.answer_id),2) END AS correctness_percentage FROM topics t LEFT JOIN questions q ON q.topic_id=t.topic_id LEFT JOIN student_answers sa ON sa.question_id=q.question_id JOIN quizzes z ON z.quiz_id=q.quiz_id AND z.module_id=t.module_id WHERE t.module_id=$1 GROUP BY t.topic_id,t.name ORDER BY correctness_percentage NULLS FIRST`,
        [req.params.moduleId],
      );
      res.json({ weakTopics: topics.rows });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/modules/:moduleId/games/activity',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const valid = parse(z.object({}).strict(), req.body || {}, req, res);
      if (!valid) return;
      const owned = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (!owned.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      const activity = await pool.query(
        `SELECT gt.key,gt.display_name,
                count(p.play_id)::int AS plays,
                count(p.play_id) FILTER (WHERE p.status<>'in_progress')::int AS completions
         FROM game_types gt
         LEFT JOIN game_plays p ON p.game_type_id=gt.game_type_id
           AND p.quiz_id IN (SELECT quiz_id FROM quizzes WHERE module_id=$1)
         WHERE gt.key<>'infected'
         GROUP BY gt.game_type_id,gt.key,gt.display_name
         ORDER BY gt.key`,
        [req.params.moduleId],
      );
      res.json({ data: activity.rows });
    } catch (caught) {
      next(caught);
    }
  },
);

const labBaseSchema = z
  .object({
    moduleId: z.string().uuid(),
    kind: z.enum(['code', 'spreadsheet', 'calculator', 'scenario']),
    title: labTitle,
    instructions: labText,
    difficulty: z.number().int().min(1).max(5),
    status: z.enum(['draft', 'published']),
    config: z.record(z.string(), z.unknown()),
  })
  .strict();
const labCreateSchema = labBaseSchema.extend({
  status: z.enum(['draft', 'published']).default('draft'),
  config: z.record(z.string(), z.unknown()).default({}),
});
const labPatchSchema = labBaseSchema
  .omit({ moduleId: true })
  .partial()
  .strict();

const labConfigFor = (kind, config) => {
  const schema =
    kind === 'code'
      ? codeLabConfig
      : kind === 'spreadsheet'
        ? spreadsheetConfig
        : kind === 'calculator'
          ? calculatorConfig
          : scenarioConfig;
  const parsed = schema.safeParse(config);
  if (!parsed.success) return null;
  if (kind === 'scenario' && !validateScenarioConfig(parsed.data).ok)
    return null;
  return parsed.data;
};
const labAccess = async (labId, user) => {
  const result = await pool.query(
    `SELECT l.*,m.module_name,m.module_code,m.lecturer_id
     FROM labs l LEFT JOIN modules m ON m.module_id=l.module_id WHERE l.lab_id=$1`,
    [labId],
  );
  if (!result.rowCount) return null;
  const lab = result.rows[0];
  if (user.role === 'lecturer')
    return lab.lecturer_id === user.userId ? lab : false;
  if (user.role !== 'student') return false;
  if (lab.is_starter && lab.status === 'published') return lab;
  const enrolled = await pool.query(
    'SELECT 1 FROM enrollments WHERE student_id=$1 AND module_id=$2',
    [user.userId, lab.module_id],
  );
  return enrolled.rowCount && lab.status === 'published' ? lab : false;
};
const labClientView = (lab, user) => {
  const config = { ...lab.config };
  if (user.role === 'student') {
    delete config.modelSolution;
    delete config.allowModelSolution;
    config.checks = (config.checks || []).map(
      ({ expected: _expected, ...check }) => check,
    );
    if (lab.kind === 'spreadsheet')
      config.lockedCells = config.lockedCells || [];
  }
  return { ...lab, config };
};

const spreadsheetCheckResults = (lab, submission) =>
  (lab.config.checks || []).map((check) => {
    const grid = submission?.grid || {};
    const evaluated = evaluateCell(grid, check.cell);
    return {
      passed:
        !evaluated.error &&
        typeof evaluated.value === 'number' &&
        Math.abs(evaluated.value - check.expected) <= check.tolerance &&
        (!check.requiresFormula ||
          String(grid[check.cell] || '').startsWith('=')),
      hint: check.hint,
    };
  });

// ── Practice Labs: catalogue, authoring, attempts, and aggregate progress ──
app.get('/api/v1/labs', requireAuth, async (req, res, next) => {
  try {
    const query = z
      .object({
        moduleId: z.string().uuid().optional(),
        search: z.string().trim().max(100).default(''),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
      })
      .strict();
    const options = parse(query, req.query, req, res, 422);
    if (!options) return;
    const programmeOrder =
      req.user.studentType === 'business'
        ? "CASE WHEN l.kind IN ('spreadsheet','calculator','scenario') THEN 0 ELSE 1 END"
        : "CASE WHEN l.kind='code' THEN 0 ELSE 1 END";
    const ownership =
      req.user.role === 'lecturer'
        ? ['m.lecturer_id=$1', req.user.userId]
        : [
            `${req.user.role === 'student' ? '(l.is_starter OR EXISTS (SELECT 1 FROM enrollments e WHERE e.module_id=l.module_id AND e.student_id=$1))' : 'false AND $1::uuid IS NOT NULL'} AND l.status='published'`,
            req.user.userId,
          ];
    const params = [
      ownership[1],
      options.moduleId || null,
      `%${options.search}%`,
      options.pageSize,
      (options.page - 1) * options.pageSize,
    ];
    const rows = await pool.query(
      `SELECT l.lab_id,l.module_id,l.kind,l.title,l.instructions,l.difficulty,l.status,l.created_by,l.created_at,l.updated_at,l.is_starter,m.module_code,m.module_name,
              COALESCE(la.checks_passed,0)::int AS checks_passed,COALESCE(la.checks_total,jsonb_array_length(COALESCE(l.config->'checks','[]'::jsonb)))::int AS checks_total,COALESCE(la.completed,false) AS completed
       FROM labs l LEFT JOIN modules m ON m.module_id=l.module_id LEFT JOIN lab_attempts la ON la.lab_id=l.lab_id AND la.student_id=$1
       WHERE ${ownership[0]} AND ($2::uuid IS NULL OR l.module_id=$2) AND ($3='' OR l.title ILIKE $3)
       ORDER BY ${programmeOrder},l.created_at DESC,l.lab_id LIMIT $4 OFFSET $5`,
      params,
    );
    res.json({
      data: rows.rows,
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        total: rows.rowCount,
        pages: Math.max(1, Math.ceil(rows.rowCount / options.pageSize)),
      },
    });
  } catch (e) {
    next(e);
  }
});

app.post(
  '/api/v1/labs',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const data = parse(labCreateSchema, req.body, req, res, 422);
      if (!data) return;
      if (
        !visibleText('labTitle', req, res, data.title) ||
        !visibleText('labInstructions', req, res, data.instructions)
      )
        return;
      const config = labConfigFor(data.kind, data.config);
      if (!config)
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'Please check the lab configuration.',
          requestId(req),
        );
      const owned = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [data.moduleId, req.user.userId],
      );
      if (!owned.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      const result = await pool.query(
        `INSERT INTO labs(module_id,kind,title,instructions,difficulty,status,created_by,config) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          data.moduleId,
          data.kind,
          data.title,
          data.instructions,
          data.difficulty,
          data.status,
          req.user.userId,
          config,
        ],
      );
      res.status(201).json({ lab: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.get('/api/v1/labs/:labId', requireAuth, async (req, res, next) => {
  try {
    const lab = await labAccess(req.params.labId, req.user);
    if (!lab)
      return error(res, 404, 'NOT_FOUND', 'Lab not found.', requestId(req));
    res.json({ lab: labClientView(lab, req.user) });
  } catch (e) {
    next(e);
  }
});

app.patch(
  '/api/v1/labs/:labId',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const data = parse(labPatchSchema, req.body, req, res, 422);
      if (!data) return;
      if (data.title && !visibleText('labTitle', req, res, data.title)) return;
      if (
        data.instructions &&
        !visibleText('labInstructions', req, res, data.instructions)
      )
        return;
      const existing = await labAccess(req.params.labId, req.user);
      if (!existing)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this lab.',
          requestId(req),
        );
      const config = data.config
        ? labConfigFor(data.kind || existing.kind, data.config)
        : existing.config;
      if (!config)
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'Please check the lab configuration.',
          requestId(req),
        );
      const result = await pool.query(
        `UPDATE labs SET kind=COALESCE($1,kind),title=COALESCE($2,title),instructions=COALESCE($3,instructions),difficulty=COALESCE($4,difficulty),status=COALESCE($5,status),config=$6,updated_at=now() WHERE lab_id=$7 RETURNING *`,
        [
          data.kind || null,
          data.title || null,
          data.instructions || null,
          data.difficulty || null,
          data.status || null,
          config,
          req.params.labId,
        ],
      );
      res.json({ lab: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/v1/labs/:labId/duplicate',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const existing = await labAccess(req.params.labId, req.user);
      if (!existing)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this lab.',
          requestId(req),
        );
      const result = await pool.query(
        `INSERT INTO labs(module_id,kind,title,instructions,difficulty,status,created_by,config)
       SELECT module_id,kind,title || ' (copy)',instructions,difficulty,'draft',$1,config FROM labs WHERE lab_id=$2 RETURNING *`,
        [req.user.userId, req.params.labId],
      );
      res.status(201).json({ lab: result.rows[0] });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  '/api/v1/labs/:labId',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      if (!parse(z.object({}).strict(), req.body || {}, req, res, 422)) return;
      const existing = await labAccess(req.params.labId, req.user);
      if (!existing)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this lab.',
          requestId(req),
        );
      const attempts = await pool.query(
        'SELECT 1 FROM lab_attempts WHERE lab_id=$1 LIMIT 1',
        [req.params.labId],
      );
      if (attempts.rowCount)
        return error(
          res,
          409,
          'LAB_LOCKED',
          'This lab cannot be deleted after student attempts.',
          requestId(req),
        );
      await pool.query('DELETE FROM labs WHERE lab_id=$1', [req.params.labId]);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  '/api/v1/labs/:labId/attempt',
  requireAuth,
  requireRole('student'),
  async (req, res, next) => {
    try {
      const lab = await labAccess(req.params.labId, req.user);
      if (!lab)
        return error(res, 404, 'NOT_FOUND', 'Lab not found.', requestId(req));
      const result = await pool.query(
        'SELECT * FROM lab_attempts WHERE lab_id=$1 AND student_id=$2',
        [req.params.labId, req.user.userId],
      );
      const attempt = result.rows[0] || null;
      const checkResults =
        lab.kind === 'spreadsheet'
          ? spreadsheetCheckResults(lab, attempt?.submission)
          : [];
      res.json({ attempt, checkResults });
    } catch (e) {
      next(e);
    }
  },
);

app.put(
  '/api/v1/labs/:labId/attempt',
  requireAuth,
  requireRole('student'),
  async (req, res, next) => {
    try {
      const data = parse(
        z
          .object({
            submission: z.record(z.string(), z.unknown()),
            checksPassed: z.number().int().min(0),
            checksTotal: z.number().int().min(0),
            completed: z.boolean(),
          })
          .strict(),
        req.body,
        req,
        res,
        422,
      );
      if (!data) return;
      const lab = await labAccess(req.params.labId, req.user);
      if (!lab)
        return error(res, 404, 'NOT_FOUND', 'Lab not found.', requestId(req));
      sanitizeSubmission(data.submission);
      const checkResults =
        lab.kind === 'spreadsheet'
          ? spreadsheetCheckResults(lab, data.submission)
          : null;
      const total = checkResults
        ? checkResults.length
        : Math.min(
            data.checksTotal,
            Array.isArray(lab.config.checks) ? lab.config.checks.length : 0,
          );
      const passed = checkResults
        ? checkResults.filter((check) => check.passed).length
        : Math.min(data.checksPassed, total);
      const result = await pool.query(
        `INSERT INTO lab_attempts(lab_id,student_id,submission,checks_passed,checks_total,completed,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(lab_id,student_id) DO UPDATE SET submission=EXCLUDED.submission,checks_passed=EXCLUDED.checks_passed,checks_total=EXCLUDED.checks_total,completed=EXCLUDED.completed,updated_at=now() RETURNING *`,
        [
          req.params.labId,
          req.user.userId,
          data.submission,
          passed,
          total,
          checkResults
            ? total > 0 && passed === total
            : data.completed && passed === total,
        ],
      );
      res.json({
        attempt: result.rows[0],
        selfChecked: true,
        ...(checkResults ? { checkResults } : {}),
      });
    } catch (e) {
      if (e.message === 'LAB_SUBMISSION_TOO_LARGE')
        return error(
          res,
          422,
          'VALIDATION_ERROR',
          'Your saved work is too large.',
          requestId(req),
        );
      next(e);
    }
  },
);

app.get(
  '/api/v1/modules/:moduleId/labs/activity',
  requireAuth,
  requireRole('lecturer'),
  async (req, res, next) => {
    try {
      const owned = await pool.query(
        'SELECT 1 FROM modules WHERE module_id=$1 AND lecturer_id=$2',
        [req.params.moduleId, req.user.userId],
      );
      if (!owned.rowCount)
        return error(
          res,
          403,
          'FORBIDDEN',
          'You do not manage this module.',
          requestId(req),
        );
      const result = await pool.query(
        `SELECT l.lab_id,l.title,l.kind,count(la.attempt_id)::int AS started,count(la.attempt_id) FILTER (WHERE la.completed)::int AS completed FROM labs l LEFT JOIN lab_attempts la ON la.lab_id=l.lab_id WHERE l.module_id=$1 GROUP BY l.lab_id ORDER BY l.created_at DESC`,
        [req.params.moduleId],
      );
      res.json({ data: result.rows });
    } catch (e) {
      next(e);
    }
  },
);

registerInfectedRoutes({
  app,
  pool,
  requireAuth,
  requireRole,
  error,
  requestId,
});

registerIslandEscapeRoutes({
  app,
  pool,
  requireAuth,
  error,
  requestId,
});

registerMemoryMatchRoutes({ app, pool, requireAuth, error, requestId });
registerBossBattleRoutes({ app, pool, requireAuth, error, requestId });
registerPixelRacerRoutes({ app, pool, requireAuth, error, requestId });
registerTimerTriviaRoutes({ app, pool, requireAuth, error, requestId });
registerSessionRoutes({ app, pool, requireAuth, error, requestId });
registerMessagingRoutes({ app, pool, requireAuth, error, requestId });
registerStudentNetworkRoutes({ app, pool, requireAuth, error, requestId });
registerAdminRoutes({
  app,
  pool,
  requireAuth,
  error,
  requestId,
  issueVerificationMail,
});

app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return error(
      res,
      413,
      'UPLOAD_TOO_LARGE',
      'This file exceeds the upload limit.',
      requestId(req),
    );
  }
  console.error(
    JSON.stringify({
      requestId: requestId(req),
      userId: req.user?.userId,
      code: err.code || 'INTERNAL_ERROR',
    }),
  );
  if (!res.headersSent)
    error(
      res,
      500,
      'INTERNAL_ERROR',
      'Something went wrong. Please try again.',
      requestId(req),
    );
});

export { app };
