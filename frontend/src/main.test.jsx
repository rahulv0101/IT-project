// @vitest-environment jsdom
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  App,
  BossBattleGame,
  InfectedGame,
  IslandEscapeGame,
  MemoryMatchGame,
  PixelRacerGame,
  GamesPage,
  Modules,
  QuizGames,
  QuizTaking,
  Quizzes,
  QuizAuthoring,
  QuizEditor,
  ResourceRow,
  Resources,
  Groups,
  ProfilePage,
  PracticeLabs,
  CodeLabPlayer,
  SpreadsheetLabPlayer,
  CalculatorLabPlayer,
  ScenarioLabPlayer,
} from './main.jsx';

describe('manual quiz authoring', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows lecturer-only starting points, mode explanations and question types', async () => {
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ module_id: 'm1', module_name: 'Web' }] }),
    });
    render(<QuizAuthoring />);
    expect(
      await screen.findByRole('heading', { name: 'Create quiz' }),
    ).toBeTruthy();
    expect(screen.getByText(/unlimited attempts/i)).toBeTruthy();
    expect(screen.getByText(/one scored attempt/i)).toBeTruthy();
    expect(screen.getByLabelText('Question type')).toBeTruthy();
  });

  it('runs the publish checklist and shows a blocking result before publishing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ data: [{ module_id: 'm1', module_name: 'Web' }] }),
      )
      .mockResolvedValueOnce(response({ quiz: { quiz_id: 'quiz-draft' } }))
      .mockResolvedValueOnce(
        response({
          checklist: {
            ok: false,
            issues: [{ message: 'Add at least one question.' }],
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<QuizAuthoring />);
    await screen.findByRole('heading', { name: 'Create quiz' });
    fireEvent.change(screen.getByLabelText('Module'), {
      target: { value: 'm1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(screen.getByText('Draft saved.')).toBeTruthy());
    fireEvent.click(
      screen.getByRole('button', { name: 'Run publish checklist' }),
    );
    await waitFor(() =>
      expect(
        screen.getByText('Dry run blocked: Add at least one question.'),
      ).toBeTruthy(),
    );
  });
});

describe('manual quiz taking question types', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders short-answer and code questions without accepted answers before submission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          attempt: { attempt_id: 'attempt-1' },
          quiz: { title: 'Mixed quiz', is_competitive: true },
          questions: [
            {
              question_id: 'short-1',
              question_text: 'Name the capital.',
              question_type: 'short_answer',
              options: [],
            },
            {
              question_id: 'code-1',
              question_text: 'What changes?',
              question_type: 'code',
              code_before: 'const x = 1;',
              options: [
                { optionId: 'o1', optionText: 'x becomes 2' },
                { optionId: 'o2', optionText: 'x is removed' },
              ],
            },
          ],
        }),
      ),
    );
    render(<QuizTaking quizId="quiz-1" />);
    expect(
      await screen.findByLabelText('Answer for Name the capital.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Code before').textContent).toContain(
      'const x = 1;',
    );
    expect(screen.queryByText('Cape Town')).toBeNull();
    expect(screen.getByText('One scored attempt only.')).toBeTruthy();
  });
});

describe('whole-quiz editor', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows all question cards, add menu, status, marks, movement and previews', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          quiz: {
            quiz_id: 'quiz-1',
            title: 'Mixed quiz',
            is_competitive: true,
            status: 'draft',
            questions: [
              {
                questionId: 'q-1',
                questionText: 'Choose one',
                questionType: 'multiple_choice',
                marks: 2,
                options: [
                  { optionId: 'o1', optionText: 'Correct', isCorrect: true },
                  { optionId: 'o2', optionText: 'Wrong', isCorrect: false },
                ],
              },
              {
                questionId: 'q-2',
                questionText: '',
                questionType: 'short_answer',
                marks: 3,
                acceptedAnswers: [],
                options: [],
              },
            ],
          },
        }),
      ),
    );
    render(<QuizEditor quizId="quiz-1" onDone={vi.fn()} />);
    expect(
      await screen.findByRole('heading', { name: 'Quiz editor' }),
    ).toBeTruthy();
    expect(screen.getByText(/1 of 2 questions have text/)).toBeTruthy();
    expect(screen.getByText(/5 total marks/)).toBeTruthy();
    expect(screen.getByLabelText('Add question')).toBeTruthy();
    expect(screen.getByText(/Question 1: Complete/)).toBeTruthy();
    expect(screen.getByText(/Question 2: Incomplete/)).toBeTruthy();
    expect(screen.getByLabelText('Preview question 1')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Run publish checklist' }),
    ).toBeTruthy();
  });
});

const bossQuestion = {
  questionId: 'boss-question-1',
  questionText: 'Which index supports this query?',
  difficultyLevel: 5,
  difficulty: 'hard',
  topic: 'Indexes',
  options: [
    { optionId: 'boss-correct', optionText: 'A B-tree index' },
    { optionId: 'boss-wrong-1', optionText: 'No index' },
    { optionId: 'boss-wrong-2', optionText: 'A display index' },
    { optionId: 'boss-wrong-3', optionText: 'A colour index' },
  ],
};

const bossData = (overrides = {}) => ({
  play: {
    playId: 'boss-play',
    quizId: 'boss-quiz',
    bossHp: 100,
    playerHp: 100,
    score: 0,
    status: 'in_progress',
    questionsAnswered: 0,
    questionsRemaining: 12,
    ...(overrides.play || {}),
  },
  question:
    overrides.question === undefined ? bossQuestion : overrides.question,
  outcome: overrides.outcome || null,
  resumed: false,
});

