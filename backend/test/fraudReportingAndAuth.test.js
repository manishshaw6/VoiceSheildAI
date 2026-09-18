import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { query } from '../src/database/db.js';
import {
  generateOAuthState,
  validateAndConsumeOAuthState,
  getGoogleLoginUrl,
  handleGoogleLoginCallback,
  getGoogleMailConnectUrl,
  handleGoogleMailCallback,
  getUserFromSession,
  disconnectMailPermission,
  registerWithPassword,
  loginWithPassword,
  saveMailPassword
} from '../src/services/authService.js';
import {
  extractOrganizationIntelligence,
  normalizeOrganizationName,
  KNOWN_ORGANIZATIONS
} from '../src/services/organizationIntelligenceService.js';
import {
  searchOrganizations,
  getOrganizationById,
  resolveVerifiedReportingContact
} from '../src/services/organizationDirectoryService.js';
import { evaluateReportingEligibility } from '../src/services/reportingEligibilityService.js';
import { redactSensitiveText, redactReportPayload } from '../src/services/redactionService.js';
import {
  generateReportId,
  calculateReportHash,
  signReportHash,
  verifyReportIntegrity
} from '../src/services/reportIntegrityService.js';
import { generateIncidentPdfBuffer } from '../src/services/reportPdfService.js';
import {
  generateIncidentReport,
  getIncidentReportById,
  approveIncidentReport,
  sendIncidentReport,
  verifyReportPublic
} from '../src/services/incidentReportService.js';
import { getUserMailProvider } from '../src/services/mail/index.js';
import { encryptToken, decryptToken } from '../src/core/encryptionService.js';
import { config } from '../src/config/index.js';
import { setSendGridClient } from '../src/services/sendgridMailService.js';

const sentMessages = [];
config.sendgrid.apiKey = 'test-sendgrid-key';
config.sendgrid.fromEmail = 'sender@voxshield.test';
setSendGridClient({
  setApiKey() { },
  async send(message) {
    sentMessages.push(message);
    return [{ headers: { 'x-message-id': `test-message-${sentMessages.length}` } }];
  }
});

function uniqueEmail(prefix = 'user') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}@test.voxshield.local`;
}

test('1. Google login initiation generates auth URL and valid state', () => {
  const login = getGoogleLoginUrl({ returnTo: '/scanner' });
  assert.ok(login.authUrl);
  assert.ok(login.state);
  assert.equal(typeof login.state, 'string');
});

test('2. OAuth state CSRF validation: valid state consumed once', () => {
  const state = generateOAuthState({ type: 'login', returnTo: '/test' });
  const consumed = validateAndConsumeOAuthState(state);
  assert.ok(consumed);
  assert.equal(consumed.type, 'login');
  assert.equal(consumed.returnTo, '/test');

  // Second consumption fails (replay attack defense)
  const replayed = validateAndConsumeOAuthState(state);
  assert.equal(replayed, null);
});

test('3. Invalid or fabricated callback state is rejected', async () => {
  await assert.rejects(
    async () => handleGoogleLoginCallback({ code: 'any_code', state: 'forged_state_value' }),
    err => err.code === 'INVALID_OAUTH_STATE' || /Invalid or expired OAuth state/i.test(err.message)
  );
});

test('4. Logged-out or unauthenticated report generation is blocked', async () => {
  await assert.rejects(
    async () => generateIncidentReport({ analysisId: 'any_id', user: null }),
    err => err.code === 'AUTH_REQUIRED' || /Authenticated user required/i.test(err.message)
  );
});

test('5. Login without mail permission cannot send email', async () => {
  const testUserId = `usr_test_no_mail_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [testUserId, uniqueEmail('nomail'), 'Test User']);

  const provider = getUserMailProvider('gmail');
  const status = await provider.getConnectionStatus(testUserId);
  assert.equal(status.connected, false);

  await assert.rejects(
    async () => provider.refreshAuthorization(testUserId),
    err => err.code === 'MAIL_NOT_CONNECTED' || /authorization not connected/i.test(err.message)
  );
});

