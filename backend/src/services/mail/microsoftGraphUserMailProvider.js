import { UserMailProvider } from './userMailProvider.js';
import { ApiError } from '../../schemas/errors.js';

/**
 * Microsoft Graph User Mail Provider (Future-Ready Architecture)
 * Ready for integration with Microsoft Graph /me/sendMail without redesigning the reporting system.
 */
export class MicrosoftGraphUserMailProvider extends UserMailProvider {
  constructor() {
    super();
    this.name = 'microsoft';
  }

  async getConnectionStatus(userId) {
    return {
      connected: false,
      provider: 'microsoft',
      senderEmail: null,
      expiresAt: null,
      note: 'Microsoft Graph provider is architected and ready for client registration.'
    };
  }

  async sendUserAuthorizedReport(params) {
    throw new ApiError(
      'PROVIDER_NOT_CONFIGURED',
      'Microsoft Outlook / Microsoft Graph reporting is not yet configured for this deployment. Please connect with Google/Gmail.',
      501
    );
  }

  async refreshAuthorization(userId) {
    throw new ApiError('PROVIDER_NOT_CONFIGURED', 'Microsoft Graph refresh not implemented', 501);
  }

  async disconnect(userId) {
    return { success: true };
  }

  async getSenderIdentity(userId) {
    throw new ApiError('PROVIDER_NOT_CONFIGURED', 'Microsoft Graph identity not available', 501);
  }
}
