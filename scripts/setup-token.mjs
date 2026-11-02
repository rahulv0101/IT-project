import { randomBytes, randomInt } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'dotenv';

const envPath = path.resolve(process.env.ENV_FILE || '.env');
const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function createToken(length = 48) {
  return Array.from(
    { length },
    () => alphabet[randomInt(alphabet.length)],
  ).join('');
}
let contents = await readFile(envPath, 'utf8').catch(() => '');
const values = parse(contents);
/** @param {string} key @param {string} value */
function setValue(key, value) {
  const pattern = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, 'm');
  contents = pattern.test(contents)
    ? contents.replace(pattern, `${key}=${value}`)
    : contents +
      (contents && !contents.endsWith('\n') ? '\n' : '') +
      `${key}=${value}\n`;
}
if (
  !values.AI_SERVICE_TOKEN ||
  values.AI_SERVICE_TOKEN === 'generate-a-long-random-token'
) {
  setValue('AI_SERVICE_TOKEN', createToken());
  console.log('AI_SERVICE_TOKEN=created');
} else console.log('AI_SERVICE_TOKEN=present');
const mfaKey = values.MFA_ENCRYPTION_KEY;
if (!mfaKey || mfaKey.startsWith('generate-a-')) {
  setValue('MFA_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
  console.log('MFA_ENCRYPTION_KEY=created');
} else {
  if (
    !/^[0-9a-f]{64}$/i.test(mfaKey) &&
    Buffer.from(mfaKey, 'base64').length !== 32
  )
    throw new Error(
      'MFA_ENCRYPTION_KEY must be a 32-byte key. Restore the existing key; setup will not rotate it.',
    );
  console.log('MFA_ENCRYPTION_KEY=present');
}
await writeFile(envPath, contents, { mode: 0o600 });
