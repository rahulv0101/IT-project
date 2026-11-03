import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/v1/__test/reset-auth-state');
  expect(response.status()).toBe(204);
});

test('Lecturer can open the manual quiz authoring form without exposing it to students', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/auth/me')
      ? {
          user: {
            userId: 'lecturer-1',
            role: 'lecturer',
            full_name: 'Demo Lecturer',
          },
        }
      : path.endsWith('/modules')
        ? { data: [{ module_id: 'module-1', module_name: 'Web foundations' }] }
        : { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quizzes' }).click();
  await page.getByRole('button', { name: 'Create quiz' }).click();
  await expect(
    page.getByRole('heading', { name: 'Create quiz' }),
  ).toBeVisible();
  await expect(
    page.getByText('Unlimited attempts; no leaderboard.'),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('Practice Lab uses a scripts-only sandbox and exposes accessible editor controls', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/auth/me')
      ? {
          user: {
            userId: 'student-1',
            role: 'student',
            full_name: 'Demo Student',
          },
        }
      : path.endsWith('/labs')
        ? {
            data: [
              {
                lab_id: 'lab-1',
                kind: 'code',
                title: 'Heading lab',
                instructions: 'Build a heading.',
                difficulty: 1,
                config: {
                  starterHtml: '<h1>Hello</h1>',
                  starterCss: '',
                  starterJs: '',
                  checks: [],
                },
              },
            ],
          }
        : { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice Labs' }).click();
  await expect(page.getByText('Heading lab')).toBeVisible();
  await page.getByRole('button', { name: 'Open lab' }).click();
  const frame = page.getByTitle('Code preview');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(page.getByRole('button', { name: 'Run' })).toBeVisible();
  await page.waitForTimeout(300);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('Business Lab spreadsheet and calculator flows are accessible', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/auth/me')
      ? {
          user: {
            userId: 'student-1',
            role: 'student',
            full_name: 'Business Student',
          },
        }
      : path.endsWith('/labs')
        ? {
            data: [
              {
                lab_id: 'sheet-1',
                kind: 'spreadsheet',
                title: 'Budget spreadsheet',
                instructions: 'Calculate the balance.',
                difficulty: 2,
                config: {
                  startingGrid: { A1: '100', B1: '=A1*2' },
                  lockedCells: ['A1'],
                  checks: [],
                },
              },
              {
                lab_id: 'calc-1',
                kind: 'calculator',
                title: 'Break-even calculator',
                instructions: 'Learn contribution.',
                difficulty: 2,
                config: {
                  inputs: [
                    { key: 'fixed', label: 'Fixed costs', defaultValue: 100 },
                  ],
                  outputs: [
                    {
                      key: 'result',
                      label: 'Result',
                      formula: '={fixed}*2',
                      explanation: 'Multiply by two.',
                    },
                  ],
                },
              },
            ],
          }
        : { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice Labs' }).click();
  await page.getByRole('button', { name: 'Open lab' }).first().click();
  await expect(page.getByRole('columnheader', { name: 'A' })).toBeVisible();
  await expect(page.getByText(/Self-checked in your browser/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('Business Lab scenario flow is accessible and resumable', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/auth/me')
      ? { user: { userId: 'student-1', role: 'student' } }
      : path.endsWith('/labs')
        ? {
            data: [
              {
                lab_id: 'scenario-1',
                kind: 'scenario',
                title: 'Market scenario',
                instructions: 'Choose a path.',
                difficulty: 2,
                config: {
                  meters: [{ key: 'cash', label: 'Cash', initial: 20 }],
                  nodes: [
                    {
                      id: 'start',
                      text: 'Choose a path',
                      choices: [
                        { label: 'Grow', next: 'end', changes: { cash: 10 } },
                      ],
                    },
                    {
                      id: 'end',
                      text: 'Finished',
                      terminal: true,
                      choices: [],
                      reflection: 'Reflect on the trade-off.',
                    },
                  ],
                },
              },
            ],
          }
        : { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice Labs' }).click();
  await page.getByRole('button', { name: 'Open lab' }).click();
  await page.getByRole('button', { name: 'Grow' }).click();
  await expect(page.getByText('Reflect on the trade-off.')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('lecturer navigation excludes games and labs, including direct links', async ({
  page,
}) => {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        new URL(route.request().url()).pathname.endsWith('/auth/me')
          ? { user: { userId: 'lecturer-1', role: 'lecturer' } }
          : { data: [] },
      ),
    }),
  );
  await page.goto('/#/practice-labs');
  await expect(page.locator('main h1')).toHaveText('Study calendar');
  await expect(
    page.locator('aside').getByRole('button', { name: 'Games', exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator('aside')
      .getByRole('button', { name: 'Practice Labs', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Create quiz', exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('authentication screen is usable at the required viewport', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('lecturer generation panel exposes mode metadata and stuck-job controls', async ({
  page,
}) => {
  let jobStatus = 'queued';
  const oldCreatedAt = '2020-01-01T00:00:00.000Z';
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body = { data: [] };
    let status = 200;
    if (path.endsWith('/auth/me'))
      body = { user: { userId: 'lecturer-1', role: 'lecturer' } };
    else if (path.endsWith('/me/modules')) body = { data: [] };
    else if (path.endsWith('/resources/modules'))
      body = {
        data: [
          {
            module_id: 'module-1',
            module_code: 'DB101',
            module_name: 'Databases',
            resource_count: 1,
            last_updated: oldCreatedAt,
          },
        ],
      };
    else if (path.endsWith('/modules')) body = { data: [] };
    else if (path.endsWith('/modules/module-1/resources'))
      body = {
        data: [
          {
            resource_id: 'resource-1',
            title: 'Database notes',
            resource_type: 'txt',
          },
        ],
      };
    else if (path.endsWith('/ai-status'))
      body = { provider: 'mock', configured: true, reachable: true };
    else if (path.endsWith('/generation-jobs'))
      body = {
        job: {
          job_id: 'job-1',
          status: 'queued',
          created_at: oldCreatedAt,
        },
      };
    else if (path.endsWith('/ai-generation-jobs/job-1'))
      body = {
        job: { job_id: 'job-1', status: jobStatus, created_at: oldCreatedAt },
      };
    else if (path.endsWith('/cancel')) {
      jobStatus = 'failed';
      body = {
        job: {
          job_id: 'job-1',
          status: 'failed',
          error_code: 'CANCELLED',
          created_at: oldCreatedAt,
        },
      };
    } else if (request.method() !== 'GET') body = { data: [] };
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Resources' }).click();
  await page.getByRole('button', { name: /DB101/ }).click();
  await expect(page.getByText('Database notes')).toBeVisible();
  await expect(page.getByLabel('Quiz mode')).toHaveValue('practice');
  await expect(page.getByLabel('Quiz title')).toHaveValue('Database notes');
  await page.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(page.getByText(/queued for/)).toBeVisible();
  await expect(
    page.getByText(/This is taking longer than expected/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByText('Quiz generation was cancelled.', {
      exact: true,
    }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('Games chooser shows catalogue cards, reasons, resume and axe-clean layout', async ({
  page,
}) => {
  const catalogue = [
    ['infected', 'Infected', 6],
    ['island_escape', 'Island Escape', 30],
    ['memory_match', 'Memory Match', 6],
    ['boss_battle', 'Boss Battle', 12],
    ['pixel_racer', 'Pixel Car Racer', 10],
    ['timer_trivia', 'Timer Trivia', 10],
  ].map(([key, display_name, minimum_questions]) => ({
    key,
    display_name,
    minimum_questions,
    description: `${display_name} practice game.`,
  }));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/auth/me')
      ? {
          user: {
            userId: 'student-1',
            role: 'student',
            full_name: 'Demo Student',
          },
        }
      : path.endsWith('/games/catalogue')
        ? { data: catalogue }
        : path.endsWith('/games/in-progress')
          ? {
              data: [
                {
                  game_key: 'infected',
                  quiz_id: 'quiz-1',
                  title: 'Resume quiz',
                },
              ],
            }
          : path.endsWith('/games/quiz-picker')
            ? {
                data: [
                  {
                    quiz_id: 'quiz-1',
                    title: 'Resume quiz',
                    module_name: 'Database Systems',
                    is_competitive: false,
                    games: [
                      {
                        key: 'infected',
                        available: true,
                        hasInProgressPlay: true,
                      },
                    ],
                  },
                ],
                pagination: { page: 1, pageSize: 20, total: 1, pages: 1 },
              }
            : { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Games' }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose a game' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Coming soon' }),
  ).toBeDisabled();
  await expect(page.getByText('Practice only').first()).toBeVisible();
  await page.getByRole('button', { name: 'Choose' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Choose a quiz' }),
  ).toBeVisible();
  await expect(page.getByText('Resume').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('module and resource catalogues show enrolled data and first-year preview', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body = { data: [] };
    if (path.endsWith('/auth/me')) {
      body = {
        user: {
          userId: 'student-1',
          role: 'student',
          studentYear: 1,
          studentType: 'it',
        },
      };
    } else if (path.endsWith('/me/modules/lookahead')) {
      body = {
        preview: true,
        data: [
          {
            module_code: 'NET201',
            module_name: 'Networks',
            year: 2,
            description: 'Network foundations.',
            topics: ['Routing'],
            prerequisite_hints: ['Foundations'],
          },
        ],
      };
    } else if (path.endsWith('/me/modules')) {
      body = {
        data: [
          {
            module_id: 'mod-1',
            module_code: 'CAT101',
            module_name: 'Foundations',
            lecturer_name: 'Dr Lecturer',
            quizzes_available: 2,
            new_resources_count: 1,
            has_in_progress_game: true,
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, pageCount: 1 },
      };
    } else if (path.endsWith('/resources/modules')) {
      body = {
        data: [
          {
            module_id: 'mod-1',
            module_code: 'CAT101',
            module_name: 'Foundations',
            resource_count: 2,
            last_updated: '2026-11-01T10:00:00.000Z',
          },
        ],
        pagination: { page: 1, pageSize: 50, total: 1, pageCount: 1 },
      };
    } else if (path.endsWith('/modules/mod-1/resources')) {
      body = {
        data: [
          { resource_id: 'r-1', title: 'Revision notes', resource_type: 'txt' },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, pageCount: 1 },
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Modules' }).click();
  await expect(
    page.getByRole('heading', { name: 'Foundations' }),
  ).toBeVisible();
  await expect(page.getByText('Preview: not enrolled')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Resources' }).click();
  await page.getByRole('button', { name: /CAT101/ }).click();
  await expect(page.getByText('Revision notes')).toBeVisible();
  const openResource = page.getByRole('link', { name: 'Open resource' });
  await expect(openResource).toBeVisible();
  await expect(openResource).toHaveAttribute(
    'href',
    '/api/v1/resources/r-1/file',
  );
  await expect(openResource).toHaveAttribute('target', '_blank');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('study groups show recommendations, chips and membership action', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/group-invitations'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    const body = path.endsWith('/auth/me')
      ? {
          user: {
            userId: 'student-1',
            role: 'student',
            studentYear: 1,
            studentType: 'it',
          },
        }
      : path.endsWith('/me/modules')
        ? {
            data: [
              {
                module_id: 'm1',
                module_name: 'Foundations',
                module_code: 'CAT101',
              },
            ],
          }
        : {
            data: [
              {
                group_id: 'g1',
                group_name: 'Python Circle',
                module_code: 'CAT101',
                module_name: 'Foundations',
                leaders: [{ name: 'Ada', role: 'leader' }],
                member_count: 3,
                languages: ['Python', 'SQL'],
                focus: 'Databases',
                recommendation_reason: 'Matches your languages: Python, SQL',
                is_member: false,
                next_up: [],
              },
            ],
            pagination: { page: 1, pageSize: 20, total: 1, pageCount: 1 },
          };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Study groups' }).click();
  await expect(
    page.getByRole('heading', { name: 'Study groups', level: 2 }),
  ).toBeVisible();
  await expect(page.getByText('Python Circle')).toBeVisible();
  await expect(page.getByText('Matches your languages')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join group' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('Infected solo flow is responsive, keyboard operable and axe clean', async ({
  page,
}) => {
  let phase = 'cards';
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    if (path.endsWith('/auth/me'))
      body = {
        user: {
          userId: 'student-1',
          role: 'student',
          full_name: 'Demo Student',
        },
      };
    else if (path.endsWith('/modules'))
      body = {
        data: [{ module_id: 'module-1', module_name: 'Database Systems' }],
      };
    else if (path.endsWith('/modules/module-1/quizzes'))
      body = {
        data: [
          {
            quiz_id: 'quiz-1',
            title: 'Demo practice quiz',
            is_competitive: false,
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-1/games'))
      body = {
        data: [
          {
            game_id: 'game-1',
            key: 'infected',
            display_name: 'Infected',
            available: true,
          },
        ],
      };
    else if (path.endsWith('/games/infected/sessions'))
      body = {
        session: {
          sessionId: 'session-1',
          cure: 0,
          hearts: 3,
          score: 0,
          status: 'in_progress',
        },
        cards: [
          {
            cardId: 'card-1',
            difficulty: 'medium',
            topic: 'Normalization',
            reward: 20,
            penalty: 10,
          },
        ],
      };
    else if (path.endsWith('/choose')) {
      phase = 'question';
      body = {
        question: {
          questionId: 'card-1',
          questionText: 'Which normal form removes transitive dependencies?',
          difficulty: 'medium',
          options: [
            { optionId: 'option-1', optionText: 'Third normal form' },
            { optionId: 'option-2', optionText: 'First normal form' },
          ],
        },
      };
    } else if (path.endsWith('/answer')) {
      phase = 'feedback';
      body = {
        isCorrect: true,
        correctOption: {
          optionId: 'option-1',
          optionText: 'Third normal form',
        },
        explanation: 'Third normal form removes transitive dependencies.',
        session: {
          sessionId: 'session-1',
          cure: 20,
          hearts: 3,
          score: 20,
          status: 'in_progress',
        },
        cards: [],
      };
    } else body = { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Quizzes' }).click();
  await page.getByRole('combobox').selectOption('module-1');
  await page.getByRole('button', { name: 'Play Infected' }).click();
  await expect(
    page.getByRole('heading', { name: 'INFECTED', exact: true }),
  ).toBeVisible();
  const card = page.getByRole('button', {
    name: /medium card about normalization/i,
  });
  await card.focus();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/choose')),
    page.keyboard.press('Enter'),
  ]);
  expect(phase).toBe('question');
  await page.getByLabel('Third normal form').check();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/answer')),
    page.getByRole('button', { name: 'Submit answer' }).click(),
  ]);
  expect(phase).toBe('feedback');
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByText('Cure 20% · Infection 80%')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('Island Escape flow is responsive, keyboard operable and axe clean', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    if (path.endsWith('/auth/me'))
      body = {
        user: {
          userId: 'student-1',
          role: 'student',
          full_name: 'Demo Student',
        },
      };
    else if (path.endsWith('/modules'))
      body = {
        data: [{ module_id: 'module-1', module_name: 'Database Systems' }],
      };
    else if (path.endsWith('/modules/module-1/quizzes'))
      body = {
        data: [
          {
            quiz_id: 'quiz-island',
            title: 'Island practice quiz',
            is_competitive: false,
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-island/games'))
      body = {
        data: [
          {
            game_id: 'game-island',
            key: 'island_escape',
            display_name: 'Island Escape',
            available: true,
          },
        ],
      };
    else if (path.endsWith('/games/island-escape/plays'))
      body = {
        play: {
          playId: 'play-island',
          phase: 1,
          phaseName: 'Gather materials',
          phaseQuestionNumber: 0,
          wrongInPhase: 0,
          streak: 0,
          doubleActive: false,
          setbacks: 0,
          retriesRemaining: 3,
          score: 0,
          materials: [],
          boatParts: [],
          sailProgress: 0,
          status: 'in_progress',
        },
        question: {
          questionId: 'question-island',
          questionText: 'Which material makes a strong mast?',
          difficultyLevel: 1,
          difficulty: 'easy',
          topic: 'Materials',
          options: [
            { optionId: 'option-wood', optionText: 'Wood' },
            { optionId: 'option-paper', optionText: 'Paper' },
          ],
        },
      };
    else if (path.endsWith('/answer'))
      body = {
        isCorrect: true,
        correctOption: { optionId: 'option-wood', optionText: 'Wood' },
        explanation: 'Wood is rigid enough to support the sail.',
        pointsEarned: 10,
        event: 'answer',
        play: {
          playId: 'play-island',
          phase: 1,
          phaseName: 'Gather materials',
          phaseQuestionNumber: 1,
          wrongInPhase: 0,
          streak: 1,
          doubleActive: false,
          setbacks: 0,
          retriesRemaining: 3,
          score: 10,
          materials: ['Wood'],
          boatParts: [],
          sailProgress: 0,
          status: 'in_progress',
        },
        question: null,
      };
    else body = { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Quizzes' }).click();
  await page.getByRole('combobox').selectOption('module-1');
  await page.getByRole('button', { name: 'Play Island Escape' }).click();
  await expect(
    page.getByRole('heading', { name: 'Island Escape', level: 2 }),
  ).toBeVisible();
  await expect(page.getByText('Phase 1 of 3 · Question 1 of 10')).toBeVisible();
  await expect(page.getByText(/Correct answer:/)).toHaveCount(0);
  await page.getByLabel('Wood').focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByText(/Points earned: 10/)).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('Memory Match full flow, refresh and competitive lock are accessible', async ({
  page,
}) => {
  const sourceCards = Array.from({ length: 6 }, (_, pair) => [
    {
      cardId: `question-${pair}`,
      kind: 'question',
      pair,
      text: `Question ${pair + 1}`,
      faceUp: false,
      matched: false,
    },
    {
      cardId: `answer-${pair}`,
      kind: 'answer',
      pair,
      text: `Answer ${pair + 1}`,
      faceUp: false,
      matched: false,
    },
  ]).flat();
  let cards = sourceCards.map((card) => ({ ...card }));
  let mismatches = 0;
  let moves = 0;
  let status = 'in_progress';
  let lastMatched = null;

  const resetPlay = () => {
    cards = sourceCards.map((card) => ({ ...card }));
    mismatches = 0;
    moves = 0;
    status = 'in_progress';
    lastMatched = null;
  };
  const clientPlay = (flippedCard = null) => {
    const matchedPairs = cards.filter(
      (card) => card.kind === 'question' && card.matched,
    ).length;
    return {
      playId: 'memory-play',
      quizId: 'quiz-memory-practice',
      status,
      matchedPairs,
      mismatches,
      moves,
      score: Math.max(0, 10 * matchedPairs - mismatches),
      cards: cards.map(({ cardId, kind, faceUp, matched }) => ({
        cardId,
        kind,
        faceUp,
        matched,
      })),
      revealed: cards
        .filter((card) => card.faceUp || card.matched)
        .map(({ cardId, kind, text }) => ({ cardId, kind, text })),
      flippedCard,
      matched: lastMatched,
    };
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    let statusCode = 200;
    if (path.endsWith('/auth/me'))
      body = {
        user: {
          userId: 'student-1',
          role: 'student',
          full_name: 'Demo Student',
        },
      };
    else if (path.endsWith('/modules'))
      body = {
        data: [{ module_id: 'module-1', module_name: 'Database Systems' }],
      };
    else if (path.endsWith('/modules/module-1/quizzes'))
      body = {
        data: [
          {
            quiz_id: 'quiz-memory-competitive',
            title: 'Locked competitive quiz',
            is_competitive: true,
          },
          {
            quiz_id: 'quiz-memory-practice',
            title: 'Memory practice quiz',
            is_competitive: false,
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-memory-competitive/games'))
      body = {
        data: [
          {
            game_id: 'memory-game',
            key: 'memory_match',
            display_name: 'Memory Match',
            available: false,
            reason: 'Complete your scored attempt to unlock this game.',
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-memory-practice/games'))
      body = {
        data: [
          {
            game_id: 'memory-game',
            key: 'memory_match',
            display_name: 'Memory Match',
            available: true,
          },
        ],
      };
    else if (
      path.endsWith('/games/memory-match/plays') &&
      request.method() === 'POST'
    ) {
      if (status === 'finished') resetPlay();
      body = { data: clientPlay() };
    } else if (path.endsWith('/games/memory-match/plays/memory-play/flip')) {
      const { cardId } = request.postDataJSON();
      const unresolved = cards.filter((card) => card.faceUp && !card.matched);
      if (unresolved.length === 2)
        for (const card of unresolved) card.faceUp = false;
      const card = cards.find((item) => item.cardId === cardId);
      if (!card || card.matched || card.faceUp) {
        statusCode = 409;
        body = {
          error: { code: 'CONFLICT', message: 'Card cannot be flipped.' },
        };
      } else {
        card.faceUp = true;
        const first = cards.find(
          (item) => item.cardId !== cardId && item.faceUp && !item.matched,
        );
        lastMatched = null;
        if (first) {
          moves += 1;
          lastMatched = first.pair === card.pair;
          if (lastMatched) {
            first.matched = true;
            card.matched = true;
          } else mismatches += 1;
        }
        if (cards.every((item) => item.matched)) status = 'finished';
        body = {
          data: clientPlay({
            cardId: card.cardId,
            kind: card.kind,
            text: card.text,
          }),
        };
      }
    } else body = { data: [] };
    await route.fulfill({
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  const openQuizzes = async () => {
    await page.getByRole('button', { name: 'Quizzes' }).click();
    await page.getByRole('combobox').selectOption('module-1');
  };
  const flip = async (name) => {
    const card = page.getByRole('button', { name, exact: true });
    await card.focus();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response
            .url()
            .includes('/games/memory-match/plays/memory-play/flip') &&
          response.request().method() === 'POST',
      ),
      page.keyboard.press('Enter'),
    ]);
    await page.waitForTimeout(50);
  };

  await page.goto('/');
  await openQuizzes();
  const lockedQuiz = page
    .locator('.quiz-entry')
    .filter({ hasText: 'Locked competitive quiz' });
  await expect(
    lockedQuiz.getByText('Complete your scored attempt to unlock this game.'),
  ).toBeVisible();
  await expect(
    lockedQuiz.getByRole('button', { name: 'Play Memory Match' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Play Memory Match' }).click();
  await expect(
    page.getByRole('heading', { name: 'MEMORY MATCH', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(page.getByText('Question 1')).toHaveCount(0);
  await expect(page.getByText('Answer 1')).toHaveCount(0);

  await flip('Flip question card 1');
  await expect(page.getByText('Question 1')).toBeVisible();
  await page.reload();
  await openQuizzes();
  await page.getByRole('button', { name: 'Play Memory Match' }).click();
  await expect(page.getByText('Question 1')).toBeVisible();

  await flip('Flip answer card 4');
  await expect(page.getByText(/Not a match/)).toBeAttached();
  await expect(page.getByText('Question 1')).toHaveCount(0, { timeout: 2000 });
  await flip('Flip question card 1');
  await flip('Flip answer card 2');
  await expect(page.getByText(/Match found. 1 pairs found/)).toBeAttached();

  for (let pair = 1; pair < 6; pair += 1) {
    await flip(`Flip question card ${pair * 2 + 1}`);
    await flip(`Flip answer card ${pair * 2 + 2}`);
  }
  await expect(page.getByText('Every pair matched')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('Boss Battle full flow and competitive lock are accessible', async ({
  page,
}) => {
  let bossHp = 100;
  let playerHp = 100;
  let score = 0;
  let answerCount = 0;
  const question = () => ({
    questionId: `boss-question-${answerCount + 1}`,
    questionText: 'Which database structure speeds up keyed lookups?',
    difficultyLevel: 5,
    difficulty: 'hard',
    topic: 'Indexes',
    options: [
      { optionId: 'boss-correct', optionText: 'A B-tree index' },
      { optionId: 'boss-wrong-1', optionText: 'A colour palette' },
      { optionId: 'boss-wrong-2', optionText: 'A page margin' },
      { optionId: 'boss-wrong-3', optionText: 'A font family' },
    ],
  });
  const play = () => ({
    playId: 'boss-play',
    quizId: 'quiz-boss-practice',
    bossHp,
    playerHp,
    score,
    status: bossHp === 0 ? 'won' : playerHp === 0 ? 'lost' : 'in_progress',
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    if (path.endsWith('/auth/me'))
      body = {
        user: {
          userId: 'student-1',
          role: 'student',
          full_name: 'Demo Student',
        },
      };
    else if (path.endsWith('/modules'))
      body = {
        data: [{ module_id: 'module-1', module_name: 'Database Systems' }],
      };
    else if (path.endsWith('/modules/module-1/quizzes'))
      body = {
        data: [
          {
            quiz_id: 'quiz-boss-competitive',
            title: 'Locked boss challenge',
            is_competitive: true,
          },
          {
            quiz_id: 'quiz-boss-practice',
            title: 'Boss practice quiz',
            is_competitive: false,
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-boss-competitive/games'))
      body = {
        data: [
          {
            game_id: 'boss-game',
            key: 'boss_battle',
            display_name: 'Boss Battle',
            available: false,
            reason: 'Complete your scored attempt to unlock this game.',
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-boss-practice/games'))
      body = {
        data: [
          {
            game_id: 'boss-game',
            key: 'boss_battle',
            display_name: 'Boss Battle',
            available: true,
          },
        ],
      };
    else if (
      path.endsWith('/games/boss-battle/plays') &&
      request.method() === 'POST'
    ) {
      if (bossHp === 0 || playerHp === 0) {
        bossHp = 100;
        playerHp = 100;
        score = 0;
        answerCount = 0;
      }
      body = {
        data: {
          play: play(),
          question: question(),
          outcome: null,
          resumed: false,
        },
      };
    } else if (path.endsWith('/games/boss-battle/plays/boss-play/answer')) {
      const { optionId } = request.postDataJSON();
      const isCorrect = optionId === 'boss-correct';
      answerCount += 1;
      if (isCorrect) {
        bossHp = Math.max(0, bossHp - 25);
        score += 25;
      } else playerHp = Math.max(0, playerHp - 20);
      body = {
        data: {
          isCorrect,
          correctOption: {
            optionId: 'boss-correct',
            optionText: 'A B-tree index',
          },
          explanation: 'A B-tree keeps keyed lookups efficient.',
          damageDealt: isCorrect ? 25 : 0,
          damageTaken: isCorrect ? 0 : 20,
          play: play(),
          question: bossHp === 0 ? null : question(),
          outcome: bossHp === 0 ? 'won' : null,
          replayed: false,
        },
      };
    } else body = { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Quizzes' }).click();
  await page.getByRole('combobox').selectOption('module-1');
  const lockedQuiz = page
    .locator('.quiz-entry')
    .filter({ hasText: 'Locked boss challenge' });
  await expect(
    lockedQuiz.getByText('Complete your scored attempt to unlock this game.'),
  ).toBeVisible();
  await expect(
    lockedQuiz.getByRole('button', { name: 'Play Boss Battle' }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Play Boss Battle' }).click();
  await expect(
    page.getByRole('heading', { name: 'BOSS BATTLE', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'Boss HP' }),
  ).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByText(/Correct answer:/)).toHaveCount(0);

  await page.getByLabel('A colour palette').focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByText('Incorrect', { exact: true })).toBeVisible();
  await expect(page.getByText('Player damage: 20.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('progressbar', { name: 'Player HP' }),
  ).toHaveAttribute('aria-valuenow', '80');

  for (let round = 0; round < 4; round += 1) {
    await page.getByLabel('A B-tree index').check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByText('Correct', { exact: true })).toBeVisible();
    await expect(page.getByText('Boss damage: 25.')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await expect(page.getByText('Boss defeated')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Back to quiz' }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('Pixel Car Racer nitro flow and competitive lock are accessible', async ({
  page,
}) => {
  let speed = 2;
  let distance = 0;
  let streak = 0;
  let points = 0;
  let nitroActive = false;
  let slotsUsed = 0;
  let answersUsed = 0;
  const bot = {
    name: 'Bot',
    distance: 360,
    points: 70,
    answersUsed: 9,
    status: 'finished',
  };
  const question = () => ({
    questionId: `pixel-question-${slotsUsed}`,
    questionText: 'Which protocol provides reliable transport?',
    difficultyLevel: 3,
    topic: 'Networking',
    options: [
      { optionId: 'pixel-correct', optionText: 'TCP' },
      { optionId: 'pixel-wrong', optionText: 'ARP' },
      { optionId: 'pixel-wrong-2', optionText: 'A display driver' },
      { optionId: 'pixel-wrong-3', optionText: 'A font file' },
    ],
  });
  const play = () => ({
    playId: 'pixel-play',
    quizId: 'quiz-pixel-practice',
    status: slotsUsed >= 10 ? 'finished' : 'in_progress',
    speed,
    distance,
    streak,
    points,
    nitroActive,
    slotsUsed,
    slotsRemaining: Math.max(0, 10 - slotsUsed),
    answersUsed,
    bot,
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    if (path.endsWith('/auth/me'))
      body = {
        user: {
          userId: 'student-1',
          role: 'student',
          full_name: 'Demo Student',
        },
      };
    else if (path.endsWith('/modules'))
      body = {
        data: [{ module_id: 'module-1', module_name: 'Database Systems' }],
      };
    else if (path.endsWith('/modules/module-1/quizzes'))
      body = {
        data: [
          {
            quiz_id: 'quiz-pixel-competitive',
            title: 'Locked pixel race',
            is_competitive: true,
          },
          {
            quiz_id: 'quiz-pixel-practice',
            title: 'Pixel practice quiz',
            is_competitive: false,
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-pixel-competitive/games'))
      body = {
        data: [
          {
            game_id: 'pixel-game',
            key: 'pixel_racer',
            display_name: 'Pixel Car Racer',
            available: false,
            reason: 'Complete your scored attempt to unlock this game.',
          },
        ],
      };
    else if (path.endsWith('/quizzes/quiz-pixel-practice/games'))
      body = {
        data: [
          {
            game_id: 'pixel-game',
            key: 'pixel_racer',
            display_name: 'Pixel Car Racer',
            available: true,
          },
        ],
      };
    else if (
      path.endsWith('/games/pixel-racer/plays') &&
      request.method() === 'POST'
    ) {
      if (slotsUsed >= 10) {
        speed = 2;
        distance = 0;
        streak = 0;
        points = 0;
        nitroActive = false;
        slotsUsed = 0;
        answersUsed = 0;
      }
      body = {
        data: {
          play: play(),
          question: question(),
          outcome: null,
          resumed: false,
        },
      };
    } else if (path.endsWith('/games/pixel-racer/plays/pixel-play/answer')) {
      const isCorrect = request.postDataJSON().optionId === 'pixel-correct';
      const usedNitro = nitroActive && isCorrect;
      speed = isCorrect ? Math.min(5, speed + 1) : Math.max(1, speed - 1);
      streak = isCorrect ? streak + 1 : 0;
      const multiplier = usedNitro ? 2 : 1;
      const slotsConsumed = usedNitro ? 2 : 1;
      const distanceGained = speed * 10 * multiplier;
      const pointsEarned = isCorrect ? 10 * multiplier : 0;
      distance += distanceGained;
      points += pointsEarned;
      slotsUsed = Math.min(10, slotsUsed + slotsConsumed);
      answersUsed += 1;
      nitroActive = isCorrect && (usedNitro || streak >= 4);
      body = {
        data: {
          isCorrect,
          correctOption: { optionId: 'pixel-correct', optionText: 'TCP' },
          explanation: 'TCP provides reliable ordered delivery.',
          distanceGained,
          pointsEarned,
          slotsConsumed,
          play: play(),
          question: slotsUsed >= 10 ? null : question(),
          outcome:
            slotsUsed >= 10
              ? {
                  winner: distance > bot.distance ? 'player' : 'bot',
                  playerDistance: distance,
                  playerPoints: points,
                  botDistance: bot.distance,
                  botPoints: bot.points,
                  answersUsed,
                }
              : null,
          replayed: false,
        },
      };
    } else body = { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Quizzes' }).click();
  await page.getByRole('combobox').selectOption('module-1');
  const lockedQuiz = page
    .locator('.quiz-entry')
    .filter({ hasText: 'Locked pixel race' });
  await expect(
    lockedQuiz.getByText('Complete your scored attempt to unlock this game.'),
  ).toBeVisible();
  await expect(
    lockedQuiz.getByRole('button', { name: 'Play Pixel Car Racer' }),
  ).toHaveCount(0);

  const playButton = page.getByRole('button', { name: 'Play Pixel Car Racer' });
  await playButton.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', {
      name: 'PIXEL CAR RACER',
      exact: true,
      level: 2,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Correct answer:/)).toHaveCount(0);
  await expect(page.getByText('Speed 2 of 5')).toBeVisible();

  for (let answerNumber = 0; answerNumber < 7; answerNumber += 1) {
    await page.getByLabel('TCP').check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByText('Correct', { exact: true })).toBeVisible();
    if (answerNumber >= 3)
      await expect(
        page.getByText('NITRO ACTIVE, answers worth double'),
      ).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await expect(page.getByText('You won the race!')).toBeVisible();
  await expect(page.getByText('Answers used: 7')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Race again' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('Timer Trivia board, timed question and feedback are accessible', async ({
  page,
}) => {
  let answered = false;
  const board = Array.from({ length: 10 }, (_, index) => ({
    cellId: `cell-${index}`,
    topic: 'Databases',
    level: (index % 5) + 1,
    points: ((index % 5) + 1) * 10,
    state: index === 0 && answered ? 'answered' : 'open',
    disabled: index === 0 && answered,
  }));
  const play = () => ({
    playId: 'timer-play',
    quizId: 'timer-quiz',
    status: answered ? 'finished' : 'in_progress',
    score: answered ? 30 : 0,
    roundsCompleted: answered ? 10 : 0,
    roundsRemaining: answered ? 0 : 10,
    topics: ['Databases'],
    board,
    activeCellId: answered ? null : null,
    deadlineAt: null,
    extendedTime: false,
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    if (path.endsWith('/auth/me'))
      body = {
        user: {
          userId: 'student-1',
          role: 'student',
          full_name: 'Demo Student',
        },
      };
    else if (path.endsWith('/modules'))
      body = {
        data: [{ module_id: 'module-1', module_name: 'Database Systems' }],
      };
    else if (path.endsWith('/modules/module-1/quizzes'))
      body = {
        data: [
          {
            quiz_id: 'timer-quiz',
            title: 'Timer practice',
            is_competitive: false,
          },
        ],
      };
    else if (path.endsWith('/quizzes/timer-quiz/games'))
      body = {
        data: [
          {
            game_id: 'timer-game',
            key: 'timer_trivia',
            display_name: 'Timer Trivia',
            available: true,
          },
        ],
      };
    else if (
      path.endsWith('/games/timer-trivia/plays') &&
      request.method() === 'POST'
    )
      body = { data: { play: play(), question: null, resumed: false } };
    else if (path.endsWith('/games/timer-trivia/plays/timer-play/choose'))
      body = {
        data: {
          play: {
            ...play(),
            activeCellId: 'cell-2',
            // Leave enough time for every browser engine to observe the
            // 10-second threshold before it crosses below it.
            deadlineAt: new Date(Date.now() + 12000).toISOString(),
          },
          question: {
            questionId: 'timer-q',
            questionText: 'Which structure stores rows?',
            topic: 'Databases',
            difficultyLevel: 3,
            options: [
              { optionId: 'timer-correct', optionText: 'A table' },
              { optionId: 'timer-wrong', optionText: 'A canvas' },
            ],
          },
        },
      };
    else if (path.endsWith('/games/timer-trivia/plays/timer-play/answer')) {
      answered = true;
      body = {
        data: {
          isCorrect: true,
          timedOut: false,
          pointsEarned: 30,
          correctOption: { optionId: 'timer-correct', optionText: 'A table' },
          explanation: 'Tables store rows.',
          play: play(),
          question: null,
        },
      };
    } else body = { data: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quizzes' }).click();
  await page.getByRole('combobox').selectOption('module-1');
  await page.getByRole('button', { name: 'Play Timer Trivia' }).click();
  await expect(
    page.getByRole('heading', { name: 'TIMER TRIVIA', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(page.getByText(/Choose an open topic/)).toBeVisible();
  await page
    .getByRole('button', { name: /Databases, 30 points/ })
    .first()
    .click();
  await expect(page.getByText('Which structure stores rows?')).toBeVisible();
  await expect(page.getByText('10 seconds remaining')).toBeVisible();
  await page.waitForTimeout(5000);
  await expect(page.getByText('5 seconds remaining')).toBeVisible();
  await page.getByLabel('A table').check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
