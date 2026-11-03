// @ts-nocheck - catalog rows are runtime database records.
import { canAccessGame } from './access.js';

const memoryEligible = (gameKey) => gameKey === 'memory_match';
const eligibleQuestionCount = (gameKey, counts) =>
  memoryEligible(gameKey)
    ? counts.memory_eligible
    : ['boss_battle', 'pixel_racer', 'timer_trivia'].includes(gameKey)
      ? counts.answerable
      : counts.question_count;

const questionReason = (game, count) =>
  game.key === 'memory_match'
    ? `Memory Match needs at least ${game.minimum_questions} questions with different correct answers. This quiz has ${count} usable ${count === 1 ? 'pair' : 'pairs'}.`
    : game.key === 'island_escape'
      ? `Needs a quiz with at least ${game.minimum_questions} questions.`
      : ['boss_battle', 'pixel_racer', 'timer_trivia'].includes(game.key)
        ? `${game.display_name} needs at least ${game.minimum_questions} eligible questions.`
        : count < game.minimum_questions
          ? `Not enough questions for this game yet. At least ${game.minimum_questions} are required.`
          : null;

export function getGameAvailability({
  game,
  quiz,
  user,
  counts,
  enrolled = false,
  scoredAttemptCompleted = false,
  hasInProgressPlay = false,
  now = new Date(),
}) {
  const published = quiz.status === 'published';
  const closed = quiz.closes_at && new Date(quiz.closes_at) <= now;
  const access = canAccessGame(user, quiz, {
    scoredAttemptCompleted,
  });
  const studentNeedsEnrollment = user?.role === 'student' && !enrolled;
  const questionCount = eligibleQuestionCount(game.key, counts);
  let reason = null;
  if (!published) reason = 'This quiz is not published.';
  else if (closed) reason = 'This quiz is closed.';
  else if (studentNeedsEnrollment) reason = 'Enrol in this module to play.';
  else if (!access)
    reason = 'Complete your scored attempt to unlock this game.';
  else if (questionCount < game.minimum_questions)
    reason = questionReason(game, questionCount);
  if (
    reason &&
    counts.unsupported_for_games > 0 &&
    [
      'boss_battle',
      'pixel_racer',
      'timer_trivia',
      'memory_match',
      'infected',
      'island_escape',
    ].includes(game.key)
  )
    reason = `${reason} ${counts.unsupported_for_games} question(s) are not fixed-option questions and are excluded.`;
  return {
    ...game,
    questionCount,
    eligible_question_count: memoryEligible(game.key)
      ? questionCount
      : counts.answerable,
    question_count: counts.question_count,
    available: !reason,
    reason,
    hasInProgressPlay,
  };
}

export { eligibleQuestionCount };
