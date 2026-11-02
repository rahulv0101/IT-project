import { spawn } from 'node:child_process';
import { resolvePython } from './python-runtime.mjs';

const child = spawn(resolvePython(), process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: true,
});
child.once('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM']))
  process.once(signal, () => child.kill(signal));
