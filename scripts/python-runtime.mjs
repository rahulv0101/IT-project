import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Find a Python 3.11+ interpreter, preferring the project's environment. */
export function resolvePython() {
  const virtualenv = path.resolve(
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  const candidates = process.env.PYTHON_EXECUTABLE
    ? [process.env.PYTHON_EXECUTABLE]
    : [...(existsSync(virtualenv) ? [virtualenv] : []), 'python3', 'python'];
  for (const command of candidates) {
    const result = spawnSync(
      command,
      ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'],
      { stdio: 'ignore', timeout: 5000, windowsHide: true },
    );
    if (result.status === 0) return command;
  }
  throw new Error(
    'Python 3.11+ is required. Create .venv and install ai-service/requirements.txt, or set PYTHON_EXECUTABLE.',
  );
}
