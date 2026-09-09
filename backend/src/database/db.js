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
        profile_id TEXT UNIQUE,
        speaker_id TEXT,
        name TEXT,
        display_name TEXT,
        embedding TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        sample_filename TEXT,
        model_name TEXT,
        model_version TEXT,
        embedding_dimension INTEGER,
        enrollment_quality REAL,
        speech_duration REAL,
        source_hash TEXT,
        sample_count INTEGER DEFAULT 1,
        samples_meta TEXT DEFAULT '[]'
      )
    `);
    // Additive migration for existing profile databases. Duplicate-column errors are expected.
    for (const statement of [
      'ALTER TABLE speaker_profiles ADD COLUMN profile_id TEXT',
      'ALTER TABLE speaker_profiles ADD COLUMN display_name TEXT',
      'ALTER TABLE speaker_profiles ADD COLUMN updated_at DATETIME',
      'ALTER TABLE speaker_profiles ADD COLUMN model_name TEXT',
      'ALTER TABLE speaker_profiles ADD COLUMN model_version TEXT',
      'ALTER TABLE speaker_profiles ADD COLUMN embedding_dimension INTEGER',
      'ALTER TABLE speaker_profiles ADD COLUMN enrollment_quality REAL',
      'ALTER TABLE speaker_profiles ADD COLUMN speech_duration REAL',
      'ALTER TABLE speaker_profiles ADD COLUMN source_hash TEXT',
      'ALTER TABLE speaker_profiles ADD COLUMN sample_count INTEGER DEFAULT 1',
      'ALTER TABLE speaker_profiles ADD COLUMN samples_meta TEXT DEFAULT "[]"'
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

    // Authenticated Users
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        picture TEXT,
        password_hash TEXT,
        password_salt TEXT,
        mail_password_encrypted TEXT,
        email_verified INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME
      )
    `);

    // Additive migrations for users table
    for (const statement of [
      'ALTER TABLE users ADD COLUMN password_hash TEXT',
      'ALTER TABLE users ADD COLUMN password_salt TEXT',
      'ALTER TABLE users ADD COLUMN mail_password_encrypted TEXT'
      ,'ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1'
    ]) db.run(statement, () => {});

    // OAuth Tokens for Users (Encrypted at rest)
    db.run(`
      CREATE TABLE IF NOT EXISTS user_oauth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, provider, scope_type),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // User Sessions (HTTP-Only Cookie Session Store)
    db.run(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Trusted Organization Directory
    db.run(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        aliases TEXT NOT NULL DEFAULT '[]',
        organization_type TEXT NOT NULL,
        country TEXT DEFAULT 'IN',
        official_domain TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Trusted Organization Verified Reporting Channels
    db.run(`
      CREATE TABLE IF NOT EXISTS organization_contacts (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        channel_type TEXT NOT NULL DEFAULT 'email',
        destination TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        verification_source TEXT,
        verified_at DATETIME,
        enabled INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `);

    // Incident Reports (Digitally Signed & State Machine Tracked)
    db.run(`
      CREATE TABLE IF NOT EXISTS incident_reports (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL,
        analysis_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        organization_id TEXT,
        organization_contact_id TEXT,
        status TEXT NOT NULL DEFAULT 'READY_FOR_REVIEW',
        report_payload TEXT NOT NULL,
        report_hash TEXT NOT NULL,
        signature TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        sent_at DATETIME,
        idempotency_key TEXT UNIQUE,
        delivery_metadata TEXT DEFAULT '{}',
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, () => {
      seedTrustedDirectory();
    });
  });
}

