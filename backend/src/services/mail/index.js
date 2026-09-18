import { GmailUserMailProvider } from './gmailUserMailProvider.js';
import { MicrosoftGraphUserMailProvider } from './microsoftGraphUserMailProvider.js';

const gmailProvider = new GmailUserMailProvider();
const microsoftProvider = new MicrosoftGraphUserMailProvider();

export function getUserMailProvider(providerName = 'gmail') {
  const norm = String(providerName).toLowerCase();
  if (norm === 'microsoft' || norm === 'outlook') {
    return microsoftProvider;
  }
  return gmailProvider;
}

export { GmailUserMailProvider, MicrosoftGraphUserMailProvider };
