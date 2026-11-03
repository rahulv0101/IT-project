import { useCallback, useEffect, useRef, useState } from 'react';
export const ROLE_SCREENS = {
  student: [
    'Dashboard',
    'Modules',
    'Resources',
    'Study groups',
    'Messages',
    'Leaderboard',
    'Quizzes',
    'Games',
    'Practice Labs',
    'Profile',
  ],
  lecturer: [
    'Study calendar',
    'Modules',
    'Resources',
    'Quizzes',
    'Analytics',
    'Profile',
  ],
  admin: ['Admin', 'Profile'],
};
const games = {
  infected: 'Infected',
  'island-escape': 'Island Escape',
  'memory-match': 'Memory Match',
  'boss-battle': 'Boss Battle',
  'pixel-racer': 'Pixel Car Racer',
  'timer-trivia': 'Timer Trivia',
};
const mains = Object.fromEntries(
  [...new Set(Object.values(ROLE_SCREENS).flat())].map((s) => [
    s.toLowerCase().replaceAll(' ', '-'),
    s,
  ]),
);
const uuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value || '',
  );
export function parseWorkspaceRoute(hash) {
  const parts = String(hash || '')
    .replace(/^#\/?/, '')
    .split('/')
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return '';
      }
    });
  const [root, second, third] = parts;
  const empty = {
    screen: null,
    quizId: null,
    gameQuizId: null,
    studySession: null,
  };
  if (root === 'games' && games[second])
    return uuid(third)
      ? { ...empty, screen: games[second], gameQuizId: third }
      : { ...empty, screen: 'Games' };
  if (root === 'quiz')
    return uuid(second)
      ? { ...empty, screen: 'Quiz', quizId: second }
      : { ...empty, screen: 'Quizzes' };
  if (root === 'quizzes' && second === 'new')
    return { ...empty, screen: 'Create quiz' };
  if (root === 'quizzes' && uuid(second))
    return {
      ...empty,
      screen: third === 'edit' ? 'Quiz editor' : 'Quiz review',
      quizId: second,
    };
  if (root === 'study-sessions')
    return uuid(second) && (!third || uuid(third))
      ? {
          ...empty,
          screen: 'Study sessions',
          studySession: { groupId: second, sessionId: third || undefined },
        }
      : { ...empty, screen: 'Study groups' };
  return { ...empty, screen: mains[root] || null };
}
export function workspaceHash(route) {
  if (route.screen === 'Quiz' && route.quizId) return `#/quiz/${route.quizId}`;
  if (route.screen === 'Create quiz') return '#/quizzes/new';
  if (['Quiz review', 'Quiz editor'].includes(route.screen) && route.quizId)
    return `#/quizzes/${route.quizId}${route.screen === 'Quiz editor' ? '/edit' : ''}`;
  if (route.screen === 'Study sessions' && route.studySession)
    return `#/study-sessions/${route.studySession.groupId}${route.studySession.sessionId ? `/${route.studySession.sessionId}` : ''}`;
  const game = Object.entries(games).find(([, name]) => name === route.screen);
  if (game && route.gameQuizId) return `#/games/${game[0]}/${route.gameQuizId}`;
  return `#/${(route.screen || '').toLowerCase().replaceAll(' ', '-')}`;
}
export function allowedScreen(role, screen) {
  if (ROLE_SCREENS[role]?.includes(screen)) return true;
  if (role === 'student' && ['Quiz', ...Object.values(games)].includes(screen))
    return true;
  if (
    role === 'lecturer' &&
    ['Create quiz', 'Quiz review', 'Quiz editor'].includes(screen)
  )
    return true;
  return ['student', 'lecturer'].includes(role) && screen === 'Study sessions';
}
export function navigationParent(screen, role) {
  if (['Quiz', 'Create quiz', 'Quiz review', 'Quiz editor'].includes(screen))
    return 'Quizzes';
  if (Object.values(games).includes(screen)) return 'Games';
  if (screen === 'Study sessions')
    return role === 'lecturer' ? 'Study calendar' : 'Study groups';
  return screen;
}
export function useWorkspaceNavigation(role) {
  const [route, setRoute] = useState(() =>
    parseWorkspaceRoute(window.location.hash),
  );
  const historyMode = useRef('replace');
  const setScreen = useCallback((screen) => {
    historyMode.current = 'push';
    setRoute((current) => ({ ...current, screen }));
  }, []);
  const setQuizId = useCallback(
    (quizId) => setRoute((current) => ({ ...current, quizId })),
    [],
  );
  const setGameQuizId = useCallback(
    (gameQuizId) => setRoute((current) => ({ ...current, gameQuizId })),
    [],
  );
  const setStudySession = useCallback(
    (studySession) => setRoute((current) => ({ ...current, studySession })),
    [],
  );
  useEffect(() => {
    const restore = () => {
      historyMode.current = null;
      setRoute(parseWorkspaceRoute(window.location.hash));
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', restore);
    };
  }, []);
  useEffect(() => {
    if (!role) return;
    const defaultScreen = ROLE_SCREENS[role]?.[0] || 'Dashboard';
    if (!allowedScreen(role, route.screen)) {
      historyMode.current = 'replace';
      setRoute((current) => ({ ...current, screen: defaultScreen }));
      return;
    }
    const hash = workspaceHash(route);
    if (historyMode.current && window.location.hash !== hash)
      window.history[
        historyMode.current === 'push' ? 'pushState' : 'replaceState'
      ]({}, '', hash);
    historyMode.current = null;
  }, [route, role]);
  const reset = () => {
    historyMode.current = 'replace';
    setRoute(parseWorkspaceRoute(''));
    window.history.replaceState({}, '', '/');
  };
  return {
    ...route,
    screen: route.screen || ROLE_SCREENS[role]?.[0] || 'Dashboard',
    setScreen,
    setQuizId,
    setGameQuizId,
    setStudySession,
    reset,
  };
}
