import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config/index.js';
import {
  sendIncidentReportEmail,
  setSendGridClient
} from '../src/services/sendgridMailService.js';

const originalConfig = {
  apiKey: config.sendgrid.apiKey,
  fromEmail: config.sendgrid.fromEmail,
  maxRetries: config.retry.maxRetries,
  retryDelayMs: config.retry.retryDelayMs
};

function validMessage() {
  return {
    reporter: { email: 'reporter@example.test', name: 'Reporter' },
    organization: 'Example Bank',
    recipient: 'security@example.test',
    incident: { reportId: 'VSR-test', incidentId: 'INC-test' },
    pdfBuffer: Buffer.from('%PDF-test'),
    subject: 'Test report',
    textBody: 'Test',
    htmlBody: '<p>Test</p>'
  };
}

test.afterEach(() => {
  setSendGridClient(null);
  config.sendgrid.apiKey = originalConfig.apiKey;
  config.sendgrid.fromEmail = originalConfig.fromEmail;
  config.retry.maxRetries = originalConfig.maxRetries;
  config.retry.retryDelayMs = originalConfig.retryDelayMs;
});

test('SendGrid rejection never falls back to a fabricated successful delivery', async () => {
  config.sendgrid.apiKey = 'test-key';
  config.sendgrid.fromEmail = 'verified@example.test';
  let calls = 0;
  setSendGridClient({
    setApiKey() {},
    async send() {
      calls += 1;
      const error = new Error('forbidden');
      error.code = 403;
      throw error;
    }
  });

  await assert.rejects(
    sendIncidentReportEmail(validMessage()),
    error => error.code === 'SENDER_NOT_VERIFIED' && error.status === 502
  );
  assert.equal(calls, 1, 'non-retryable sender rejection should be attempted once');
});

test('transient provider failure is retried and reports provider acceptance truthfully', async () => {
  config.sendgrid.apiKey = 'test-key';
  config.sendgrid.fromEmail = 'verified@example.test';
  config.retry.maxRetries = 2;
  config.retry.retryDelayMs = 1;
  let calls = 0;
  setSendGridClient({
    setApiKey() {},
    async send() {
      calls += 1;
      if (calls < 3) {
        const error = new Error('timeout');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      return [{ headers: { 'x-message-id': 'accepted-message-id' } }];
    }
  });

  const result = await sendIncidentReportEmail(validMessage());
  assert.equal(calls, 3);
  assert.equal(result.messageId, 'accepted-message-id');
  assert.equal(result.deliveryStatus, 'ACCEPTED');
});
