import { config } from '../config/index.js';
import { query } from '../database/db.js';

export function isSupabaseAuthConfigured() {
  return Boolean(config.supabase.url && config.supabase.publishableKey);
}

async function persistSupabaseUser(supabaseUser) {
  const email = String(supabaseUser.email || '').trim().toLowerCase();
  if (!supabaseUser.id || !email || !supabaseUser.email_confirmed_at) return null;

  let localUser = await query.get(
    'SELECT * FROM users WHERE supabase_id = ? OR id = ?',
    [supabaseUser.id, supabaseUser.id]
  );
  if (!localUser) localUser = await query.get('SELECT * FROM users WHERE email = ?', [email]);

  const metadata = supabaseUser.user_metadata || {};
  const name = metadata.full_name || metadata.name || email.split('@')[0];
  const picture = metadata.avatar_url || metadata.picture || null;

  if (localUser) {
    await query.run(`
      UPDATE users
      SET supabase_id = ?, email = ?, name = COALESCE(name, ?), full_name = COALESCE(full_name, ?),
          picture = COALESCE(?, picture), email_verified = ?, updated_at = CURRENT_TIMESTAMP,
          last_login_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [supabaseUser.id, email, name, name, picture, supabaseUser.email_confirmed_at ? 1 : 0, localUser.id]);
    return { ...localUser, supabase_id: supabaseUser.id, email, name: localUser.name || name, full_name: localUser.full_name || name, picture: picture || localUser.picture };
  }

  await query.run(`
    INSERT INTO users (id, supabase_id, email, name, full_name, picture, email_verified, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [supabaseUser.id, supabaseUser.id, email, name, name, picture, supabaseUser.email_confirmed_at ? 1 : 0]);
  return { id: supabaseUser.id, supabase_id: supabaseUser.id, email, name, full_name: name, picture };
}

export async function verifySupabaseAccessToken(accessToken) {
  if (!isSupabaseAuthConfigured() || !accessToken) return null;
  const response = await fetch(`${config.supabase.url}/auth/v1/user`, {
    headers: {
      apikey: config.supabase.publishableKey,
      Authorization: `Bearer ${accessToken}`
    },
    signal: AbortSignal.timeout(8000)
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Supabase authentication unavailable (${response.status})`);
  return persistSupabaseUser(await response.json());
}
