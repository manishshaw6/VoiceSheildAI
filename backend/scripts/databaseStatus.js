#!/usr/bin/env node

import { query, databaseEngine, closeDatabase } from '../src/database/db.js';

async function main() {
  const includeSchema = process.argv.includes('--schema');
  const tables = await query.all(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = ? ORDER BY table_name',
    ['public', 'BASE TABLE']
  );
  const counts = {};
  for (const { table_name: tableName } of tables) {
    if (!/^[a-z_]+$/.test(tableName)) continue;
    const row = await query.get(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
    counts[tableName] = row.count;
  }
  const output = { engine: databaseEngine, tables: counts };
  if (includeSchema) {
    const columns = await query.all(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = ?
      ORDER BY table_name, ordinal_position
    `, ['public']);
    output.columns = columns;
  }
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch(error => {
    console.error(`[database-status] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
