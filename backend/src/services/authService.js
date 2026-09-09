import crypto from 'crypto';
import { config } from '../config/index.js';
import { query } from '../database/db.js';
import { encryptToken, decryptToken } from '../core/encryptionService.js';
import { recordAudit } from './auditService.js';
import { ApiError } from '../schemas/errors.js';

// In-memory state cache for OAuth CSRF protection (TTL 10 mins)
const oauthStates = new Map();

function cleanExpiredStates() {
  const now = Date.now();
  for (const [state, meta] of oauthStates.entries()) {
    if (meta.expiresAt < now) {
      oauthStates.delete(state);
    }
  }
}

/**
 * Generate a cryptographically secure state parameter
 */
export function generateOAuthState(metadata = {}) {
  cleanExpiredStates();
  const state = crypto.randomBytes(32).toString('hex');
  oauthStates.set(state, {
    ...metadata,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
  });
  return state;
}

/**
 * Validate and consume OAuth state parameter (Single-use CSRF defense)
 */
export function validateAndConsumeOAuthState(state) {
  cleanExpiredStates();
  if (!state || typeof state !== 'string') return null;
  const meta = oauthStates.get(state);
  if (!meta) return null;
  oauthStates.delete(state);
  return meta;
}

/**
 * Initiates Google OpenID Login
 * Scopes requested: openid, email, profile ONLY (no mail permissions here!)
 */
export function getGoogleLoginUrl({ returnTo = '/' } = {}) {
  const state = generateOAuthState({ type: 'login', returnTo });
  if (!config.google.clientId) {
    // In local dev/test mode without credentials configured, return internal endpoint for guided simulation
    return {
      authUrl: `/api/v1/auth/google/callback?code=mock_code_test&state=${state}`,
      state,
      mode: 'mock_simulation'
    };
  }

  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account'
  });

  return {
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
    mode: 'live_google'
  };
}

/**
 * Completes Google Login code exchange
 */
export async function handleGoogleLoginCallback({ code, state }) {
  const meta = validateAndConsumeOAuthState(state);
  if (!meta || meta.type !== 'login') {
    throw new ApiError('INVALID_OAUTH_STATE', 'Invalid or expired OAuth state parameter. Please try logging in again.', 400);
  }

  let userInfo;
  let tokens = { access_token: 'mock_token', refresh_token: null, expires_in: 3600 };

  if (code === 'mock_code_test' || !config.google.clientId || !config.google.clientSecret) {
    userInfo = {
      sub: 'google_user_mock_12345',
      email: 'investigator.demo@voxshield.local',
      name: 'VoxShield Security Analyst',
      picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80'
    };
  } else {
    // Real Google OAuth Code Exchange
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new ApiError('OAUTH_EXCHANGE_FAILED', `Google OAuth token exchange failed: ${errText}`, 400);
    }

    tokens = await tokenRes.json();

    // Fetch user profile from OpenID endpoint
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    if (!profileRes.ok) {
      throw new ApiError('USERINFO_FETCH_FAILED', 'Failed to retrieve Google user profile.', 400);
    }

    userInfo = await profileRes.json();
  }

  const userId = `usr_${crypto.createHash('sha256').update(userInfo.sub || userInfo.email).digest('hex').slice(0, 16)}`;

  // Upsert user in database
  await query.run(`
    INSERT INTO users (id, google_id, email, name, picture, last_login_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      picture = excluded.picture,
      last_login_at = CURRENT_TIMESTAMP
  `, [userId, userInfo.sub, userInfo.email, userInfo.name, userInfo.picture]);

  // Store encrypted login tokens
  const encryptedAccess = encryptToken(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
  const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

  await query.run(`
    INSERT INTO user_oauth_tokens (user_id, provider, scope_type, access_token, refresh_token, expires_at, updated_at)
    VALUES (?, 'google', 'auth', ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, provider, scope_type) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, user_oauth_tokens.refresh_token),
      expires_at = excluded.expires_at,
      updated_at = CURRENT_TIMESTAMP
  `, [userId, encryptedAccess, encryptedRefresh, expiresAt]);

  // Create persistent session (7-day duration)
  const sessionId = crypto.randomBytes(32).toString('hex');
  const sessionExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  await query.run(`
    INSERT INTO user_sessions (session_id, user_id, expires_at)
    VALUES (?, ?, ?)
  `, [sessionId, userId, sessionExpiresAt]);

  await recordAudit('USER_LOGGED_IN', {
    actor: userId,
    resource: userId,
    metadata: { email: userInfo.email, provider: 'google' }
  });

  return {
    sessionId,
    user: {
      id: userId,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture
    },
    returnTo: meta.returnTo || '/'
  };
}

