// @ts-nocheck - this is a small cross-platform verification orchestrator.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import process from 'node:process';

const root = process.cwd();
const has = (name) => Boolean(process.env[name]);
const results = [];
function run(label, command, args = [], env = process.env) {
  const executable =
    process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  results.push({
    label,
    result:
      result.status === 0 ? 'passed' : `failed (${result.status ?? 'process'})`,
  });
}
console.log('Prerequisite variable names only:');
for (const name of [
  'DATABASE_URL',
  'TEST_DATABASE_URL',
  'REAL_TEST_DATABASE_URL',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'AI_API_KEY',
  'AI_PROVIDER',
  'AI_BASE_URL',
  'AI_MODEL',
  'AI_MAX_REQUESTS_PER_RUN',
])
  console.log(`${name}=${has(name) ? 'present' : 'missing'}`);
run('lint', 'npm', ['run', 'lint']);
run('format', 'npm', ['run', 'format:check']);
run('type-check', 'npm', ['run', 'typecheck']);
run('build', 'npm', ['--prefix', 'frontend', 'run', 'build']);
run('JavaScript suite', 'npm', ['test']);
run('Python suite', process.execPath, [
  'scripts/run-python.mjs',
  '-m',
  'pytest',
  'ai-service',
  '-q',
]);
run('Playwright and axe', 'npm', ['run', 'test:e2e']);
if (has('REAL_TEST_DATABASE_URL'))
  run('real PostgreSQL', 'npm', ['run', 'test:db:real']);
else
  results.push({
    label: 'real PostgreSQL',
    result:
      'blocked: REAL_TEST_DATABASE_URL — add it to .env, then run npm run verify:all',
  });
const selectedProvider = process.env.AI_PROVIDER || 'mock';
const aiCredentialPresent =
  selectedProvider === 'anthropic'
    ? has('ANTHROPIC_API_KEY')
    : selectedProvider === 'openai'
      ? has('OPENAI_API_KEY')
      : selectedProvider === 'openai_compatible'
        ? has('AI_API_KEY') && has('AI_BASE_URL')
        : false;
if (aiCredentialPresent) run('real AI', 'npm', ['run', 'test:ai:real']);
else
  results.push({
    label: 'real AI',
    result: `blocked: provider credentials for ${selectedProvider} — configure provider .env variables, then run npm run verify:all`,
  });
await mkdir('docs', { recursive: true });
const lines = [
  '# Verification run',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '| Check | Result |',
  '| --- | --- |',
  ...results.map(({ label, result }) => `| ${label} | ${result} |`),
  '',
  '## Not verified',
  '',
  '- Real PostgreSQL and live Anthropic checks are blocked when their variable names are missing.',
  '- Native backup uses pg_dump/pg_restore when available; otherwise use the JSON fallback.',
  '',
  '## Verdict',
  '',
  results.some((item) => item.result.startsWith('failed'))
    ? 'Not ready: one or more runnable checks failed.'
    : 'Ready with caveats: runnable checks passed; see blocked checks above.',
];
await appendFile('docs/VERIFICATION.md', `\n\n${lines.join('\n')}\n`);
process.exitCode = results.some(({ result }) => result.startsWith('failed'))
  ? 1
  : 0;
