import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve('frontend/dist');
const assets = (await readdir(path.join(root, 'assets')))
  .filter((name) => /\.(js|css|woff2?|png|svg)$/.test(name))
  .map((name) => `/assets/${name}`);
const precache = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  ...assets,
].sort();
const hash = crypto.createHash('sha256');
for (const file of precache) hash.update(await readFile(path.join(root, file)));
const version = hash.digest('hex').slice(0, 16);
const template = await readFile('frontend/pwa/sw.template.js', 'utf8');
await writeFile(
  path.join(root, 'sw.js'),
  template
    .replace('__BUILD_ID__', version)
    .replace('/*__PRECACHE__*/ []', JSON.stringify(precache)),
);
console.log(
  `PWA built: ${precache.length} public assets; private API traffic is never cached.`,
);