test('6. Valid mail permission recognized after mail OAuth callback', async () => {
  const testUserId = `usr_test_mail_ok_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [testUserId, uniqueEmail('mailok'), 'Test User']);

  const state = generateOAuthState({ type: 'mail_connect', userId: testUserId });
  const result = await handleGoogleMailCallback({ code: 'mock_mail_code', state });
  assert.equal(result.success, true);

  const provider = getUserMailProvider('gmail');
  const status = await provider.getConnectionStatus(testUserId);
  assert.equal(status.connected, true);
  assert.equal(status.provider, 'gmail');
});

test('7. Token encryption and decryption at rest', () => {
  const secret = 'ya29.sample_oauth_bearer_secret_token_12345';
  const encrypted = encryptToken(secret);
  assert.notEqual(encrypted, secret);
  assert.ok(encrypted.includes(':'));

  const decrypted = decryptToken(encrypted);
  assert.equal(decrypted, secret);
});

test('8. Token refresh behavior executed for expired token', async () => {
  const testUserId = `usr_test_refresh_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [testUserId, uniqueEmail('refresh'), 'Refresh User']);

  // Insert an expired token
  const encAccess = encryptToken('old_access_token');
  const encRefresh = encryptToken('mock_mail_refresh');
  const pastTime = Date.now() - 10000;

  await query.run(`
    INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, scope_type, access_token, refresh_token, expires_at)
    VALUES (?, 'google', 'mail', ?, ?, ?)
  `, [testUserId, encAccess, encRefresh, pastTime]);

  const provider = getUserMailProvider('gmail');
  const refreshedToken = await provider.refreshAuthorization(testUserId);
  assert.ok(refreshedToken);

  const updated = await query.get('SELECT expires_at FROM user_oauth_tokens WHERE user_id = ? AND scope_type = "mail"', [testUserId]);
  assert.ok(updated.expires_at > Date.now());
});

test('9. Token failure handled truthfully when no refresh token available', async () => {
  const testUserId = `usr_test_no_refresh_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [testUserId, uniqueEmail('norefresh'), 'No Refresh User']);

  const encAccess = encryptToken('expired_access_token');
  const pastTime = Date.now() - 10000;

  await query.run(`
    INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, scope_type, access_token, refresh_token, expires_at)
    VALUES (?, 'google', 'mail', ?, NULL, ?)
  `, [testUserId, encAccess, pastTime]);

  const provider = getUserMailProvider('gmail');
  await assert.rejects(
    async () => provider.refreshAuthorization(testUserId),
    err => err.code === 'OAUTH_REFRESH_FAILED' || /No refresh token available/i.test(err.message)
  );
});

test('10. Organization extraction extracts organization from transcript', () => {
  const transcript = 'Hello, I am calling from State Bank of India regarding your card.';
  const intel = extractOrganizationIntelligence({ text: transcript });
  assert.equal(intel.organization_detected, true);
  assert.equal(intel.organization_name_normalized, 'State Bank of India');
  assert.equal(intel.organization_type, 'BANK');
});

test('11. Organization mention ≠ impersonation (benign passive mention)', () => {
  const transcript = 'I transferred 500 rupees through SBI yesterday to my sister.';
  const intel = extractOrganizationIntelligence({ text: transcript, riskScore: 10 });
  assert.equal(intel.organization_detected, true);
  assert.equal(intel.identity_claim_detected, false);
  assert.equal(intel.impersonation_status, 'ORGANIZATION_MENTION');
});

test('12. Organization impersonation detected when claim is backed by fraud markers', () => {
  const transcript = 'This is HDFC Bank verification department. Your account is blocked. Tell me your OTP immediately.';
  const intel = extractOrganizationIntelligence({
    text: transcript,
    riskScore: 85,
    conversationIntelligence: {
      threat_assessment: { malicious_intent_detected: true },
      sensitive_entities: { otp_requested: true }
    }
  });
  assert.equal(intel.organization_detected, true);
  assert.equal(intel.identity_claim_detected, true);
  assert.equal(intel.impersonation_status, 'LIKELY_ORGANIZATION_IMPERSONATION');
});

test('13. Alias normalization maps variations to canonical name', () => {
  assert.equal(normalizeOrganizationName('sbi')?.normalized_name, 'State Bank of India');
  assert.equal(normalizeOrganizationName('sbi bank')?.normalized_name, 'State Bank of India');
  assert.equal(normalizeOrganizationName('hdfc')?.normalized_name, 'HDFC Bank');
  assert.equal(normalizeOrganizationName('airtel telecom')?.normalized_name, 'Bharti Airtel');
  assert.equal(normalizeOrganizationName('amazon pay')?.normalized_name, 'Amazon India');
});

test('14. Unknown organization returns safe empty schema without hallucinations', () => {
  const transcript = 'I am eating lunch at a local pizza restaurant with my friend.';
  const intel = extractOrganizationIntelligence({ text: transcript });
  assert.equal(intel.organization_detected, false);
  assert.equal(intel.organization_name_normalized, null);
  assert.equal(intel.impersonation_status, 'NONE');
});

test('15. Verified contact resolution succeeds for trusted directory contact', async () => {
  const contact = await resolveVerifiedReportingContact('contact_demo_mailbox');
  assert.ok(contact);
  assert.equal(contact.verified, true);
  assert.ok(contact.destination);
  assert.equal(contact.organizationName, 'VoxShield Demo Test Organization');
});

test('16. Unverified contact blocks external delivery', async () => {
  await assert.rejects(
    async () => resolveVerifiedReportingContact('contact_sample_unverified'),
    err => err.code === 'CONTACT_UNVERIFIED' || /has not been verified/i.test(err.message)
  );
});

test('17. Arbitrary recipient injection is blocked (must be in directory)', async () => {
  await assert.rejects(
    async () => resolveVerifiedReportingContact('malicious@attacker.example.com'),
    err => err.code === 'CONTACT_NOT_FOUND' || /not found in directory/i.test(err.message)
  );
});

test('18. Incident report generation creates canonical structure with unique ID', async () => {
  const testUserId = `usr_report_gen_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [testUserId, uniqueEmail('analyst'), 'Security Analyst']);

  // Insert mock analysis record
  const mockAnalysisId = `ana_${crypto.randomBytes(4).toString('hex')}`;
  await query.run(`
    INSERT INTO analyses (id, final_score, risk_level, threat_category, transcript, raw_result)
    VALUES (?, 85, 'CRITICAL', 'Bank Impersonation', 'This is SBI. Give me your OTP 123456 now.', '{}')
  `, [mockAnalysisId]);

  const report = await generateIncidentReport({
    analysisId: mockAnalysisId,
    user: { id: testUserId, email: uniqueEmail('analyst'), name: 'Security Analyst' }
  });

  assert.ok(report);
  assert.ok(report.reportId.startsWith('VS-RPT-'));
  assert.equal(report.riskAssessment.score, 85);
  assert.equal(report.impersonatedOrganization.organization_name_normalized, 'State Bank of India');
  assert.ok(report.integrityInformation.reportHash);
  assert.ok(report.integrityInformation.signature);
});

