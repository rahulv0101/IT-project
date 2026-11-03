// @ts-nocheck
import {
  MEMORY_DEFAULT_PAIRS,
  MEMORY_MATCH_POINTS,
  MEMORY_STATE_VERSION,
} from './config.js';

export const initialMemoryState = () => ({
  version: MEMORY_STATE_VERSION,
  status: 'in_progress',
  cards: [],
  flipped: [],
  matched: [],
  matches: 0,
  mismatches: 0,
  score: 0,
  moves: 0,
  startedAt: null,
});

export const isTerminal = (state) => state.status === 'finished';

export function buildCards(
  questions,
  rng = Math.random,
  pairs = MEMORY_DEFAULT_PAIRS,
) {
  const seen = new Set();
  const eligible = questions
    .filter((q) => {
      if (
        !['multiple_choice', 'true_false'].includes(
          q.question_type || 'multiple_choice',
        )
      )
        return false;
      const answer = q.correct_option_text
        ?.trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      if (!q.question_text?.trim() || !answer || seen.has(answer)) return false;
      seen.add(answer);
      return true;
    })
    .slice(0, pairs);
  const cards = eligible.flatMap((q) => [
    {
      cardId: `${q.question_id}:q`,
      kind: 'question',
      questionId: q.question_id,
      text: q.question_text,
    },
    {
      cardId: `${q.question_id}:a`,
      kind: 'answer',
      questionId: q.question_id,
      text: q.correct_option_text,
    },
  ]);
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function flipCard(state, cardId) {
  if (isTerminal(state)) throw new Error('MEMORY_PLAY_FINISHED');
  if (state.matched.includes(cardId)) throw new Error('MEMORY_CARD_MATCHED');
  if (state.flipped.includes(cardId))
    throw new Error('MEMORY_CARD_ALREADY_FLIPPED');
  if (state.flipped.length >= 2) throw new Error('MEMORY_TURN_PENDING');
  const card = state.cards.find((item) => item.cardId === cardId);
  if (!card) throw new Error('MEMORY_CARD_NOT_FOUND');
  if (state.flipped.length === 1) {
    const first = state.cards.find((item) => item.cardId === state.flipped[0]);
    if (first.kind === card.kind) throw new Error('MEMORY_SAME_KIND');
  }
  return { ...state, flipped: [...state.flipped, cardId] };
}

export function resolveFlip(state) {
  if (state.flipped.length !== 2) return state;
  const [left, right] = state.flipped.map((id) =>
    state.cards.find((card) => card.cardId === id),
  );
  const match = left.questionId === right.questionId;
  const next = {
    ...state,
    flipped: [],
    moves: state.moves + 1,
    matches: state.matches + (match ? 1 : 0),
    mismatches: state.mismatches + (match ? 0 : 1),
    score: Math.max(
      0,
      (state.matches + (match ? 1 : 0)) * MEMORY_MATCH_POINTS -
        state.mismatches -
        (match ? 0 : 1),
    ),
  };
  if (match) next.matched = [...state.matched, left.cardId, right.cardId];
  if (next.matched.length === state.cards.length) next.status = 'finished';
  return next;
}
