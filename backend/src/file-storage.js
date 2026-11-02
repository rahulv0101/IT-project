import path from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { get, put, del } from '@vercel/blob';

const cloudStorage = () =>
  Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
/** @param {string} file */
const key = (file) => `uploads/${path.basename(file)}`;

/** Persist validated uploads before committing their database reference.
 * @param {string} file
 * @param {Buffer} bytes
 */
export async function persistUpload(file, bytes) {
  if (cloudStorage())
    await put(key(file), bytes, { access: 'private', addRandomSuffix: false });
}

/** Call only after the requesting user's resource/group access is checked.
 * @param {string} file
 */
export async function readUpload(file) {
  if (!cloudStorage()) return readFile(file);
  const blob = await get(key(file), { access: 'private', useCache: false });
  if (!blob || blob.statusCode !== 200) throw new Error('FILE_NOT_FOUND');
  return Buffer.from(await new Response(blob.stream).arrayBuffer());
}

/** @param {string} file */
export async function removeUpload(file) {
  if (cloudStorage()) await del(key(file));
  await unlink(file).catch(() => {});
}
