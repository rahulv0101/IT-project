// @ts-nocheck - Blob responses are deliberately minimal stream test doubles.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get, put, del } from '@vercel/blob';
import {
  readUpload,
  persistUpload,
  removeUpload,
} from '../src/file-storage.js';
vi.mock('@vercel/blob', () => ({ get: vi.fn(), put: vi.fn(), del: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('durable private uploaded files', () => {
  it('retains normal filesystem behavior when cloud storage is not configured', async () => {
    vi.stubEnv('BLOB_STORE_ID', '');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    const folder = await mkdtemp(path.join(os.tmpdir(), 'eduquest-storage-'));
    const file = path.join(folder, 'document.txt');
    try {
      await writeFile(file, 'local notes');
      await persistUpload(file, Buffer.from('local notes'));
      expect((await readUpload(file)).toString()).toBe('local notes');
      expect(put).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      await removeUpload(file);
      await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  it('persists only a private random storage key and reads after local scratch files disappear', async () => {
    vi.stubEnv('BLOB_STORE_ID', 'store_test');
    const bytes = Buffer.from('private course notes');
    await persistUpload('/tmp/eduquest-uploads/random-id', bytes);
    expect(put).toHaveBeenCalledWith('uploads/random-id', bytes, {
      access: 'private',
      addRandomSuffix: false,
    });
    get.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    });
    expect(await readUpload('/different-instance/random-id')).toEqual(bytes);
    expect(get).toHaveBeenCalledWith('uploads/random-id', {
      access: 'private',
      useCache: false,
    });
    await removeUpload('/nonexistent/random-id');
    expect(del).toHaveBeenCalledWith('uploads/random-id');
  });
  it('fails closed when the private blob is unavailable', async () => {
    vi.stubEnv('BLOB_STORE_ID', 'store_test');
    get.mockResolvedValue(null);
    await expect(readUpload('/tmp/missing')).rejects.toThrow('FILE_NOT_FOUND');
  });
});
