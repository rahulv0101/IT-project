// @ts-nocheck - backup JSON and database metadata are runtime-shaped.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../backend/db.js';

const quote = (name) => `"${name.replaceAll('"', '""')}"`;

export async function restoreBackup(filePath) {
  const dump = JSON.parse(await readFile(filePath, 'utf8'));
  if (dump.version !== 1 || !dump.tables || Array.isArray(dump.tables))
    throw new Error('Unsupported EduQuest backup format');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const columns = (
      await client.query(`SELECT c.table_name,c.column_name,c.data_type
      FROM information_schema.columns c JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name
      WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY c.ordinal_position`)
    ).rows;
    const schema = new Map();
    for (const column of columns) {
      if (!schema.has(column.table_name))
        schema.set(column.table_name, new Map());
      schema.get(column.table_name).set(column.column_name, column.data_type);
    }
    const names = Object.keys(dump.tables);
    if (names.length !== schema.size || names.some((name) => !schema.has(name)))
      throw new Error('Backup tables do not match the current database schema');
    for (const [table, data] of Object.entries(dump.tables)) {
      const known = schema.get(table);
      if (
        !Array.isArray(data.columns) ||
        !Array.isArray(data.rows) ||
        data.columns.length !== known.size ||
        new Set(data.columns).size !== known.size ||
        data.columns.some((column) => !known.has(column)) ||
        data.rows.some(
          (row) => !row || data.columns.some((column) => !(column in row)),
        )
      )
        throw new Error(`Invalid backup data for ${table}`);
    }
    const foreignKeys = (
      await client.query(`SELECT c.oid,ct.relname AS child,pt.relname AS parent,c.condeferrable,
      ca.attname AS child_column,pa.attname AS parent_column
      FROM pg_constraint c JOIN pg_class ct ON ct.oid=c.conrelid
      JOIN pg_class pt ON pt.oid=c.confrelid JOIN pg_namespace n ON n.oid=ct.relnamespace
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) ON true
      JOIN pg_attribute ca ON ca.attrelid=ct.oid AND ca.attnum=k.attnum
      JOIN pg_attribute pa ON pa.attrelid=pt.oid AND pa.attnum=c.confkey[k.ord::int]
      WHERE c.contype='f' AND n.nspname='public' ORDER BY c.oid,k.ord`)
    ).rows;
    // Deferrable turn/card cycles are checked at commit; other foreign keys stay active.
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    const remaining = new Set(names);
    const ordered = [];
    while (remaining.size) {
      const ready = [...remaining].filter(
        (table) =>
          !foreignKeys.some(
            (fk) =>
              fk.child === table &&
              fk.parent !== table &&
              !fk.condeferrable &&
              remaining.has(fk.parent),
          ),
      );
      if (!ready.length)
        throw new Error('Backup schema has unsupported foreign key cycles');
      for (const table of ready) {
        ordered.push(table);
        remaining.delete(table);
      }
    }
    const triggers = (
      await client.query(`SELECT c.relname AS table_name,t.tgname,t.tgenabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal`)
    ).rows;
    // Prevent quiz-creation and cleanup triggers from changing restored records.
    for (const table of names)
      await client.query(
        `ALTER TABLE public.${quote(table)} DISABLE TRIGGER USER`,
      );
    await client.query(
      `TRUNCATE TABLE ${names.map((name) => `public.${quote(name)}`).join(',')}`,
    );
    for (const table of ordered) {
      const data = dump.tables[table];
      const selfKeys = foreignKeys.filter(
        (fk) => fk.child === table && fk.parent === table && !fk.condeferrable,
      );
      const pending = [...data.rows];
      const inserted = new Map(
        selfKeys.map((fk) => [fk.parent_column, new Set()]),
      );
      while (pending.length) {
        const index = pending.findIndex((row) =>
          selfKeys.every(
            (fk) =>
              row[fk.child_column] == null ||
              row[fk.child_column] === row[fk.parent_column] ||
              inserted.get(fk.parent_column).has(row[fk.child_column]),
          ),
        );
        if (index < 0) throw new Error(`Invalid self-reference in ${table}`);
        const [row] = pending.splice(index, 1);
        const values = data.columns.map((column) => {
          const value = row[column];
          return ['json', 'jsonb'].includes(schema.get(table).get(column)) &&
            value !== null
            ? JSON.stringify(value)
            : value;
        });
        await client.query(
          `INSERT INTO public.${quote(table)} (${data.columns.map(quote).join(',')})
          VALUES (${values.map((_, index) => `$${index + 1}`).join(',')})`,
          values,
        );
        for (const fk of selfKeys)
          inserted.get(fk.parent_column).add(row[fk.parent_column]);
      }
    }
    // Drain deferred FK events before ALTER TABLE restores trigger states.
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    for (const trigger of triggers) {
      const mode = {
        O: 'ENABLE',
        D: 'DISABLE',
        R: 'ENABLE REPLICA',
        A: 'ENABLE ALWAYS',
      }[trigger.tgenabled];
      await client.query(
        `ALTER TABLE public.${quote(trigger.table_name)} ${mode} TRIGGER ${quote(trigger.tgname)}`,
      );
    }
    await client.query('COMMIT');
    return { filePath, tables: names.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('db-restore.mjs')) {
  if (!process.argv[2])
    throw new Error('Usage: node scripts/db-restore.mjs <backup.json>');
  const result = await restoreBackup(path.resolve(process.argv[2]));
  console.log(`Restored ${result.tables} tables from ${result.filePath}`);
  await pool.end();
}
