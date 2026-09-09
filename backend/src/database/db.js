import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

// Ensure necessary directories exist
[config.dataDir, config.uploadDir, config.tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const db = new sqlite3.Database(config.dbPath, (err) => {
  if (err) {
    console.error('[VoiceShieldAI:DB] Database connection error:', err.message);
  } else {
    console.log('[VoiceShieldAI:DB] Connected to SQLite database at', config.dbPath);
    initSchema();
  }
});

function initSchema() {
  db.serialize(() => {
    // Analyses table
    db.run(`
      CREATE TABLE IF NOT EXISTS analyses (
        id TEXT PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        audio_filename TEXT,
        duration REAL,
        transcript TEXT,
        deepfake_score REAL,
        scam_score REAL,
        speaker_score REAL,
        final_score REAL,
        risk_level TEXT,
        threat_category TEXT,
        indicators TEXT,
        raw_result TEXT
      )
    `);
    // Speaker Profiles table for enrollment & verification
    db.run(`
      CREATE TABLE IF NOT EXISTS speaker_profiles (
        id TEXT PRIMARY KEY,
        speaker_id TEXT UNIQUE,
        name TEXT,
        embedding TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sample_filename TEXT,
        updated_at DATETIME,
        model_version TEXT,
        embedding_dimension INTEGER,
        enrollment_quality REAL,
        source_hash TEXT
      )
    `);
    // Additive migration for existing profile databases. Duplicate-column errors are expected.
    for (const statement of [
      'ALTER TABLE speaker_profiles ADD COLUMN updated_at DATETIME',
      'ALTER TABLE speaker_profiles ADD COLUMN model_version TEXT',
      'ALTER TABLE speaker_profiles ADD COLUMN embedding_dimension INTEGER',
      'ALTER TABLE speaker_profiles ADD COLUMN enrollment_quality REAL',
      'ALTER TABLE speaker_profiles ADD COLUMN source_hash TEXT'
    ]) db.run(statement, () => {});

    db.run(`
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        call_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'OPEN',
        record TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT,
        call_id TEXT,
        request_id TEXT,
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `);
  });
}

// Promise-based helper functions
export const query = {
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

export async function checkDatabase() {
  try {
    await query.get('SELECT 1 AS ok');
    return true;
  } catch {
    return false;
  }
}

export default db;
