import { DatabaseSync } from 'node:sqlite';

function normalizeParameters(parameters) {
  const values = Array.isArray(parameters) ? parameters : [parameters];
  return values.map(value => value === undefined ? null : value);
}

/**
 * Small compatibility layer for the callback API previously provided by the
 * legacy native SQLite dependency. This uses Node's built-in implementation,
 * so local development and one-time migrations need no external native addon.
 */
export function openSqliteDatabase(filename, { readOnly = false } = {}) {
  const database = new DatabaseSync(filename, {
    readOnly,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: true
  });

  return {
    serialize(callback) {
      callback();
    },

    run(statement, parameters = [], callback) {
      if (typeof parameters === 'function') {
        callback = parameters;
        parameters = [];
      }
      try {
        const result = database.prepare(statement).run(...normalizeParameters(parameters));
        const context = {
          lastID: Number(result.lastInsertRowid || 0),
          changes: Number(result.changes || 0)
        };
        callback?.call(context, null);
      } catch (error) {
        if (callback) callback(error);
        else throw error;
      }
      return this;
    },

    get(statement, parameters = [], callback) {
      try {
        callback(null, database.prepare(statement).get(...normalizeParameters(parameters)));
      } catch (error) {
        callback(error);
      }
    },

    all(statement, parameters = [], callback) {
      try {
        callback(null, database.prepare(statement).all(...normalizeParameters(parameters)));
      } catch (error) {
        callback(error);
      }
    },

    close(callback) {
      try {
        database.close();
        callback?.(null);
      } catch (error) {
        if (callback) callback(error);
        else throw error;
      }
    }
  };
}
