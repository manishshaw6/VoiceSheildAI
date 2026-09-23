import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { initializePostgresSchema } from './postgresSchema.js';
import { toPostgresPlaceholders } from './sqlDialect.js';

// Ensure necessary directories exist
[config.dataDir, config.uploadDir, config.tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export const databaseEngine = config.databaseUrl ? 'postgres' : 'sqlite';
let db = null;
let pgClient = null;
let databaseReady = Promise.resolve();

if (databaseEngine === 'postgres') {
  let transactionPooler = false;
  try { transactionPooler = new URL(config.databaseUrl).port === '6543'; } catch { /* validated on connect */ }
  pgClient = postgres(config.databaseUrl, {
    max: config.databasePoolSize,
    ssl: 'require',
    prepare: !transactionPooler,
    connect_timeout: 15,
    idle_timeout: 30,
    max_lifetime: 60 * 30
  });
  databaseReady = initializePostgresSchema(pgClient, { devTestRecipient: config.devTestRecipient })
    .then(() => console.log('[VoiceShieldAI:DB] Connected to Supabase PostgreSQL'));
  databaseReady.catch(error => {
    console.error('[VoiceShieldAI:DB] PostgreSQL initialization error:', error.message);
  });
} else {
  const { openSqliteDatabase } = await import('./sqliteCompat.js');
  db = openSqliteDatabase(config.dbPath);
  console.log('[VoiceShieldAI:DB] Connected to built-in SQLite database at', config.dbPath);
  initSchema();
}

function initSchema() {
  db.serialize(() => {
    // Analyses table
    db.run(`
      CREATE TABLE IF NOT EXISTS analyses (
        id TEXT PRIMARY KEY,
        user_id TEXT,
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
    db.run('ALTER TABLE analyses ADD COLUMN user_id TEXT', () => {});
    db.run('CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id)');
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
    // Merged schema:
    // - Ayush branch: Google OAuth, sessions, Gmail permissions
    // - main branch: username + bcrypt password authentication
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        full_name TEXT,
        username TEXT UNIQUE,
        picture TEXT,
        password_hash TEXT,
        password_salt TEXT,
        mail_password_encrypted TEXT,
        email_verified INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME
      )
    `);

    // Additive migrations for existing users table.
    // These allow databases created by either branch to continue working.
    for (const statement of [
      'ALTER TABLE users ADD COLUMN google_id TEXT',
      'ALTER TABLE users ADD COLUMN supabase_id TEXT',
      'ALTER TABLE users ADD COLUMN full_name TEXT',
      'ALTER TABLE users ADD COLUMN username TEXT',
      'ALTER TABLE users ADD COLUMN picture TEXT',
      'ALTER TABLE users ADD COLUMN password_hash TEXT',
      'ALTER TABLE users ADD COLUMN password_salt TEXT',
      'ALTER TABLE users ADD COLUMN mail_password_encrypted TEXT',
      'ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP',
      'ALTER TABLE users ADD COLUMN last_login_at DATETIME'
    ]) {
      db.run(statement, () => {});
    }
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_id ON users(supabase_id)');

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
    `);

    // API Keys (External Integrations & Developer Layer)
    db.run(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        key_name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        permissions TEXT DEFAULT '["forensics:read","forensics:write","live:stream"]',
        status TEXT DEFAULT 'ACTIVE',
        rate_limit_rpm INTEGER DEFAULT 60,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME,
        expires_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
      id: 'org_kotak',
      display_name: 'Kotak Mahindra Bank',
      aliases: JSON.stringify(['kotak', 'kotak bank', 'kotak mahindra', 'kotak mahindra bank', 'kotak 811', '811 kotak', 'kotak security']),
      organization_type: 'BANK',
      country: 'IN',
      official_domain: 'kotak.com',
      contacts: [{
        id: 'contact_kotak_fraud',
        destination: 'katarapchandrashekargoud@gmail.com',
        verified: 1,
        verification_source: 'RBI Regulated Entity Directory (Verified)',
        enabled: 1
      }]
    },
    {
      id: 'org_unverified_sample',
      display_name: 'Unverified Entity (Security Test)',
      aliases: JSON.stringify(['unverified entity', 'sample unverified org']),
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

  for (const org of seedOrgs) {
    db.run(
      'INSERT OR REPLACE INTO organizations (id, display_name, aliases, organization_type, country, official_domain) VALUES (?, ?, ?, ?, ?, ?)',
      [org.id, org.display_name, org.aliases, org.organization_type, org.country, org.official_domain],
      () => {
        for (const c of org.contacts) {
          db.run(
            'INSERT OR REPLACE INTO organization_contacts (id, organization_id, channel_type, destination, verified, verification_source, verified_at, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [c.id, org.id, 'email', c.destination, c.verified, c.verification_source, new Date().toISOString(), c.enabled]
          );
        }
      }
    );
  }
}

// Promise-based helper functions
async function executePostgres(statement, params = []) {
  await databaseReady;
  return pgClient.unsafe(toPostgresPlaceholders(statement), params);
}

export const query = {
  run: (sql, params = []) => {
    if (databaseEngine === 'postgres') {
      return executePostgres(sql, params).then(result => ({
        lastID: result[0]?.id ?? null,
        changes: result.count ?? result.length ?? 0
      }));
    }
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get: (sql, params = []) => {
    if (databaseEngine === 'postgres') {
      return executePostgres(sql, params).then(rows => rows[0]);
    }
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all: (sql, params = []) => {
    if (databaseEngine === 'postgres') {
      return executePostgres(sql, params).then(rows => Array.from(rows));
    }
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

export const run = query.run;
export const get = query.get;
export const all = query.all;

export async function checkDatabase() {
  try {
    await query.get('SELECT 1 AS ok');
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase() {
  if (pgClient) await pgClient.end({ timeout: 5 });
  if (db) await new Promise(resolve => db.close(() => resolve()));
}

export { databaseReady };

export default databaseEngine === 'postgres' ? pgClient : db;