test('19. Report ownership enforced: unauthorized user cannot view report', async () => {
  const userA = { id: `usr_a_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('usra'), name: 'User A' };
  const userB = { id: `usr_b_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('usrb'), name: 'User B' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [userA.id, userA.email, userA.name]);
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [userB.id, userB.email, userB.name]);

  const mockAnalysisId = `ana_owner_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 70, "HIGH", "SBI calling")', [mockAnalysisId]);

  const report = await generateIncidentReport({ analysisId: mockAnalysisId, user: userA });

  // User A can access
  const retrieved = await getIncidentReportById(report.reportId, userA);
  assert.equal(retrieved.id, report.reportId);

  // User B is rejected
  await assert.rejects(
    async () => getIncidentReportById(report.reportId, userB),
    err => err.code === 'FORBIDDEN' || /permission/i.test(err.message)
  );
});

test('20. Report SHA-256 hash computed deterministically', () => {
  const payload1 = { a: 'first', b: 'second', c: 100 };
  const payload2 = { c: 100, b: 'second', a: 'first' };
  const hash1 = calculateReportHash(payload1);
  const hash2 = calculateReportHash(payload2);
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);
});

test('21. Report tampering detected when payload is altered', () => {
  const original = { id: 'VS-RPT-TEST', score: 85, summary: 'Original finding' };
  const hash = calculateReportHash(original);
  const sig = signReportHash(hash);

  // Unaltered passes
  const validCheck = verifyReportIntegrity(original, hash, sig);
  assert.equal(validCheck.valid, true);

  // Altered payload fails
  const tampered = { ...original, score: 20 };
  const tamperedCheck = verifyReportIntegrity(tampered, hash, sig);
  assert.equal(tamperedCheck.valid, false);
  assert.equal(tamperedCheck.tamperingDetected, true);
});

test('22. Backend PDF generation produces valid non-empty PDF binary buffer', async () => {
  const sampleReport = {
    reportId: 'VS-RPT-2026-TESTPDF',
    incidentId: 'INC-12345',
    generatedAt: new Date().toISOString(),
    incidentTimestamp: new Date().toISOString(),
    reportingUser: { name: 'Investigator', email: 'inv@voxshield.local' },
    incidentOverview: 'Suspected synthetic voice impersonation incident.',
    impersonatedOrganization: {
      organization_name_normalized: 'State Bank of India',
      organization_type: 'BANK',
      claimed_role: 'fraud department',
      impersonation_status: 'LIKELY_ORGANIZATION_IMPERSONATION'
    },
    riskAssessment: { score: 92, level: 'CRITICAL', threatCategory: 'Digital Arrest' },
    voiceAuthenticity: { provider: 'Reality Defender', verdict: 'SYNTHETIC', syntheticProbability: 0.94 },
    speakerVerification: { enrolledTarget: 'None', similarity: null, decision: 'NO_COMPARISON_REQUESTED' },
    conversationIntelligence: { attackCategory: 'KYC Block Scam', otpRequested: true },
    transcriptExcerpt: 'Your SBI account is blocked. Share code immediately.',
    userExposure: { credentialsShared: false, moneyTransferred: false, riskAfterCall: 'HIGH' },
    recommendedActions: ['Hang up immediately', 'Contact SBI official desk'],
    integrityInformation: { reportHash: 'abcdef1234567890', signature: 'hmacsig123', verificationStatus: 'DIGITALLY SIGNED' }
  };

  const buffer = await generateIncidentPdfBuffer(sampleReport);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 1000);
  assert.equal(buffer.slice(0, 4).toString(), '%PDF');
});

test('23. OTP redaction removes verification codes from transcript and report', () => {
  const original = 'My OTP is 938421, please verify quickly.';
  const redacted = redactSensitiveText(original);
  assert.equal(redacted.includes('938421'), false);
  assert.ok(redacted.includes('[REDACTED_OTP]'));
});

test('24. Credential, card number, and Aadhaar redaction', () => {
  const original = 'My card number is 4111 2222 3333 4444 and cvv is 482. Aadhaar is 2345 6789 0123.';
  const redacted = redactSensitiveText(original);
  assert.equal(redacted.includes('4111 2222 3333 4444'), false);
  assert.equal(redacted.includes('482'), false);
  assert.equal(redacted.includes('2345 6789 0123'), false);
  assert.ok(redacted.includes('[REDACTED_CARD_NUMBER]'));
  assert.ok(redacted.includes('[REDACTED_CVV]'));
  assert.ok(redacted.includes('[REDACTED_AADHAAR]'));
});

test('25. Safe call is evaluated as NOT_ELIGIBLE for external report', () => {
  const eligibility = evaluateReportingEligibility({
    risk: { score: 15, level: 'SAFE' },
    organization: { organization_detected: false },
    conversationIntelligence: { threat_assessment: { malicious_intent_detected: false } }
  });
  assert.equal(eligibility.status, 'NOT_ELIGIBLE');
  assert.equal(eligibility.eligible, false);
});

test('26. High-risk bank impersonation is evaluated as RECOMMENDED / STRONGLY_RECOMMENDED', () => {
  const eligibility = evaluateReportingEligibility({
    risk: { score: 85, level: 'CRITICAL' },
    organization: {
      organization_detected: true,
      identity_claim_detected: true,
      organization_name_normalized: 'HDFC Bank'
    },
    conversationIntelligence: {
      sensitive_entities: { otp_requested: true }
    },
    deepfake: { score: 0.90 }
  });
  assert.equal(eligibility.status, 'STRONGLY_RECOMMENDED');
  assert.equal(eligibility.eligible, true);
  assert.ok(eligibility.reasonCodes.includes('OTP_SOLICITATION'));
  assert.ok(eligibility.reasonCodes.includes('ORGANIZATION_IDENTITY_CLAIM'));
});

test('27. User explicit approval required before sending', async () => {
  const user = { id: `usr_appr_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('appr'), name: 'Approver' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user.id, user.email, user.name]);

  // Connect mail authorization so Gate 2 passes and it tests Gate 5 (approval required)
  const encAccess = encryptToken('mock_mail_token');
  await query.run(`
    INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, scope_type, access_token, expires_at)
    VALUES (?, 'google', 'mail', ?, ?)
  `, [user.id, encAccess, Date.now() + 3600000]);

  const mockAna = `ana_appr_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 80, "HIGH", "HDFC verify")', [mockAna]);

  const report = await generateIncidentReport({ analysisId: mockAna, user });
  const retrieved = await getIncidentReportById(report.reportId, user);
  assert.equal(retrieved.status, 'READY_FOR_REVIEW');

  // Attempting to send before approval fails Gate 5
  await assert.rejects(
    async () => sendIncidentReport({
      reportId: report.reportId,
      user,
      organizationContactId: 'contact_demo_mailbox'
    }),
    err => err.code === 'APPROVAL_REQUIRED' || /Explicit user review and consent is required/i.test(err.message)
  );
});

test('28. User approval stored with timestamp and state change', async () => {
  const user = { id: `usr_appr2_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('appr2'), name: 'Approver 2' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user.id, user.email, user.name]);

  const mockAna = `ana_appr2_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 80, "HIGH", "HDFC verify")', [mockAna]);

  const report = await generateIncidentReport({ analysisId: mockAna, user });
  const approved = await approveIncidentReport({ reportId: report.reportId, user, consentGiven: true });
  assert.equal(approved.status, 'APPROVED');

  const record = await query.get('SELECT status, approved_at FROM incident_reports WHERE id = ?', [report.reportId]);
  assert.equal(record.status, 'APPROVED');
  assert.ok(record.approved_at);
});

test('29. Send without approval or with false consent is rejected', async () => {
  const user = { id: `usr_appr_fail_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('fail'), name: 'Fail User' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user.id, user.email, user.name]);

  const mockAna = `ana_appr_fail_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 80, "HIGH", "call")', [mockAna]);
  const report = await generateIncidentReport({ analysisId: mockAna, user });

  await assert.rejects(
    async () => approveIncidentReport({ reportId: report.reportId, user, consentGiven: false }),
    err => err.code === 'CONSENT_REQUIRED' || /Explicit user authorization is required/i.test(err.message)
  );
});

test('30. Successful authorized report dispatch via SendGrid (mocked)', async () => {
  const user = { id: `usr_send_ok_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('sender'), name: 'Authorized Sender' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user.id, user.email, user.name]);

  // Connect mail authorization
  const encAccess = encryptToken('mock_mail_token');
  await query.run(`
    INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, scope_type, access_token, expires_at)
    VALUES (?, 'google', 'mail', ?, ?)
  `, [user.id, encAccess, Date.now() + 3600000]);

  const mockAna = `ana_send_ok_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 85, "CRITICAL", "Airtel SIM block alert")', [mockAna]);

  const report = await generateIncidentReport({ analysisId: mockAna, user });
  await approveIncidentReport({ reportId: report.reportId, user, consentGiven: true });

  const result = await sendIncidentReport({
    reportId: report.reportId,
    user,
    organizationContactId: 'contact_demo_mailbox'
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'SENT');
  assert.ok(result.delivery.messageId);
  assert.equal(result.delivery.sender, 'sender@voxshield.test');
  assert.equal(result.delivery.replyTo, user.email);
  assert.equal(sentMessages.at(-1).from.email, 'sender@voxshield.test');
  assert.equal(sentMessages.at(-1).replyTo.email, user.email);
  assert.equal(sentMessages.at(-1).attachments[0].type, 'application/pdf');
});

test('31. Unverified reporter email is blocked before delivery', async () => {
  const user = { id: `usr_no_perm_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('noperm'), name: 'No Perm' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user.id, user.email, user.name]);
  await query.run('UPDATE users SET email_verified = 0 WHERE id = ?', [user.id]);

  const mockAna = `ana_no_perm_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 85, "CRITICAL", "call")', [mockAna]);
  const report = await generateIncidentReport({ analysisId: mockAna, user });
  await approveIncidentReport({ reportId: report.reportId, user, consentGiven: true });

  await assert.rejects(
    async () => sendIncidentReport({ reportId: report.reportId, user, organizationContactId: 'contact_demo_mailbox' }),
    err => err.code === 'EMAIL_NOT_VERIFIED' || /verified authenticated email/i.test(err.message)
  );
});

test('32. Duplicate send prevented by idempotency key (double-click protection)', async () => {
  const user = { id: `usr_dup_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('dup'), name: 'Dup Sender' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user.id, user.email, user.name]);

  const encAccess = encryptToken('mock_mail_token');
  await query.run(`
    INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, scope_type, access_token, expires_at)
    VALUES (?, 'google', 'mail', ?, ?)
  `, [user.id, encAccess, Date.now() + 3600000]);

  const mockAna = `ana_dup_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 85, "CRITICAL", "HDFC")', [mockAna]);

  const report = await generateIncidentReport({ analysisId: mockAna, user });
  await approveIncidentReport({ reportId: report.reportId, user, consentGiven: true });

  const firstSend = await sendIncidentReport({
    reportId: report.reportId,
    user,
    organizationContactId: 'contact_demo_mailbox'
  });
  assert.equal(firstSend.status, 'SENT');

  // Immediate second send does NOT dispatch another email; returns existing delivery metadata
  const secondSend = await sendIncidentReport({
    reportId: report.reportId,
    user,
    organizationContactId: 'contact_demo_mailbox'
  });
  assert.equal(secondSend.status, 'SENT');
  assert.equal(secondSend.alreadySent, true);
  assert.equal(secondSend.delivery.messageId, firstSend.delivery.messageId);
});

test('33. Different users cannot access or tamper with each other’s reports', async () => {
  const user1 = { id: `usr_iso1_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('iso1'), name: 'User 1' };
  const user2 = { id: `usr_iso2_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('iso2'), name: 'User 2' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user1.id, user1.email, user1.name]);
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user2.id, user2.email, user2.name]);

  const mockAna = `ana_iso_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 75, "HIGH", "SBI")', [mockAna]);

  const report = await generateIncidentReport({ analysisId: mockAna, user: user1 });

  // User 2 cannot approve User 1's report
  await assert.rejects(
    async () => approveIncidentReport({ reportId: report.reportId, user: user2, consentGiven: true }),
    err => err.code === 'FORBIDDEN' || /own this incident report/i.test(err.message)
  );
});