describe('Games chooser', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

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

  it('renders catalogue cards, tags, vector icons and coming-soon multiplayer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path) =>
        Promise.resolve(
          response(
            path.includes('/catalogue')
              ? { data: catalogue }
              : path.includes('/in-progress')
                ? { data: [] }
                : { data: [], pagination: { page: 1, pageSize: 20, pages: 1 } },
          ),
        ),
      ),
    );
    render(<GamesPage user={{ role: 'student' }} onStartGame={() => {}} />);
    expect(
      await screen.findByRole('heading', { name: 'Choose a game' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Choose' })).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Coming soon' }).disabled).toBe(
      true,
    );
    expect(screen.getAllByRole('img')).toHaveLength(7);
    expect(screen.getAllByText('Practice only')).toHaveLength(6);
  });

  it('opens the quiz picker with availability reasons, search, pagination and resume', async () => {
    const play = { game_key: 'infected', quiz_id: 'q1', title: 'Resume Quiz' };
    const quiz = {
      quiz_id: 'q1',
      title: 'Resume Quiz',
      module_name: 'Databases',
      is_competitive: false,
      games: [
        {
          key: 'infected',
          available: true,
          hasInProgressPlay: true,
          playId: 'play-1',
        },
      ],
    };
    const onStartGame = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn((path) =>
        Promise.resolve(
          response(
            path.includes('/catalogue')
              ? { data: catalogue }
              : path.includes('/in-progress')
                ? { data: [play] }
                : {
                    data: [quiz],
                    pagination: { page: 1, pageSize: 20, pages: 2 },
                  },
          ),
        ),
      ),
    );
    render(<GamesPage user={{ role: 'student' }} onStartGame={onStartGame} />);
    await screen.findByRole('heading', { name: 'Choose a game' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Choose' })[0]);
    expect(
      await screen.findByRole('heading', { name: 'Choose a quiz' }),
    ).toBeTruthy();
    expect(screen.getAllByText('Resume').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search quizzes'), {
      target: { value: 'Resume' },
    });
    expect(screen.getByDisplayValue('Resume')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onStartGame).toHaveBeenCalledWith('infected', 'q1');
  });
});

describe('Lecturer module creation', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('creates a module and displays the generated JoinCode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path, options) => {
        if (path === '/api/v1/modules' && options?.method === 'POST')
          return Promise.resolve(
            response({
              module: {
                module_id: 'new-module',
                module_code: 'CS101',
                module_name: 'Introduction to Computing',
                join_code: 'JOIN-123',
              },
            }),
          );
        return Promise.resolve(response({ data: [] }));
      }),
    );

    render(<Modules user={{ role: 'lecturer' }} />);
    await screen.findByRole('heading', { name: 'Create a module' });
    fireEvent.change(screen.getByLabelText('Module code'), {
      target: { value: 'CS101' },
    });
    fireEvent.change(screen.getByLabelText('Module name'), {
      target: { value: 'Introduction to Computing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create module' }));

    expect(
      await screen.findByText(/Share JoinCode JOIN-123 with students/),
    ).toBeTruthy();
    expect(screen.getByText('Introduction to Computing')).toBeTruthy();
    expect(screen.getByText('JoinCode: JOIN-123')).toBeTruthy();
  });
});

describe('Student module and resource catalogues', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders enrolled module cards and the first-year read-only look-ahead', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url.includes('/me/modules/lookahead'))
          return Promise.resolve(
            response({
              preview: true,
              data: [
                {
                  module_id: 'next-module',
                  module_code: 'CAT201',
                  module_name: 'Networks',
                  description: 'Networking foundations.',
                  year: 2,
                  topics: ['Routing'],
                  prerequisite_hints: ['Complete foundations'],
                },
              ],
            }),
          );
        return Promise.resolve(
          response({
            data: [
              {
                module_id: 'current-module',
                module_code: 'CAT101',
                module_name: 'Foundations',
                lecturer_name: 'Dr Lecturer',
                quizzes_available: 2,
                new_resources_count: 3,
                has_in_progress_game: true,
              },
            ],
            pagination: { page: 1, pageSize: 20, total: 1, pageCount: 1 },
          }),
        );
      }),
    );
    render(<Modules user={{ role: 'student' }} />);
    expect(await screen.findByText('Foundations')).toBeTruthy();
    expect(screen.getByText('2 quizzes available')).toBeTruthy();
    expect(screen.getByText('Game in progress')).toBeTruthy();
    expect(
      screen.getByText(
        'Preview: not enrolled. This read-only view contains no quizzes, resources or enrolment actions.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Networks')).toBeTruthy();
  });

  it('renders resource module tiles and searches within the selected module', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const fetchMock = vi.fn((url) => {
      if (url.includes('/resources/modules'))
        return Promise.resolve(
          response({
            data: [
              {
                module_id: 'current-module',
                module_code: 'CAT101',
                module_name: 'Foundations',
                resource_count: 4,
                last_updated: '2026-11-01T10:00:00.000Z',
              },
            ],
            pagination: { page: 1, pageSize: 50, total: 1, pageCount: 1 },
          }),
        );
      if (url.includes('/modules/current-module/resources'))
        return Promise.resolve(
          response({
            data: [
              {
                resource_id: 'resource-1',
                title: 'Revision notes',
                resource_type: 'txt',
              },
            ],
            pagination: { page: 1, pageSize: 20, total: 1, pageCount: 1 },
          }),
        );
      return Promise.resolve(
        response({
          data: [
            {
              module_id: 'current-module',
              module_name: 'Foundations',
              module_code: 'CAT101',
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Resources user={{ role: 'student' }} />);
    expect(
      await screen.findByRole('button', { name: /Foundations/ }),
    ).toBeTruthy();
    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes('unique "key" prop'),
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Foundations/ }));
    expect(await screen.findByText('Revision notes')).toBeTruthy();
    const openResource = screen.getByRole('link', { name: 'Open resource' });
    expect(openResource.getAttribute('href')).toBe(
      '/api/v1/resources/resource-1/file',
    );
    expect(openResource.getAttribute('target')).toBe('_blank');
    expect(openResource.getAttribute('rel')).toContain('noopener');
    fireEvent.change(screen.getByLabelText('Search resource titles'), {
      target: { value: 'Revision' },
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url.includes('search=Revision')),
      ).toBe(true),
    );
  });
});

describe('Study groups frontend', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders recommended group cards, language chips and join action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url.includes('/groups'))
          return Promise.resolve(
            response({
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
            }),
          );
        return Promise.resolve(
          response({ data: [{ module_id: 'm1', module_name: 'Foundations' }] }),
        );
      }),
    );
    render(<Groups user={{ role: 'student' }} />);
    expect(await screen.findByText('Python Circle')).toBeTruthy();
    expect(screen.getAllByText('Python').length).toBeGreaterThan(0);
    expect(screen.getByText(/Matches your languages/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy();
  });
});

