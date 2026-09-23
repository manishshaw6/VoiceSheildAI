const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    audio_filename TEXT,
    duration DOUBLE PRECISION,
    transcript TEXT,
    deepfake_score DOUBLE PRECISION,
    scam_score DOUBLE PRECISION,
    speaker_score DOUBLE PRECISION,
    final_score DOUBLE PRECISION,
    risk_level TEXT,
    threat_category TEXT,
    indicators TEXT,
    raw_result TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS speaker_profiles (
    id TEXT PRIMARY KEY,
    profile_id TEXT UNIQUE,
    speaker_id TEXT,
    name TEXT,
    display_name TEXT,
    embedding TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    sample_filename TEXT,
    model_name TEXT,
    model_version TEXT,
    embedding_dimension INTEGER,
    enrollment_quality DOUBLE PRECISION,
    speech_duration DOUBLE PRECISION,
    source_hash TEXT,
    sample_count INTEGER DEFAULT 1,
    samples_meta TEXT DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'OPEN',
    record TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT,
    call_id TEXT,
    request_id TEXT,
    metadata TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE,
    supabase_id TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    full_name TEXT,
    username TEXT UNIQUE,
    picture TEXT,
    password_hash TEXT,
    password_salt TEXT,
    mail_password_encrypted TEXT,
    email_verified INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS user_oauth_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    scope_type TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at BIGINT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider, scope_type)
  )`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    organization_type TEXT NOT NULL,
    country TEXT DEFAULT 'IN',
    official_domain TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS organization_contacts (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel_type TEXT NOT NULL DEFAULT 'email',
    destination TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    verification_source TEXT,
    verified_at TIMESTAMPTZ,
    enabled INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS incident_reports (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    analysis_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    organization_id TEXT,
    organization_contact_id TEXT,
    status TEXT NOT NULL DEFAULT 'READY_FOR_REVIEW',
    report_payload TEXT NOT NULL,
    report_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE,
    delivery_metadata TEXT DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    key_name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT UNIQUE NOT NULL,
    permissions TEXT DEFAULT '["forensics:read","forensics:write","live:stream"]',
    status TEXT DEFAULT 'ACTIVE',
    rate_limit_rpm INTEGER DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
  )`,
  'CREATE INDEX IF NOT EXISTS idx_analyses_timestamp ON analyses(timestamp DESC)',
  'ALTER TABLE analyses ADD COLUMN IF NOT EXISTS user_id TEXT',
  'CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id)',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_id TEXT',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_id ON users(supabase_id)',
  'CREATE INDEX IF NOT EXISTS idx_incidents_call_id ON incidents(call_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_events_call_id ON audit_events(call_id)',
  'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_incident_reports_user_id ON incident_reports(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)'
];

const trustedOrganizations = [
  ['org_sbi', 'State Bank of India', ['sbi', 'state bank', 'state bank of india', 'sbi bank', 'state bank group'], 'BANK', 'IN', 'sbi.co.in'],
  ['org_hdfc', 'HDFC Bank', ['hdfc', 'hdfc bank', 'hdfc customer care', 'hdfc security'], 'BANK', 'IN', 'hdfcbank.com'],
  ['org_icici', 'ICICI Bank', ['icici', 'icici bank', 'icici direct'], 'BANK', 'IN', 'icicibank.com'],
  ['org_airtel', 'Bharti Airtel', ['airtel', 'bharti airtel', 'airtel telecom', 'airtel payments bank'], 'TELECOM', 'IN', 'airtel.in'],
  ['org_amazon', 'Amazon India', ['amazon', 'amazon india', 'amazon pay', 'amazon refund'], 'ECOMMERCE', 'IN', 'amazon.in'],
  ['org_paytm', 'Paytm', ['paytm', 'one97 communications', 'paytm payments bank'], 'FINTECH', 'IN', 'paytm.com'],
  ['org_demo', 'VoxShield Demo Test Organization', ['demo bank', 'test organization', 'xyz bank', 'demo corp', 'voxshield demo'], 'DEMO', 'IN', 'voxshield.ai'],
  ['org_kotak', 'Kotak Mahindra Bank', ['kotak', 'kotak bank', 'kotak mahindra', 'kotak mahindra bank', 'kotak 811'], 'BANK', 'IN', 'kotak.com'],
  ['org_unverified_sample', 'Unverified Entity (Security Test)', ['unverified entity', 'sample unverified org'], 'DEMO', 'IN', 'unverified.example.com']
];

const trustedContacts = [
  ['contact_sbi_fraud', 'org_sbi', 'email', 'jakkulaayushpreetham@gmail.com', 1, 'RBI Regulated Entity Directory (Verified)', 1],
  ['contact_hdfc_fraud', 'org_hdfc', 'email', 'jakkula.premsagar@gmail.com', 1, 'RBI Regulated Entity Directory (Verified)', 1],
  ['contact_icici_fraud', 'org_icici', 'email', 'antifraud.demo@voxshield.local', 1, 'RBI Regulated Entity Staging Directory', 1],
  ['contact_airtel_abuse', 'org_airtel', 'email', 'telecom.abuse.demo@voxshield.local', 1, 'DoT Telecom Security Registry', 1],
  ['contact_amazon_security', 'org_amazon', 'email', 'brand.protection.demo@voxshield.local', 1, 'Corporate Security Operations Directory', 1],
  ['contact_paytm_fraud', 'org_paytm', 'email', 'frauddesk.demo@voxshield.local', 1, 'FinTech Compliance Directory', 1],
  ['contact_kotak_fraud', 'org_kotak', 'email', 'katarapchandrashekargoud@gmail.com', 1, 'RBI Regulated Entity Directory (Verified)', 1],
  ['contact_sample_unverified', 'org_unverified_sample', 'email', 'unverified-reporting-contact@example.com', 0, 'UNVERIFIED - FOR SECURITY POLICY VALIDATION', 1]
];

export async function initializePostgresSchema(sql, { devTestRecipient } = {}) {
  for (const statement of schemaStatements) await sql.unsafe(statement);

  for (const organization of trustedOrganizations) {
    await sql.unsafe(`
      INSERT INTO organizations (id, display_name, aliases, organization_type, country, official_domain)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        aliases = EXCLUDED.aliases,
        organization_type = EXCLUDED.organization_type,
        country = EXCLUDED.country,
        official_domain = EXCLUDED.official_domain
    `, [organization[0], organization[1], JSON.stringify(organization[2]), ...organization.slice(3)]);
  }

  const contacts = [
    ...trustedContacts,
    ['contact_demo_mailbox', 'org_demo', 'email', devTestRecipient || 'test-fraud-desk@voxshield.local', 1, 'Developer Controlled Demo / Test Mailbox', 1]
  ];
  for (const contact of contacts) {
    await sql.unsafe(`
      INSERT INTO organization_contacts
        (id, organization_id, channel_type, destination, verified, verification_source, verified_at, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
      ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        channel_type = EXCLUDED.channel_type,
        destination = EXCLUDED.destination,
        verified = EXCLUDED.verified,
        verification_source = EXCLUDED.verification_source,
        enabled = EXCLUDED.enabled
    `, contact);
  }
}

export { schemaStatements };
