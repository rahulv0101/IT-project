// @ts-nocheck - integration suite drives runtime Express and PostgreSQL records.
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'development';
process.env.COOKIE_SECURE = 'false';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { app } = await import('../src/app.js');
const { pool } = await import('../db.js');

const prefix = crypto.randomUUID().slice(0, 8);
const password = 'MemoryMatch123!';
const people = {
  lecturer: `${prefix}-memory-lecturer@example.com`,
  otherLecturer: `${prefix}-memory-other-lecturer@example.com`,
  student: `${prefix}-memory-student@example.com`,
  otherStudent: `${prefix}-memory-other-student@example.com`,
  locked: `${prefix}-memory-locked@example.com`,
  outsider: `${prefix}-memory-outsider@example.com`,
};
const fixture = { texts: new Map() };

async function addUser(name, role) {
  const userId = (
    await pool.query(
      `INSERT INTO users(email,password_hash,role,full_name)
       VALUES($1,$2,$3,$4) RETURNING user_id`,
      [people[name], await bcrypt.hash(password, 4), role, `Memory ${name}`],
    )
  ).rows[0].user_id;
  fixture[name] = userId;
  return userId;
}

async function addQuiz(
  moduleId,
  lecturerId,
  title,
  count,
  competitive = false,
) {
  const quizId = (
    await pool.query(
      `INSERT INTO quizzes(module_id,created_by,title,is_competitive,status)
       VALUES($1,$2,$3,$4,'published') RETURNING quiz_id`,
      [moduleId, lecturerId, title, competitive],
    )
  ).rows[0].quiz_id;
  const texts = [];
  for (let index = 0; index < count; index += 1) {
    const questionText = `${title} question ${index + 1}?`;
    const answerText = `${title} answer ${index + 1}`;
    const questionId = (
      await pool.query(
        `INSERT INTO questions(quiz_id,question_text,marks,difficulty_level,explanation)
         VALUES($1,$2,1,3,$3) RETURNING question_id`,
        [quizId, questionText, `${title} explanation ${index + 1}.`],
      )
    ).rows[0].question_id;
    await pool.query(
      `INSERT INTO question_options(question_id,option_text,is_correct)
       VALUES($1,$2,true),($1,$3,false)`,
      [questionId, answerText, `${title} distractor ${index + 1}`],
    );
    texts.push(questionText, answerText);
  }
  fixture.texts.set(quizId, texts);
  return quizId;
}

async function login(name) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({
    email: people[name],
    password,
  });
  expect(response.status).toBe(200);
  return agent;
}

async function start(agent, quizId) {
  return agent.post('/api/v1/games/memory-match/plays').send({ quizId });
}

async function freshPlay(title) {
  const quizId = await addQuiz(
    fixture.module,
    fixture.lecturer,
    `${title} ${crypto.randomUUID().slice(0, 6)}`,
    6,
  );
  const agent = await login('student');
  const started = await start(agent, quizId);
  expect(started.status).toBe(200);
  return { agent, quizId, playId: started.body.data.playId, started };
}

async function playState(playId) {
  return (
    await pool.query('SELECT state FROM game_plays WHERE play_id=$1', [playId])
  ).rows[0].state;
}

function pairs(state) {
  return [...new Set(state.cards.map((card) => card.pairKey))].map((pairKey) =>
    state.cards.filter((card) => card.pairKey === pairKey),
  );
}

async function flip(agent, playId, cardId, body = { cardId }) {
  return agent
    .post(`/api/v1/games/memory-match/plays/${playId}/flip`)
    .send(body);
}

async function clearPlay(agent, playId) {
  const state = await playState(playId);
  let response;
  for (const pair of pairs(state)) {
    expect((await flip(agent, playId, pair[0].cardId)).status).toBe(200);
    response = await flip(agent, playId, pair[1].cardId);
    expect(response.status).toBe(200);
    expect(response.body.data.matched).toBe(true);
  }
  return response;
}