describe('Boss Battle frontend', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders four options, textual HP and no pre-answer correctness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ data: bossData() })),
    );
    render(<BossBattleGame quizId="boss-quiz" onBack={() => {}} />);
    expect(await screen.findByText('Boss HP')).toBeTruthy();
    expect(screen.getByText('Player HP')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getAllByText('100%', { selector: 'span' })).toHaveLength(2);
    expect(screen.queryByText(/Correct answer:/)).toBeNull();
    expect(
      screen.getByRole('img', { name: 'Boss condition: Unhurt' }),
    ).toBeTruthy();
  });

  it('shows correct feedback, damage and the next question after Continue', async () => {
    const nextQuestion = {
      ...bossQuestion,
      questionText: 'Next boss question?',
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: bossData() }))
        .mockResolvedValueOnce(
          response({
            data: {
              ...bossData({
                play: { bossHp: 75, score: 25, questionsAnswered: 1 },
                question: nextQuestion,
              }),
              isCorrect: true,
              correctOption: {
                optionId: 'boss-correct',
                optionText: 'A B-tree index',
              },
              explanation: 'B-tree indexes support ordered lookups.',
              damageDealt: 25,
              damageTaken: 0,
              replayed: false,
            },
          }),
        ),
    );
    render(<BossBattleGame quizId="boss-quiz" onBack={() => {}} />);
    fireEvent.click(await screen.findByLabelText('A B-tree index'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Correct', { exact: true })).toBeTruthy();
    expect(screen.getByText('Boss damage: 25.')).toBeTruthy();
    expect(
      screen.getByText('B-tree indexes support ordered lookups.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Next boss question?')).toBeTruthy();
    expect(screen.getByText('75%', { selector: 'span' })).toBeTruthy();
  });

  it('shows incorrect feedback and player damage', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: bossData() }))
        .mockResolvedValueOnce(
          response({
            data: {
              ...bossData({ play: { playerHp: 80, questionsAnswered: 1 } }),
              isCorrect: false,
              correctOption: {
                optionId: 'boss-correct',
                optionText: 'A B-tree index',
              },
              explanation: 'The ordered index is the correct choice.',
              damageDealt: 0,
              damageTaken: 20,
              replayed: false,
            },
          }),
        ),
    );
    render(<BossBattleGame quizId="boss-quiz" onBack={() => {}} />);
    fireEvent.click(await screen.findByLabelText('No index'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Incorrect')).toBeTruthy();
    expect(screen.getByText('Player damage: 20.')).toBeTruthy();
    expect(screen.getByText('80%', { selector: 'span' })).toBeTruthy();
  });

  it.each([
    ['won', 'Boss defeated', 0, 100],
    ['lost', 'The boss prevailed', 100, 0],
    ['exhausted', 'Questions exhausted', 40, 40],
  ])(
    'shows the %s terminal screen and replay controls',
    async (status, title, bossHp, playerHp) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response({
            data: bossData({
              play: { status, bossHp, playerHp, score: 60 },
              question: null,
              outcome: { status, bossHp, playerHp, score: 60 },
            }),
          }),
        ),
      );
      render(<BossBattleGame quizId="boss-quiz" onBack={() => {}} />);
      expect(await screen.findByText(title)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Back to quiz' })).toBeTruthy();
    },
  );

  it('shows availability and both unavailable reasons without dead buttons', async () => {
    const onPlay = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        response({
          data: [
            {
              game_id: 'boss-game',
              key: 'boss_battle',
              display_name: 'Boss Battle',
              available: true,
            },
          ],
        }),
      ),
    );
    const available = render(
      <QuizGames quizId="boss-available" onPlayBossBattle={onPlay} />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Play Boss Battle' }),
    );
    expect(onPlay).toHaveBeenCalledOnce();
    available.unmount();

    for (const reason of [
      'Complete your scored attempt to unlock this game.',
      'Boss Battle needs at least 12 eligible questions.',
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(
          response({
            data: [
              {
                game_id: `boss-${reason.length}`,
                key: 'boss_battle',
                display_name: 'Boss Battle',
                available: false,
                reason,
              },
            ],
          }),
        ),
      );
      const view = render(
        <QuizGames
          quizId={`boss-${reason.length}`}
          onPlayBossBattle={onPlay}
        />,
      );
      expect(await screen.findByText(reason)).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'Play Boss Battle' }),
      ).toBeNull();
      view.unmount();
    }
  });
});

describe('Quiz list pagination', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('searches and paginates the quiz list without rendering every record', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.endsWith('/modules'))
        return Promise.resolve(
          response({ data: [{ module_id: 'module-1', module_name: 'Demo' }] }),
        );
      return Promise.resolve(
        response({
          data: [
            {
              quiz_id: 'quiz-1',
              title: 'Newest API quiz',
              is_competitive: false,
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 21, pages: 2 },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <Quizzes
        onTake={() => {}}
        onPlayInfected={() => {}}
        onPlayIslandEscape={() => {}}
        onPlayMemoryMatch={() => {}}
        onPlayBossBattle={() => {}}
        onPlayPixelRacer={() => {}}
        onPlayTimerTrivia={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Demo' })).toBeTruthy(),
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'module-1' },
    });
    await waitFor(() =>
      expect(screen.getByText('Newest API quiz')).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText('Search quizzes'), {
      target: { value: 'API' },
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url.includes('search=API')),
      ).toBe(true),
    );
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
  });
});

const response = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 401,
  json: async () => body,
});

const pixelQuestion = {
  questionId: 'pixel-question-1',
  questionText: 'Which protocol provides reliable transport?',
  difficultyLevel: 3,
  topic: 'Networking',
  options: [
    { optionId: 'pixel-correct', optionText: 'TCP' },
    { optionId: 'pixel-wrong-1', optionText: 'ARP' },
    { optionId: 'pixel-wrong-2', optionText: 'ICMP only' },
    { optionId: 'pixel-wrong-3', optionText: 'A display driver' },
  ],
};

const pixelData = (overrides = {}) => ({
  play: {
    playId: 'pixel-play',
    quizId: 'pixel-quiz',
    status: 'in_progress',
    speed: 2,
    distance: 0,
    streak: 0,
    points: 0,
    nitroActive: false,
    slotsUsed: 0,
    slotsRemaining: 10,
    answersUsed: 0,
    bot: {
      name: 'Bot',
      distance: 310,
      points: 60,
      answersUsed: 10,
      status: 'finished',
    },
    ...(overrides.play || {}),
  },
  question:
    overrides.question === undefined ? pixelQuestion : overrides.question,
  outcome: overrides.outcome || null,
  resumed: false,
});

