import { readFile, appendFile } from 'node:fs/promises';
import { parse } from 'dotenv';

/** Fill local database defaults without replacing existing provider settings.
 * @param {string} file
 */
export async function ensureLocalDatabaseEnv(
  file,
  { devPort = 5432, testPort = 5433 } = {},
) {
  const contents = await readFile(file, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const existing = parse(contents);
  const defaults = {
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${devPort}/eduquest?sslmode=disable`,
    TEST_DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${testPort}/eduquest_test?sslmode=disable`,
    PGLITE_DEV_PORT: String(devPort),
    PGLITE_TEST_PORT: String(testPort),
  };
  const missing = Object.entries(defaults).filter(
    ([key]) => !existing[key]?.trim(),
  );
  if (missing.length) {
    const prefix = contents && !contents.endsWith('\n') ? '\n' : '';
    await appendFile(
      file,
      prefix +
        missing.map(([key, value]) => `${key}=${value}`).join('\n') +
        '\n',
      { mode: 0o600 },
    );
  }
  return [
    ...new Set([...Object.keys(existing), ...missing.map(([key]) => key)]),
  ];
}
