// @vitest-environment jsdom
import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GroupChat } from './group-chat.jsx';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      if (String(url).endsWith('/reports'))
        return {
          ok: true,
          json: async () => ({
            data: [{ report_id: 'r1', reason: 'spam', body: 'Reported text' }],
          }),
        };
      if (options.method === 'POST')
        return {
          ok: true,
          json: async () => ({
            message_id: 'new',
            author_name: 'Student',
            body: 'Posted',
            kind: 'message',
          }),
        };
      return {
        ok: true,
        headers: { get: () => 'etag-1' },
        json: async () => ({
          data: [
            {
              message_id: 'm1',
              author_name: 'Leader',
              body: 'Use https://example.com and <b>text</b>',
              kind: 'announcement',
              pinned: true,
            },
          ],
          nextAfter: 'm1',
        }),
      };
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
});

it('renders escaped message text and safe https links', async () => {
  const { container } = render(<GroupChat groupId="group" />);
  expect(await screen.findByText(/Use/)).toBeTruthy();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('.chat-message p').textContent).toContain(
    '<b>text</b>',
  );
  const link = screen.getByRole('link', { name: 'https://example.com' });
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
});

it('posts a member message and shows the status', async () => {
  render(<GroupChat groupId="group" />);
  await screen.findByText(/Leader/);
  fireEvent.change(screen.getByLabelText('Write a message'), {
    target: { value: 'Hello group' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Post message' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Message posted.'),
  );
});

it('renders a read-only lecturer view without a composer', async () => {
  render(<GroupChat groupId="group" readOnly />);
  await screen.findByText(/Leader/);
  expect(screen.queryByLabelText('Write a message')).toBeNull();
  expect(screen.getByText(/only members can post/)).toBeTruthy();
});

it('lets a leader choose announcements and see the moderation list', async () => {
  render(<GroupChat groupId="group" canModerate />);
  await screen.findByText(/Leader/);
  expect(
    screen.getByRole('complementary', { name: 'Open message reports' })
      .textContent,
  ).toContain('spam');
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Post as announcement' }),
  );
  fireEvent.change(screen.getByLabelText('Write a message'), {
    target: { value: 'Next study focus' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Post announcement' }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/groups/group/messages',
      expect.objectContaining({
        body: JSON.stringify({
          body: 'Next study focus',
          kind: 'announcement',
        }),
      }),
    ),
  );
});

it('stops polling after unmount and while the tab is hidden', async () => {
  vi.useFakeTimers();
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const view = render(<GroupChat groupId="group" />);
  await vi.advanceTimersByTimeAsync(0);
  const initialCalls = fetch.mock.calls.length;
  hidden = true;
  await vi.advanceTimersByTimeAsync(12000);
  expect(fetch).toHaveBeenCalledTimes(initialCalls);
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch.mock.calls.length).toBeGreaterThan(initialCalls);
  view.unmount();
  await vi.advanceTimersByTimeAsync(12000);
  const callsAfterUnmount = fetch.mock.calls.length;
  await vi.advanceTimersByTimeAsync(12000);
  expect(fetch).toHaveBeenCalledTimes(callsAfterUnmount);
  vi.useRealTimers();
});

it('backs off repeated polling errors instead of creating a tight loop', async () => {
  vi.useFakeTimers();
  fetch.mockRejectedValue(new Error('offline'));
  render(<GroupChat groupId="group" />);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(4000);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4000);
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(16000);
  expect(fetch).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
});

it('refreshes edited messages without duplicates on repeated polling', async () => {
  vi.useFakeTimers();
  let reads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => `etag-${++reads}` },
      json: async () => ({
        data: [
          {
            message_id: 'same',
            author_name: 'Ada',
            body: reads > 1 ? 'Edited message' : 'Original message',
            kind: 'message',
          },
        ],
      }),
    })),
  );
  const view = render(<GroupChat groupId="one" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('Original message')).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8000);
  });
  expect(screen.getAllByText('Edited message')).toHaveLength(1);
  expect(screen.queryByText('Original message')).toBeNull();
  view.unmount();
  vi.useRealTimers();
});
it('discards a delayed response from a previous group', async () => {
  let release;
  vi.stubGlobal(
    'fetch',
    vi.fn((url) =>
      url.includes('/old/')
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => '' },
            json: async () => ({
              data: [
                {
                  message_id: 'new',
                  body: 'Current group only',
                  kind: 'message',
                },
              ],
            }),
          }),
    ),
  );
  const view = render(<GroupChat groupId="old" />);
  view.rerender(<GroupChat groupId="new" />);
  await screen.findByText('Current group only');
  release({
    ok: true,
    status: 200,
    headers: { get: () => '' },
    json: async () => ({
      data: [{ message_id: 'old', body: 'Old private group', kind: 'message' }],
    }),
  });
  await waitFor(() =>
    expect(screen.queryByText('Old private group')).toBeNull(),
  );
  expect(screen.getByText('Current group only')).toBeTruthy();
});
