import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/v1/__test/reset-auth-state');
  expect(response.status()).toBe(204);
});

test('study sessions: leader schedules, member RSVPs, calendars, notifications and cancellation are accessible', async ({
  page,
}) => {
  expect(process.env.DATABASE_URL).toContain(':55436/eduquest_e2e');
  const login = async (email) => {
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('EduQuestDemo123!');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  };
  const axe = async () => {
    // Cards use a short entrance transition. Audit their settled, visible state
    // rather than the deliberately transparent transition frame.
    await page.waitForTimeout(500);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  };
  await login('demo-student-1@example.com');
  const modules = await (await page.request.get('/api/v1/me/modules')).json();
  const module = modules.data.find((m) => m.module_code === 'DEMO101');
  expect(module).toBeTruthy();
  const groupName = `Session team ${Date.now()}`;
  const sessionTitle = `Query revision ${Date.now()}`;
  const created = await page.request.post('/api/v1/groups', {
    data: { moduleId: module.module_id, groupName },
  });
  expect(created.status()).toBe(201);
  const group = (await created.json()).group;
  await page.getByRole('button', { name: 'Study groups', exact: true }).click();
  const card = page.locator('.group-card').filter({ hasText: groupName });
  await card
    .getByRole('button', { name: 'Study sessions', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Plan a session', exact: true })
    .click();
  await page.getByLabel('Title', { exact: true }).fill(sessionTitle);
  await page.getByLabel('Topic', { exact: true }).fill('Relational databases');
  await page
    .getByLabel('Preparation notes', { exact: true })
    .fill('Read your notes');
  await page.getByLabel('Room or HTTPS meeting link').fill('Room A');
  await page.getByLabel('Weekly occurrences (1–12)').fill('2');
  await axe();
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().endsWith(`/groups/${group.group_id}/sessions`),
  );
  await page.getByRole('button', { name: 'Save session', exact: true }).click();
  const result = await saved;
  expect(result.status()).toBe(201);
  const sessions = (await result.json()).sessions;
  expect(sessions).toHaveLength(2);
  await expect(
    page.getByRole('button', { name: /Query revision/ }),
  ).toHaveCount(2);
  const announcement = `Bring notes ${Date.now()}`;
  const announcementResponse = await page.request.post(
    `/api/v1/groups/${group.group_id}/messages`,
    { data: { body: announcement, kind: 'announcement' } },
  );
  expect(announcementResponse.status()).toBe(201);
  await page.getByRole('button', { name: 'Month view' }).click();
  await expect(page.locator('.session-calendar')).toBeVisible();
  await axe();
  await page.getByRole('button', { name: 'Week view' }).click();
  await axe();
  await page.getByRole('button', { name: 'List view' }).click();
  await page
    .getByRole('button', { name: /Query revision/ })
    .first()
    .click();
  const details = page.getByRole('region', { name: 'Session details' });
  await expect(
    details.getByText('Read your notes', { exact: false }),
  ).toBeVisible();
  await details.getByRole('button', { name: 'Going', exact: true }).click();
  await expect(details.getByText('going: 1', { exact: false })).toBeVisible();
  const ics = await page.request.get(
    `/api/v1/groups/${group.group_id}/sessions/calendar.ics`,
  );
  expect(ics.status()).toBe(200);
  expect(await ics.text()).toContain('BEGIN:VCALENDAR');
  await page.getByLabel('Cancellation reason').fill('Room unavailable');
  await page
    .getByRole('button', { name: 'Cancel session', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Session details' })
      .getByText('Cancelled: Room unavailable', { exact: true }),
  ).toBeVisible();
  await axe();
  await page.reload();
  await page.getByRole('button', { name: /Notifications:/ }).click();
  await expect(
    page
      .getByRole('region', { name: 'Notifications' })
      .getByText(`${sessionTitle} · cancelled`, { exact: true }),
  ).toBeVisible();
  await axe();
  await page
    .getByText(`${sessionTitle} · cancelled`, { exact: true })
    .locator('..')
    .getByRole('button', { name: 'Open session', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Session details' })
      .getByText('Cancelled: Room unavailable', { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('region', { name: 'Session details' }),
  ).toHaveCount(0);
  await page.goForward();
  await expect(
    page
      .getByRole('region', { name: 'Session details' })
      .getByText('Cancelled: Room unavailable', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await login('demo-student-2@example.com');
  await page.getByRole('button', { name: 'Study groups', exact: true }).click();
  const memberCard = page.locator('.group-card').filter({ hasText: groupName });
  await memberCard
    .getByRole('button', { name: 'Join group', exact: true })
    .click();
  await memberCard
    .getByRole('button', { name: 'Group chat', exact: true })
    .click();
  await expect(page.getByText(announcement, { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await axe();
  expect(
    (
      await page.request.post(`/api/v1/groups/${group.group_id}/sessions`, {
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get(
        `/api/v1/groups/${group.group_id}/sessions/${sessions[0].session_id}`,
      )
    ).status(),
  ).toBe(200);
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > window.innerWidth + 1,
      )
      .map((element) => `${element.tagName}.${element.className}`)
      .slice(0, 12),
  );
  expect(overflowing).toEqual([]);
});