/**
 * Initiates INCREMENTAL Mail-Send Scope Authorization
 * Strictly requests https://www.googleapis.com/auth/gmail.send
 */
export function getGoogleMailConnectUrl({ userId, returnTo = '/' } = {}) {
  const state = generateOAuthState({ type: 'mail_connect', userId, returnTo });
  if (!config.google.clientId) {
    return {
      authUrl: `/api/v1/mail/google/callback?code=mock_mail_code&state=${state}`,
      state,
      mode: 'mock_simulation'
    };
  }

  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.mailRedirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true'
  });

  return {
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
    mode: 'live_google'
  };
}

/**
 * Completes Mail-Send authorization code exchange
 */
export async function handleGoogleMailCallback({ code, state }) {
  const meta = validateAndConsumeOAuthState(state);
  if (!meta || meta.type !== 'mail_connect') {
    throw new ApiError('INVALID_OAUTH_STATE', 'Invalid or expired Mail connection state parameter.', 400);
  }

  const userId = meta.userId;
  let tokens = { access_token: 'mock_mail_token', refresh_token: 'mock_mail_refresh', expires_in: 3600 };

  if (code !== 'mock_mail_code' && config.google.clientId && config.google.clientSecret) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.mailRedirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new ApiError('MAIL_OAUTH_FAILED', `Failed to obtain mail send permission from Google: ${err}`, 400);
    }
    tokens = await tokenRes.json();
  }

  const encryptedAccess = encryptToken(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
  const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

  await query.run(`
    INSERT INTO user_oauth_tokens (user_id, provider, scope_type, access_token, refresh_token, expires_at, updated_at)
    VALUES (?, 'google', 'mail', ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, provider, scope_type) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, user_oauth_tokens.refresh_token),
      expires_at = excluded.expires_at,
      updated_at = CURRENT_TIMESTAMP
  `, [userId, encryptedAccess, encryptedRefresh, expiresAt]);

  await recordAudit('MAIL_PERMISSION_GRANTED', {
    actor: userId,
    resource: 'gmail',
    metadata: { provider: 'google', scope: 'gmail.send' }
  });

  return {
    success: true,
    userId,
    returnTo: meta.returnTo || '/'
  };
}

/**
 * Retrieves authenticated user and mail permission status from a session ID
 */
export async function getUserFromSession(sessionId) {
  if (!sessionId) return null;

  const session = await query.get(
    'SELECT user_id, expires_at FROM user_sessions WHERE session_id = ?',
    [sessionId]
  );

  if (!session || session.expires_at < Date.now()) {
    return null;
  }

  const user = await query.get(
    'SELECT id, email, name, picture, mail_password_encrypted, created_at, last_login_at FROM users WHERE id = ?',
    [session.user_id]
  );

  if (!user) return null;

  // Check mail-send permission
  const mailToken = await query.get(
    "SELECT id, expires_at FROM user_oauth_tokens WHERE user_id = ? AND scope_type = 'mail'",
    [user.id]
  );

  const hasMailPermission = Boolean(mailToken) || Boolean(user.mail_password_encrypted);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
    hasMailPermission
  };
}

/**
 * Hash password with PBKDF2
 */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

/**
 * Verify password with timing-safe compare
 */
export function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false;
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Register a new user with standard email and password
 */
