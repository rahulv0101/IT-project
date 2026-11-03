import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('student navigation stays inside its sidebar and lab errors cannot pass as completed', async ({
  page,
}, info) => {
  await page.route(
    /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
    (r) => r.abort(),
  );
  await page.setViewportSize({
    width: info.project.use.viewport.width,
    height: 500,
  });
  expect(
    (await page.request.post('/api/v1/__test/reset-auth-state')).status(),
  ).toBe(204);
  await page.goto('/');
  await page
    .getByLabel('Email', { exact: true })
    .fill('demo-student-1@example.com');
  await page.getByLabel('Password', { exact: true }).fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const sidebar = page.locator('.shell > aside');
  await expect(
    sidebar.getByRole('button', { name: 'Log out', exact: true }),
  ).toBeVisible();
  for (const name of ['Quizzes', 'Practice Labs', 'Profile', 'Log out']) {
    const button = sidebar.getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    const inside = await button.evaluate((node) => {
      const b = node.getBoundingClientRect(),
        a = node.parentElement.getBoundingClientRect();
      return b.top >= a.top && b.bottom <= a.bottom && b.height >= 44;
    });
    expect(inside).toBe(true);
  }
  await page.route(
    '**/api/v1/modules',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Modules could not be loaded.' },
        }),
      }),
    { times: 1 },
  );
  await sidebar.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Modules could not be loaded.',
  );
  await page.getByRole('button', { name: 'Retry loading modules' }).click();
  await expect(
    page.getByText('Choose a module to view quizzes.'),
  ).toBeVisible();
  await sidebar
    .getByRole('button', { name: 'Practice Labs', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Search practice labs' })
    .fill('HTML essentials');
  await page.getByRole('button', { name: 'Open lab', exact: true }).click();
  const editor = page.getByLabel('html code');
  await expect(editor).toBeVisible();
  const malformed =
    'Html code;\n<!DOCTYPE html>\n<head>\n<title>My First Webpage</title>\nhead>\n<h1>word<h1>';
  await editor.fill(malformed);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Code errors found' }),
  ).toBeVisible();
  await expect(page.getByText(/HTML line 2, column 1:/)).toBeVisible();
  await expect(page.getByText('0 of 2 checks passed')).toBeVisible();
  await page.screenshot({
    path: info.outputPath('student-lab-html-errors.png'),
    fullPage: true,
  });
  const saveRequest = page.waitForRequest(
    (r) =>
      r.method() === 'PUT' &&
      /\/labs\/[^/]+\/attempt$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  expect((await saveRequest).postDataJSON()).toMatchObject({
    completed: false,
    checksPassed: 0,
  });
  await expect(
    page.getByText('Draft saved. Checks run in your browser.'),
  ).toBeVisible();
  await editor.fill('<h1>Fixed heading</h1><p>Fixed paragraph</p>');
  await page.getByRole('tab', { name: 'JavaScript', exact: true }).click();
  for (const code of [
    'const broken = ;',
    'throw new Error("Runtime lab error");',
    'Promise.reject(new Error("Async lab error"));',
  ]) {
    await page.getByLabel('js code').fill(code);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Code errors found' }),
    ).toBeVisible();
    await expect(page.locator('.lab-console .error')).toContainText(
      'JavaScript:',
    );
    await expect(page.getByText('0 of 2 checks passed')).toBeVisible();
  }
  await page.getByLabel('js code').fill('console.log("Run succeeded");');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('2 of 2 checks passed')).toBeVisible();
  await expect(page.locator('.lab-console')).toContainText('Run succeeded');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page
      .frameLocator('iframe[title="Code preview"]')
      .getByRole('heading', { name: 'Fixed heading' }),
  ).toBeVisible();
  // Editing cannot execute partial JavaScript or retain old completion checks.
  await page.getByLabel('js code').fill('throw new Error("Not run yet");');
  await expect(page.getByText('0 of 2 checks passed')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('0 of 2 checks passed')).toBeVisible();
  await expect(page.locator('.lab-console .error')).toHaveCount(0);
  await page.route('**/api/v1/labs/*/attempt', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { message: 'Draft save failed. Try again.' },
          }),
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Draft save failed. Try again.',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
