import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('admin signup-style form validates emails and every role needs email OTP before access', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  await page.route(
    /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
    (r) => r.abort(),
  );
  expect(
    (await page.request.post('/api/v1/__test/reset-auth-state')).status(),
  ).toBe(204);
  await page.goto('/');
  await page
    .getByLabel('Email', { exact: true })
    .fill('demo-admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Users', exact: true }).click();
  for (const role of ['student', 'lecturer', 'admin']) {
    await page.getByRole('button', { name: 'Add user', exact: true }).click();
    const form = page.getByRole('form', { name: 'Add a user', exact: true });
    await form.getByLabel('First name', { exact: true }).fill('Browser');
    await form.getByLabel('Last name', { exact: true }).fill('Person');
    const password = 'VioletMountain88!';
    await form.getByLabel('Email', { exact: true }).fill('learner@gmail.con');
    await form.getByLabel('Password', { exact: true }).fill(password);
    await form
      .getByLabel('Confirm password', { exact: true })
      .fill('WrongSecret99!');
    await form
      .getByRole('combobox', { name: 'Role', exact: true })
      .selectOption(role);
    await form
      .getByRole('button', { name: 'Create user', exact: true })
      .click();
    await expect(
      page.getByText('Passwords do not match.', { exact: true }),
    ).toBeVisible();
    await form.getByLabel('Confirm password', { exact: true }).fill(password);
    await form
      .getByRole('button', { name: 'Show password', exact: true })
      .click();
    await expect(form.getByLabel('Password', { exact: true })).toHaveAttribute(
      'type',
      'text',
    );
    await form
      .getByRole('button', { name: 'Hide password', exact: true })
      .click();
    await form
      .getByRole('button', { name: 'Create user', exact: true })
      .click();
    await expect(
      page.getByText(
        'This email domain cannot receive mail. Check the spelling of your email address.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(form.getByLabel('Email', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(form.getByLabel('Year of study', { exact: true })).toHaveCount(
      role === 'student' ? 1 : 0,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const email = `admin-form-${role}-${info.project.name}-${Date.now()}@example.com`;
    await form.getByLabel('Email', { exact: true }).fill(email);
    const completed = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().endsWith('/api/v1/admin/users'),
    );
    await form
      .getByRole('button', { name: 'Create user', exact: true })
      .click();
    const response = await completed;
    expect(response.status()).toBe(201);
    const user = (await response.json()).user;
    await expect(page.getByText(/Browser Person was added/)).toBeVisible();
    await page.getByLabel('Search users').fill(email);
    await expect(
      page
        .getByRole('row')
        .filter({ hasText: email })
        .getByText('Pending email verification', { exact: true }),
    ).toBeVisible();
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:5391',
      viewport: page.viewportSize(),
    });
    await context.route(
      /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
      (r) => r.abort(),
    );
    const student = await context.newPage();
    try {
      await student.goto('/');
      await student.getByLabel('Email', { exact: true }).fill(email);
      await student.getByLabel('Password', { exact: true }).fill(password);
      await student
        .getByRole('button', { name: 'Log in', exact: true })
        .click();
      await expect(
        student.getByRole('heading', { name: 'Check your email', exact: true }),
      ).toBeVisible();
      const protectedPath =
        role === 'admin' ? '/api/v1/admin/dashboard' : '/api/v1/modules';
      const blocked = await student.request.get(protectedPath);
      expect(blocked.status()).toBe(403);
      expect((await blocked.json()).error.code).toBe('EMAIL_NOT_VERIFIED');
      const code = (
        await readFile(`docs/dev-mail/${user.user_id}.txt`, 'utf8')
      ).match(/verification code: (\d{6})/)[1];
      await student.getByLabel('Verification code', { exact: true }).fill(code);
      await student
        .getByRole('button', { name: 'Verify email', exact: true })
        .click();
      await expect(
        student.getByRole('button', { name: 'Log out', exact: true }),
      ).toBeVisible();
      expect((await student.request.get(protectedPath)).status()).toBe(200);
    } finally {
      await context.close();
    }
  }
});