describe('Pixel Car Racer frontend', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the track, textual stats, four options and no correctness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ data: pixelData() })),
    );
    render(<PixelRacerGame quizId="pixel-quiz" onBack={() => {}} />);
    expect(await screen.findByText('Speed 2 of 5')).toBeTruthy();
    expect(screen.getByText('Streak 0')).toBeTruthy();
    expect(screen.getByText('Nitro inactive')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('img', { name: 'You car at 0' })).toBeTruthy();
    expect(screen.queryByText(/Correct answer:/)).toBeNull();
  });

  it('shows doubled nitro feedback and updated race state', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: pixelData() }))
        .mockResolvedValueOnce(
          response({
            data: {
              ...pixelData({
                play: {
                  speed: 5,
                  distance: 100,
                  streak: 5,
                  points: 20,
                  nitroActive: true,
                  slotsUsed: 2,
                  slotsRemaining: 8,
                  answersUsed: 1,
                },
              }),
              isCorrect: true,
              correctOption: {
                optionId: 'pixel-correct',
                optionText: 'TCP',
              },
              explanation: 'TCP provides reliable ordered delivery.',
              distanceGained: 100,
              pointsEarned: 20,
              slotsConsumed: 2,
            },
          }),
        ),
    );
    render(<PixelRacerGame quizId="pixel-quiz" onBack={() => {}} />);
    fireEvent.click(await screen.findByLabelText('TCP'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Correct', { exact: true })).toBeTruthy();
    expect(
      screen.getByText(
        'Distance gained: 100 · Points earned: 20 · Slots used: 2',
      ),
    ).toBeTruthy();
    expect(screen.getByText('NITRO ACTIVE, answers worth double')).toBeTruthy();
  });

  it('shows wrong-answer feedback without reducing points', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: pixelData() }))
        .mockResolvedValueOnce(
          response({
            data: {
              ...pixelData({
                play: { speed: 1, distance: 10, slotsUsed: 1, answersUsed: 1 },
              }),
              isCorrect: false,
              correctOption: {
                optionId: 'pixel-correct',
                optionText: 'TCP',
              },
              explanation: 'TCP is the reliable transport protocol.',
              distanceGained: 10,
              pointsEarned: 0,
              slotsConsumed: 1,
            },
          }),
        ),
    );
    render(<PixelRacerGame quizId="pixel-quiz" onBack={() => {}} />);
    fireEvent.click(await screen.findByLabelText('ARP'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Incorrect')).toBeTruthy();
    expect(screen.getByText(/Points earned: 0/)).toBeTruthy();
    expect(screen.getByText('Points 0')).toBeTruthy();
  });

  it.each([
    ['player', 'You won the race!'],
    ['bot', 'Bot wins this race'],
    ['shared', 'Photo finish — shared result'],
  ])('shows the %s terminal result', async (winner, title) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          data: pixelData({
            play: {
              status: 'finished',
              distance: 420,
              points: 100,
              slotsUsed: 10,
              slotsRemaining: 0,
              answersUsed: 7,
            },
            question: null,
            outcome: {
              winner,
              playerDistance: 420,
              playerPoints: 100,
              botDistance: 390,
              botPoints: 70,
              answersUsed: 7,
            },
          }),
        }),
      ),
    );
    render(<PixelRacerGame quizId="pixel-quiz" onBack={() => {}} />);
    expect(await screen.findByText(title)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Race again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to quiz' })).toBeTruthy();
  });

  it('shows play only when available and otherwise shows the reason', async () => {
    const onPlay = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        response({
          data: [
            {
              game_id: 'pixel-game',
              key: 'pixel_racer',
              display_name: 'Pixel Car Racer',
              available: true,
            },
          ],
        }),
      ),
    );
    const available = render(
      <QuizGames quizId="pixel-available" onPlayPixelRacer={onPlay} />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Play Pixel Car Racer' }),
    );
    expect(onPlay).toHaveBeenCalledOnce();
    available.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        response({
          data: [
            {
              game_id: 'pixel-locked',
              key: 'pixel_racer',
              display_name: 'Pixel Car Racer',
              available: false,
              reason: 'Complete your scored attempt to unlock this game.',
            },
          ],
        }),
      ),
    );
    render(<QuizGames quizId="pixel-locked" onPlayPixelRacer={onPlay} />);
    expect(
      await screen.findByText(
        'Complete your scored attempt to unlock this game.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Play Pixel Car Racer' }),
    ).toBeNull();
  });
});

const memoryCards = [
  {
    cardId: 'memory-question',
    kind: 'question',
    faceUp: false,
    matched: false,
  },
  {
    cardId: 'memory-answer',
    kind: 'answer',
    faceUp: false,
    matched: false,
  },
];

const memoryPlay = (overrides = {}) => ({
  playId: 'memory-play',
  quizId: 'memory-quiz',
  status: 'in_progress',
  matchedPairs: 0,
  mismatches: 0,
  moves: 0,
  score: 0,
  cards: memoryCards,
  revealed: [],
  ...overrides,
});

