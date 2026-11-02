import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { totpAt } from '../../backend/src/mfa.js';

test.beforeEach(async ({ page }) => {
  expect(
    (await page.request.post('/api/v1/__test/reset-auth-state')).status(),
  ).toBe(204);
});

async function login(page, email) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Log out', exact: true }),
  ).toBeVisible();
}

test('registration matches the branch and verifies a six-digit email code', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `sweep-${info.project.name}-${Date.now()}@example.com`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('First name', { exact: true }).fill('Sam');
  await expect(page.getByLabel('Last name', { exact: true })).toHaveAttribute(
    'required',
    '',
  );
  await page.getByLabel('Last name', { exact: true }).fill('Example');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('CorrectHorse9!');
  await page
    .getByRole('button', { name: 'Show password', exact: true })
    .click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  await page
    .getByRole('button', { name: 'Hide password', exact: true })
    .click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
  await page
    .getByLabel('Confirm password', { exact: true })
    .fill('DifferentPassword9!');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(
    page.getByText('Passwords do not match.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Confirm password')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath('registration-validation.png'),
    fullPage: true,
  });
  await page.getByLabel('Confirm password').fill('CorrectHorse9!');
  const registered = page.waitForResponse((response) =>
    response.url().endsWith('/auth/register'),
  );
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  const response = await registered;
  expect(response.status()).toBe(201);
  const { user } = await response.json();
  expect(user.last_name).toBe('Example');
  await expect(
    page.getByRole('heading', { name: 'Check your email', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Check your email', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Resend code', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Wait a minute');
  const mail = await readFile(`docs/dev-mail/${user.user_id}.txt`, 'utf8');
  const code = mail.match(/verification code: (\d{6})/)[1];
  await page
    .getByLabel('Verification code', { exact: true })
    .fill(code === '000000' ? '000001' : '000000');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('invalid');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath('email-code-screen.png'),
    fullPage: true,
  });
  await page.getByLabel('Verification code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('First name', { exact: true }).fill('Sam');
  await expect(page.getByLabel('Last name', { exact: true })).toHaveAttribute(
    'required',
    '',
  );
  await page.getByLabel('Last name', { exact: true }).fill('Example');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('CorrectHorse9!');
  await page.getByLabel('Confirm password').fill('CorrectHorse9!');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await expect(page.getByLabel('First name', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'false',
  );
  expect(errors).toEqual([]);
});

test('MFA enrolment, confirmation, recovery login and disable work end to end', async ({
  page,
}, info) => {
  const email = `mfa-sweep-${info.project.name}-${Date.now()}@example.com`;
  const response = await page.request.post('/api/v1/auth/register', {
    data: {
      email,
      password: 'CorrectHorse9!',
      confirmPassword: 'CorrectHorse9!',
      firstName: 'Sam',
      studentType: 'it',
    },
  });
  expect(response.status()).toBe(201);
  const { user } = await response.json();
  const mail = await readFile(`docs/dev-mail/${user.user_id}.txt`, 'utf8');
  const token = new URL(mail.match(/https?:\/\/\S+/)[0]).searchParams.get(
    'token',
  );
  expect(
    (
      await page.request.get(`/api/v1/auth/verify-email?token=${token}`)
    ).status(),
  ).toBe(200);
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Enrol MFA' }).click();
  const key = await page.locator('.profile-stack code').textContent();
  await page
    .getByLabel('Setup authenticator code')
    .fill(totpAt(key, Date.now()));
  await page.getByRole('button', { name: 'Confirm MFA' }).click();
  await expect(
    page.getByText('MFA is enabled.', { exact: true }),
  ).toBeVisible();
  const codes = (await page.getByText(/^Recovery codes:/).textContent())
    .split(':')[1]
    .trim()
    .split(', ');
  expect(codes).toHaveLength(10);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('CorrectHorse9!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Verify your sign-in' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Use recovery code', exact: true })
    .click();
  await page.getByLabel('Recovery code', { exact: true }).fill(codes[0]);
  await page
    .getByRole('button', { name: 'Verify sign-in', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Log out', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByLabel('MFA password').fill('CorrectHorse9!');
  await page.getByLabel('Authenticator or recovery code').fill(codes[1]);
  await page.getByRole('button', { name: 'Disable MFA' }).click();
  await expect(
    page.getByText('MFA is not enabled.', { exact: true }),
  ).toBeVisible();
});

for (const [role, email] of [
  ['student', 'demo-student-1@example.com'],
  ['lecturer', 'demo-lecturer@example.com'],
  ['admin', 'demo-admin@example.com'],
]) {
  test(`${role}: every navigation page renders without crashes, errors or overflow`, async ({
    page,
  }, info) => {
    const crashes = [];
    page.on('pageerror', (error) => crashes.push(error.message));
    await login(page, email);
    const destinations = await page
      .locator('aside button.nav:not(.logout)')
      .allTextContents();
    for (const name of destinations) {
      await page
        .locator('aside')
        .getByRole('button', { name, exact: true })
        .click();
      await expect(page.locator('main h1')).toHaveText(name);
      await expect(
        page.getByText(/Loading (your profile|administration data|data)/),
      ).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect(
        (await new AxeBuilder({ page }).analyze()).violations,
        `${role}/${name}`,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${role}/${name} overflow`,
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`${role}-${name.replaceAll(' ', '-')}.png`),
        fullPage: true,
      });
    }
    if (role === 'admin') {
      await page
        .locator('aside')
        .getByRole('button', { name: 'Admin', exact: true })
        .click();
      for (const tab of [
        'Overview',
        'Users',
        'Modules',
        'Moderation',
        'System',
        'Audit',
      ]) {
        await page
          .getByRole('navigation', { name: 'Administration sections' })
          .getByRole('button', { name: tab, exact: true })
          .click();
        await expect(
          page.getByText('Loading administration data…'),
        ).toHaveCount(0);
        await expect(page.getByRole('alert')).toHaveCount(0);
        expect(
          (await new AxeBuilder({ page }).analyze()).violations,
          `admin/${tab}`,
        ).toEqual([]);
      }
    }
    expect(crashes).toEqual([]);
  });
}
