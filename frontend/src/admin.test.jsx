// @vitest-environment jsdom
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from './admin.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Admin control centre', () => {
  it('shows platform metrics without academic score controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          users: { students: 12, lecturers: 3, suspended: 1 },
          modules: 4,
          quizzes: { published: 8 },
          openReports: 2,
        }),
      }),
    );
    render(<AdminPage />);
    expect(await screen.findByText('12')).toBeTruthy();
    expect(screen.queryByText('Open reports')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Moderation' })).toBeNull();
    expect(screen.queryByText(/edit score/i)).toBeNull();
  });

  it('lists users and performs an audited account action', async () => {
    const fetch = vi.fn().mockImplementation(async (url, options = {}) => ({
      ok: true,
      status: 200,
      json: async () =>
        options.method === 'PATCH'
          ? {}
          : url.endsWith('/users')
            ? {
                data: [
                  {
                    user_id: 'user-1',
                    full_name: 'Demo Student',
                    email: 'student@example.com',
                    role: 'student',
                    account_status: 'active',
                    mfa_enabled: false,
                  },
                ],
              }
            : {
                users: { students: 1, lecturers: 1, suspended: 0 },
                modules: 1,
                quizzes: { published: 1 },
                openReports: 0,
              },
    }));
    vi.stubGlobal('fetch', fetch);
    render(<AdminPage />);
    await screen.findByText('Students');
    fireEvent.click(screen.getByRole('button', { name: 'Users' }));
    expect(await screen.findByText('Demo Student')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/admin/users/user-1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('returns to Overview without rendering stale data from another tab', async () => {
    const dashboard = {
      users: { students: 12, lecturers: 3, suspended: 1 },
      modules: 4,
      quizzes: { published: 8 },
      openReports: 2,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url) => ({
        ok: true,
        status: 200,
        json: async () =>
          url.endsWith('/users')
            ? {
                data: [
                  {
                    user_id: 'user-1',
                    full_name: 'Demo Student',
                    email: 'student@example.com',
                    role: 'student',
                    account_status: 'active',
                    mfa_enabled: false,
                  },
                ],
              }
            : dashboard,
      })),
    );

    render(<AdminPage />);
    expect(await screen.findByText('12')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Users' }));
    expect(await screen.findByText('Demo Student')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(await screen.findByText('12')).toBeTruthy();
    expect(screen.getByText('Published quizzes')).toBeTruthy();
  });
});
