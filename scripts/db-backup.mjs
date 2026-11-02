// @ts-nocheck - database metadata is runtime-shaped.
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../backend/db.js';

export async function createBackup(filePath) {
  const client = await pool.connect();
  let dump;
  try {
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    const tables = (
      await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
      )
    ).rows.map((row) => row.table_name);
    dump = { version: 1, createdAt: new Date().toISOString(), tables: {} };
    for (const table of tables) {
      const columns = (
        await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
          [table],
        )
      ).rows.map((row) => row.column_name);
      dump.tables[table] = {
        columns,
        rows: (await client.query(`SELECT * FROM "${table}"`)).rows,
      };
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(dump, null, 2), { mode: 0o600 });
  return { filePath, tables: Object.keys(dump.tables).length };
}

if (process.argv[1]?.endsWith('db-backup.mjs')) {
  const filePath = path.resolve(
    process.argv[2] || `backups/eduquest-${Date.now()}.json`,
  );
  const result = await createBackup(filePath);
  console.log(`Backup written to ${result.filePath} (${result.tables} tables)`);
  await pool.end();
}
