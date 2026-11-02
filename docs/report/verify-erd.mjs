import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required');

async function snapshot(client) {
  const tables = (
    await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `)
  ).rows.map((row) => row.table_name);
  const columns = (
    await client.query(`
    select table_name, column_name, ordinal_position, udt_name, data_type,
           is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position
  `)
  ).rows;
  const constraints = (
    await client.query(`
    select conrelid::regclass::text as table_name, conname,
           contype, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where connamespace = 'public'::regnamespace and conrelid <> 0
    order by table_name, conname
  `)
  ).rows;
  const indexes = (
    await client.query(`
    select tablename, indexname, indexdef from pg_indexes
    where schemaname = 'public' order by tablename, indexname
  `)
  ).rows;
  const triggers = (
    await client.query(`
    select c.relname as table_name, t.tgname as name,
           pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
    order by c.relname, t.tgname
  `)
  ).rows;
  return { tables, columns, constraints, indexes, triggers };
}

const client = new Client({ connectionString: url });
await client.connect();
const before = await snapshot(client);
await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
await client.query(await readFile('docs/report/schema.sql', 'utf8'));
const after = await snapshot(client);

const stable = (value) => JSON.stringify(value);
const compare = (name, left, right) => {
  const a = [...left].map(stable).sort();
  const b = [...right].map(stable).sort();
  return {
    name,
    pass: stable(a) === stable(b),
    before: a.length,
    after: b.length,
  };
};
const results = [
  compare('tables', before.tables, after.tables),
  compare('columns', before.columns, after.columns),
  compare('constraints', before.constraints, after.constraints),
  compare('indexes', before.indexes, after.indexes),
  compare('triggers', before.triggers, after.triggers),
];

const erd = await readFile('docs/report/ERD.md', 'utf8');
const erdTables = [...erd.matchAll(/^ {2}([A-Z][A-Z0-9_]*) \{$/gm)]
  .map((match) => match[1].toLowerCase())
  .sort();
const erdRelationships = (
  erd.match(
    /^ {2}[A-Z][A-Z0-9_]* (?:\|\||\}o|\}\||o\|)--(?:\|\||\}o|\}\||o\|) [A-Z][A-Z0-9_]* :/gm,
  ) || []
).length;
const foreignKeyCount = before.constraints.filter(
  (row) => row.contype === 'f',
).length;
results.push({
  name: 'ERD table count',
  pass: stable(erdTables) === stable([...before.tables].sort()),
  before: before.tables.length,
  after: erdTables.length,
});
results.push({
  name: 'ERD foreign-key relationship count',
  pass: erdRelationships === foreignKeyCount,
  before: foreignKeyCount,
  after: erdRelationships,
});

console.log(
  JSON.stringify({
    results,
    allPassed: results.every((result) => result.pass),
  }),
);
await client.end();

const reset = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'db:test:reset'],
  { cwd: process.cwd(), stdio: 'inherit', shell: process.platform === 'win32' },
);
process.exitCode =
  results.every((result) => result.pass) && reset.status === 0 ? 0 : 1;