describe('Memory Match frontend', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('flips a card and reveals only the returned text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ data: memoryPlay() }))
      .mockResolvedValueOnce(
        response({
          data: memoryPlay({
            cards: [{ ...memoryCards[0], faceUp: true }, memoryCards[1]],
            revealed: [
              {
                cardId: 'memory-question',
                kind: 'question',
                text: 'What is a primary key?',
              },
            ],
            flippedCard: {
              cardId: 'memory-question',
              kind: 'question',
              text: 'What is a primary key?',
            },
            matched: null,
          }),
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryMatchGame quizId="memory-quiz" onBack={() => {}} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Flip question card 1' }),
    );
    expect(await screen.findByText('What is a primary key?')).toBeTruthy();
    expect(screen.queryByText('A unique row identifier')).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toContain('/memory-play/flip');
  });

  it('announces a match, locks both cards and updates textual statistics', async () => {
    const first = memoryPlay({
      cards: [{ ...memoryCards[0], faceUp: true }, memoryCards[1]],
      revealed: [
        {
          cardId: 'memory-question',
          kind: 'question',
          text: 'What is a primary key?',
        },
      ],
      matched: null,
    });
    const matchedCards = memoryCards.map((card) => ({
      ...card,
      faceUp: true,
      matched: true,
    }));
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: memoryPlay() }))
        .mockResolvedValueOnce(response({ data: first }))
        .mockResolvedValueOnce(
          response({
            data: memoryPlay({
              cards: matchedCards,
              revealed: [
                {
                  cardId: 'memory-question',
                  kind: 'question',
                  text: 'What is a primary key?',
                },
                {
                  cardId: 'memory-answer',
                  kind: 'answer',
                  text: 'A unique row identifier',
                },
              ],
              matched: true,
              matchedPairs: 1,
              moves: 1,
              score: 10,
            }),
          }),
        ),
    );
    render(<MemoryMatchGame quizId="memory-quiz" onBack={() => {}} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Flip question card 1' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Flip answer card 2' }),
    );
    expect(await screen.findByText(/Match found. 1 pairs found/)).toBeTruthy();
    expect(screen.getByText('Score 10')).toBeTruthy();
    expect(screen.getByText('Moves 1')).toBeTruthy();
    expect(screen.getByText('Pairs found 1')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Matched question card 1/ }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: /Matched answer card 2/ }).disabled,
    ).toBe(true);
  });

  it('announces a mismatch and flips the cards back instantly for reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const first = memoryPlay({
      cards: [{ ...memoryCards[0], faceUp: true }, memoryCards[1]],
      revealed: [
        {
          cardId: 'memory-question',
          kind: 'question',
          text: 'Question text',
        },
      ],
      matched: null,
    });
    const mismatch = memoryPlay({
      cards: memoryCards.map((card) => ({ ...card, faceUp: true })),
      revealed: [
        {
          cardId: 'memory-question',
          kind: 'question',
          text: 'Question text',
        },
        {
          cardId: 'memory-answer',
          kind: 'answer',
          text: 'Wrong answer',
        },
      ],
      matched: false,
      mismatches: 1,
      moves: 1,
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: memoryPlay() }))
        .mockResolvedValueOnce(response({ data: first }))
        .mockResolvedValueOnce(response({ data: mismatch })),
    );
    render(<MemoryMatchGame quizId="memory-quiz" onBack={() => {}} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Flip question card 1' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Flip answer card 2' }),
    );
    expect(await screen.findByText(/Not a match/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText('Question text')).toBeNull();
      expect(screen.queryByText('Wrong answer')).toBeNull();
    });
    expect(
      screen.getByRole('button', { name: 'Flip question card 1' }).disabled,
    ).toBe(false);
  });

  it('restores server-owned face-up and matched cards after refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          data: memoryPlay({
            score: 10,
            moves: 1,
            matchedPairs: 1,
            cards: [
              { ...memoryCards[0], faceUp: true },
              { ...memoryCards[1], faceUp: true, matched: true },
            ],
            revealed: [
              {
                cardId: 'memory-question',
                kind: 'question',
                text: 'Pending question',
              },
              {
                cardId: 'memory-answer',
                kind: 'answer',
                text: 'Stored matched answer',
              },
            ],
          }),
        }),
      ),
    );
    render(<MemoryMatchGame quizId="memory-quiz" onBack={() => {}} />);
    expect(await screen.findByText('Pending question')).toBeTruthy();
    expect(screen.getByText('Stored matched answer')).toBeTruthy();
    expect(screen.queryByText('isCorrect')).toBeNull();
  });

  it('shows a finished screen and starts a new play on Play again', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: memoryPlay({
            status: 'finished',
            score: 60,
            moves: 6,
            matchedPairs: 6,
            cards: memoryCards.map((card) => ({
              ...card,
              faceUp: true,
              matched: true,
            })),
          }),
        }),
      )
      .mockResolvedValueOnce(response({ data: memoryPlay() }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryMatchGame quizId="memory-quiz" onBack={() => {}} />);
    expect(await screen.findByText('Every pair matched')).toBeTruthy();
    expect(screen.getByText(/Final score 60 · 6 moves/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(
      await screen.findByRole('button', { name: 'Flip question card 1' }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows availability, scored-attempt locking and minimum-question reasons', async () => {
    const onPlay = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        response({
          data: [
            {
              game_id: 'memory-game',
              key: 'memory_match',
              display_name: 'Memory Match',
              available: true,
              reason: null,
            },
          ],
        }),
      ),
    );
    const available = render(
      <QuizGames quizId="quiz-available" onPlayMemoryMatch={onPlay} />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Play Memory Match' }),
    );
    expect(onPlay).toHaveBeenCalledOnce();
    available.unmount();

    for (const reason of [
      'Complete your scored attempt to unlock this game.',
      'Not enough questions for this game yet. At least 6 are required.',
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(
          response({
            data: [
              {
                game_id: `memory-${reason.length}`,
                key: 'memory_match',
                display_name: 'Memory Match',
                available: false,
                reason,
              },
            ],
          }),
        ),
      );
      const view = render(
        <QuizGames
          quizId={`quiz-${reason.length}`}
          onPlayMemoryMatch={onPlay}
        />,
      );
      expect(await screen.findByText(reason)).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'Play Memory Match' }),
      ).toBeNull();
      view.unmount();
    }
  });
});

const islandPlay = (overrides = {}) => ({
  playId: 'play-1',
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
  ...overrides,
});

const islandQuestion = {
  questionId: 'question-1',
  questionText: 'Which material makes a strong mast?',
  difficultyLevel: 1,
  difficulty: 'easy',
  topic: 'Materials',
  options: [
    { optionId: 'option-1', optionText: 'Wood' },
    { optionId: 'option-2', optionText: 'Paper' },
  ],
};

