import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';

test('students can use all four real starter labs and restore saved work', async ({
  page,
}) => {
  expect(
    (await page.request.post('/api/v1/__test/reset-auth-state')).status(),
  ).toBe(204);
  expect(process.env.DATABASE_URL).toContain(':55436/eduquest_e2e');
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(
      "DELETE FROM lab_attempts WHERE student_id=(SELECT user_id FROM users WHERE email='demo-student-1@example.com') AND lab_id IN (SELECT lab_id FROM labs WHERE is_starter)",
    );
  } finally {
    await db.end();
  }
  const crashes = [];
  page.on('pageerror', (error) => crashes.push(error.message));
  await page.goto('/');
  await page
    .getByLabel('Email', { exact: true })
    .fill('demo-student-1@example.com');
  await page.getByLabel('Password', { exact: true }).fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page
    .getByRole('button', { name: 'Practice Labs', exact: true })
    .click();
  async function open(title) {
    await page
      .getByRole('textbox', { name: 'Search practice labs' })
      .fill(title);
    await page.getByRole('button', { name: 'Open lab', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
  }
  async function back() {
    await page
      .getByRole('button', { name: '← Back to Practice Labs', exact: true })
      .click();
  }
  await open('HTML essentials');
  await expect(page.getByLabel('html code')).toContainText('Add your heading');
  await page
    .getByLabel('html code')
    .fill('<h1>My saved heading</h1><p>My paragraph</p>');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('2 of 2 checks passed')).toBeVisible();
  await expect(
    page
      .frameLocator('iframe[title="Code preview"]')
      .getByRole('heading', { name: 'My saved heading' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Completed — your self-checked progress is saved.'),
  ).toBeVisible();
  await back();
  await open('HTML essentials');
  await expect(page.getByLabel('html code')).toHaveValue(
    '<h1>My saved heading</h1><p>My paragraph</p>',
  );
  await back();
  await open('Monthly budget');
  await expect(page.getByLabel('A2', { exact: true })).toHaveValue('12000');
  await page.getByLabel('C2', { exact: true }).fill('=A2-B2');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Passed', { exact: true })).toHaveCount(1);
  await back();
  await open('Monthly budget');
  await expect(page.getByLabel('C2', { exact: true })).toHaveValue('=A2-B2');
  await back();
  await open('Break-even explorer');
  await expect(page.locator('output')).toHaveText('500');
  await page.getByLabel('Fixed costs', { exact: true }).fill('20000');
  await expect(page.locator('output')).toHaveText('1000');
  await back();
  await open('Customer service decisions');
  await page
    .getByRole('button', {
      name: 'Explain the delay and offer an update',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Reflection summary', exact: true }),
  ).toBeVisible();
  // Wait for the durable save before leaving the player.
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(
              '/api/v1/labs/00000000-0000-4000-8000-000000000104/attempt',
            )
          ).json()
        ).attempt?.submission.nodeId,
    )
    .toBe('explain');
  await back();
  await open('Customer service decisions');
  await expect(
    page.getByRole('heading', { name: 'Reflection summary', exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await back();
  await page
    .getByRole('textbox', { name: 'Search practice labs' })
    .fill('no-such-lab-title');
  await expect(
    page.getByText('No labs match your search. Try a different title.'),
  ).toBeVisible();
  expect(crashes).toEqual([]);
});
