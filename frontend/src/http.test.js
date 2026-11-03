// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { appFetch } from './http.js';
afterEach(() => vi.unstubAllGlobals());
it('announces invalid sessions while preserving the original response body', async () => {
  const listener = vi.fn();
  window.addEventListener('eduquest:session-expired', listener);
  try {
    const response = new Response(
      JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }),
      { status: 401 },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const returned = await appFetch('/api/v1/me/profile');
    expect(listener).toHaveBeenCalledOnce();
    expect((await returned.json()).error.code).toBe('UNAUTHENTICATED');
  } finally {
    window.removeEventListener('eduquest:session-expired', listener);
  }
});
it('keeps wrong-current-password failures on the password form', async () => {
  const listener = vi.fn();
  window.addEventListener('eduquest:session-expired', listener);
  try {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 'INVALID_PASSWORD' } }),
            { status: 401 },
          ),
        ),
    );
    await appFetch('/api/v1/me/password');
    expect(listener).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('eduquest:session-expired', listener);
  }
});
