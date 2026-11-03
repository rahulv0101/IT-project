import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page, email) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Log out', exact: true }),
  ).toBeVisible();
}

test('saved lecturer join codes remain visible after reload and signing in again', async ({
  page,
  context,
  browserName,
}, info) => {
  expect(
    (await page.request.post('/api/v1/__test/reset-auth-state')).status(),
  ).toBe(204);
  const crashes = [];
  page.on('pageerror', (error) => crashes.push(error.message));
  await login(page, 'demo-lecturer@example.com');
  const response = await page.request.get('/api/v1/me/modules');
  expect(response.status()).toBe(200);
  const module = (await response.json()).data.find(
    (item) => item.module_code === 'DEMO101',
  );
  expect(module.join_code).toBeTruthy();
  await page.getByRole('button', { name: 'Modules', exact: true }).click();
  const input = page.getByRole('textbox', {
    name: `Join code for ${module.module_name}`,
    exact: true,
  });
  await expect(input).toHaveValue(module.join_code);
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page
      .getByRole('button', {
        name: `Copy join code for ${module.module_name}`,
        exact: true,
      })
      .click();
    await expect(page.getByRole('status')).toHaveText(
      `Join code for ${module.module_name} copied.`,
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      module.join_code,
    );
  }
  await page.reload();
  await expect(input).toHaveValue(module.join_code);
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await page.getByRole('button', { name: 'Modules', exact: true }).click();
  await expect(input).toHaveValue(module.join_code);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('saved-module-join-code.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back', exact: true }),
  ).toBeVisible();
  await login(page, 'demo-lecturer@example.com');
  await page.getByRole('button', { name: 'Modules', exact: true }).click();
  await expect(input).toHaveValue(module.join_code);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back', exact: true }),
  ).toBeVisible();
  await login(page, 'demo-student-1@example.com');
  await page.getByRole('button', { name: 'Modules', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Database Systems', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.module-join-code')).toHaveCount(0);
  expect(crashes).toEqual([]);
});
