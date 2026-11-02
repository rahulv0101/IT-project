import 'dotenv/config';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { createBackup } = await import('./db-backup.mjs');
const { restoreBackup } = await import('./db-restore.mjs');
const { pool } = await import('../backend/db.js');
const directory = await mkdtemp(path.join(os.tmpdir(), 'eduquest-backup-'));
const filePath = path.join(directory, 'round-trip.json');
const orderedRows = (/** @type {Record<string, unknown>[]} */ rows) =>
  rows.map((row) => JSON.stringify(row)).sort();
try {
  const before = (
    await pool.query(`SELECT count(*)::int AS count FROM schema_migrations`)
  ).rows[0].count;
  await createBackup(filePath);
  const original = JSON.parse(await readFile(filePath, 'utf8'));
  if (
    !original.tables.users.rows.length ||
    !original.tables.questions.rows.length
  )
    throw new Error('Backup check requires populated academic data');
  const corrupt = JSON.parse(JSON.stringify(original));
  corrupt.tables.resources.rows[0].uploaded_by = randomUUID();
  const corruptPath = path.join(directory, 'invalid-reference.json');
  await writeFile(corruptPath, JSON.stringify(corrupt));
  await assert.rejects(() => restoreBackup(corruptPath));
  const afterFailurePath = path.join(directory, 'after-failure.json');
  await createBackup(afterFailurePath);
  assert.deepEqual(
    JSON.parse(await readFile(afterFailurePath, 'utf8')).tables,
    original.tables,
  );
  const reordered = JSON.parse(JSON.stringify(original));
  for (const table of Object.values(reordered.tables)) table.columns.reverse();
  await writeFile(filePath, JSON.stringify(reordered));
  await restoreBackup(filePath);
  const after = (
    await pool.query(`SELECT count(*)::int AS count FROM schema_migrations`)
  ).rows[0].count;
  if (before !== after)
    throw new Error(
      `Backup round-trip changed migration count from ${before} to ${after}`,
    );
  const restoredPath = path.join(directory, 'restored.json');
  await createBackup(restoredPath);
  const restored = JSON.parse(await readFile(restoredPath, 'utf8'));
  for (const [table, data] of Object.entries(original.tables)) {
    const beforeRows = orderedRows(data.rows);
    const afterRows = orderedRows(restored.tables[table].rows);
    if (JSON.stringify(beforeRows) !== JSON.stringify(afterRows))
      throw new Error(`Backup changed rows in ${table}`);
  }
  console.log(
    `Populated backup/restore round-trip passed (${after} migrations, ${Object.keys(original.tables).length} tables)`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
  await pool.end();
}
