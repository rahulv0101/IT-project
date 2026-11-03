import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('PWA survives a real network outage and reconnects without caching private API data', async ({
  page,
}) => {
  const root = path.resolve('frontend/dist');
  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
  };
  const server = createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      });
      res.end(JSON.stringify({ error: { message: 'Sign in to continue.' } }));
      return;
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(
      root,
      pathname === '/' ? 'index.html' : pathname.slice(1),
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const bytes = await readFile(file);
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const listen = (port) =>
    new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const close = () =>
    new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(resolve);
      server.closeAllConnections();
    });
  await listen(0);
  const port = server.address().port;
  try {
    await page.goto(`http://127.0.0.1:${port}`);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    const cached = await page.evaluate(async () => {
      const lists = await Promise.all(
        (await caches.keys()).map(async (n) =>
          (await (await caches.open(n)).keys()).map(
            (r) => new URL(r.url).pathname,
          ),
        ),
      );
      return lists.flat();
    });
    expect(cached).toContain('/offline.html');
    expect(cached.some((p) => p.startsWith('/api/') || p === '/')).toBe(false);
    // Stop the actual origin: Firefox's setOffline emulation leaves SW fetches online.
    await close();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'You’re offline' }),
    ).toBeVisible();
    await listen(port);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
  } finally {
    await close();
  }
});