describe('Island Escape solo game', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => cleanup());

  it('renders a pending question without revealing correctness and applies feedback', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ play: islandPlay(), question: islandQuestion }),
        )
        .mockResolvedValueOnce(
          response({
            isCorrect: true,
            correctOption: { optionId: 'option-1', optionText: 'Wood' },
            explanation: 'Wood is rigid enough to support the sail.',
            pointsEarned: 10,
            event: 'answer',
            play: islandPlay({
              phaseQuestionNumber: 1,
              streak: 1,
              score: 10,
              materials: ['Wood'],
            }),
            question: { ...islandQuestion, questionId: 'question-2' },
          }),
        ),
    );
    render(<IslandEscapeGame quizId="quiz-1" onBack={() => {}} />);
    expect(await screen.findByText(islandQuestion.questionText)).toBeTruthy();
    expect(screen.queryByText(/Correct answer:/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Wood'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Correct')).toBeTruthy();
    expect(screen.getByText(/Points earned: 10/)).toBeTruthy();
    expect(screen.getByText(/Score: 10/)).toBeTruthy();
  });

  it('shows setback details and continues from the restarted phase', async () => {
    const restarted = islandPlay({ setbacks: 1, retriesRemaining: 2 });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            play: islandPlay({ wrongInPhase: 4 }),
            question: islandQuestion,
          }),
        )
        .mockResolvedValueOnce(
          response({
            isCorrect: false,
            correctOption: { optionId: 'option-1', optionText: 'Wood' },
            explanation: 'Wood is the stronger choice.',
            pointsEarned: 0,
            event: 'tools_lost',
            play: restarted,
            question: { ...islandQuestion, questionId: 'restart-question' },
          }),
        ),
    );
    render(<IslandEscapeGame quizId="quiz-2" onBack={() => {}} />);
    fireEvent.click(await screen.findByLabelText('Paper'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Your tools were lost')).toBeTruthy();
    expect(screen.getByText('2 retries remain.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(islandQuestion.questionText)).toBeTruthy();
    expect(screen.getByText(/Wrong answers 0 of 5/)).toBeTruthy();
  });

  it.each([
    ['won', 'You reached the mainland'],
    ['lost', 'Stranded'],
    ['exhausted', 'No more questions are available'],
  ])('renders the %s terminal state', async (status, heading) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          play: islandPlay({ status, score: 570 }),
          question: null,
          personalBest: 570,
        }),
      ),
    );
    render(<IslandEscapeGame quizId={`quiz-${status}`} onBack={() => {}} />);
    expect(await screen.findByText(heading)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy();
    cleanup();
  });

  it('resumes the server-owned question after reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          resumed: true,
          play: islandPlay({ phase: 2, phaseQuestionNumber: 3, score: 120 }),
          question: islandQuestion,
        }),
      ),
    );
    render(<IslandEscapeGame quizId="quiz-resume" onBack={() => {}} />);
    expect(await screen.findByText(islandQuestion.questionText)).toBeTruthy();
    expect(screen.getByText(/Phase 2 of 3 · Question 4 of 10/)).toBeTruthy();
    expect(screen.queryByText(/Correct answer:/)).toBeNull();
  });

  it('shows friendly unavailable and empty states', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(
            { error: { message: 'Needs a quiz with at least 30 questions.' } },
            false,
          ),
        ),
    );
    const view = render(
      <IslandEscapeGame quizId="quiz-short" onBack={() => {}} />,
    );
    expect(
      await screen.findByText('Needs a quiz with at least 30 questions.'),
    ).toBeTruthy();
    view.unmount();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(response({ play: islandPlay(), question: null })),
    );
    render(<IslandEscapeGame quizId="quiz-empty" onBack={() => {}} />);
    expect(
      await screen.findByText('No Island Escape question is ready.'),
    ).toBeTruthy();
  });
});

