// @vitest-environment jsdom
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CodeLabPlayer, Quizzes } from './main.jsx';

const lab = {
  lab_id: 'lab-code-errors',
  title: 'HTML essentials',
  instructions: 'Add a heading and paragraph.',
  difficulty: 1,
  config: {
    starterHtml: '<h1>Start</h1><p>Paragraph</p>',
    checks: [
      { type: 'element_exists', selector: 'h1' },
      { type: 'element_exists', selector: 'p' },
    ],
  },
};
let fetchMock;
beforeEach(() => {
  fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ attempt: null }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows and retries a failed quiz module request instead of an empty selector', async () => {
  fetchMock
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { message: 'Modules could not be loaded.' },
      }),
    })
    .mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  render(<Quizzes user={{ role: 'student' }} />);
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Modules could not be loaded.',
  );
  expect(screen.getByLabelText('Module').disabled).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry loading modules' }),
  );
  await screen.findByText(
    'No modules are available. Enrol in a module from Modules to access its quizzes.',
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

it('never reports repaired invalid HTML as completed, even when DOM checks pass', async () => {
  render(<CodeLabPlayer lab={lab} onBack={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('html code'), {
    target: { value: '<h1>word<h1><p>Paragraph</p>' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
  await screen.findAllByText(/HTML line 1, column/);
  fireEvent(
    window,
    new MessageEvent('message', {
      source: screen.getByTitle('Code preview').contentWindow,
      data: { type: 'checks', results: [{ passed: true }, { passed: true }] },
    }),
  );
  expect(screen.getByText('0 of 2 checks passed')).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Save draft', exact: true }),
  );
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, options]) => options?.method === 'PUT'),
    ).toBe(true),
  );
  const saved = JSON.parse(
    fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')[1]
      .body,
  );
  expect(saved).toMatchObject({
    completed: false,
    checksPassed: 0,
    checksTotal: 2,
  });
});

it('invalidates passed checks on runtime errors and clears stale results on reset', async () => {
  render(<CodeLabPlayer lab={lab} onBack={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Run', exact: true }).disabled,
    ).toBe(false),
  );
  fireEvent(
    window,
    new MessageEvent('message', {
      source: screen.getByTitle('Code preview').contentWindow,
      data: { type: 'checks', results: [{ passed: true }, { passed: true }] },
    }),
  );
  expect(screen.getByText('2 of 2 checks passed')).toBeTruthy();
  fireEvent(
    window,
    new MessageEvent('message', {
      source: screen.getByTitle('Code preview').contentWindow,
      data: {
        type: 'console',
        level: 'error',
        text: 'JavaScript: broken script',
      },
    }),
  );
  expect(screen.getByText('0 of 2 checks passed')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('Code errors found');
  fireEvent.click(screen.getByRole('button', { name: 'Reset', exact: true }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('0 of 2 checks passed')).toBeTruthy();
});

it('shows a failed draft request as an error instead of a green success message', async () => {
  fetchMock.mockImplementation(async (_url, options) => ({
    ok: options?.method !== 'PUT',
    json: async () =>
      options?.method === 'PUT'
        ? { error: { message: 'Draft save failed. Try again.' } }
        : { attempt: null },
  }));
  render(<CodeLabPlayer lab={lab} onBack={vi.fn()} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Save draft', exact: true }),
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Draft save failed. Try again.',
  );
  expect(screen.queryByText(/Draft saved/)).toBeNull();
});
