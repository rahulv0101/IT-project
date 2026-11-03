import { test, expect } from '@playwright/test';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
import { unlink } from 'node:fs/promises';

async function login(page, email) {
  await page.route(
    /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
    (route) => route.abort(),
  );
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Log out', exact: true }),
  ).toBeVisible();
}
test('lecturer selects a document year and only matching enrolled students can list and open it', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  expect(process.env.DATABASE_URL).toContain(':55436/eduquest_e2e');
  expect(
    (await page.request.post('/api/v1/__test/reset-auth-state')).status(),
  ).toBe(204);
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    query_timeout: 10000,
  });
  await db.connect();
  let resource;
  const contexts = [];
  try {
    await db.query(
      "UPDATE users SET student_year=2 WHERE email='demo-student-2@example.com'",
    );
    await login(page, 'demo-lecturer@example.com');
    const module = (
      await (await page.request.get('/api/v1/me/modules')).json()
    ).data.find((m) => m.module_code === 'DEMO101');
    expect(module).toBeTruthy();
    await page.getByRole('button', { name: 'Resources', exact: true }).click();
    const form = page.getByRole('form', { name: 'Upload resource' });
    await form
      .getByRole('combobox', { name: 'Module', exact: true })
      .selectOption(module.module_id);
    await expect(
      form.getByRole('combobox', { name: 'Student year', exact: true }),
    ).toHaveValue('1');
    await form
      .getByRole('combobox', { name: 'Student year', exact: true })
      .selectOption('2');
    const title = `Year audience ${info.project.name} ${Date.now()}`;
    const text = 'Revision material for Year 2.';
    await form.getByLabel('Title', { exact: true }).fill(title);
    await form.getByLabel('File', { exact: true }).setInputFiles({
      name: 'revision.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(text),
    });
    const completed = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().includes(`/modules/${module.module_id}/resources`),
    );
    await form.getByRole('button', { name: 'Upload', exact: true }).click();
    const response = await completed;
    expect(response.status()).toBe(201);
    resource = (await response.json()).resource;
    expect(resource.target_year).toBe(2);
    await expect(
      page.getByText('Document uploaded for Year 2 students in this module.'),
    ).toBeVisible();
    await expect(
      page.locator('.resource-generation').filter({ hasText: title }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const [email, allowed] of [
      ['demo-student-1@example.com', false],
      ['demo-student-2@example.com', true],
    ]) {
      const context = await browser.newContext({
        baseURL: 'http://127.0.0.1:5391',
        viewport: page.viewportSize(),
      });
      contexts.push(context);
      const student = await context.newPage();
      student.setDefaultTimeout(10000);
      await login(student, email);
      await student
        .getByRole('button', { name: 'Resources', exact: true })
        .click();
      await student.getByLabel('Jump to module').selectOption(module.module_id);
      await student.getByLabel('Search resource titles').fill(title);
      if (allowed) {
        await expect(student.getByText(title, { exact: true })).toBeVisible();
        const file = await student.request.get(
          `/api/v1/resources/${resource.resource_id}/file`,
        );
        expect(file.status()).toBe(200);
        expect(await file.text()).toBe(text);
        await expect(
          student.getByRole('link', { name: 'Open resource', exact: true }),
        ).toHaveAttribute(
          'href',
          `/api/v1/resources/${resource.resource_id}/file`,
        );
      } else {
        await expect(
          student.getByText('No resources are visible for this module.', {
            exact: true,
          }),
        ).toBeVisible();
        await expect(student.getByText(title, { exact: true })).toHaveCount(0);
        expect(
          (
            await student.request.get(
              `/api/v1/resources/${resource.resource_id}/file`,
            )
          ).status(),
        ).toBe(404);
      }
      expect(
        await student.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    for (const context of contexts) await context.close();
    await db.query(
      "UPDATE users SET student_year=1 WHERE email='demo-student-2@example.com'",
    );
    if (resource) {
      await db.query('DELETE FROM resources WHERE resource_id=$1', [
        resource.resource_id,
      ]);
      await unlink(resource.file_location).catch(() => {});
    }
    await db.end();
  }
});
