// @ts-nocheck - command runner is a small cross-platform runtime script.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${command} ${args.join(' ')} exited with code ${code}`),
        );
    });
  });
}

try {
  // Pure suites retain normal parallel execution. Database suites use one worker
  // against one fresh PGlite instance managed by Vitest global setup/teardown.
  const vitest = 'node_modules/vitest/vitest.mjs';
  await run(process.execPath, [
    vitest,
    'run',
    '--config',
    'vitest.unit.config.js',
  ]);
  // Independent checkouts/test runs must not reset each other's database.
  if (!process.env.PGLITE_SUITE_PORT) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('No free test database port');
    process.env.PGLITE_SUITE_PORT = String(address.port);
    await new Promise((resolve) => server.close(resolve));
  }
  await run(process.execPath, [
    vitest,
    'run',
    '--config',
    'vitest.db.config.js',
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