test('34. Different incidents produce different unique report IDs and hashes', async () => {
  const user = { id: `usr_diff_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('diff'), name: 'Diff User' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user.id, user.email, user.name]);

  const ana1 = `ana_diff1_${crypto.randomBytes(4).toString('hex')}`;
  const ana2 = `ana_diff2_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 80, "HIGH", "Call 1")', [ana1]);
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 60, "MODERATE", "Call 2")', [ana2]);

  const rep1 = await generateIncidentReport({ analysisId: ana1, user });
  const rep2 = await generateIncidentReport({ analysisId: ana2, user });

  assert.notEqual(rep1.reportId, rep2.reportId);
  assert.notEqual(rep1.integrityInformation.reportHash, rep2.integrityInformation.reportHash);
});

test('35. OAuth tokens are never returned in public user session queries', async () => {
  const testUserId = `usr_safe_sess_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [testUserId, uniqueEmail('safe'), 'Safe User']);

  const sessionId = crypto.randomBytes(32).toString('hex');
  await query.run('INSERT OR REPLACE INTO user_sessions (session_id, user_id, expires_at) VALUES (?, ?, ?)', [sessionId, testUserId, Date.now() + 3600000]);

  const user = await getUserFromSession(sessionId);
  assert.ok(user);
  assert.equal(user.id, testUserId);
  assert.equal(user.access_token, undefined);
  assert.equal(user.refresh_token, undefined);
});

test('36. OAuth tokens are never logged in audit records', async () => {
  const rows = await query.all('SELECT metadata FROM audit_events ORDER BY id DESC LIMIT 50');
  for (const row of rows) {
    const metaStr = row.metadata || '';
    assert.equal(metaStr.includes('access_token'), false);
    assert.equal(metaStr.includes('refresh_token'), false);
    assert.equal(metaStr.includes('ya29.'), false);
  }
});

test('37. Safe post-call summary output is available for benign interactions', () => {
  const eligibility = evaluateReportingEligibility({
    risk: { score: 10, level: 'SAFE' },
    organization: { organization_detected: false }
  });
  assert.equal(eligibility.status, 'NOT_ELIGIBLE');
  assert.ok(eligibility.suggestedAction.includes('summary available'));
});

test('38. High-risk user guidance recommends defensive actions and official channels', async () => {
  const user = { id: `usr_guidance_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('guidance'), name: 'Guidance User' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user.id, user.email, user.name]);

  const mockAna = `ana_guidance_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 90, "CRITICAL", "Emergency police warrant")', [mockAna]);

  const report = await generateIncidentReport({ analysisId: mockAna, user });
  assert.ok(report.recommendedActions.length > 0);
  assert.ok(report.recommendedActions.some(a => a.toLowerCase().includes('cease') || a.toLowerCase().includes('contact')));
});

test('39. Report data faithfully reflects analysis findings without hallucinating government certification', async () => {
  const user = { id: `usr_ver_${crypto.randomBytes(4).toString('hex')}`, email: uniqueEmail('ver'), name: 'Ver User' };
  await query.run('INSERT OR REPLACE INTO users (id, email, name) VALUES (?, ?, ?)', [user.id, user.email, user.name]);

  const mockAna = `ana_ver_${crypto.randomBytes(4).toString('hex')}`;
  await query.run('INSERT INTO analyses (id, final_score, risk_level, transcript) VALUES (?, 75, "HIGH", "Airtel")', [mockAna]);

  const report = await generateIncidentReport({ analysisId: mockAna, user });
  const verified = await verifyReportPublic(report.reportId);

  assert.equal(verified.valid, true);
  assert.equal(verified.issuer, 'VoxShield');
  assert.equal(verified.government_authorized, false);
  assert.ok(verified.explanation.includes('does not constitute government'));
});

test('40. Verification endpoint detects non-existent report gracefully', async () => {
  const nonExistent = await verifyReportPublic('VS-RPT-2099-FAKE9999');
  assert.equal(nonExistent.valid, false);
  assert.equal(nonExistent.integrity_status, 'UNKNOWN_OR_NOT_FOUND');
  assert.equal(nonExistent.government_authorized, false);
});

test('41. Standard Email and Password Registration (Signup)', async () => {
  const email = uniqueEmail('signup');
  const res = await registerWithPassword({
    name: 'Ayush Preetham',
    email,
    password: 'SecurePassword123!',
    gmailAppPassword: 'abcd efgh ijkl mnop'
  });

  assert.ok(res.sessionId);
  assert.equal(res.user.email, email);
  assert.equal(res.user.name, 'Ayush Preetham');
  assert.equal(res.user.hasMailPermission, true);

  // Check duplicate signup rejection
  await assert.rejects(async () => {
    await registerWithPassword({
      name: 'Duplicate',
      email,
      password: 'AnotherPassword123!'
    });
  }, { code: 'EMAIL_IN_USE' });
});

test('42. Standard Email and Password Login', async () => {
  const email = uniqueEmail('login');
  await registerWithPassword({
    name: 'Login Tester',
    email,
    password: 'CorrectPassword123!'
  });

  // Invalid password rejected
  await assert.rejects(async () => {
    await loginWithPassword({ email, password: 'WrongPassword!' });
  }, { code: 'INVALID_CREDENTIALS' });

  // Valid password succeeds
  const loginRes = await loginWithPassword({ email, password: 'CorrectPassword123!' });
  assert.ok(loginRes.sessionId);
  assert.equal(loginRes.user.email, email);
  assert.equal(loginRes.user.name, 'Login Tester');

  // Verify session resolution
  const sessionUser = await getUserFromSession(loginRes.sessionId);
  assert.ok(sessionUser);
  assert.equal(sessionUser.email, email);
});

test('43. Gmail App Password storage updates mail-send permission', async () => {
  const email = uniqueEmail('app_pass');
  const reg = await registerWithPassword({
    name: 'No Mail User',
    email,
    password: 'Password123!'
  });

  let user = await getUserFromSession(reg.sessionId);
  assert.equal(user.hasMailPermission, false);

  // Save Gmail App Password
  await saveMailPassword(reg.user.id, { gmailAppPassword: 'wxyz 1234 abcd 5678' });

  user = await getUserFromSession(reg.sessionId);
  assert.equal(user.hasMailPermission, true);
});

