import { appFetch } from './http.js';
import React, { useEffect, useState } from 'react';
export function QuizReview({ quizId, onBack, onEdit }) {
  const [state, setState] = useState({ loading: true, quiz: null, error: '' });
  useEffect(() => {
    let active = true;
    setState({ loading: true, quiz: null, error: '' });
    appFetch(`/api/v1/quizzes/${quizId}`, { credentials: 'include' })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error?.message || 'Unable to load questions.');
        return b;
      })
      .then(
        (b) => active && setState({ loading: false, quiz: b.quiz, error: '' }),
      )
      .catch(
        (e) =>
          active && setState({ loading: false, quiz: null, error: e.message }),
      );
    return () => {
      active = false;
    };
  }, [quizId]);
  if (state.loading) return <p role="status">Loading questions and answers…</p>;
  if (state.error)
    return (
      <section className="card">
        <p role="alert" className="field-error">
          {state.error}
        </p>
        <button className="secondary" onClick={onBack}>
          Back to quizzes
        </button>
      </section>
    );
  const quiz = state.quiz;
  const questions = [...(quiz.questions || [])].sort(
    (a, b) =>
      (a.displayOrder || 0) - (b.displayOrder || 0) ||
      a.questionId.localeCompare(b.questionId),
  );
  return (
    <section className="quiz-review">
      <div className="section-heading">
        <div>
          <span className="eyebrow">QUESTIONS AND ANSWERS</span>
          <h2>{quiz.title}</h2>
          <p className="muted">
            {quiz.status === 'draft' ? 'Draft quiz' : 'Published quiz'} ·{' '}
            {questions.length} questions
          </p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={onBack}>
            Back to quizzes
          </button>
          {onEdit && (
            <button className="secondary" onClick={onEdit}>
              Edit quiz
            </button>
          )}
        </div>
      </div>
      {!questions.length && (
        <p className="empty-state">This draft has no questions yet.</p>
      )}
      {questions.map((q, index) => (
        <article className="card review-question" key={q.questionId}>
          <p className="eyebrow">
            Question {index + 1} · {q.marks}{' '}
            {Number(q.marks) === 1 ? 'mark' : 'marks'}
          </p>
          <h3>{q.questionText}</h3>
          {q.codeBefore && (
            <pre>
              <code>{q.codeBefore}</code>
            </pre>
          )}
          {q.codeAfter && (
            <pre>
              <code>{q.codeAfter}</code>
            </pre>
          )}
          {q.options?.length > 0 && (
            <ul className="review-options">
              {q.options.map((o, i) => (
                <li
                  key={o.optionId || i}
                  className={o.correct ? 'correct-answer' : ''}
                >
                  {o.optionText}
                  {o.correct && <strong> — Correct answer</strong>}
                </li>
              ))}
            </ul>
          )}
          {q.acceptedAnswers?.length > 0 && (
            <p>
              <strong>Accepted answers:</strong> {q.acceptedAnswers.join(', ')}
            </p>
          )}
          {q.expectedOutput && (
            <p>
              <strong>Expected output:</strong> <code>{q.expectedOutput}</code>
            </p>
          )}
          {q.explanation && (
            <p>
              <strong>Explanation:</strong> {q.explanation}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
