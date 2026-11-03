// @ts-nocheck
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { get } from '@vercel/blob';
vi.mock('@vercel/blob', () => ({ get: vi.fn(), put: vi.fn(), del: vi.fn() }));

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

describe('student module and resource catalogue API', () => {
  let lecturer;
  let otherLecturer;
  let firstYear;
  let _secondYear;
  let ownModule;
  let otherModule;
  let lecturerAgent;
  let otherLecturerAgent;
  let firstYearAgent;
  let secondYearAgent;
  let tempDirectory;
  let resourceId;
  let groupResourceId;

  beforeAll(async () => {
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'eduquest-resource-'));
    const pdfPath = path.join(tempDirectory, 'student-notes.pdf');
    await writeFile(
      pdfPath,
      Buffer.from('%PDF-1.4\nEduQuest student notes\n%%EOF'),
    );
    const hash = await bcrypt.hash('CataloguePassword9!', 12);
    const users = await Promise.all([
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_year)
         VALUES('catalogue-lecturer@example.com',$1,'lecturer','Catalogue Lecturer','Catalogue',NULL) RETURNING user_id`,
        [hash],
      ),
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,student_year,email_verified_at)
         VALUES('catalogue-first@example.com',$1,'student','First Student','First','it',1,now()) RETURNING user_id`,
        [hash],
      ),
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_type,student_year,email_verified_at)
         VALUES('catalogue-second@example.com',$1,'student','Second Student','Second','it',2,now()) RETURNING user_id`,
        [hash],
      ),
      pool.query(
        `INSERT INTO users(email,password_hash,role,full_name,first_name,student_year)
         VALUES('catalogue-other-lecturer@example.com',$1,'lecturer','Other Lecturer','Other',NULL) RETURNING user_id`,
        [hash],
      ),
    ]);
    lecturer = users[0].rows[0].user_id;
    firstYear = users[1].rows[0].user_id;
    _secondYear = users[2].rows[0].user_id;
    otherLecturer = users[3].rows[0].user_id;
    ownModule = (
      await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,description,year,programme,offering,join_code)
         VALUES($1,'CAT101','Catalogue Foundations','First-year foundations.',1,'it','Semester 1','CATJOIN10101') RETURNING *`,
        [lecturer],
      )
    ).rows[0];
    otherModule = (
      await pool.query(
        `INSERT INTO modules(lecturer_id,module_code,module_name,description,year,programme,offering,join_code)
         VALUES($1,'CAT201','Catalogue Networks','Second-year networking.',2,'it','Semester 2','CATJOIN20101') RETURNING *`,
        [otherLecturer],
      )
    ).rows[0];
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [firstYear, ownModule.module_id],
    );
    await pool.query(
      `INSERT INTO topics(module_id,name) VALUES($1,'Networking')`,
      [otherModule.module_id],
    );
    resourceId = (
      await pool.query(
        `INSERT INTO resources(uploaded_by,module_id,title,resource_type,file_location,file_size_bytes)
       VALUES($1,$2,'First resource','pdf',$3,36) RETURNING resource_id`,
        [lecturer, ownModule.module_id, pdfPath],
      )
    ).rows[0].resource_id;
    const group = (
      await pool.query(
        `INSERT INTO study_groups(module_id,created_by,group_name)
         VALUES($1,$2,'Restricted Catalogue Group') RETURNING group_id`,
        [ownModule.module_id, lecturer],
      )
    ).rows[0];
    groupResourceId = (
      await pool.query(
        `INSERT INTO resources(uploaded_by,module_id,group_id,title,resource_type,file_location,file_size_bytes)
         VALUES($1,$2,$3,'Group-only resource','pdf',$4,36) RETURNING resource_id`,
        [lecturer, ownModule.module_id, group.group_id, pdfPath],
      )
    ).rows[0].resource_id;
    await pool.query(
      `INSERT INTO quizzes(module_id,created_by,title,status) VALUES($1,$2,'Published CAT Quiz','published')`,
      [ownModule.module_id, lecturer],
    );
    lecturerAgent = request.agent(app);
    otherLecturerAgent = request.agent(app);
    firstYearAgent = request.agent(app);
    secondYearAgent = request.agent(app);
    await lecturerAgent.post('/api/v1/auth/login').send({
      email: 'catalogue-lecturer@example.com',
      password: 'CataloguePassword9!',
    });
    await otherLecturerAgent.post('/api/v1/auth/login').send({
      email: 'catalogue-other-lecturer@example.com',
      password: 'CataloguePassword9!',
    });
    await firstYearAgent.post('/api/v1/auth/login').send({
      email: 'catalogue-first@example.com',
      password: 'CataloguePassword9!',
    });
    await secondYearAgent.post('/api/v1/auth/login').send({
      email: 'catalogue-second@example.com',
      password: 'CataloguePassword9!',
    });
  });

  it('rejects missing and oversized upload titles without hanging or saving a resource', async () => {
    const before = (
      await pool.query('SELECT count(*)::int AS total FROM resources')
    ).rows[0].total;
    for (const title of ['', 'x'.repeat(201)]) {
      const result = await lecturerAgent
        .post(`/api/v1/modules/${ownModule.module_id}/resources`)
        .field('title', title)
        .attach('file', Buffer.from('%PDF-1.4\nNotes\n%%EOF'), 'notes.pdf')
        .timeout({ deadline: 5000 });
      expect(result.status).toBe(422);
    }
    expect(
      (await pool.query('SELECT count(*)::int AS total FROM resources')).rows[0]
        .total,
    ).toBe(before);
  });

  it('rejects unsupported document generation before queueing a paid job', async () => {
    const resource = await pool.query(
      `INSERT INTO resources(uploaded_by,module_id,title,resource_type,file_location,file_size_bytes)
      VALUES($1,$2,'Office document','docx','not-read.docx',10) RETURNING resource_id`,
      [lecturer, ownModule.module_id],
    );
    const result = await lecturerAgent
      .post(`/api/v1/resources/${resource.rows[0].resource_id}/generation-jobs`)
      .send({ questionCount: 5, quizMode: 'practice' });
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('DOCUMENT_TYPE_NOT_SUPPORTED');
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS total FROM ai_generation_jobs WHERE resource_id=$1',
          [resource.rows[0].resource_id],
        )
      ).rows[0].total,
    ).toBe(0);
    await pool.query('DELETE FROM resources WHERE resource_id=$1', [
      resource.rows[0].resource_id,
    ]);
  });

  afterAll(async () => {
    await pool.query(
      'DELETE FROM resources WHERE module_id = ANY($1::uuid[])',
      [[ownModule.module_id, otherModule.module_id]],
    );
    await pool.query('DELETE FROM quizzes WHERE module_id = ANY($1::uuid[])', [
      [ownModule.module_id, otherModule.module_id],
    ]);
    await pool.query('DELETE FROM topics WHERE module_id = ANY($1::uuid[])', [
      [ownModule.module_id, otherModule.module_id],
    ]);
    await pool.query(
      'DELETE FROM study_groups WHERE module_id = ANY($1::uuid[])',
      [[ownModule.module_id, otherModule.module_id]],
    );
    await pool.query(
      'DELETE FROM enrollments WHERE module_id = ANY($1::uuid[])',
      [[ownModule.module_id, otherModule.module_id]],
    );
    await pool.query('DELETE FROM modules WHERE module_id = ANY($1::uuid[])', [
      [ownModule.module_id, otherModule.module_id],
    ]);
    await pool.query(
      `DELETE FROM users WHERE email LIKE 'catalogue-%@example.com'`,
    );
    await rm(tempDirectory, { recursive: true, force: true });
  });

  it('returns saved join codes to the owning lecturer on every catalogue load', async () => {
    for (const query of [{}, { search: 'Foundations', sort: 'name' }]) {
      const result = await lecturerAgent.get('/api/v1/me/modules').query(query);
      expect(result.status).toBe(200);
      expect(result.body.data).toHaveLength(1);
      expect(result.body.data[0]).toMatchObject({
        module_id: ownModule.module_id,
        join_code: ownModule.join_code,
      });
    }
    const other = await otherLecturerAgent.get('/api/v1/me/modules');
    expect(other.status).toBe(200);
    expect(
      other.body.data.some((m) => m.module_id === ownModule.module_id),
    ).toBe(false);
    expect(JSON.stringify(other.body)).not.toContain(ownModule.join_code);
    const student = await firstYearAgent.get('/api/v1/me/modules');
    expect(student.status).toBe(200);
    expect(student.body.data[0]).not.toHaveProperty('join_code');
  });
  it('returns all enrolled module cards with counts and lecturer details immediately', async () => {
    const result = await firstYearAgent.get('/api/v1/me/modules');
    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0]).toMatchObject({
      module_code: 'CAT101',
      module_name: 'Catalogue Foundations',
      lecturer_name: 'Catalogue Lecturer',
      quizzes_available: 1,
      new_resources_count: 1,
    });
  });

  it('shows first-year look-ahead previews without enrolment data or answer-bearing data', async () => {
    const first = await firstYearAgent.get('/api/v1/me/modules/lookahead');
    expect(first.status).toBe(200);
    expect(first.body.preview).toBe(true);
    expect(first.body.data.every((module) => module.year === 2)).toBe(true);
    const serialised = JSON.stringify(first.body);
    expect(serialised).not.toContain('resources');
    expect(serialised).not.toContain('quizzes');
    expect(serialised).not.toContain('answers');

    const second = await secondYearAgent.get('/api/v1/me/modules/lookahead');
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual([]);
    expect(second.body.preview).toBe(false);
  });

  it('returns resource tiles only for enrolled student modules and lecturer-owned modules', async () => {
    const studentTiles = await firstYearAgent.get('/api/v1/resources/modules');
    expect(studentTiles.status).toBe(200);
    expect(studentTiles.body.data.map((module) => module.module_code)).toEqual([
      'CAT101',
    ]);
    expect(studentTiles.body.data[0]).toMatchObject({
      resource_count: 1,
    });

    const lecturerTiles = await lecturerAgent.get('/api/v1/resources/modules');
    expect(lecturerTiles.status).toBe(200);
    expect(lecturerTiles.body.data.map((module) => module.module_code)).toEqual(
      ['CAT101'],
    );
    expect(
      (
        await firstYearAgent.get(
          `/api/v1/modules/${otherModule.module_id}/resources`,
        )
      ).status,
    ).toBe(403);
  });

  it('serves an enrolled student PDF inline without exposing its storage path', async () => {
    const listing = await firstYearAgent.get(
      `/api/v1/modules/${ownModule.module_id}/resources`,
    );
    expect(listing.status).toBe(200);
    expect(JSON.stringify(listing.body)).not.toContain(tempDirectory);
    expect(listing.body.data[0]).not.toHaveProperty('file_location');

    const opened = await firstYearAgent.get(
      `/api/v1/resources/${resourceId}/file`,
    );
    expect(opened.status).toBe(200);
    expect(opened.headers['content-type']).toContain('application/pdf');
    expect(opened.headers['content-disposition']).toContain('inline');
    expect(opened.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(opened.body).toString()).toContain('%PDF-1.4');
  });

  it('refuses unenrolled, wrong-owner and group-ineligible resource access', async () => {
    expect(
      (await secondYearAgent.get(`/api/v1/resources/${resourceId}/file`))
        .status,
    ).toBe(404);
    expect(
      (await otherLecturerAgent.get(`/api/v1/resources/${resourceId}/file`))
        .status,
    ).toBe(404);
    expect(
      (await firstYearAgent.get(`/api/v1/resources/${groupResourceId}/file`))
        .status,
    ).toBe(404);
    expect(
      (await lecturerAgent.get(`/api/v1/resources/${groupResourceId}/file`))
        .status,
    ).toBe(200);
  });

  it('validates resource file identifiers and requires a session', async () => {
    expect(
      (await request(app).get(`/api/v1/resources/${resourceId}/file`)).status,
    ).toBe(401);
    const invalid = await firstYearAgent.get(
      '/api/v1/resources/not-a-uuid/file',
    );
    expect(invalid.status).toBe(422);
    expect(invalid.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects unauthenticated and invalid catalogue requests with the standard shape', async () => {
    expect((await request(app).get('/api/v1/me/modules')).status).toBe(401);
    const invalid = await firstYearAgent.get('/api/v1/me/modules?unknown=true');
    expect(invalid.status).toBe(422);
    expect(invalid.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('checks access before fetching private cloud bytes and survives a different function filesystem', async () => {
    vi.stubEnv('BLOB_STORE_ID', 'store_test');
    const bytes = Buffer.from('%PDF-1.4\nPrivate cloud notes\n%%EOF');
    get.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    });
    try {
      const denied = await secondYearAgent.get(
        `/api/v1/resources/${resourceId}/file`,
      );
      expect(denied.status).toBe(404);
      expect(get).not.toHaveBeenCalled();
      const allowed = await firstYearAgent.get(
        `/api/v1/resources/${resourceId}/file`,
      );
      expect(allowed.status).toBe(200);
      expect(Buffer.from(allowed.body)).toEqual(bytes);
      expect(allowed.headers['content-type']).toContain('application/pdf');
      expect(get).toHaveBeenCalledWith('uploads/student-notes.pdf', {
        access: 'private',
        useCache: false,
      });
    } finally {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    }
  });
});
