#!/usr/bin/env node

import postgres from 'postgres';
import { config } from '../src/config/index.js';
import { initializePostgresSchema } from '../src/database/postgresSchema.js';
import { openSqliteDatabase } from '../src/database/sqliteCompat.js';

const tablePlan = [
  { table: 'users', conflict: ['id'] },
  { table: 'organizations', conflict: ['id'] },
  { table: 'organization_contacts', conflict: ['id'] },
  { table: 'analyses', conflict: ['id'] },
  { table: 'speaker_profiles', conflict: ['id'] },
  { table: 'incidents', conflict: ['id'] },
  { table: 'audit_events', conflict: ['id'] },
  { table: 'user_sessions', conflict: ['session_id'] },
  { table: 'user_oauth_tokens', conflict: ['id'] },
  { table: 'incident_reports', conflict: ['id'] },
  { table: 'api_keys', conflict: ['id'] }
];

function openSqlite(filename) {
  return Promise.resolve(openSqliteDatabase(filename, { readOnly: true }));
}

function readAll(source, statement) {
  return new Promise((resolve, reject) => {
    source.all(statement, [], (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function closeSqlite(source) {
  return new Promise(resolve => source.close(() => resolve()));
}

async function migrateTable(source, target, { table, conflict }) {
  const exists = await readAll(source, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table}'`);
  if (exists.length === 0) return { table, migrated: 0, skipped: true };
  const rows = await readAll(source, `SELECT * FROM ${table}`);
  for (const row of rows) {
    const columns = Object.keys(row);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const updates = columns.filter(column => !conflict.includes(column))
      .map(column => `${column} = EXCLUDED.${column}`).join(', ');
    const conflictAction = updates ? `DO UPDATE SET ${updates}` : 'DO NOTHING';
    await target.unsafe(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${conflict.join(', ')}) ${conflictAction}`,
      columns.map(column => row[column])
    );
  }
  return { table, migrated: rows.length, skipped: false };
}

async function main() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required. Use the Supabase Session Pooler connection string.');
  const source = await openSqlite(config.dbPath);
  const target = postgres(config.databaseUrl, { ssl: 'require', max: 1, prepare: false });
  try {
    await initializePostgresSchema(target, { devTestRecipient: config.devTestRecipient });
    for (const plan of tablePlan) {
      const result = await migrateTable(source, target, plan);
      console.log(`[migration] ${result.table}: ${result.skipped ? 'not present' : `${result.migrated} row(s)`}`);
    }
    await target.unsafe(`SELECT setval(pg_get_serial_sequence('audit_events', 'id'), COALESCE((SELECT MAX(id) FROM audit_events), 1), true)`);
    await target.unsafe(`SELECT setval(pg_get_serial_sequence('user_oauth_tokens', 'id'), COALESCE((SELECT MAX(id) FROM user_oauth_tokens), 1), true)`);
    console.log('[migration] SQLite to Supabase PostgreSQL migration completed.');
  } finally {
    await closeSqlite(source);
    await target.end({ timeout: 5 });
  }
}

main().catch(error => {
  console.error('[migration] Failed:', error.message);
  process.exitCode = 1;
});
