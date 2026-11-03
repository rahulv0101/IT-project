// @ts-nocheck - Express route metadata is runtime-specific.
import { studentNetworkRoutes } from './groups/student-network.js';
import { accountManagementRoutes } from './admin/accounts.js';
// Every API route must have an explicit entry. This is intentionally data-only so
// authorization policy can be reviewed without reading handler implementation.
const routePolicies = {
  ...studentNetworkRoutes,
  ...accountManagementRoutes,
  'GET /api/v1/admin/dashboard': { auth: 'admin' },
  'GET /api/v1/admin/users': { auth: 'admin' },
  'POST /api/v1/admin/lecturers': { auth: 'admin' },
  'PATCH /api/v1/admin/users/:userId': { auth: 'admin' },
  'GET /api/v1/admin/modules': { auth: 'admin' },
  'PATCH /api/v1/admin/modules/:moduleId/lecturer': { auth: 'admin' },
  'GET /api/v1/admin/reports': { auth: 'admin' },
  'PATCH /api/v1/admin/reports/:reportId': { auth: 'admin' },
  'GET /api/v1/admin/system': { auth: 'admin' },
  'GET /api/v1/admin/audit': { auth: 'admin' },
  'GET /api/v1/me/sessions': { auth: 'student|lecturer' },
  'GET /api/v1/groups/:groupId/sessions': { auth: 'student|lecturer' },
  'POST /api/v1/groups/:groupId/sessions': { auth: 'student' },
  'PATCH /api/v1/groups/:groupId/sessions/:sessionId': { auth: 'student' },
  'POST /api/v1/groups/:groupId/sessions/:sessionId/cancel': {
    auth: 'student',
  },
  'POST /api/v1/groups/:groupId/sessions/:sessionId/duplicate': {
    auth: 'student',
  },
  'GET /api/v1/groups/:groupId/sessions/calendar.ics': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/groups/:groupId/sessions/preparation-options': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/groups/:groupId/sessions/:sessionId/resources/:resourceId': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/groups/:groupId/sessions/:sessionId/calendar.ics': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/groups/:groupId/sessions/:sessionId': {
    auth: 'student|lecturer',
  },
  'PUT /api/v1/groups/:groupId/sessions/:sessionId/rsvp': { auth: 'student' },
  'GET /api/v1/me/notifications': { auth: 'student|lecturer' },
  'POST /api/v1/me/notifications/:notificationId/read': {
    auth: 'student|lecturer',
  },
  'GET /health': { auth: 'public' },
  'POST /api/v1/auth/register': { auth: 'public' },
  'POST /api/v1/auth/login': { auth: 'public' },
  'GET /api/v1/auth/verify-email': { auth: 'public' },
  'POST /api/v1/auth/verify-email': { auth: 'student|lecturer' },
  'POST /api/v1/auth/resend-verification': { auth: 'student|lecturer' },
  'POST /api/v1/auth/login/mfa': { auth: 'public' },
  'POST /api/v1/mfa/enrol': { auth: 'student|lecturer' },
  'POST /api/v1/mfa/confirm': { auth: 'student|lecturer' },
  'POST /api/v1/mfa/disable': { auth: 'student|lecturer' },
  'POST /api/v1/mfa/recovery-codes/regenerate': { auth: 'student|lecturer' },
  'POST /api/v1/auth/logout': { auth: 'student|lecturer' },
  'GET /api/v1/auth/me': { auth: 'student|lecturer' },
  'PUT /api/v1/auth/me': { auth: 'student|lecturer' },
  'GET /api/v1/me/profile': { auth: 'student|lecturer' },
  'PATCH /api/v1/me/profile': { auth: 'student|lecturer' },
  'POST /api/v1/me/password': { auth: 'student|lecturer' },
  'POST /api/v1/me/email': { auth: 'student|lecturer' },
  'GET /api/v1/modules': { auth: 'student|lecturer' },
  'GET /api/v1/me/modules': { auth: 'student|lecturer' },
  'GET /api/v1/me/modules/lookahead': { auth: 'student' },
  'GET /api/v1/resources/modules': { auth: 'student|lecturer' },
  'POST /api/v1/modules': { auth: 'lecturer' },
  'POST /api/v1/enrollments': { auth: 'student' },
  'POST /api/v1/modules/:moduleId/groups': { auth: 'student|lecturer' },
  'GET /api/v1/groups': { auth: 'student|lecturer' },
  'POST /api/v1/groups': { auth: 'student' },
  'PATCH /api/v1/groups/:groupId': { auth: 'student' },
  'POST /api/v1/groups/:groupId/leaders': { auth: 'student' },
  'DELETE /api/v1/groups/:groupId/leaders/:studentId': { auth: 'student' },
  'POST /api/v1/groups/:groupId/updates': { auth: 'student' },
  'DELETE /api/v1/groups/:groupId/updates/:updateId': { auth: 'student' },
  'POST /api/v1/groups/:groupId/leave': { auth: 'student' },
  'POST /api/v1/groups/:groupId/join': { auth: 'student' },
  'GET /api/v1/modules/:moduleId/resources': { auth: 'student|lecturer' },
  'GET /api/v1/resources/:resourceId/file': { auth: 'student|lecturer' },
  'POST /api/v1/modules/:moduleId/resources': { auth: 'lecturer' },
  'POST /api/v1/quizzes': { auth: 'lecturer' },
  'POST /api/v1/quizzes/manual': { auth: 'lecturer' },
  'POST /api/v1/quizzes/:quizId/publish': { auth: 'lecturer' },
  'POST /api/v1/quizzes/:quizId/publish-check': { auth: 'lecturer' },
  'POST /api/v1/quizzes/:quizId/questions': { auth: 'lecturer' },
  'PATCH /api/v1/quizzes/:quizId/questions/:questionId': { auth: 'lecturer' },
  'DELETE /api/v1/quizzes/:quizId/questions/:questionId': { auth: 'lecturer' },
  'POST /api/v1/quizzes/:quizId/questions/reorder': { auth: 'lecturer' },
  'POST /api/v1/quizzes/:quizId/duplicate': { auth: 'lecturer' },
  'DELETE /api/v1/quizzes/:quizId': { auth: 'lecturer' },
  'POST /api/v1/quizzes/:quizId/questions/:questionId/duplicate': {
    auth: 'lecturer',
  },
  'GET /api/v1/modules/:moduleId/quizzes': { auth: 'student|lecturer' },
  'POST /api/v1/resources/:resourceId/generation-jobs': { auth: 'lecturer' },
  'GET /api/v1/ai-generation-jobs/:jobId': { auth: 'student|lecturer' },
  'GET /api/v1/ai-status': { auth: 'lecturer' },
  'POST /api/v1/ai-generation-jobs/:jobId/cancel': { auth: 'lecturer' },
  'POST /api/v1/ai-generation-jobs/:jobId/retry': { auth: 'lecturer' },
  'GET /api/v1/labs': { auth: 'student|lecturer' },
  'POST /api/v1/labs': { auth: 'lecturer' },
  'GET /api/v1/labs/:labId': { auth: 'student|lecturer' },
  'PATCH /api/v1/labs/:labId': { auth: 'lecturer' },
  'POST /api/v1/labs/:labId/duplicate': { auth: 'lecturer' },
  'DELETE /api/v1/labs/:labId': { auth: 'lecturer' },
  'GET /api/v1/labs/:labId/attempt': { auth: 'student' },
  'PUT /api/v1/labs/:labId/attempt': { auth: 'student' },
  'GET /api/v1/modules/:moduleId/labs/activity': { auth: 'lecturer' },
  'GET /api/v1/quizzes/:quizId': { auth: 'lecturer' },
  'PUT /api/v1/quizzes/:quizId': { auth: 'lecturer' },
  'POST /api/v1/quizzes/:quizId/attempts': { auth: 'student' },
  'GET /api/v1/quizzes/:quizId/games': { auth: 'student|lecturer' },
  'GET /api/v1/games/catalogue': { auth: 'student|lecturer' },
  'GET /api/v1/games/availability/:quizId': { auth: 'student|lecturer' },
  'GET /api/v1/games/in-progress': { auth: 'student|lecturer' },
  'GET /api/v1/games/quiz-picker': { auth: 'student|lecturer' },
  'POST /api/v1/attempts/:attemptId/submit': { auth: 'student' },
  'GET /api/v1/modules/:moduleId/leaderboard': { auth: 'student|lecturer' },
  'GET /api/v1/me/analytics': { auth: 'student' },
  'GET /api/v1/modules/:moduleId/groups/:groupId/analytics': {
    auth: 'lecturer',
  },
  'GET /api/v1/modules/:moduleId/analytics': { auth: 'lecturer' },
  'POST /api/v1/games/infected/sessions': { auth: 'student|lecturer' },
  'POST /api/v1/games/infected/sessions/:id/choose': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/infected/sessions/:id/answer': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/games/infected/sessions/:id': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/modules/:moduleId/games/infected/activity': {
    auth: 'lecturer',
  },
  'GET /api/v1/modules/:moduleId/games/activity': { auth: 'lecturer' },
  'POST /api/v1/games/island-escape/plays': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/island-escape/plays/:id/answer': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/games/island-escape/plays/:id': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/memory-match/plays': { auth: 'student|lecturer' },
  'GET /api/v1/games/memory-match/plays/:id': { auth: 'student|lecturer' },
  'POST /api/v1/games/memory-match/plays/:id/flip': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/boss-battle/plays': { auth: 'student|lecturer' },
  'GET /api/v1/games/boss-battle/plays/:id': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/boss-battle/plays/:id/answer': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/pixel-racer/plays': { auth: 'student|lecturer' },
  'GET /api/v1/games/pixel-racer/plays/:id': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/pixel-racer/plays/:id/answer': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/timer-trivia/plays': { auth: 'student|lecturer' },
  'GET /api/v1/games/timer-trivia/plays/:id': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/timer-trivia/plays/:id/choose': {
    auth: 'student|lecturer',
  },
  'POST /api/v1/games/timer-trivia/plays/:id/answer': {
    auth: 'student|lecturer',
  },
  'GET /api/v1/groups/:groupId/messages': { auth: 'student|lecturer' },
  'POST /api/v1/groups/:groupId/messages': { auth: 'student|lecturer' },
  'PATCH /api/v1/groups/:groupId/messages/:messageId': { auth: 'student' },
  'DELETE /api/v1/groups/:groupId/messages/:messageId': { auth: 'student' },
  'POST /api/v1/groups/:groupId/messages/:messageId/report': {
    auth: 'student',
  },
  'GET /api/v1/groups/:groupId/reports': { auth: 'student' },
  'PATCH /api/v1/groups/:groupId/reports/:reportId': { auth: 'student' },
  'POST /api/v1/groups/:groupId/mutes/:studentId': { auth: 'student' },
  'POST /api/v1/groups/:groupId/read': { auth: 'student|lecturer' },
  'POST /api/v1/groups/:groupId/messages/:messageId/attachments': {
    auth: 'student',
  },
  'GET /api/v1/groups/:groupId/attachments/:attachmentId': {
    auth: 'student|lecturer',
  },
};

const caseNames = [
  'unauthenticated',
  'wrongRole',
  'wrongOwner',
  'validation',
  'success',
];

// Each route carries the five required matrix dimensions. Public routes mark
// the auth/ownership dimensions as not applicable; protected routes must have
// a corresponding behavioral test entry in the route matrix suite.
export const authorizationMatrix = Object.fromEntries(
  Object.entries(routePolicies).map(([route, policy]) => [
    route,
    {
      ...policy,
      cases: Object.fromEntries(
        caseNames.map((name) => [
          name,
          (policy.auth === 'public' &&
            ['unauthenticated', 'wrongRole', 'wrongOwner'].includes(name)) ||
          (policy.auth === 'student|lecturer' && name === 'wrongRole')
            ? 'not_applicable'
            : 'required',
        ]),
      ),
    },
  ]),
);

export const matrixKey = (method, path) => `${method.toUpperCase()} ${path}`;
