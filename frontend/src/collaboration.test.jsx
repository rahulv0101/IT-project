// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AdminUsers } from './admin-users.jsx';
import {
  DirectMessages,
  GroupInvitations,
  InviteStudent,
} from './student-network.jsx';
import { QuizReview } from './quiz-review.jsx';
import { ProfilePage } from './main.jsx';
const response = (body, status = 200) => ({
  ok: status < 300,
  status,
  json: async () => body,
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('admin creates a user and confirms deactivation with an email and reason', async () => {
  let present = false;
  const user = {
    user_id: 'managed-1',
    full_name: 'New Person',
    email: 'new@example.com',
    role: 'student',
    account_status: 'active',
  };
  const fetch = vi.fn(async (url, opts = {}) => {
    if (opts.method === 'POST') {
      present = true;
      return response({ user }, 201);
    }
    if (opts.method === 'DELETE') {
      user.account_status = 'inactive';
      return response(null, 204);
    }
    return response({
      data: present ? [user] : [],
      pagination: { total: present ? 1 : 0 },
    });
  });
  vi.stubGlobal('fetch', fetch);
  render(<AdminUsers currentUserId="owner" />);
  await screen.findByText('No users match your search.');
  fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
  for (const [label, value] of [
    ['First name', 'New'],
    ['Last name', 'Person'],
    ['Email', 'new@example.com'],
    ['Temporary password', 'TemporarySecure99!'],
    ['Reason', 'Testing account creation'],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
  await screen.findByRole('button', { name: 'Deactivate New Person' });
  fireEvent.click(
    screen.getByRole('button', { name: 'Deactivate New Person' }),
  );
  fireEvent.change(screen.getByLabelText('Confirm email'), {
    target: { value: user.email },
  });
  fireEvent.change(screen.getByLabelText('Deactivation reason'), {
    target: { value: 'Disposable test cleanup' },
  });
  fireEvent.submit(
    screen.getByRole('form', { name: 'Confirm account deactivation' }),
  );
  await screen.findByText(/Account made inactive/);
  expect(await screen.findByText('inactive')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Activate' })).toBeTruthy();
  const deletion = fetch.mock.calls.find(([, o]) => o.method === 'DELETE');
  expect(JSON.parse(deletion[1].body)).toEqual({
    confirmationEmail: user.email,
    reason: 'Disposable test cleanup',
  });
});
it('group invitations require an explicit acceptance and refresh membership', async () => {
  const onJoined = vi.fn();
  let pending = true;
  const fetch = vi.fn(async (url, opts = {}) => {
    if (opts.method === 'POST') {
      pending = false;
      return response({ joined: true });
    }
    return response({
      data: pending
        ? [
            {
              invitation_id: 'i1',
              group_name: 'Revision',
              inviter_name: 'Ada',
              module_code: 'CS101',
            },
          ]
        : [],
    });
  });
  vi.stubGlobal('fetch', fetch);
  render(<GroupInvitations onJoined={onJoined} />);
  await screen.findByText('Revision');
  expect(fetch.mock.calls.every(([, o]) => !o.method)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
  await waitFor(() => expect(onJoined).toHaveBeenCalledOnce());
  expect(
    JSON.parse(fetch.mock.calls.find(([, o]) => o.method === 'POST')[1].body),
  ).toEqual({ accept: true });
});
it('invites students from the selected module without forcing membership', async () => {
  const fetch = vi.fn(async (url, opts = {}) =>
    response(
      opts.method === 'POST'
        ? { invitation: { invitation_id: 'i1' } }
        : { data: [{ user_id: 's1', full_name: 'Ada Student' }] },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  render(<InviteStudent group={{ group_id: 'g1', module_id: 'm1' }} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Invite a student' }));
  await screen.findByRole('option', { name: 'Ada Student' });
  fireEvent.change(screen.getByLabelText('Student', { exact: true }), {
    target: { value: 's1' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Send group invitation' }),
  );
  await screen.findByText(/Invitation sent/);
  expect(fetch.mock.calls.some(([url]) => url.includes('moduleId=m1'))).toBe(
    true,
  );
  expect(
    fetch.mock.calls.some(
      ([url, o]) =>
        url.endsWith('/invitations') && JSON.parse(o.body).studentId === 's1',
    ),
  ).toBe(true);
});
it('keeps a failed message draft and clears private history when switching conversations', async () => {
  const fetch = vi.fn(async (url, opts = {}) => {
    if (url.includes('/students?')) return response({ data: [] });
    if (url.includes('/messages'))
      return opts.method === 'POST'
        ? response({ error: { message: 'Please wait a minute.' } }, 429)
        : response({
            data: [
              {
                message_id: url.includes('/c1/') ? 'm1' : 'm2',
                message_order: 1,
                body: url.includes('/c1/')
                  ? 'Private Ada history'
                  : 'Private Grace history',
                sender_id: 'peer',
                created_at: '2026-11-03T00:00:00Z',
              },
            ],
            hasMore: false,
          });
    return response({
      data: [
        {
          conversation_id: 'c1',
          peer_id: 'peer',
          peer_name: 'Ada',
          peer_status: 'active',
        },
        {
          conversation_id: 'c2',
          peer_id: 'peer2',
          peer_name: 'Grace',
          peer_status: 'active',
        },
      ],
    });
  });
  vi.stubGlobal('fetch', fetch);
  render(<DirectMessages />);
  fireEvent.click(await screen.findByRole('button', { name: /Ada/ }));
  await screen.findByText('Private Ada history');
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'Keep this draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByText('Please wait a minute.');
  expect(screen.getByLabelText('Message').value).toBe('Keep this draft');
  fireEvent.click(screen.getByRole('button', { name: /Grace/ }));
  await screen.findByText('Private Grace history');
  expect(screen.queryByText('Private Ada history')).toBeNull();
});
it('lecturer review displays correct MCQ, short answers and code outputs without play controls', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      response({
        quiz: {
          title: 'Review quiz',
          status: 'draft',
          questions: [
            {
              questionId: 'q1',
              questionText: 'Choose',
              marks: 2,
              options: [
                { optionText: 'Right', correct: true },
                { optionText: 'Wrong', correct: false },
              ],
            },
            {
              questionId: 'q2',
              questionText: 'Explain',
              marks: 1,
              acceptedAnswers: ['database'],
            },
            {
              questionId: 'q3',
              questionText: 'Output',
              marks: 1,
              codeBefore: 'print(1)',
              expectedOutput: '1',
              explanation: 'Prints one',
            },
          ],
        },
      }),
    ),
  );
  render(<QuizReview quizId="q" onBack={vi.fn()} />);
  await screen.findByText('Review quiz');
  expect(screen.getByText(/Correct answer/)).toBeTruthy();
  expect(screen.getByText(/database/)).toBeTruthy();
  expect(screen.getByText('Prints one')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Take quiz|Play/ })).toBeNull();
});
it.each(['student', 'lecturer', 'admin'])(
  'removes change email and MFA from the %s profile while retaining password editing',
  async (role) => {
    const profile = {
      user_id: 'p',
      role,
      first_name: 'Ada',
      email: 'ada@example.com',
      preferred_languages: [],
      mfa_enabled: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ profile, languages: [] })),
    );
    render(<ProfilePage user={profile} onUserChange={vi.fn()} />);
    await screen.findByText('Edit profile');
    expect(
      screen.getByRole('heading', { name: 'Change password' }),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        /Change email|Multi.factor authentication|MFA is|Enrol MFA/,
      ),
    ).toBeNull();
  },
);