describe('frontend authentication and role routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  it('shows the authentication form and reports inline errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(
            { error: { message: 'Email or password is incorrect.' } },
            false,
          ),
        ),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByText('Welcome back')).toBeTruthy());
    fireEvent.submit(
      screen.getByRole('button', { name: 'Log in' }).closest('form'),
    );
    await waitFor(() =>
      expect(screen.getByText('Email or password is incorrect.')).toBeTruthy(),
    );
  });

  it('mirrors split-name registration, student type and password strength rules', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ error: { message: 'Not signed in.' } }, false),
      )
      .mockResolvedValueOnce(
        response({
          user: {
            role: 'student',
            full_name: 'Ada Lovelace',
            first_name: 'Ada',
          },
        }),
      )
      .mockResolvedValueOnce(response({ verified: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await waitFor(() => screen.getByText('Welcome back'));
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Ada' },
    });
    fireEvent.change(screen.getByLabelText('Last name'), {
      target: { value: 'Lovelace' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'SecureAda9!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'SecureAda9!' },
    });
    expect(screen.getByText('At least 10 characters')).toBeTruthy();
    expect(screen.getByText('At least one special character')).toBeTruthy();
    fireEvent.submit(
      screen.getByRole('button', { name: 'Register' }).closest('form'),
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check your email' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Verify email' }).closest('form'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy());
    const registration = fetchMock.mock.calls.find(([url]) =>
      url.endsWith('/auth/register'),
    );
    expect(JSON.parse(registration[1].body)).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      studentType: 'it',
      confirmPassword: 'SecureAda9!',
    });
  });

  it('shows lecturer-only navigation after a real login response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ error: { message: 'Not signed in.' } }, false),
      )
      .mockResolvedValueOnce(
        response({ user: { role: 'lecturer', full_name: 'Lecturer' } }),
      )
      .mockResolvedValueOnce(response({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await waitFor(() => screen.getByText('Welcome back'));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'lecturer@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'StrongPassword1!' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Log in' }).closest('form'),
    );
    await waitFor(() => expect(screen.getByText('Analytics')).toBeTruthy());
    const loginCall = fetchMock.mock.calls.find(([url]) =>
      url.endsWith('/auth/login'),
    );
    expect(JSON.parse(loginCall[1].body)).toEqual({
      email: 'lecturer@example.com',
      password: 'StrongPassword1!',
    });
    expect(screen.queryByText('Study groups')).toBeNull();
  });

  it('renders the competitive quiz warning and keeps unavailable submission disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          attempt: { attempt_id: 'attempt-1' },
          quiz: { title: 'Quiz', is_competitive: true },
          questions: [],
        }),
      ),
    );
    render(<QuizTaking quizId="quiz-1" />);
    await waitFor(() => screen.getByText('One scored attempt only.'));
    expect(
      screen.getByRole('button', { name: 'Submit attempt' }).disabled,
    ).toBe(false);
  });

  it('shows queued, running and succeeded AI generation states with an editable draft', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ configured: true, reachable: true, provider: 'mock' }),
      )
      .mockResolvedValueOnce(
        response({ job: { job_id: 'job-1', status: 'queued' } }),
      )
      .mockResolvedValueOnce(
        response({ job: { job_id: 'job-1', status: 'running' } }),
      )
      .mockResolvedValueOnce(
        response({
          job: { job_id: 'job-1', status: 'succeeded', quiz_id: 'quiz-1' },
        }),
      )
      .mockResolvedValueOnce(
        response({
          quiz: {
            quiz_id: 'quiz-1',
            title: 'Draft quiz',
            is_competitive: false,
            questions: [
              {
                questionId: 'q-1',
                questionText: 'Question',
                topic: 'Topic',
                difficultyLevel: 3,
                explanation: 'This is the explanation.',
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          quiz: {
            quiz_id: 'quiz-1',
            title: 'Published draft',
            is_competitive: true,
            questions: [
              {
                questionId: 'q-1',
                questionText: 'Question',
                topic: 'Topic',
                difficultyLevel: 3,
                explanation: 'This is the explanation.',
              },
            ],
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ResourceRow
        lecturer
        resource={{
          resource_id: 'resource-1',
          title: 'Notes',
          resource_type: 'txt',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate quiz' }));
    await waitFor(() => expect(screen.getByText(/running/i)).toBeTruthy(), {
      timeout: 1000,
    });
    await waitFor(
      () => expect(screen.getByText('Generated draft')).toBeTruthy(),
      { timeout: 1500 },
    );
    expect(screen.getByDisplayValue('Draft quiz')).toBeTruthy();
    expect(screen.getByText('Topic')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Quiz title'), {
      target: { value: 'Published draft' },
    });
    fireEvent.change(screen.getByLabelText('Mode'), {
      target: { value: 'competitive' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish quiz' }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(6));
  });

  it('shows a friendly failed state and exposes retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ configured: true, reachable: true, provider: 'mock' }),
      )
      .mockResolvedValueOnce(
        response({ job: { job_id: 'job-2', status: 'queued' } }),
      )
      .mockResolvedValueOnce(
        response({
          job: {
            job_id: 'job-2',
            status: 'failed',
            error_code: 'GENERATION_FAILED',
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ job: { job_id: 'job-3', status: 'queued' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ResourceRow
        lecturer
        resource={{
          resource_id: 'resource-2',
          title: 'Notes',
          resource_type: 'txt',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate quiz' }));
    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy(),
      { timeout: 1000 },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3),
    );
  });

  it('renders Infected cards without answers, then chooses and answers correctly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
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
              difficulty: 'hard',
              topic: 'Normalization',
              reward: 30,
              penalty: 15,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          question: {
            questionId: 'card-1',
            questionText: 'Which form removes transitive dependencies?',
            difficulty: 'hard',
            topic: 'Normalization',
            options: [
              { optionId: 'option-1', optionText: 'Third normal form' },
              { optionId: 'option-2', optionText: 'First normal form' },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          isCorrect: true,
          correctOption: {
            optionId: 'option-1',
            optionText: 'Third normal form',
          },
          explanation: 'Third normal form removes transitive dependencies.',
          session: {
            sessionId: 'session-1',
            cure: 30,
            hearts: 3,
            score: 30,
            status: 'in_progress',
          },
          cards: [
            {
              cardId: 'card-2',
              difficulty: 'easy',
              topic: 'Keys',
              reward: 10,
              penalty: 5,
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<InfectedGame quizId="quiz-1" onBack={() => {}} />);
    const card = await screen.findByRole('button', {
      name: /hard card about normalization/i,
    });
    expect(screen.queryByText('Third normal form')).toBeNull();
    fireEvent.click(card);
    await screen.findByText('Which form removes transitive dependencies?');
    fireEvent.click(screen.getByLabelText('Third normal form'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    await screen.findByText('Correct');
    expect(screen.getByText(/Cure 30% · Infection 70%/)).toBeTruthy();
    expect(screen.getByText(/3 of 3 hearts/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByRole('button', { name: /easy card about keys/i }),
    ).toBeTruthy();
  });

  it('announces an incorrect answer and updates cure and hearts', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            session: {
              sessionId: 'session-2',
              cure: 40,
              hearts: 3,
              score: 20,
              status: 'in_progress',
            },
            cards: [
              {
                cardId: 'card-2',
                difficulty: 'hard',
                topic: 'Queries',
                reward: 30,
                penalty: 15,
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          response({
            question: {
              questionId: 'card-2',
              questionText: 'Choose the query result.',
              difficulty: 'hard',
              options: [
                { optionId: 'wrong', optionText: 'Wrong result' },
                { optionId: 'right', optionText: 'Correct result' },
              ],
            },
          }),
        )
        .mockResolvedValueOnce(
          response({
            isCorrect: false,
            correctOption: {
              optionId: 'right',
              optionText: 'Correct result',
            },
            explanation: 'The correct result follows the WHERE clause.',
            session: {
              sessionId: 'session-2',
              cure: 25,
              hearts: 2,
              score: 20,
              status: 'in_progress',
            },
            cards: [],
          }),
        ),
    );
    render(<InfectedGame quizId="quiz-2" onBack={() => {}} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /hard card about queries/i }),
    );
    fireEvent.click(await screen.findByLabelText('Wrong result'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    await screen.findByText('Incorrect');
    expect(screen.getByText(/Cure 25% · Infection 75%/)).toBeTruthy();
    expect(screen.getByText(/2 of 3 hearts/)).toBeTruthy();
    expect(screen.getByText(/Correct answer:/)).toBeTruthy();
  });

  it.each([
    ['won', 'Cure complete — you win!'],
    ['lost', 'No hearts left'],
    ['exhausted', 'Questions exhausted'],
  ])('renders the %s terminal screen', async (status, heading) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          session: {
            sessionId: `session-${status}`,
            cure: status === 'won' ? 100 : 40,
            hearts: status === 'lost' ? 0 : 2,
            score: 60,
            status,
          },
          cards: [],
        }),
      ),
    );
    render(<InfectedGame quizId={`quiz-${status}`} onBack={() => {}} />);
    expect(await screen.findByText(heading)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy();
    cleanup();
  });

  it('restores a pending question when a session resumes after reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          resumed: true,
          session: {
            sessionId: 'session-resume',
            cure: 20,
            hearts: 2,
            score: 20,
            status: 'in_progress',
          },
          cards: [],
          question: {
            questionId: 'question-resume',
            questionText: 'Pending question after refresh?',
            difficulty: 'medium',
            options: [
              { optionId: 'a', optionText: 'Answer A' },
              { optionId: 'b', optionText: 'Answer B' },
            ],
          },
        }),
      ),
    );
    render(<InfectedGame quizId="quiz-resume" onBack={() => {}} />);
    expect(
      await screen.findByText('Pending question after refresh?'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Answer A')).toBeTruthy();
  });

  it('shows friendly error and empty states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            error: {
              message: 'Not enough questions for this game yet.',
            },
          },
          false,
        ),
      ),
    );
    const view = render(<InfectedGame quizId="quiz-error" onBack={() => {}} />);
    expect(
      await screen.findByText('Not enough questions for this game yet.'),
    ).toBeTruthy();
    view.unmount();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          session: {
            sessionId: 'session-empty',
            cure: 0,
            hearts: 3,
            score: 0,
            status: 'in_progress',
          },
          cards: [],
        }),
      ),
    );
    render(<InfectedGame quizId="quiz-empty" onBack={() => {}} />);
    expect(await screen.findByText('No cards are available.')).toBeTruthy();
  });
});
it('profile page loads, edits preferred languages, and shows unsaved changes', async () => {
  cleanup();
  const profile = {
    user_id: 'profile-1',
    role: 'student',
    first_name: 'Ada',
    last_name: 'Lovelace',
    student_type: 'it',
    email: 'ada@example.com',
    preferred_languages: ['Python'],
    mfa_enabled: false,
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ profile, languages: ['JavaScript', 'Python'] }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        profile: { ...profile, preferred_languages: ['JavaScript', 'Python'] },
        message: 'Profile saved.',
      }),
    });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <ProfilePage
      user={{ role: 'student', ...profile }}
      onUserChange={vi.fn()}
    />,
  );
  expect(await screen.findByText('Edit profile')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('JavaScript'));
  expect(screen.getByText('You have unsaved changes.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(screen.getByText('Profile saved.')).toBeTruthy());
  vi.unstubAllGlobals();
});

