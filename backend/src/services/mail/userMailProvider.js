/**
 * Base User Mail Provider Abstraction
 * Enforces that user-originated fraud reports are sent exclusively from
 * the authenticated user's own mailbox via scoped OAuth 2.0.
 */
export class UserMailProvider {
  /**
   * Check connection status for user's mailbox
   * @param {string} userId
   * @returns {Promise<{ connected: boolean, provider: string, senderEmail: string|null, expiresAt: number|null }>}
   */
  async getConnectionStatus(userId) {
    throw new Error('Not implemented');
  }

  /**
   * Send a user-authorized incident report from the user's account
   * @param {object} params
   * @param {object} params.user
   * @param {string} params.recipientEmail
   * @param {string} params.subject
   * @param {string} params.textBody
   * @param {string} params.htmlBody
   * @param {Array<{ filename: string, contentType: string, content: Buffer }>} params.attachments
   * @returns {Promise<{ success: boolean, messageId: string, provider: string, senderEmail: string, recipientEmail: string }>}
   */
  async sendUserAuthorizedReport(params) {
    throw new Error('Not implemented');
  }

  /**
   * Refresh OAuth access token if expired
   * @param {string} userId
   * @returns {Promise<string>} Valid access token
   */
  async refreshAuthorization(userId) {
    throw new Error('Not implemented');
  }

  /**
   * Disconnect mail access for user
   * @param {string} userId
   */
  async disconnect(userId) {
    throw new Error('Not implemented');
  }

  /**
   * Get sender identity
   * @param {string} userId
   * @returns {Promise<{ email: string, name: string }>}
   */
  async getSenderIdentity(userId) {
    throw new Error('Not implemented');
  }
}