function expectNoHiddenText(response, state) {
  const serialized = JSON.stringify(response.body);
  const visible = new Set(
    (response.body.data?.revealed ?? []).map((card) => card.cardId),
  );
  if (response.body.data?.flippedCard)
    visible.add(response.body.data.flippedCard.cardId);
  for (const card of state.cards)
    if (!visible.has(card.cardId)) expect(serialized).not.toContain(card.text);
}

beforeAll(async () => {
  await pool.query(
    "UPDATE game_types SET is_enabled=true WHERE key='memory_match'",
  );
  await addUser('lecturer', 'lecturer');
  await addUser('otherLecturer', 'lecturer');
  for (const name of ['student', 'otherStudent', 'locked', 'outsider'])
    await addUser(name, 'student');
  fixture.module = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Memory Module',$3) RETURNING module_id`,
      [fixture.lecturer, `MM${prefix}`, `MMJOIN${prefix}`],
    )
  ).rows[0].module_id;
  fixture.otherModule = (
    await pool.query(
      `INSERT INTO modules(lecturer_id,module_code,module_name,join_code)
       VALUES($1,$2,'Other Memory Module',$3) RETURNING module_id`,
      [fixture.otherLecturer, `OM${prefix}`, `OMJOIN${prefix}`],
    )
  ).rows[0].module_id;
  for (const name of ['student', 'otherStudent', 'locked'])
    await pool.query(
      'INSERT INTO enrollments(student_id,module_id) VALUES($1,$2)',
      [fixture[name], fixture.module],
    );
  fixture.practice = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Memory Practice',
    6,
  );
  fixture.short = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Memory Short',
    1,
  );
  fixture.competitive = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Memory Competitive',
    6,
    true,
  );
  fixture.isolation = await addQuiz(
    fixture.module,
    fixture.lecturer,
    'Memory Isolation',
    6,
  );
  fixture.otherQuiz = await addQuiz(
    fixture.otherModule,
    fixture.otherLecturer,
    'Other Memory Quiz',
    6,
  );
});

