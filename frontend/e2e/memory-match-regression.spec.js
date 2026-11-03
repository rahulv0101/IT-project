import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';

test('Memory Match plays a two-question quiz with long AI-style text', async ({
  page,
}) => {
  expect(process.env.DATABASE_URL).toContain(':55436/eduquest_e2e');
  expect(
    (await page.request.post('/api/v1/__test/reset-auth-state')).status(),
  ).toBe(204);
  const login = async (email) =>
    expect(
      (
        await page.request.post('/api/v1/auth/login', {
          data: { email, password: 'EduQuestDemo123!' },
        })
      ).status(),
    ).toBe(200);
  await login('demo-lecturer@example.com');
  const modules = await (await page.request.get('/api/v1/modules')).json();
  const module = modules.data.find((m) => m.module_code === 'DEMO101');
  const questions = [0, 1].map((i) => ({
    questionType: 'multiple_choice',
    questionText: `Scenario ${i + 1}: A team needs to store related customer and order records. ${'Explain how the database keeps their relationships consistent. '.repeat(4)}`,
    difficultyLevel: 2,
    marks: 1,
    options: [
      {
        optionText: `Answer ${i + 1}: ${'Use a relational constraint to preserve the connection between the records. '.repeat(2)}`,
        isCorrect: true,
      },
      {
        optionText: 'Ignore the relationship between the records.',
        isCorrect: false,
      },
    ],
  }));
  const created = await page.request.post('/api/v1/quizzes/manual', {
    data: {
      moduleId: module.module_id,
      title: `Memory short regression ${Date.now()}`,
      status: 'published',
      questions,
    },
  });
  expect(created.status()).toBe(201);
  const { quiz } = await created.json();
  await login('demo-student-1@example.com');
  const availability = await (
    await page.request.get(`/api/v1/quizzes/${quiz.quiz_id}/games`)
  ).json();
  expect(availability.data.find((g) => g.key === 'memory_match')).toMatchObject(
    { available: true, questionCount: 2, minimum_questions: 2 },
  );
  const started = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().endsWith('/games/memory-match/plays'),
  );
  await page.goto(`/#/games/memory-match/${quiz.quiz_id}`);
  const response = await started;
  expect(response.status()).toBe(200);
  const { data } = await response.json();
  expect(data.cards).toHaveLength(4);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let cards;
  try {
    cards = (
      await client.query('SELECT state FROM game_plays WHERE play_id=$1', [
        data.playId,
      ])
    ).rows[0].state.cards;
  } finally {
    await client.end();
  }
  const buttons = page.locator('.memory-card');
  await expect(buttons).toHaveCount(4);
  const pairKeys = [...new Set(cards.map((c) => c.pairKey))];
  for (const pair of pairKeys) {
    for (const card of cards
      .filter((c) => c.pairKey === pair)
      .sort((a, b) =>
        a.kind === 'question' ? -1 : b.kind === 'question' ? 1 : 0,
      )) {
      await buttons.nth(cards.indexOf(card)).click();
      if (card.kind === 'question') {
        const text = page
          .locator('.memory-card-front b')
          .filter({ hasText: card.text });
        await expect(text).toBeVisible();
        expect(
          await text.evaluate((el) => {
            const front = el.closest('.memory-card-front');
            return (
              el.getBoundingClientRect().bottom <=
              front.getBoundingClientRect().bottom + 1
            );
          }),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
          [],
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
  }
  await expect(
    page.getByRole('heading', { name: 'Every pair matched' }),
  ).toBeVisible();
});
