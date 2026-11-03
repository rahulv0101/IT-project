import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const password = 'EduQuestDemo123!';
async function login(page, email) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Log out', exact: true }),
  ).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  expect(
    (await page.request.post('/api/v1/__test/reset-auth-state')).status(),
  ).toBe(204);
});
test('admin adds and deletes a student through Users', async ({
  page,
}, info) => {
  await login(page, 'demo-admin@example.com');
  await page.getByRole('button', { name: 'Users', exact: true }).click();
  await page.getByRole('button', { name: 'Add user', exact: true }).click();
  const email = `browser-managed-${info.project.name}-${Date.now()}@example.com`;
  await page.getByLabel('First name', { exact: true }).fill('Browser');
  await page.getByLabel('Last name', { exact: true }).fill('Student');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Temporary password').fill('TemporarySecure99!');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Browser account validation');
  await page.getByRole('button', { name: 'Create user', exact: true }).click();
  await expect(page.getByText(/Browser Student was added/)).toBeVisible();
  await page.getByLabel('Search users').fill(email);
  await page
    .getByRole('button', { name: 'Delete Browser Student', exact: true })
    .click();
  await page.getByLabel('Confirm email').fill(email);
  await page.getByLabel('Deletion reason').fill('Browser test cleanup');
  await page.getByRole('button', { name: 'Delete user', exact: true }).click();
  await expect(page.getByText(/User deleted. Access/)).toBeVisible();
  await expect(page.getByText('No users match your search.')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('students exchange private messages and invite another student to a study group', async ({
  page,
  browser,
}, info) => {
  await login(page, 'demo-student-1@example.com');
  const second = await browser.newContext({
    baseURL: 'http://127.0.0.1:5391',
    viewport: page.viewportSize(),
  });
  const peer = await second.newPage();
  try {
    await login(peer, 'demo-student-2@example.com');
    const me1 = await (await page.request.get('/api/v1/auth/me')).json();
    const me2 = await (await peer.request.get('/api/v1/auth/me')).json();
    const modules = await (await page.request.get('/api/v1/me/modules')).json();
    const module = modules.data.find((m) => m.module_code === 'DEMO101');
    expect(module).toBeTruthy();
    await page.getByRole('button', { name: 'Messages', exact: true }).click();
    await page.getByLabel('Search students').fill(me2.user.fullName);
    await page
      .getByRole('button', {
        name: `Message ${me2.user.fullName}`,
        exact: true,
      })
      .click();
    const text = `Study message ${info.project.name} ${Date.now()}`;
    await page.getByLabel('Message', { exact: true }).fill(text);
    await page
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await peer.getByRole('button', { name: 'Messages', exact: true }).click();
    await peer
      .getByRole('button', { name: new RegExp(me1.user.fullName) })
      .first()
      .click();
    await expect(peer.getByText(text, { exact: true })).toBeVisible();
    const reply = `Reply ${Date.now()}`;
    await peer.getByLabel('Message', { exact: true }).fill(reply);
    await peer
      .getByRole('button', { name: 'Send message', exact: true })
      .click();
    await expect(page.getByText(reply, { exact: true })).toBeVisible({
      timeout: 10000,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath('student-direct-messages.png'),
      fullPage: true,
    });
    const groupName = `Browser revision ${info.project.name} ${Date.now()}`;
    const created = await page.request.post(
      `/api/v1/modules/${module.module_id}/groups`,
      { data: { groupName } },
    );
    expect(created.status()).toBe(201);
    const { group } = await created.json();
    await page
      .getByRole('button', { name: 'Study groups', exact: true })
      .click();
    await page.getByLabel('Search groups').fill(groupName);
    const card = page.locator('.group-card').filter({
      has: page.getByRole('heading', { name: groupName, exact: true }),
    });
    await card
      .getByRole('button', { name: 'Invite a student', exact: true })
      .click();
    await card.getByLabel('Find a student').fill(me2.user.fullName);
    await expect(
      card.getByRole('option', { name: me2.user.fullName, exact: true }),
    ).toHaveCount(1);
    await card
      .getByRole('combobox', { name: 'Student', exact: true })
      .selectOption(me2.user.userId);
    await card
      .getByRole('button', { name: 'Send group invitation', exact: true })
      .click();
    await expect(card.getByText(/Invitation sent/)).toBeVisible();
    await peer
      .getByRole('button', { name: 'Study groups', exact: true })
      .click();
    const invitation = peer
      .locator('.invitation-row')
      .filter({ has: peer.getByText(groupName, { exact: true }) });
    await invitation.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(
      peer.getByText(`You joined ${groupName}.`, { exact: true }),
    ).toBeVisible();
    const members = await peer.request.get(
      `/api/v1/groups/${group.group_id}/members`,
    );
    expect(members.status()).toBe(200);
    expect((await members.json()).data.map((x) => x.user_id)).toContain(
      me2.user.userId,
    );
    await page.screenshot({
      path: info.outputPath('study-group-invitations.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await page.goBack();
    await expect(page.locator('main h1')).toHaveText('Study groups');
    await page.reload();
    await expect(page.locator('main h1')).toHaveText('Study groups');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await second.close();
  }
});
test('lecturer reviews questions and answers without student play actions', async ({
  page,
}) => {
  await login(page, 'demo-lecturer@example.com');
  await expect(
    page.locator('aside').getByRole('button', { name: 'Games', exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator('aside')
      .getByRole('button', { name: 'Practice Labs', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page
    .getByLabel('Module', { exact: true })
    .selectOption({ label: 'Database Systems' });
  const review = page
    .getByRole('button', { name: 'View questions and answers', exact: true })
    .first();
  await review.click();
  await expect(
    page.getByText('QUESTIONS AND ANSWERS', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Correct answer/).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Take quiz|Play Infected|Open quiz/ }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText('QUESTIONS AND ANSWERS', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Back to quizzes', exact: true })
    .click();
  await expect(page.locator('main h1')).toHaveText('Quizzes');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('PWA serves install metadata, excludes private caches and handles offline navigation', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const manifest = await (
    await page.request.get('/manifest.webmanifest')
  ).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i) => i.sizes)).toContain('512x512');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  for (const icon of manifest.icons)
    expect((await page.request.get(icon.src)).status()).toBe(200);
  await page.evaluate(() =>
    fetch('/api/v1/auth/me', { credentials: 'include' }),
  );
  const paths = await page.evaluate(async () => {
    const all = await Promise.all(
      (await caches.keys()).map(async (key) =>
        (await (await caches.open(key)).keys()).map(
          (r) => new URL(r.url).pathname,
        ),
      ),
    );
    return all.flat();
  });
  expect(paths.some((p) => p.startsWith('/api/') || p === '/')).toBe(false);
  expect(paths).toContain('/offline.html');
  await context.setOffline(true);
  await expect(page.getByText(/You’re offline. Reconnect/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'You’re offline' }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();
});