describe.sequential('Memory Match start and refresh API', () => {
  it('start creates a play and returns opaque card ids and kinds only', async () => {
    const response = await start(await login('student'), fixture.practice);
    expect(response.status).toBe(200);
    fixture.playId = response.body.data.playId;
    expect(response.body.data.cards).toHaveLength(12);
    for (const card of response.body.data.cards) {
      expect(card.cardId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(['question', 'answer']).toContain(card.kind);
      expect(card).not.toHaveProperty('text');
      expect(card).not.toHaveProperty('questionId');
      expect(card).not.toHaveProperty('pairKey');
    }
    expect(response.body.data.revealed).toEqual([]);
  });

  it('starting again returns the same in-progress play instead of a second one', async () => {
    const agent = await login('student');
    const first = await start(agent, fixture.practice);
    const second = await start(agent, fixture.practice);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.playId).toBe(first.body.data.playId);
    const count = await pool.query(
      `SELECT count(*)::int AS count FROM game_plays p JOIN game_types gt ON gt.game_type_id=p.game_type_id
       WHERE gt.key='memory_match' AND p.student_id=$1 AND p.quiz_id=$2 AND p.status='in_progress'`,
      [fixture.student, fixture.practice],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it('explains why a quiz with only one usable pair cannot start', async () => {
    const response = await start(await login('student'), fixture.short);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: expect.objectContaining({
        code: 'NOT_ENOUGH_QUESTIONS',
        message: expect.stringContaining(
          'at least 2 questions with different correct answers',
        ),
      }),
    });
  });

  it('plays shorter quizzes with two to five distinct pairs and agrees with the picker', async () => {
    const agent = await login('student');
    for (const count of [2, 3, 5]) {
      const quizId = await addQuiz(
        fixture.module,
        fixture.lecturer,
        `Short board ${crypto.randomUUID().slice(0, 6)}`,
        count,
      );
      const available = await agent.get(`/api/v1/quizzes/${quizId}/games`);
      expect(available.status).toBe(200);
      const memory = available.body.data.find((g) => g.key === 'memory_match');
      expect(memory).toMatchObject({
        available: true,
        minimum_questions: 2,
        questionCount: count,
        eligible_question_count: count,
      });
      const play = await start(agent, quizId);
      expect(play.status).toBe(200);
      expect(play.body.data.cards).toHaveLength(count * 2);
    }
  });
  it('keeps long AI-style questions and answers eligible without exposing their hidden text', async () => {
    const quizId = await addQuiz(
      fixture.module,
      fixture.lecturer,
      'Long memory content',
      3,
    );
    await pool.query(
      "UPDATE questions SET question_text=question_text||repeat(' Explain the database design in this scenario.',8) WHERE quiz_id=$1",
      [quizId],
    );
    await pool.query(
      "UPDATE question_options SET option_text=option_text||repeat(' Detailed explanation of relational design.',5) WHERE is_correct=true AND question_id IN(SELECT question_id FROM questions WHERE quiz_id=$1)",
      [quizId],
    );
    const agent = await login('student');
    const availability = await agent.get(`/api/v1/quizzes/${quizId}/games`);
    expect(
      availability.body.data.find((g) => g.key === 'memory_match'),
    ).toMatchObject({ available: true, questionCount: 3 });
    const response = await start(agent, quizId);
    expect(response.status).toBe(200);
    expect(response.body.data.cards).toHaveLength(6);
    const state = await playState(response.body.data.playId);
    expect(
      state.cards.some((c) => c.kind === 'question' && c.text.length > 140),
    ).toBe(true);
    expect(
      state.cards.some((c) => c.kind === 'answer' && c.text.length > 60),
    ).toBe(true);
    expectNoHiddenText(response, state);
    expect(
      (await clearPlay(agent, response.body.data.playId)).body.data.status,
    ).toBe('finished');
  });
  it('normalizes duplicate answers consistently in the picker and dealing endpoint', async () => {
    const quizId = await addQuiz(
      fixture.module,
      fixture.lecturer,
      'Duplicate memory answers',
      5,
    );
    const ids = (
      await pool.query(
        'SELECT question_id FROM questions WHERE quiz_id=$1 ORDER BY question_id',
        [quizId],
      )
    ).rows;
    for (let i = 0; i < ids.length; i++)
      await pool.query(
        'UPDATE question_options SET option_text=$2 WHERE question_id=$1 AND is_correct=true',
        [
          ids[i].question_id,
          [
            'Same answer',
            ' same   ANSWER ',
            'Same answer',
            'Same answer',
            'Same answer',
          ][i],
        ],
      );
    const agent = await login('student');
    const availability = await agent.get(`/api/v1/quizzes/${quizId}/games`);
    expect(
      availability.body.data.find((g) => g.key === 'memory_match'),
    ).toMatchObject({ available: false, questionCount: 1 });
    const response = await start(agent, quizId);
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('1 usable pair');
  });
  it('samples different questions across plays instead of always the same six', async () => {
    const quizId = await addQuiz(
      fixture.module,
      fixture.lecturer,
      `Memory Large ${crypto.randomUUID().slice(0, 6)}`,
      20,
    );
    const seen = new Set();
    for (const name of ['student', 'otherStudent', 'locked']) {
      const started = await start(await login(name), quizId);
      expect(started.status).toBe(200);
      const state = await playState(started.body.data.playId);
      expect(pairs(state)).toHaveLength(6);
      for (const card of state.cards) seen.add(card.questionId);
    }
    expect(seen.size).toBeGreaterThan(6);
  });

  it('never deals two answer cards with identical text', async () => {
    const quizId = await addQuiz(
      fixture.module,
      fixture.lecturer,
      `Memory Dupes ${crypto.randomUUID().slice(0, 6)}`,
      10,
    );
    await pool.query(
      `UPDATE question_options SET option_text='True'
       WHERE is_correct=true AND question_id IN (
         SELECT question_id FROM questions WHERE quiz_id=$1 ORDER BY question_id LIMIT 4)`,
      [quizId],
    );
    const started = await start(await login('student'), quizId);
    expect(started.status).toBe(200);
    const answers = (await playState(started.body.data.playId)).cards
      .filter((card) => card.kind === 'answer')
      .map((card) => card.text.toLowerCase());
    expect(new Set(answers).size).toBe(answers.length);
  });

  it('counts only distinct answers toward the two-pair minimum', async () => {
    const quizId = await addQuiz(
      fixture.module,
      fixture.lecturer,
      `Memory Booleans ${crypto.randomUUID().slice(0, 6)}`,
      8,
    );
    await pool.query(
      `UPDATE question_options SET option_text='True'
       WHERE is_correct=true AND question_id IN (SELECT question_id FROM questions WHERE quiz_id=$1)`,
      [quizId],
    );
    const response = await start(await login('student'), quizId);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('NOT_ENOUGH_QUESTIONS');
  });

  it('refuses a student who is not enrolled in the module', async () => {
    const response = await start(await login('outsider'), fixture.practice);
    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('blocks competitive play before the scored attempt and allows it after completion', async () => {
    const agent = await login('locked');
    const blocked = await start(agent, fixture.competitive);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('GAME_LOCKED');
    await pool.query(
      `INSERT INTO quiz_attempts(quiz_id,student_id,score,completion_time,is_scored)
       VALUES($1,$2,0,now(),true)`,
      [fixture.competitive, fixture.locked],
    );
    const allowed = await start(agent, fixture.competitive);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.playId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("allows a lecturer on their own quiz but refuses another lecturer's quiz", async () => {
    const lecturer = await login('lecturer');
    expect((await start(lecturer, fixture.practice)).status).toBe(200);
    const denied = await start(lecturer, fixture.otherQuiz);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
  });

  it("never exposes an unflipped card's question or answer text in start or get", async () => {
    const agent = await login('student');
    const started = await start(agent, fixture.practice);
    const refreshed = await agent.get(
      `/api/v1/games/memory-match/plays/${started.body.data.playId}`,
    );
    expect(refreshed.status).toBe(200);
    for (const response of [started, refreshed]) {
      const serialized = JSON.stringify(response.body);
      for (const text of fixture.texts.get(fixture.practice))
        expect(serialized).not.toContain(text);
    }
  });

  it("GET refuses another student's play", async () => {
    const response = await (
      await login('otherStudent')
    ).get(`/api/v1/games/memory-match/plays/${fixture.playId}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('starting a play does not change leaderboard rows, scored attempts, or analytics figures', async () => {
    const lecturer = await login('lecturer');
    const leaderboardBefore = await lecturer.get(
      `/api/v1/modules/${fixture.module}/leaderboard`,
    );
    const analyticsBefore = await lecturer.get(
      `/api/v1/modules/${fixture.module}/analytics`,
    );
    const countsBefore = (
      await pool.query(
        `SELECT
          (SELECT count(*)::int FROM quiz_attempts) AS attempts,
          (SELECT count(*)::int FROM student_answers) AS answers`,
      )
    ).rows[0];
    expect(
      (await start(await login('student'), fixture.isolation)).status,
    ).toBe(200);
    const countsAfter = (
      await pool.query(
        `SELECT
          (SELECT count(*)::int FROM quiz_attempts) AS attempts,
          (SELECT count(*)::int FROM student_answers) AS answers`,
      )
    ).rows[0];
    const leaderboardAfter = await lecturer.get(
      `/api/v1/modules/${fixture.module}/leaderboard`,
    );
    const analyticsAfter = await lecturer.get(
      `/api/v1/modules/${fixture.module}/analytics`,
    );
    expect(countsAfter).toEqual(countsBefore);
    expect(leaderboardAfter.body).toEqual(leaderboardBefore.body);
    expect(analyticsAfter.body).toEqual(analyticsBefore.body);
  });
});

describe.sequential('Memory Match flip API', () => {
  it('clears every pair and finishes the play with the engine score', async () => {
    const { agent, playId } = await freshPlay('Memory Full Clear');
    const completed = await clearPlay(agent, playId);
    expect(completed.body.data).toMatchObject({
      matchedPairs: 6,
      mismatches: 0,
      moves: 6,
      score: 60,
      status: 'finished',
      replayed: false,
    });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM game_play_moves WHERE play_id=$1',
          [playId],
        )
      ).rows[0].count,
    ).toBe(12);
  });

  it('records mismatches and then allows every pair to be cleared', async () => {
    const { agent, playId } = await freshPlay('Memory Mismatch Clear');
    const state = await playState(playId);
    const allPairs = pairs(state);
    const question = allPairs[0].find((card) => card.kind === 'question');
    const wrongAnswer = allPairs[1].find((card) => card.kind === 'answer');
    expect((await flip(agent, playId, question.cardId)).status).toBe(200);
    const mismatch = await flip(agent, playId, wrongAnswer.cardId);
    expect(mismatch.status).toBe(200);
    expect(mismatch.body.data).toMatchObject({
      matched: false,
      mismatches: 1,
      moves: 1,
      score: 0,
    });
    let completed;
    const clearOrder = [
      allPairs[2],
      allPairs[0],
      allPairs[1],
      ...allPairs.slice(3),
    ];
    for (const pair of clearOrder) {
      expect((await flip(agent, playId, pair[0].cardId)).status).toBe(200);
      completed = await flip(agent, playId, pair[1].cardId);
      expect(completed.status).toBe(200);
      expect(completed.body.data.matched).toBe(true);
    }
    expect(completed.body.data).toMatchObject({
      status: 'finished',
      matchedPairs: 6,
      mismatches: 1,
      moves: 7,
      score: 59,
    });
  });

  it('preserves the single flipped card across a refresh', async () => {
    const { agent, playId } = await freshPlay('Memory Refresh');
    const state = await playState(playId);
    const card = state.cards[0];
    const flipped = await flip(agent, playId, card.cardId);
    expect(flipped.status).toBe(200);
    expect(flipped.body.data.flippedCard).toMatchObject({
      cardId: card.cardId,
      kind: card.kind,
      text: card.text,
    });
    const refreshed = await agent.get(
      `/api/v1/games/memory-match/plays/${playId}`,
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.revealed).toEqual([
      expect.objectContaining({ cardId: card.cardId, text: card.text }),
    ]);
    expectNoHiddenText(refreshed, state);
  });

  it('rejects a same-kind second flip without appending a move', async () => {
    const { agent, playId } = await freshPlay('Memory Same Kind');
    const state = await playState(playId);
    const sameKind = state.cards.filter(
      (card) => card.kind === state.cards[0].kind,
    );
    expect((await flip(agent, playId, sameKind[0].cardId)).status).toBe(200);
    const rejected = await flip(agent, playId, sameKind[1].cardId);
    expect(rejected.status).toBe(422);
    expect(rejected.body.error).toMatchObject({ code: 'INVALID_CARD_PAIR' });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM game_play_moves WHERE play_id=$1',
          [playId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it('serializes a rapid duplicate flip and applies it only once', async () => {
    const { agent, playId } = await freshPlay('Memory Rapid Flip');
    const state = await playState(playId);
    const cardId = state.cards[0].cardId;
    const responses = await Promise.all([
      flip(agent, playId, cardId),
      flip(agent, playId, cardId),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(
      responses.map((response) => response.body.data.replayed).sort(),
    ).toEqual([false, true]);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM game_play_moves WHERE play_id=$1',
          [playId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it('returns the stored result for a replayed identical flip', async () => {
    const { agent, playId } = await freshPlay('Memory Replay');
    const pair = pairs(await playState(playId))[0];
    expect((await flip(agent, playId, pair[0].cardId)).status).toBe(200);
    const first = await flip(agent, playId, pair[1].cardId);
    const locked = await flip(agent, playId, pair[0].cardId);
    expect(locked.status).toBe(409);
    expect(locked.body.error).toMatchObject({ code: 'CARD_LOCKED' });
    const replay = await flip(agent, playId, pair[1].cardId);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.data).toEqual({ ...first.body.data, replayed: true });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM game_play_moves WHERE play_id=$1',
          [playId],
        )
      ).rows[0].count,
    ).toBe(2);
  });

  it('rejects a new move after the play is finished', async () => {
    const { agent, playId } = await freshPlay('Memory Finished');
    const state = await playState(playId);
    const completed = await clearPlay(agent, playId);
    const finalCardId = completed.body.data.flippedCard.cardId;
    const otherCard = state.cards.find((card) => card.cardId !== finalCardId);
    const rejected = await flip(agent, playId, otherCard.cardId);
    expect(rejected.status).toBe(409);
    expect(rejected.body.error).toMatchObject({ code: 'GAME_FINISHED' });
  });

  it("never includes an unflipped card's text in any flip or refresh response", async () => {
    const { agent, playId, started } = await freshPlay('Memory Hidden Text');
    const state = await playState(playId);
    expectNoHiddenText(started, state);
    const allPairs = pairs(state);
    const first = allPairs[0].find((card) => card.kind === 'question');
    const wrong = allPairs[1].find((card) => card.kind === 'answer');
    const firstResponse = await flip(agent, playId, first.cardId);
    expectNoHiddenText(firstResponse, state);
    const secondResponse = await flip(agent, playId, wrong.cardId);
    expectNoHiddenText(secondResponse, state);
    const refreshed = await agent.get(
      `/api/v1/games/memory-match/plays/${playId}`,
    );
    expectNoHiddenText(refreshed, state);
    const next = state.cards.find(
      (card) => card.cardId !== first.cardId && card.cardId !== wrong.cardId,
    );
    const nextResponse = await flip(agent, playId, next.cardId);
    expect(nextResponse.status).toBe(200);
    expectNoHiddenText(nextResponse, state);
    expect(JSON.stringify(nextResponse.body)).not.toContain(first.text);
    expect(JSON.stringify(nextResponse.body)).not.toContain(wrong.text);
  });

  it('playing never changes leaderboard rows, scored attempts, or analytics figures', async () => {
    const { agent, playId } = await freshPlay('Memory Play Isolation');
    const lecturer = await login('lecturer');
    const leaderboardBefore = await lecturer.get(
      `/api/v1/modules/${fixture.module}/leaderboard`,
    );
    const analyticsBefore = await lecturer.get(
      `/api/v1/modules/${fixture.module}/analytics`,
    );
    const countsBefore = (
      await pool.query(
        `SELECT
          (SELECT count(*)::int FROM quiz_attempts) AS attempts,
          (SELECT count(*)::int FROM student_answers) AS answers`,
      )
    ).rows[0];
    const pair = pairs(await playState(playId))[0];
    expect((await flip(agent, playId, pair[0].cardId)).status).toBe(200);
    expect((await flip(agent, playId, pair[1].cardId)).status).toBe(200);
    const countsAfter = (
      await pool.query(
        `SELECT
          (SELECT count(*)::int FROM quiz_attempts) AS attempts,
          (SELECT count(*)::int FROM student_answers) AS answers`,
      )
    ).rows[0];
    const leaderboardAfter = await lecturer.get(
      `/api/v1/modules/${fixture.module}/leaderboard`,
    );
    const analyticsAfter = await lecturer.get(
      `/api/v1/modules/${fixture.module}/analytics`,
    );
    expect(countsAfter).toEqual(countsBefore);
    expect(leaderboardAfter.body).toEqual(leaderboardBefore.body);
    expect(analyticsAfter.body).toEqual(analyticsBefore.body);
  });
});
