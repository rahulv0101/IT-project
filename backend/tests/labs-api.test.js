// @ts-nocheck
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

describe('Practice Lab API', () => {
  let lecturer, otherLecturer, student, _outsider, moduleRow, otherModule, lab;
  let lecturerAgent, studentAgent, outsiderAgent;
  const password = 'LabPassword9!';

  beforeAll(async () => {
    const hash = await bcrypt.hash(password, 12);
    const users = await Promise.all([
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,email_verified_at) VALUES('lab-lecturer@example.com',$1,'lecturer','Lab Lecturer','Lab',now()) RETURNING user_id`,
        [hash],
      ),
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,student_year,email_verified_at) VALUES('lab-student@example.com',$1,'student','Lab Student','Lab','it',1,now()) RETURNING user_id`,
        [hash],
      ),
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,student_year,email_verified_at) VALUES('lab-outsider@example.com',$1,'student','Lab Outsider','Lab','business',1,now()) RETURNING user_id`,
        [hash],
      ),
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,email_verified_at) VALUES('lab-other@example.com',$1,'lecturer','Other Lecturer','Other',now()) RETURNING user_id`,
        [hash],
      ),
    ]);
    lecturer = users[0].rows[0].user_id;
    student = users[1].rows[0].user_id;
    _outsider = users[2].rows[0].user_id;
    otherLecturer = users[3].rows[0].user_id;
    moduleRow = (
      await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,join_code) VALUES($1,'LAB101','IT Lab Module','LABJOIN101001') RETURNING *`,
        [lecturer],
      )
    ).rows[0];
    otherModule = (
      await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,join_code) VALUES($1,'LAB201','Other Lab Module','LABJOIN201001') RETURNING *`,
        [otherLecturer],
      )
    ).rows[0];
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [student, moduleRow.module_id],
    );
    lab = (
      await pool.query(
        `INSERT INTO labs(module_id,kind,title,instructions,difficulty,status,created_by,config) VALUES($1,'code','Heading practice','Build a heading.',1,'published',$2,$3) RETURNING *`,
        [
          moduleRow.module_id,
          lecturer,
          {
            starterHtml: '<h1>Hello</h1>',
            starterCss: '',
            starterJs: '',
            checks: [
              {
                type: 'element_exists',
                selector: 'h1',
                hint: 'Add a heading.',
              },
            ],
          },
        ],
      )
    ).rows[0];
    lecturerAgent = request.agent(app);
    studentAgent = request.agent(app);
    outsiderAgent = request.agent(app);
    await lecturerAgent
      .post('/api/v1/auth/login')
      .send({ email: 'lab-lecturer@example.com', password });
    await studentAgent
      .post('/api/v1/auth/login')
      .send({ email: 'lab-student@example.com', password });
    await outsiderAgent
      .post('/api/v1/auth/login')
      .send({ email: 'lab-outsider@example.com', password });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM lab_attempts WHERE lab_id=$1', [lab?.lab_id]);
    await pool.query('DELETE FROM labs WHERE module_id=ANY($1::uuid[])', [
      [moduleRow?.module_id, otherModule?.module_id],
    ]);
    await pool.query(
      'DELETE FROM enrollments WHERE module_id=ANY($1::uuid[])',
      [[moduleRow?.module_id, otherModule?.module_id]],
    );
    await pool.query('DELETE FROM modules WHERE module_id=ANY($1::uuid[])', [
      [moduleRow?.module_id, otherModule?.module_id],
    ]);
    await pool.query(`DELETE FROM users WHERE email LIKE 'lab-%@example.com'`);
  });

  it('gives students without enrolments all four starter kinds and isolates saved progress', async () => {
    const listed = await outsiderAgent.get('/api/v1/labs');
    expect(listed.status).toBe(200);
    const starters = listed.body.data.filter((row) => row.is_starter);
    expect(starters).toHaveLength(4);
    expect(new Set(starters.map((row) => row.kind))).toEqual(
      new Set(['code', 'spreadsheet', 'calculator', 'scenario']),
    );
    for (const starter of starters) {
      const detail = await outsiderAgent.get(`/api/v1/labs/${starter.lab_id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.lab.config).toBeTruthy();
      expect(detail.body.lab.module_id).toBeNull();
      expect(
        (
          await lecturerAgent
            .patch(`/api/v1/labs/${starter.lab_id}`)
            .send({ title: 'Changed' })
        ).status,
      ).toBe(403);
      expect(
        (await lecturerAgent.delete(`/api/v1/labs/${starter.lab_id}`)).status,
      ).toBe(403);
      expect(
        (
          await lecturerAgent
            .post(`/api/v1/labs/${starter.lab_id}/duplicate`)
            .send({})
        ).status,
      ).toBe(403);
    }
    const code = starters.find((row) => row.kind === 'code');
    const saved = await outsiderAgent
      .put(`/api/v1/labs/${code.lab_id}/attempt`)
      .send({
        submission: { html: '<h1>My draft</h1>' },
        checksPassed: 0,
        checksTotal: 2,
        completed: false,
      });
    expect(saved.status).toBe(200);
    expect(
      (await outsiderAgent.get(`/api/v1/labs/${code.lab_id}/attempt`)).body
        .attempt.submission.html,
    ).toContain('My draft');
    expect(
      (await studentAgent.get(`/api/v1/labs/${code.lab_id}/attempt`)).body
        .attempt,
    ).toBeNull();
    expect((await outsiderAgent.get(`/api/v1/labs/${lab.lab_id}`)).status).toBe(
      404,
    );
    expect(
      (await outsiderAgent.get(`/api/v1/labs?moduleId=${moduleRow.module_id}`))
        .body.data,
    ).toEqual([]);
  });

  it('evaluates starter spreadsheet work when saved and returns immediate feedback without expected answers', async () => {
    const id = '00000000-0000-4000-8000-000000000102';
    const incorrect = await outsiderAgent
      .put(`/api/v1/labs/${id}/attempt`)
      .send({
        submission: { grid: { A2: '12000', B2: '6700', C2: '1' } },
        checksPassed: 1,
        checksTotal: 1,
        completed: true,
      });
    expect(incorrect.body.attempt).toMatchObject({
      checks_passed: 0,
      completed: false,
    });
    expect(incorrect.body.checkResults[0].passed).toBe(false);
    const correct = await outsiderAgent.put(`/api/v1/labs/${id}/attempt`).send({
      submission: { grid: { A2: '12000', B2: '6700', C2: '=A2-B2' } },
      checksPassed: 0,
      checksTotal: 1,
      completed: false,
    });
    expect(correct.body.attempt).toMatchObject({
      checks_passed: 1,
      completed: true,
    });
    expect(correct.body.checkResults[0].passed).toBe(true);
    expect(JSON.stringify(correct.body)).not.toContain('expected');
    expect(
      (await outsiderAgent.get(`/api/v1/labs/${id}/attempt`)).body.checkResults,
    ).toEqual(correct.body.checkResults);
  });

  it('lists published labs only for enrolled students with recommendation ordering', async () => {
    const result = await studentAgent.get('/api/v1/labs');
    expect(result.status).toBe(200);
    expect(result.body.data[0]).toMatchObject({
      lab_id: lab.lab_id,
      kind: 'code',
      module_code: 'LAB101',
    });
    expect(result.body.data[0]).toHaveProperty('checks_passed', 0);
  });

  it('keeps unpublished and other-module labs out of student responses', async () => {
    const draft = (
      await pool.query(
        `INSERT INTO labs(module_id,kind,title,instructions,difficulty,created_by,config) VALUES($1,'scenario','Hidden scenario','Private instructions.',3,$2,'{}') RETURNING lab_id`,
        [otherModule.module_id, otherLecturer],
      )
    ).rows[0];
    const result = await studentAgent.get('/api/v1/labs');
    expect(result.body.data.map((row) => row.lab_id)).not.toContain(
      draft.lab_id,
    );
    expect(
      (await studentAgent.get(`/api/v1/labs/${draft.lab_id}`)).status,
    ).toBe(404);
  });

  it('enforces lecturer ownership and server validation including profanity', async () => {
    expect(
      (
        await lecturerAgent.post('/api/v1/labs').send({
          moduleId: otherModule.module_id,
          kind: 'code',
          title: 'Other',
          instructions: 'x',
          difficulty: 1,
          config: {},
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await lecturerAgent.post('/api/v1/labs').send({
          moduleId: moduleRow.module_id,
          kind: 'code',
          title: 'fuck',
          instructions: 'x',
          difficulty: 1,
          config: {},
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await lecturerAgent.post('/api/v1/labs').send({
          moduleId: moduleRow.module_id,
          kind: 'code',
          title: 'Missing config',
          instructions: 'x',
          difficulty: 1,
          unknown: true,
        })
      ).status,
    ).toBe(422);
  });

  it('creates, edits and publishes a code lab only for its lecturer', async () => {
    const created = await lecturerAgent.post('/api/v1/labs').send({
      moduleId: moduleRow.module_id,
      kind: 'code',
      title: 'Button lab',
      instructions: 'Create a button.',
      difficulty: 2,
      status: 'published',
      config: {
        starterHtml: '<button>Go</button>',
        starterCss: '',
        starterJs: '',
        checks: [],
      },
    });
    expect(created.status).toBe(201);
    const edited = await lecturerAgent
      .patch(`/api/v1/labs/${created.body.lab.lab_id}`)
      .send({ status: 'published' });
    expect(edited.status).toBe(200);
    expect(edited.body.lab.status).toBe('published');
    expect(
      (
        await outsiderAgent
          .patch(`/api/v1/labs/${created.body.lab.lab_id}`)
          .send({ title: 'No' })
      ).status,
    ).toBe(403);
  });

  it('returns student-safe config without hidden expected answers or model solution', async () => {
    await pool.query(`UPDATE labs SET config=$1 WHERE lab_id=$2`, [
      {
        starterHtml: '<h1>Hi</h1>',
        starterCss: '',
        starterJs: '',
        checks: [
          {
            type: 'text_contains',
            selector: 'h1',
            expected: 'Hi',
            hint: 'Use a heading.',
          },
        ],
        modelSolution: { html: '<h1>Hi</h1>', css: '', js: '' },
        allowModelSolution: true,
      },
      lab.lab_id,
    ]);
    const result = await studentAgent.get(`/api/v1/labs/${lab.lab_id}`);
    expect(result.status).toBe(200);
    expect(JSON.stringify(result.body)).not.toContain('modelSolution');
    expect(result.body.lab.config.checks[0]).not.toHaveProperty('expected');
  });

  it('validates spreadsheet configs, hides expected values and keeps business results practice-only', async () => {
    const created = await lecturerAgent.post('/api/v1/labs').send({
      moduleId: moduleRow.module_id,
      kind: 'spreadsheet',
      title: 'Budget grid',
      instructions: 'Calculate the balance.',
      difficulty: 2,
      status: 'published',
      config: {
        startingGrid: { A1: '100', B1: '=A1*2' },
        lockedCells: ['A1'],
        checks: [
          {
            cell: 'B1',
            expected: 200,
            tolerance: 0.01,
            requiresFormula: true,
            hint: 'Use a formula.',
          },
        ],
        currencySymbol: 'R',
        formats: { B1: 'currency' },
      },
    });
    expect(created.status).toBe(201);
    const visible = await studentAgent.get(
      `/api/v1/labs/${created.body.lab.lab_id}`,
    );
    expect(visible.status).toBe(200);
    expect(visible.body.lab.config.checks[0]).not.toHaveProperty('expected');
    const saved = await studentAgent
      .put(`/api/v1/labs/${created.body.lab.lab_id}/attempt`)
      .send({
        submission: { grid: { B1: '=A1*2' } },
        checksPassed: 1,
        checksTotal: 1,
        completed: true,
      });
    expect(saved.status).toBe(200);
    expect(saved.body.selfChecked).toBe(true);
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM quiz_attempts'))
        .rows[0].count,
    ).toBeGreaterThanOrEqual(0);
  });

  it('autosaves and restores self-checked progress without affecting scored data', async () => {
    const before = await pool.query(
      'SELECT count(*)::int AS n FROM quiz_attempts',
    );
    const saved = await studentAgent
      .put(`/api/v1/labs/${lab.lab_id}/attempt`)
      .send({
        submission: { html: '<h1>Hi</h1>', css: '', js: '' },
        checksPassed: 1,
        checksTotal: 1,
        completed: true,
      });
    expect(saved.status).toBe(200);
    expect(saved.body.selfChecked).toBe(true);
    expect(
      (await studentAgent.get(`/api/v1/labs/${lab.lab_id}/attempt`)).body
        .attempt.submission.html,
    ).toContain('<h1>Hi</h1>');
    const after = await pool.query(
      'SELECT count(*)::int AS n FROM quiz_attempts',
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('rejects oversized submissions and unauthorised access', async () => {
    expect(
      (await outsiderAgent.get(`/api/v1/labs/${lab.lab_id}/attempt`)).status,
    ).toBe(404);
    const result = await studentAgent
      .put(`/api/v1/labs/${lab.lab_id}/attempt`)
      .send({
        submission: { html: 'x'.repeat(70_000) },
        checksPassed: 0,
        checksTotal: 1,
        completed: false,
      });
    expect(result.status).toBe(422);
  });

  it('returns aggregate lecturer activity only for owned modules', async () => {
    const own = await lecturerAgent.get(
      `/api/v1/modules/${moduleRow.module_id}/labs/activity`,
    );
    expect(own.status).toBe(200);
    const ownLab = own.body.data.find((row) => row.lab_id === lab.lab_id);
    expect(ownLab).toMatchObject({
      title: 'Heading practice',
      started: 1,
      completed: 1,
    });
    expect(
      (
        await lecturerAgent.get(
          `/api/v1/modules/${otherModule.module_id}/labs/activity`,
        )
      ).status,
    ).toBe(403);
    expect(JSON.stringify(own.body)).not.toMatch(/submission|html|student_id/);
  });

  it('returns spreadsheet check results without revealing expected values and refuses lecturers on student attempts', async () => {
    const created = await lecturerAgent.post('/api/v1/labs').send({
      moduleId: moduleRow.module_id,
      kind: 'spreadsheet',
      title: 'Check panel lab',
      instructions: 'Complete the total.',
      difficulty: 1,
      status: 'published',
      config: {
        startingGrid: { A1: '2' },
        lockedCells: [],
        checks: [
          {
            cell: 'A1',
            expected: 2,
            tolerance: 0.01,
            hint: 'Keep the value at two.',
          },
        ],
      },
    });
    const result = await studentAgent.get(
      `/api/v1/labs/${created.body.lab.lab_id}/attempt`,
    );
    expect(result.status).toBe(200);
    expect(result.body.checkResults[0]).toMatchObject({
      passed: false,
      hint: 'Keep the value at two.',
    });
    expect(JSON.stringify(result.body)).not.toContain('expected');
    expect(
      (
        await lecturerAgent.get(
          `/api/v1/labs/${created.body.lab.lab_id}/attempt`,
        )
      ).status,
    ).toBe(403);
  });

  it('duplicates owned labs and prevents deleting a lab after an attempt', async () => {
    const duplicate = await lecturerAgent.post(
      `/api/v1/labs/${lab.lab_id}/duplicate`,
    );
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.lab.status).toBe('draft');
    expect(
      (await lecturerAgent.delete(`/api/v1/labs/${lab.lab_id}`)).status,
    ).toBe(409);
    expect(
      (await outsiderAgent.post(`/api/v1/labs/${lab.lab_id}/duplicate`)).status,
    ).toBe(403);
  });
});
