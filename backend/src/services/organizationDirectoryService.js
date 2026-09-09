import { query } from '../database/db.js';
import { ApiError } from '../schemas/errors.js';

/**
 * Searches trusted organizations by name or alias
 */
export async function searchOrganizations(searchTerm = '') {
  const term = String(searchTerm).trim().toLowerCase();
  const rows = await query.all('SELECT id, display_name, aliases, organization_type, country, official_domain FROM organizations');

  const filtered = rows.filter(org => {
    if (!term) return true;
    if (org.display_name.toLowerCase().includes(term)) return true;
    try {
      const aliases = JSON.parse(org.aliases || '[]');
      return aliases.some(a => a.toLowerCase().includes(term));
    } catch {
      return false;
    }
  });

  return filtered.map(org => ({
    ...org,
    aliases: JSON.parse(org.aliases || '[]')
  }));
}

/**
 * Gets an organization by ID with its reporting channels
 */
export async function getOrganizationById(id) {
  const org = await query.get('SELECT * FROM organizations WHERE id = ?', [id]);
  if (!org) return null;

  const contacts = await query.all(
    'SELECT id, channel_type, destination, verified, verification_source, verified_at, enabled FROM organization_contacts WHERE organization_id = ?',
    [id]
  );

  return {
    ...org,
    aliases: JSON.parse(org.aliases || '[]'),
    reporting_channels: contacts.map(c => ({
      ...c,
      verified: Boolean(c.verified),
      enabled: Boolean(c.enabled)
    }))
  };
}

/**
 * Resolves a trusted, verified, enabled contact for report dispatch.
 * CRITICAL SECURITY CHECK: Prevents arbitrary recipient injection.
 */
export async function resolveVerifiedReportingContact(contactId) {
  if (!contactId) {
    throw new ApiError('CONTACT_REQUIRED', 'Organization reporting contact ID is required.', 400);
  }

  const contact = await query.get(
    `SELECT c.id, c.organization_id, c.channel_type, c.destination, c.verified, c.verification_source, c.enabled,
            o.display_name AS organization_name, o.official_domain
     FROM organization_contacts c
     JOIN organizations o ON o.id = c.organization_id
     WHERE c.id = ?`,
    [contactId]
  );

  if (!contact) {
    throw new ApiError('CONTACT_NOT_FOUND', 'Requested reporting contact was not found in directory.', 404);
  }

  if (!contact.enabled) {
    throw new ApiError('CONTACT_DISABLED', `The reporting channel for ${contact.organization_name} is currently disabled.`, 403);
  }

  if (!contact.verified) {
    throw new ApiError('CONTACT_UNVERIFIED', `The reporting channel for ${contact.organization_name} has not been verified. External delivery blocked.`, 403);
  }

  return {
    id: contact.id,
    organizationId: contact.organization_id,
    organizationName: contact.organization_name,
    officialDomain: contact.official_domain,
    channelType: contact.channel_type,
    destination: contact.destination,
    verified: Boolean(contact.verified),
    verificationSource: contact.verification_source
  };
}
