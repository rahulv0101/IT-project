import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/v1/__test/reset-auth-state');
  expect(response.status()).toBe(204);
});

test('browser suite uses an isolated database, never the dev database', () => {
  expect(process.env.DATABASE_URL).not.toContain(':5432/eduquest');
  expect(process.env.DATABASE_URL).toContain(':55436/eduquest_e2e');
});

test('seeded lecturer logs in, generates a quiz and publishes it', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('demo-lecturer@example.com');
  await page.getByLabel('Password').fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  const selector = page.locator('article > select');
  await expect(selector.locator('option')).not.toHaveCount(1);
  await selector.selectOption({ label: 'Database Systems' });
  const resource = page.locator('.resource-generation').first();
  await resource.getByLabel('Questions').fill('3');
  await resource.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(resource.getByText('Generated draft')).toBeVisible({
    timeout: 20000,
  });
  await expect(
    resource.getByText(/Long resources are sampled across the document/),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await resource
    .getByLabel('Quiz title', { exact: true })
    .fill(`Browser smoke ${test.info().project.name}`);
  const published = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/api/v1/quizzes/'),
  );
  await resource.getByRole('button', { name: 'Publish quiz' }).click();
  expect((await published).status()).toBe(200);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();
});

test('whole-quiz editor publishes all question types and enforces the student attempt boundary', async ({
  page,
}) => {
  const title = `Whole quiz ${Date.now()}`;
  await page.goto('/');
  await page.getByLabel('Email').fill('demo-lecturer@example.com');
  await page.getByLabel('Password').fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('button', { name: 'Create quiz' }).click();
  await page.getByLabel('Quiz title').fill(title);
  await page
    .locator('label')
    .filter({ hasText: 'Module' })
    .locator('select')
    .selectOption({ label: 'Database Systems' });
  await page.locator('fieldset').getByRole('radio').nth(1).check();
  await page.getByLabel('Question text').fill('Which layer stores data?');
  await page.getByLabel('Answer 1').fill('Database');
  await page.getByLabel('Answer 2').fill('Presentation');
  const draftResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/v1/quizzes') &&
      !response.url().includes('/questions'),
  );
  await page.getByRole('button', { name: 'Save draft' }).click();
  const quizId = (await (await draftResponse).json()).quiz.quiz_id;
  await expect(
    page.getByRole('heading', { name: 'Quiz editor' }),
  ).toBeVisible();

  const add = page.getByLabel('Add question');
  const addResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/questions'),
  );
  await add.selectOption('true_false');
  expect((await addResponse).status()).toBe(201);
  await expect(page.getByText('Question 2: Complete')).toBeVisible();
  await add.selectOption('short_answer');
  await expect(page.getByText('Question 3: Complete')).toBeVisible();
  await add.selectOption('code');
  await expect(page.getByText('Question 4: Complete')).toBeVisible();

  const cards = page.locator('.quiz-question-card');
  await cards
    .nth(1)
    .getByLabel('Question text')
    .fill('Is SQL a database language?');
  await cards
    .nth(2)
    .getByLabel('Question text')
    .fill('Name the query language.');
  await cards
    .nth(2)
    .getByLabel('Accepted answer')
    .fill('structured query language');
  await cards
    .nth(3)
    .getByLabel('Question text')
    .fill('What does this code return?');
  await cards.nth(3).getByLabel('Code before').fill('const answer = 42;');
  await cards.nth(3).getByLabel('Code after').fill('const answer = 42;');
  await cards.nth(3).getByLabel('Expected output').fill('42');
  await cards.nth(0).getByLabel('Question 1 option 1').fill('Database');
  await cards.nth(1).getByLabel('Question 2 option 1').fill('True');
  await cards.nth(1).getByLabel('Question 2 option 2').fill('False');
  await page.getByRole('heading', { name: 'Quiz editor' }).click();
  await expect(page.getByText('Saved')).toHaveCount(4);
  await expect
    .poll(
      async () =>
        page.evaluate(async (id) => {
          const response = await fetch(`/api/v1/quizzes/${id}`);
          const quiz = (await response.json()).quiz;
          return {
            count: quiz.questions.length,
            first: quiz.questions[0].options[0],
            second: quiz.questions[1].options[0],
            accepted: quiz.questions[2].acceptedAnswers,
            fourth: quiz.questions[3].options[0],
            marks: quiz.questions.map((question) => question.marks),
          };
        }, quizId),
      { timeout: 10000 },
    )
    .toEqual({
      count: 4,
      first: expect.objectContaining({ correct: true, optionText: 'Database' }),
      second: expect.objectContaining({ correct: true, optionText: 'True' }),
      accepted: expect.arrayContaining(['structured query language']),
      fourth: expect.objectContaining({
        correct: true,
        optionText: 'Option A',
      }),
      marks: [1, 1, 1, 1],
    });

  await page
    .getByRole('button', { name: 'Run publish checklist' })
    .last()
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Publish checklist passed',
  );
  const publishResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/publish'),
  );
  await page.getByRole('button', { name: 'Publish quiz' }).last().click();
  expect((await publishResponse).status()).toBe(200);
  await expect(page.getByRole('status')).toContainText('Quiz published');
  await expect(new AxeBuilder({ page }).analyze()).resolves.toMatchObject({
    violations: [],
  });

  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByLabel('Email').fill('demo-student-1@example.com');
  await page.getByLabel('Password').fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  const authoringStatus = await page.evaluate(async (path) => {
    const response = await fetch(path);
    return response.status;
  }, `/api/v1/quizzes/${quizId}`);
  expect(authoringStatus).toBe(403);
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page
    .locator('section.card > select')
    .selectOption({ label: 'Database Systems' });
  await page.getByPlaceholder('Search by title').fill(title);
  await expect(page.getByText(title)).toBeVisible();
  await page
    .locator('.quiz-entry')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Open quiz' })
    .click();
  await expect(page.locator('fieldset')).toHaveCount(4);
  await expect(page.getByText('Which layer stores data?')).toBeVisible();
  await expect(page.getByText('What does this code return?')).toBeVisible();
  await page
    .getByLabel('Answer for Name the query language.')
    .fill('Structured Query Language');
  await page
    .locator('fieldset')
    .filter({ hasText: 'Which layer stores data?' })
    .getByRole('radio', { name: 'Database' })
    .check();
  await page
    .locator('fieldset')
    .filter({ hasText: 'Is SQL a database language?' })
    .getByRole('radio', { name: 'True' })
    .check();
  await page
    .locator('fieldset')
    .filter({ hasText: 'What does this code return?' })
    .getByRole('radio', { name: 'Option A' })
    .check();
  await page.getByRole('button', { name: 'Submit attempt' }).click();
  await expect(page.getByText('Your score: 4')).toBeVisible();
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page
    .locator('section.card > select')
    .selectOption({ label: 'Database Systems' });
  await page.getByPlaceholder('Search by title').fill(title);
  await page
    .locator('.quiz-entry')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Open quiz' })
    .click();
  await expect(
    page.getByText('You already have an attempt for this quiz.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(page.getByText(/demo student/i)).toBeVisible();
});

