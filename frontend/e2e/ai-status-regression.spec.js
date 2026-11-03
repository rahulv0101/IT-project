import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('a temporary AI status failure stays retryable and does not lock generation', async ({
  page,
}) => {
  let healthChecks = 0,
    generationRequests = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = { data: [] };
    if (path.endsWith('/auth/me'))
      body = {
        user: {
          userId: 'lecturer-qa',
          role: 'lecturer',
          full_name: 'Lecturer',
        },
      };
    else if (
      path.endsWith('/me/modules') ||
      path.endsWith('/me/resources/tiles')
    )
      body = {
        data: [
          {
            module_id: 'module-qa',
            module_code: 'AI101',
            module_name: 'AI recovery',
            resources_count: 1,
          },
        ],
      };
    else if (path.endsWith('/resources'))
      body = {
        data: [
          {
            resource_id: 'resource-qa',
            title: 'Study Guide',
            resource_type: 'pdf',
            module_id: 'module-qa',
          },
        ],
      };
    else if (path.endsWith('/ai-status'))
      body = { configured: true, reachable: ++healthChecks > 1 };
    else if (path.endsWith('/generation-jobs')) {
      generationRequests++;
      body = {
        job: { job_id: 'job-qa', status: 'succeeded', quiz_id: 'quiz-qa' },
      };
    }
    await route.fulfill({
      status: path.endsWith('/generation-jobs') ? 202 : 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/#/resources');
  await page.getByLabel('Jump to module').selectOption('module-qa');
  await expect(page.getByText('AI status: unavailable')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Generate quiz', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', {
      name: 'Check AI status for Study Guide',
      exact: true,
    })
    .click();
  await expect(page.getByText('AI status: ready')).toBeVisible();
  await expect(page.getByText(/The AI service did not respond/)).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Generate quiz', exact: true })
    .click();
  await expect.poll(() => generationRequests).toBe(1);
});
