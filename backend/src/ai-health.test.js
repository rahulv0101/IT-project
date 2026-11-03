// @ts-nocheck - HTTP and mock fixtures use runtime-shaped responses.
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiHealthProbe } from './ai-health.js';

afterEach(() => vi.restoreAllMocks());
describe('AI health probes', () => {
  it('accepts an authenticated cold-start response taking longer than one second', async () => {
    let authenticated = false;
    const server = createServer((req, res) => {
      authenticated =
        req.headers['x-ai-service-token'] === 'test-service-secret';
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"status":"ok"}');
      }, 1200);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const probe = createAiHealthProbe();
      expect(
        await probe(
          `http://127.0.0.1:${server.address().port}/`,
          'test-service-secret',
        ),
      ).toBe(true);
      expect(authenticated).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
  it('bounds unavailable probes and allows a successful retry', async () => {
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(
        (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason)),
          ),
      )
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
    const probe = createAiHealthProbe({ timeoutMs: 25, fetchFn });
    expect(await probe('http://ai.test', 'test-secret')).toBe(false);
    expect(await probe('http://ai.test', 'test-secret')).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('shares concurrent probes, caches only success and expires it', async () => {
    let release;
    let time = 1000;
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
    const probe = createAiHealthProbe({ fetchFn, now: () => time });
    const first = probe('http://ai.test', 'one');
    const second = probe('http://ai.test', 'one');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    release({ ok: true, json: async () => ({ status: 'ok' }) });
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(await probe('http://ai.test', 'one')).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    time += 30001;
    expect(await probe('http://ai.test', 'one')).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(await probe('http://ai.test', 'changed')).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
  it.each([
    { ok: false, json: async () => ({ status: 'ok' }) },
    { ok: true, json: async () => ({ status: 'not ready' }) },
    {
      ok: true,
      json: async () => {
        throw Error('HTML deployment page');
      },
    },
  ])(
    'rejects unhealthy and non-JSON responses without caching failure',
    async (response) => {
      const fetchFn = vi.fn().mockResolvedValue(response);
      const probe = createAiHealthProbe({ fetchFn });
      expect(await probe('http://ai.test', 'secret')).toBe(false);
      expect(await probe('http://ai.test', 'secret')).toBe(false);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    },
  );
});
