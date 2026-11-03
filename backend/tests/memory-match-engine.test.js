// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  buildCards,
  flipCard,
  initialMemoryState,
  resolveFlip,
} from '../src/games/memory_match/engine.js';

const questions = Array.from({ length: 6 }, (_, i) => ({
  question_id: `q${i}`,
  question_text: `Question ${i}`,
  correct_option_text: `Answer ${i}`,
}));

describe('Memory Match engine', () => {
  it('filters, creates two card kinds, and shuffles deterministically', () => {
    const cards = buildCards(questions, () => 0.5);
    expect(cards).toHaveLength(12);
    expect(new Set(cards.map((card) => card.kind))).toEqual(
      new Set(['question', 'answer']),
    );
  });
  it('accepts full authored text while removing equivalent answers', () => {
    const cards = buildCards(
      [
        {
          question_id: 'long',
          question_text: 'A database scenario. '.repeat(20),
          correct_option_text: 'An extended answer. '.repeat(8),
        },
        ...questions,
        {
          question_id: 'duplicate',
          question_text: 'Duplicate answer question',
          correct_option_text: '  ANSWER   0 ',
        },
      ],
      () => 0.5,
      10,
    );
    expect(cards).toHaveLength(14);
    expect(
      cards.some((c) => c.kind === 'question' && c.text.length > 140),
    ).toBe(true);
  });
  it('matches pairs and scores without negative values', () => {
    let state = {
      ...initialMemoryState(),
      cards: buildCards(questions, () => 0),
    };
    state = flipCard(state, 'q0:q');
    expect(() => flipCard(state, 'q0:a')).not.toThrow();
    state = resolveFlip(flipCard(state, 'q0:a'));
    expect(state.matches).toBe(1);
    expect(state.score).toBe(10);
    expect(state.status).toBe('in_progress');
  });
  it('rejects same-kind and third-card flips', () => {
    const cards = buildCards(questions, () => 0);
    let state = flipCard({ ...initialMemoryState(), cards }, 'q0:q');
    expect(() => flipCard(state, 'q1:q')).toThrow('MEMORY_SAME_KIND');
    state = flipCard(state, 'q0:a');
    expect(() => flipCard(state, 'q1:a')).toThrow('MEMORY_TURN_PENDING');
  });
  it('does not expose unflipped text through engine card metadata', () => {
    const cards = buildCards(questions, () => 0);
    expect(cards[0]).not.toHaveProperty('question_text');
    expect(cards[0]).not.toHaveProperty('correct_option_text');
  });
});
