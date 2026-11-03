import { describe, expect, it } from 'vitest';
import {
  allowedScreen,
  navigationParent,
  parseWorkspaceRoute,
  ROLE_SCREENS,
  workspaceHash,
} from './navigation.js';
const id = '12345678-1234-1234-1234-123456789abc';
describe('role-aware workspace routing', () => {
  it('keeps lecturer play routes and administration out of student navigation', () => {
    expect(ROLE_SCREENS.lecturer).not.toContain('Games');
    expect(ROLE_SCREENS.lecturer).not.toContain('Practice Labs');
    expect(allowedScreen('lecturer', 'Quiz')).toBe(false);
    expect(allowedScreen('lecturer', 'Infected')).toBe(false);
    expect(allowedScreen('student', 'Quiz review')).toBe(false);
    expect(allowedScreen('student', 'Admin')).toBe(false);
    expect(allowedScreen('lecturer', 'Quiz review')).toBe(true);
    expect(allowedScreen('student', 'Messages')).toBe(true);
  });
  it('round-trips nested quiz, game and session routes for refresh and back navigation', () => {
    for (const hash of [
      `#/quiz/${id}`,
      `#/quizzes/${id}`,
      `#/quizzes/${id}/edit`,
      '#/quizzes/new',
      `#/games/infected/${id}`,
      `#/study-sessions/${id}`,
      `#/study-sessions/${id}/${id}`,
      '#/study-groups',
      '#/messages',
    ])
      expect(workspaceHash(parseWorkspaceRoute(hash))).toBe(hash);
    expect(navigationParent('Quiz review', 'lecturer')).toBe('Quizzes');
    expect(navigationParent('Infected', 'student')).toBe('Games');
  });
  it('handles malformed deep links without throwing or retaining invalid identifiers', () => {
    expect(parseWorkspaceRoute('#/quiz/%E0%A4%A').screen).toBe('Quizzes');
    expect(parseWorkspaceRoute('#/games/infected/nonsense').screen).toBe(
      'Games',
    );
    expect(
      parseWorkspaceRoute('#/study-sessions/unknown').studySession,
    ).toBeNull();
    expect(parseWorkspaceRoute('#/unknown').screen).toBeNull();
  });
});
