import { describe, expect, it } from 'vitest';
import { getGameAvailability } from '../src/games/availability.js';

const user = { userId: 'student-1', role: 'student' };
const quiz = { status: 'published', is_competitive: false, closes_at: null };
const counts = { question_count: 40, memory_eligible: 8, answerable: 40 };

describe('shared game availability policy', () => {
  it('covers every enabled game and preserves its catalogue minimum', () => {
    const games = [
      ['infected', 'Infected', 6],
      ['island_escape', 'Island Escape', 30],
      ['memory_match', 'Memory Match', 2],
      ['boss_battle', 'Boss Battle', 12],
      ['pixel_racer', 'Pixel Car Racer', 10],
      ['timer_trivia', 'Timer Trivia', 10],
    ];
    for (const [key, display_name, minimum_questions] of games) {
      expect(
        getGameAvailability({
          game: { key, display_name, minimum_questions },
          quiz: { ...quiz },
          user,
          counts,
          enrolled: true,
        }),
      ).toMatchObject({
        key,
        minimum_questions,
        available: true,
        reason: null,
      });
    }
  });

  it.each([
    ['not published', { status: 'draft' }, true, 'This quiz is not published.'],
    [
      'closed',
      { closes_at: '2020-01-01T00:00:00Z' },
      true,
      'This quiz is closed.',
    ],
    ['not enrolled', {}, false, 'Enrol in this module to play.'],
    [
      'competitive lock',
      { is_competitive: true },
      true,
      'Complete your scored attempt to unlock this game.',
    ],
  ])('returns the exact %s reason', (_name, quizChanges, enrolled, reason) => {
    const result = getGameAvailability({
      game: { key: 'infected', display_name: 'Infected', minimum_questions: 6 },
      quiz: { ...quiz, ...quizChanges },
      user,
      counts,
      enrolled,
      scoredAttemptCompleted: false,
    });
    expect(result).toMatchObject({ available: false, reason });
  });

  it('returns the precise minimum-question reason for each game', () => {
    for (const [key, display_name, minimum_questions] of [
      ['infected', 'Infected', 6],
      ['island_escape', 'Island Escape', 30],
      ['memory_match', 'Memory Match', 2],
      ['boss_battle', 'Boss Battle', 12],
      ['pixel_racer', 'Pixel Car Racer', 10],
      ['timer_trivia', 'Timer Trivia', 10],
    ]) {
      const result = getGameAvailability({
        game: { key, display_name, minimum_questions },
        quiz: { ...quiz },
        user,
        counts: { question_count: 1, memory_eligible: 1, answerable: 1 },
        enrolled: true,
      });
      expect(result.available).toBe(false);
      expect(result.reason).toContain(String(minimum_questions));
    }
  });
});