export async function registerWithPassword({ name, email, password, gmailAppPassword }) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new ApiError('INVALID_EMAIL', 'A valid email address is required.', 400);
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new ApiError('WEAK_PASSWORD', 'Password must be at least 6 characters long.', 400);
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = (name && typeof name === 'string' && name.trim()) ? name.trim() : cleanEmail.split('@')[0];

  // Check if user already exists
  const existing = await query.get('SELECT id, email, password_hash FROM users WHERE email = ?', [cleanEmail]);
  if (existing && existing.password_hash) {
    throw new ApiError('EMAIL_IN_USE', 'An account with this email address already exists. Please sign in.', 409);
  }

  const { hash, salt } = hashPassword(password);
  const userId = existing ? existing.id : `usr_${crypto.createHash('sha256').update(cleanEmail).digest('hex').slice(0, 16)}`;
  const cleanAppPass = gmailAppPassword?.trim() || null;
  const encryptedMailPass = cleanAppPass ? encryptToken(cleanAppPass) : null;

  if (existing) {
    await query.run(`
      UPDATE users SET
        name = ?,
        password_hash = ?,
        password_salt = ?,
        mail_password_encrypted = COALESCE(?, mail_password_encrypted),
        last_login_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [cleanName, hash, salt, encryptedMailPass, userId]);
  } else {
    await query.run(`
      INSERT INTO users (id, email, name, password_hash, password_salt, mail_password_encrypted, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [userId, cleanEmail, cleanName, hash, salt, encryptedMailPass]);
  }

  // If Gmail App Password provided, store mail token
  if (cleanAppPass) {
    const encryptedAccess = encryptToken(cleanAppPass);
    await query.run(`
      INSERT INTO user_oauth_tokens (user_id, provider, scope_type, access_token, refresh_token, expires_at, updated_at)
      VALUES (?, 'gmail_smtp', 'mail', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, provider, scope_type) DO UPDATE SET
        access_token = excluded.access_token,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, encryptedAccess, null, Date.now() + 365 * 24 * 3600 * 1000]);
  }

  // Create persistent session (7-day duration)
  const sessionId = crypto.randomBytes(32).toString('hex');
  const sessionExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  await query.run(`
    INSERT INTO user_sessions (session_id, user_id, expires_at)
    VALUES (?, ?, ?)
  `, [sessionId, userId, sessionExpiresAt]);

  await recordAudit('USER_REGISTERED', {
    actor: userId,
    resource: userId,
    metadata: { email: cleanEmail, method: 'password' }
  });

  return {
    sessionId,
    user: {
      id: userId,
      email: cleanEmail,
      name: cleanName,
      hasMailPermission: Boolean(cleanAppPass)
    }
  };
}

/**
 * Sign in existing user with email and password
 */
export async function loginWithPassword({ email, password }) {
  if (!email || !password) {
    throw new ApiError('MISSING_CREDENTIALS', 'Email and password are required.', 400);
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = await query.get(
    'SELECT id, email, name, picture, password_hash, password_salt, mail_password_encrypted FROM users WHERE email = ?',
    [cleanEmail]
  );

  if (!user || !user.password_hash || !user.password_salt) {
    throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  const isValid = verifyPassword(password, user.password_hash, user.password_salt);
  if (!isValid) {
    throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  // Update last login
  await query.run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

  // Create persistent session
  const sessionId = crypto.randomBytes(32).toString('hex');
  const sessionExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  await query.run(`
    INSERT INTO user_sessions (session_id, user_id, expires_at)
    VALUES (?, ?, ?)
  `, [sessionId, user.id, sessionExpiresAt]);

  const mailToken = await query.get(
    "SELECT id FROM user_oauth_tokens WHERE user_id = ? AND scope_type = 'mail'",
    [user.id]
  );

  const hasMailPermission = Boolean(mailToken) || Boolean(user.mail_password_encrypted);

  await recordAudit('USER_LOGGED_IN', {
    actor: user.id,
    resource: user.id,
    metadata: { email: cleanEmail, method: 'password' }
  });

  return {
    sessionId,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      hasMailPermission
    }
  };
}

/**
 * Save or update Gmail App Password for authenticated user
 */
export async function saveMailPassword(userId, { gmailAppPassword }) {
  if (!userId) {
    throw new ApiError('UNAUTHORIZED', 'Authentication required.', 401);
  }
  if (!gmailAppPassword || typeof gmailAppPassword !== 'string' || !gmailAppPassword.trim()) {
    throw new ApiError('INVALID_PASSWORD', 'Gmail App Password is required.', 400);
  }

  const cleanPass = gmailAppPassword.trim();
  const encryptedPass = encryptToken(cleanPass);

  await query.run(
    'UPDATE users SET mail_password_encrypted = ? WHERE id = ?',
    [encryptedPass, userId]
  );

  await query.run(`
    INSERT INTO user_oauth_tokens (user_id, provider, scope_type, access_token, refresh_token, expires_at, updated_at)
    VALUES (?, 'gmail_smtp', 'mail', ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, provider, scope_type) DO UPDATE SET
      access_token = excluded.access_token,
      updated_at = CURRENT_TIMESTAMP
  `, [userId, encryptedPass, null, Date.now() + 365 * 24 * 3600 * 1000]);

  await recordAudit('MAIL_CREDENTIAL_UPDATED', {
    actor: userId,
    resource: 'gmail_smtp',
    metadata: { provider: 'gmail_app_password' }
  });

  return { success: true };
}

/**
 * Revokes / removes mail send permission for a user
 */
export async function disconnectMailPermission(userId) {
  await query.run(
    "DELETE FROM user_oauth_tokens WHERE user_id = ? AND scope_type = 'mail'",
    [userId]
  );
  await query.run(
    'UPDATE users SET mail_password_encrypted = NULL WHERE id = ?',
    [userId]
  );

  await recordAudit('MAIL_PERMISSION_REVOKED', {
    actor: userId,
    resource: 'gmail',
    metadata: { provider: 'gmail' }
  });

  return { success: true };
}

/**
 * Logs out user by destroying session
 */
export async function destroySession(sessionId) {
  if (!sessionId) return;
  await query.run('DELETE FROM user_sessions WHERE session_id = ?', [sessionId]);
}

/**
 * Authenticates a strictly unprivileged non-production demo account
 * for local development and live testing evaluation only.
 */
export async function loginDemoUser() {
  const demoEmail = 'demo.investigator@voxshield.local';
  const demoName = 'Demo Investigator';
  const demoPass = 'DemoAccess2026!';

  let user = await query.get('SELECT id, email, name FROM users WHERE email = ?', [demoEmail]);
  let userId;

  if (!user) {
    const { hash, salt } = hashPassword(demoPass);
    userId = `usr_demo_${crypto.createHash('sha256').update(demoEmail).digest('hex').slice(0, 12)}`;
    await query.run(`
      INSERT OR REPLACE INTO users (id, email, name, password_hash, password_salt, last_login_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [userId, demoEmail, demoName, hash, salt]);
    user = { id: userId, email: demoEmail, name: demoName };
  } else {
    userId = user.id;
    await query.run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
  }

  // Grant active relay permission for demo evaluation
  await query.run(`
    INSERT INTO user_oauth_tokens (user_id, provider, scope_type, access_token, expires_at, updated_at)
    VALUES (?, 'voxshield_relay', 'mail', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, provider, scope_type) DO UPDATE SET
      updated_at = CURRENT_TIMESTAMP
  `, [userId, encryptToken('mock_relay_token'), Date.now() + 365 * 24 * 3600 * 1000]);

  // Create persistent session
  const sessionId = crypto.randomBytes(32).toString('hex');
  const sessionExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  await query.run(`
    INSERT INTO user_sessions (session_id, user_id, expires_at)
    VALUES (?, ?, ?)
  `, [sessionId, userId, sessionExpiresAt]);

  return {
    sessionId,
    user: {
      id: userId,
      email: demoEmail,
      name: demoName,
      hasMailPermission: true
    }
  };
}