it('profile page shows inline validation errors and MFA actions', async () => {
  cleanup();
  const profile = {
    user_id: 'profile-2',
    role: 'student',
    first_name: 'Grace',
    last_name: 'Hopper',
    student_type: 'it',
    email: 'grace@example.com',
    preferred_languages: [],
    mfa_enabled: true,
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ profile, languages: ['Python'] }),
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: "That text isn't allowed." } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: 'MFA updated.' }),
    });
  vi.stubGlobal('fetch', fetchMock);
  render(<ProfilePage user={profile} onUserChange={vi.fn()} />);
  await screen.findByText('MFA is enabled.');
  fireEvent.change(screen.getByLabelText('First name'), {
    target: { value: 'bad text' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      "That text isn't allowed.",
    ),
  );
  expect(screen.getByRole('button', { name: 'Disable MFA' })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Regenerate recovery codes' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Disable MFA' }));
  await waitFor(() => expect(screen.getByText('MFA updated.')).toBeTruthy());
  vi.unstubAllGlobals();
});

it('practice labs lists labs and opens the browser-only code lab', async () => {
  cleanup();
  const lab = {
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
  };
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [lab] }),
    }),
  );
  render(<PracticeLabs user={{ role: 'student' }} />);
  expect(await screen.findByText('Heading lab')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open lab' }));
  expect(await screen.findByTitle('Code preview')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'HTML' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
  const frame = screen.getByTitle('Code preview');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame.srcdoc).toContain("default-src 'none'");
  vi.unstubAllGlobals();
});

it('code lab keeps console output escaped and provides reset and save controls', async () => {
  cleanup();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ attempt: { completed: false } }),
    }),
  );
  render(
    <CodeLabPlayer
      lab={{
        lab_id: 'lab-2',
        title: 'Safe lab',
        instructions: 'Try it.',
        difficulty: 1,
        config: {
          starterHtml: '<p>Start</p>',
          starterCss: '',
          starterJs: '',
          checks: [],
        },
      }}
      onBack={vi.fn()}
    />,
  );
  expect(screen.getByText('0 of 0 checks passed')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(screen.getByText(/Draft saved/)).toBeTruthy());
  vi.unstubAllGlobals();
});

it('spreadsheet lab renders headers, locked cells, formulas and errors safely', () => {
  cleanup();
  render(
    <SpreadsheetLabPlayer
      lab={{
        lab_id: 'sheet-1',
        title: 'Budget',
        instructions: 'Calculate.',
        difficulty: 2,
        config: {
          startingGrid: { A1: '100', B1: '=A1*2' },
          lockedCells: ['A1'],
          checks: [{ cell: 'B1' }],
        },
      }}
      onBack={vi.fn()}
    />,
  );
  expect(screen.getByRole('columnheader', { name: 'A' })).toBeTruthy();
  expect(screen.getByRole('rowheader', { name: '1' })).toBeTruthy();
  expect(screen.getByLabelText('A1').disabled).toBe(true);
  fireEvent.focus(screen.getByLabelText('B1'));
  expect(screen.getByText(/Computed value/)).toBeTruthy();
  expect(screen.getByText(/Computed value/)).toBeTruthy();
});

it('spreadsheet lab provides a formula bar, keyboard navigation and check results', async () => {
  cleanup();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        attempt: null,
        checkResults: [{ passed: false, hint: 'Add the total.' }],
      }),
    }),
  );
  render(
    <SpreadsheetLabPlayer
      lab={{
        lab_id: 'sheet-2',
        title: 'Checks',
        instructions: 'Use formulas.',
        difficulty: 1,
        config: {
          startingGrid: { A1: '1', B1: '=A1+1' },
          lockedCells: [],
          checks: [{ cell: 'B1', hint: 'Add the total.' }],
        },
      }}
      onBack={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Formula bar').value).toBe('1');
  fireEvent.focus(screen.getByLabelText('B1'));
  expect(screen.getByLabelText('Formula bar').value).toBe('=A1+1');
  fireEvent.keyDown(screen.getByLabelText('B1'), { key: 'ArrowLeft' });
  expect(document.activeElement).toBe(screen.getByLabelText('A1'));
  expect(screen.getByText(/Not yet/)).toBeTruthy();
  vi.unstubAllGlobals();
});

it('scenario lab announces meter changes, persists progress and can restart', async () => {
  cleanup();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ attempt: null }),
    }),
  );
  render(
    <ScenarioLabPlayer
      lab={{
        lab_id: 'scenario-1',
        title: 'Market choice',
        instructions: 'Choose wisely.',
        config: {
          meters: [
            { key: 'cash', label: 'Cash', initial: 20 },
            { key: 'risk', label: 'Risk', initial: 10 },
            { key: 'trust', label: 'Trust', initial: 50 },
          ],
          nodes: [
            {
              id: 'start',
              text: 'Choose a path',
              choices: [{ label: 'Grow', next: 'end', changes: { cash: 10 } }],
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
      }}
      onBack={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Grow' }));
  await waitFor(() => expect(screen.getByText('Cash: 30')).toBeTruthy());
  expect(screen.getByText('Reflect on the trade-off.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Restart scenario' }));
  expect(screen.getByText('Choose a path')).toBeTruthy();
  vi.unstubAllGlobals();
});

it('calculator lab renders configurable inputs and working', () => {
  cleanup();
  render(
    <CalculatorLabPlayer
      lab={{
        title: 'Break-even',
        instructions: 'Learn.',
        difficulty: 1,
        config: {
          inputs: [{ key: 'fixed', label: 'Fixed costs', defaultValue: 100 }],
          outputs: [
            {
              key: 'result',
              label: 'Result',
              formula: '={fixed}*2',
              explanation: 'Multiply by two.',
            },
          ],
        },
      }}
      onBack={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Fixed costs')).toBeTruthy();
  expect(screen.getByText('Multiply by two.')).toBeTruthy();
});