function seedTrustedDirectory() {
  const seedOrgs = [
    {
      id: 'org_sbi',
      display_name: 'State Bank of India',
      aliases: JSON.stringify(['sbi', 'state bank', 'state bank of india', 'sbi bank', 'state bank group']),
      organization_type: 'BANK',
      country: 'IN',
      official_domain: 'sbi.co.in',
      contacts: [{
        id: 'contact_sbi_fraud',
        destination: 'jakkulaayushpreetham@gmail.com',
        verified: 1,
        verification_source: 'RBI Regulated Entity Directory (Verified)',
        enabled: 1
      }]
    },
    {
      id: 'org_hdfc',
      display_name: 'HDFC Bank',
      aliases: JSON.stringify(['hdfc', 'hdfc bank', 'hdfc customer care', 'hdfc security']),
      organization_type: 'BANK',
      country: 'IN',
      official_domain: 'hdfcbank.com',
      contacts: [{
        id: 'contact_hdfc_fraud',
        destination: 'jakkula.premsagar@gmail.com',
        verified: 1,
        verification_source: 'RBI Regulated Entity Directory (Verified)',
        enabled: 1
      }]
    },
    {
      id: 'org_icici',
      display_name: 'ICICI Bank',
      aliases: JSON.stringify(['icici', 'icici bank', 'icici direct']),
      organization_type: 'BANK',
      country: 'IN',
      official_domain: 'icicibank.com',
      contacts: [{
        id: 'contact_icici_fraud',
        destination: 'antifraud.demo@voxshield.local',
        verified: 1,
        verification_source: 'RBI Regulated Entity Staging Directory',
        enabled: 1
      }]
    },
    {
      id: 'org_airtel',
      display_name: 'Bharti Airtel',
      aliases: JSON.stringify(['airtel', 'bharti airtel', 'airtel telecom', 'airtel payments bank']),
      organization_type: 'TELECOM',
      country: 'IN',
      official_domain: 'airtel.in',
      contacts: [{
        id: 'contact_airtel_abuse',
        destination: 'telecom.abuse.demo@voxshield.local',
        verified: 1,
        verification_source: 'DoT Telecom Security Registry',
        enabled: 1
      }]
    },
    {
      id: 'org_amazon',
      display_name: 'Amazon India',
      aliases: JSON.stringify(['amazon', 'amazon india', 'amazon pay', 'amazon refund']),
      organization_type: 'ECOMMERCE',
      country: 'IN',
      official_domain: 'amazon.in',
      contacts: [{
        id: 'contact_amazon_security',
        destination: 'brand.protection.demo@voxshield.local',
        verified: 1,
        verification_source: 'Corporate Security Operations Directory',
        enabled: 1
      }]
    },
    {
      id: 'org_paytm',
      display_name: 'Paytm',
      aliases: JSON.stringify(['paytm', 'one97 communications', 'paytm payments bank']),
      organization_type: 'FINTECH',
      country: 'IN',
      official_domain: 'paytm.com',
      contacts: [{
        id: 'contact_paytm_fraud',
        destination: 'frauddesk.demo@voxshield.local',
        verified: 1,
        verification_source: 'FinTech Compliance Directory',
        enabled: 1
      }]
    },
    {
      id: 'org_demo',
      display_name: 'VoxShield Demo Test Organization',
      aliases: JSON.stringify(['demo bank', 'test organization', 'xyz bank', 'demo corp', 'voxshield demo', 'sample organization']),
      organization_type: 'DEMO',
      country: 'IN',
      official_domain: 'voxshield.ai',
      contacts: [{
        id: 'contact_demo_mailbox',
        destination: config.devTestRecipient || 'test-fraud-desk@voxshield.local',
        verified: 1,
        verification_source: 'Developer Controlled Demo / Test Mailbox',
        enabled: 1
      }]
    },
    {
      id: 'org_unverified_sample',
      display_name: 'Unverified Third-Party Entity',
      aliases: JSON.stringify(['unverified entity', 'sample unverified']),
      organization_type: 'DEMO',
      country: 'IN',
      official_domain: 'unverified.example.com',
      contacts: [{
        id: 'contact_sample_unverified',
        destination: 'unverified-reporting-contact@example.com',
        verified: 0, // Explicitly unverified to test blocking
        verification_source: 'UNVERIFIED — FOR SECURITY POLICY VALIDATION',
        enabled: 1
      }]
    }
  ];

  db.get('SELECT COUNT(*) as count FROM organizations', (err, row) => {
    if (err || !row || row.count > 0) return;
    for (const org of seedOrgs) {
      db.run(
        'INSERT OR IGNORE INTO organizations (id, display_name, aliases, organization_type, country, official_domain) VALUES (?, ?, ?, ?, ?, ?)',
        [org.id, org.display_name, org.aliases, org.organization_type, org.country, org.official_domain],
        () => {
          for (const c of org.contacts) {
            db.run(
              'INSERT OR IGNORE INTO organization_contacts (id, organization_id, channel_type, destination, verified, verification_source, verified_at, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [c.id, org.id, 'email', c.destination, c.verified, c.verification_source, new Date().toISOString(), c.enabled]
            );
          }
        }
      );
    }
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
