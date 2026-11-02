import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { resolvePython } from './python-runtime.mjs';

const steps = ['setup:token', 'db:start', 'db:migrate', 'seed', 'dev'];
if (process.argv.includes('--dry-run')) {
  console.log(`DRY RUN: project root = ${process.cwd()}`);
  for (const step of steps) console.log(`Would run: npm run ${step}`);
} else {
  resolvePython();
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  for (const step of steps) {
    const result = spawnSync(npm, ['run', step], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
}