test('whole-quiz editor blocks publishing an incomplete question', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('demo-lecturer@example.com');
  await page.getByLabel('Password').fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('button', { name: 'Create quiz' }).click();
  await page.getByLabel('Quiz title').fill(`Incomplete ${Date.now()}`);
  await page
    .locator('label')
    .filter({ hasText: 'Module' })
    .locator('select')
    .selectOption({ label: 'Database Systems' });
  await page.getByLabel('Question text').fill('Temporary question');
  await page.getByLabel('Answer 1').fill('Temporary answer');
  await page.getByLabel('Answer 2').fill('Other answer');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(
    page.getByRole('heading', { name: 'Quiz editor' }),
  ).toBeVisible();
  await page.getByLabel('Question text').fill('');
  await page.getByRole('heading', { name: 'Quiz editor' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Please check the submitted fields',
  );
  await page.getByRole('button', { name: 'Run publish checklist' }).click();
  await expect(page.getByRole('status')).toContainText('Publish blocked');
});

test('profile page edits identity and languages with an accessible layout', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('demo-lecturer@example.com');
  await page.getByLabel('Password').fill('EduQuestDemo123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Edit profile' }),
  ).toBeVisible();
  const expectAccessible = async () => {
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  };
  await expectAccessible();
  await page.getByLabel('First name').fill('A!');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expectAccessible();
  await page.getByLabel('First name').fill('Demo');
  await page.getByLabel('Python').check();
  await expect(page.getByText('You have unsaved changes.')).toBeVisible();
  await expectAccessible();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await expectAccessible();
});
