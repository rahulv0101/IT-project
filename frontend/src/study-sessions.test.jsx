// @vitest-environment jsdom
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  StudySessions,
  UpcomingSessions,
  Notifications,
} from './study-sessions.jsx';
const session = {
  session_id: 'session',
  group_id: 'group',
  title: 'Revision together',
  topic: 'Databases',
  starts_at: new Date(Date.now() + 3600000).toISOString(),
  ends_at: new Date(Date.now() + 7200000).toISOString(),
  status: 'scheduled',
  mode: 'in_person',
  location: 'Room A',
  preparation_notes: 'Read the handout',
  description: 'Discuss queries',
};
let calls, manage, notificationRead;
beforeEach(() => {
  calls = [];
  manage = true;
  notificationRead = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      calls.push([url, options]);
      let body = {};
      if (url.includes('preparation-options'))
        body = { canManage: manage, resources: [], topics: [] };
      else if (url.endsWith('/read')) {
        notificationRead = true;
        body = { notification: { read_at: 'now' } };
      } else if (url.includes('/notifications'))
        body = {
          data: [
            {
              notification_id: 'notice',
              session_id: 'session',
              payload: { title: session.title, groupId: 'group' },
              kind: 'created',
              read_at: notificationRead ? 'now' : null,
            },
          ],
          unread: notificationRead ? 0 : 1,
        };
      else if (url.endsWith('/rsvp'))
        body = { response: 'going', warnings: [] };
      else if (url.endsWith('/session'))
        body = {
          session,
          resources: [],
          counts: [{ response: 'going', count: 1 }],
          leaders: [{ full_name: 'Study Leader' }],
          canManage: manage,
          canRsvp: true,
          warnings: [],
        };
      else if (options.method === 'POST')
        body = { sessions: [session], warnings: [] };
      else body = { data: [session], pagination: { total: 1 } };
      return { ok: true, json: async () => body };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('leader creates a weekly session with accessible labelled fields', async () => {
  render(<StudySessions groupId="group" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Plan a session' }),
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Revision together' },
  });
  fireEvent.change(screen.getByLabelText('Topic'), {
    target: { value: 'Databases' },
  });
  fireEvent.change(screen.getByLabelText('Room'), {
    target: { value: 'Room A' },
  });
  fireEvent.change(screen.getByLabelText('Weekly occurrences (1–12)'), {
    target: { value: '2' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Save session' }).closest('form'),
  );
  await waitFor(() =>
    expect(
      calls.some(
        ([u, o]) =>
          u.endsWith('/sessions') &&
          o.method === 'POST' &&
          JSON.parse(o.body).weeks === 2,
      ),
    ).toBe(true),
  );
});
it('member sees details, preparation, counts and RSVP but no creation control', async () => {
  manage = false;
  render(<StudySessions groupId="group" sessionId="session" />);
  await screen.findByText('Read the handout', { exact: false });
  expect(screen.queryByRole('button', { name: 'Plan a session' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Going', exact: true }));
  await waitFor(() =>
    expect(
      calls.some(
        ([u, o]) =>
          u.endsWith('/rsvp') && JSON.parse(o.body).response === 'going',
      ),
    ).toBe(true),
  );
});
it('blocks past dates and invalid durations before sending a session request', async () => {
  render(<StudySessions groupId="group" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Plan a session' }),
  );
  fireEvent.change(screen.getByLabelText('Starts at'), {
    target: { value: '2000-01-01T10:00' },
  });
  fireEvent.change(screen.getByLabelText('Ends at'), {
    target: { value: '2000-01-01T11:00' },
  });
  const form = screen
    .getByRole('button', { name: 'Save session' })
    .closest('form');
  fireEvent.submit(form);
  expect(screen.getByRole('alert').textContent).toBe(
    'Choose a future start time.',
  );
  expect(calls.some(([, o]) => o.method === 'POST')).toBe(false);
  fireEvent.change(screen.getByLabelText('Starts at'), {
    target: { value: '2030-01-02T10:00' },
  });
  fireEvent.change(screen.getByLabelText('Ends at'), {
    target: { value: '2030-01-02T09:00' },
  });
  fireEvent.submit(form);
  expect(screen.getByRole('alert').textContent).toContain(
    'at most eight hours',
  );
  expect(calls.some(([, o]) => o.method === 'POST')).toBe(false);
});
it('plans an online session without displaying or requiring a meeting link', async () => {
  render(<StudySessions groupId="group" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Plan a session' }),
  );
  fireEvent.change(screen.getByLabelText('Mode'), {
    target: { value: 'online' },
  });
  expect(screen.queryByLabelText('Room')).toBeNull();
  expect(screen.queryByText(/meeting link|Open HTTPS meeting/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Online revision' },
  });
  fireEvent.change(screen.getByLabelText('Topic'), {
    target: { value: 'Databases' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Save session' }).closest('form'),
  );
  await waitFor(() =>
    expect(
      calls.some(
        ([, o]) => o.method === 'POST' && JSON.parse(o.body).location === '',
      ),
    ).toBe(true),
  );
});
it('month and week calendars provide native keyboard-focusable session buttons', async () => {
  render(<StudySessions groupId="group" />);
  await screen.findByRole('button', { name: /Revision together/ });
  fireEvent.click(
    screen.getByRole('button', { name: 'Month view', exact: true }),
  );
  await waitFor(() =>
    expect(
      document.querySelector('[aria-label="month calendar"]'),
    ).not.toBeNull(),
  );
  const button = document.querySelector('.session-calendar button');
  button.focus();
  expect(document.activeElement).toBe(button);
  fireEvent.click(
    screen.getByRole('button', { name: 'Week view', exact: true }),
  );
  expect(document.querySelector('[aria-label="week calendar"]')).not.toBeNull();
});
it('upcoming empty state is honest', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  render(<UpcomingSessions />);
  expect(
    await screen.findByText('No upcoming study sessions yet.'),
  ).toBeTruthy();
});
it('notification bell marks only the chosen notification read', async () => {
  render(<Notifications onOpen={() => {}} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Notifications: 1 unread' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
  await screen.findByRole('button', { name: 'Notifications: 0 unread' });
  expect(
    calls.some(([u, o]) => u.endsWith('/notice/read') && o.method === 'POST'),
  ).toBe(true);
});
