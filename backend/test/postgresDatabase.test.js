import test from 'node:test';
import assert from 'node:assert/strict';

import { toPostgresPlaceholders } from '../src/database/sqlDialect.js';
import { initializePostgresSchema, schemaStatements } from '../src/database/postgresSchema.js';

test('PostgreSQL placeholder conversion preserves quoted question marks', () => {
  assert.equal(
    toPostgresPlaceholders("SELECT * FROM analyses WHERE id = ? AND transcript = '?' AND user_id = ?"),
    "SELECT * FROM analyses WHERE id = $1 AND transcript = '?' AND user_id = $2"
  );
});

test('PostgreSQL schema initialization creates the complete backend schema', async () => {
  const calls = [];
  const fakeSql = {
    unsafe: async (statement, parameters = []) => {
      calls.push({ statement, parameters });
      return [];
    }
  };

  await initializePostgresSchema(fakeSql, { devTestRecipient: 'security-test@example.com' });

  assert.ok(schemaStatements.some(statement => statement.includes('CREATE TABLE IF NOT EXISTS analyses')));
  assert.ok(schemaStatements.some(statement => statement.includes('CREATE TABLE IF NOT EXISTS incident_reports')));
  assert.ok(schemaStatements.some(statement => statement.includes('idx_analyses_user_id')));
  assert.ok(calls.some(call => call.statement.includes('INSERT INTO organizations')));
  assert.ok(calls.some(call => call.parameters.includes('security-test@example.com')));
});
