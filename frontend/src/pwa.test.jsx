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
import { PwaStatus } from './pwa.jsx';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('shows reconnect guidance when connectivity changes', () => {
  render(<PwaStatus />);
  fireEvent(window, new Event('offline'));
  expect(screen.getByText(/You’re offline. Reconnect/)).toBeTruthy();
  fireEvent(window, new Event('online'));
  expect(screen.queryByText(/You’re offline/)).toBeNull();
});
it('offers installation only after the browser supplies a user prompt', async () => {
  const prompt = vi.fn(async () => {}),
    event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  render(<PwaStatus />);
  expect(screen.queryByRole('button', { name: 'Install EduQuest' })).toBeNull();
  fireEvent(window, event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Install EduQuest' }));
  await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  fireEvent(window, new Event('appinstalled'));
  expect(screen.queryByRole('button', { name: 'Install EduQuest' })).toBeNull();
});
