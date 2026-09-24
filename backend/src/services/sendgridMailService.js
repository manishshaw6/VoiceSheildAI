import sgMail from '@sendgrid/mail';
import { config } from '../config/index.js';
import { ApiError } from '../schemas/errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let sendGridClient = sgMail;
const IS_TEST_RUNNER = Boolean(process.env.NODE_TEST_CONTEXT) ||
    process.env.NODE_ENV === 'test' || process.execArgv.includes('--test');

export function setSendGridClient(client) {
    sendGridClient = client || sgMail;
}

export function getSendGridStatus() {
    return {
        configured: Boolean(config.sendgrid.apiKey && config.sendgrid.fromEmail && EMAIL_PATTERN.test(config.sendgrid.fromEmail)),
        senderEmail: config.sendgrid.fromEmail || null,
        senderName: config.sendgrid.fromName
    };
}

function classifyProviderError(error) {
    const status = error?.code || error?.response?.statusCode;
    if (status === 401 || status === 403) return 'SENDER_NOT_VERIFIED';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 400 && status < 500) return 'RECIPIENT_REJECTED';
    if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') return 'NETWORK_FAILURE';
    return 'PROVIDER_ERROR';
}

const RETRYABLE_CODES = new Set(['RATE_LIMITED', 'NETWORK_FAILURE', 'PROVIDER_ERROR']);

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWithRetry(message) {
    const maxAttempts = Math.max(1, Math.min(5, Number(config.retry?.maxRetries || 0) + 1));
    const baseDelayMs = Math.max(50, Number(config.retry?.retryDelayMs || 500));

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await sendGridClient.send(message);
        } catch (error) {
            const code = classifyProviderError(error);
            if (!RETRYABLE_CODES.has(code) || attempt === maxAttempts) {
                error.voxshieldDeliveryCode = code;
                throw error;
            }

            // Bounded exponential backoff. Do not log addresses, provider bodies,
            // credentials, or attachment content.
            await wait(Math.min(5000, baseDelayMs * (2 ** (attempt - 1))));
        }
    }
}

export async function sendIncidentReportEmail({ reporter, organization, recipient, incident, pdfBuffer, subject, textBody, htmlBody }) {
    if (!reporter?.email || !EMAIL_PATTERN.test(reporter.email)) {
        throw new ApiError('EMAIL_NOT_VERIFIED', 'A verified authenticated reporter email is required.', 403);
    }
    if (!recipient || !EMAIL_PATTERN.test(recipient)) {
        throw new ApiError('RECIPIENT_REJECTED', 'The trusted organization recipient is invalid.', 422);
    }
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
        throw new ApiError('REPORT_NOT_GENERATED', 'A generated PDF report is required before dispatch.', 422);
    }

    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    const smtpUser = process.env.GMAIL_USER || config.sendgrid.fromEmail || reporter.email;
    // Unit/integration tests inject the SendGrid client below. They must not
    // attempt network SMTP delivery merely because a developer .env is loaded.
    if (gmailPass && !IS_TEST_RUNNER) {
        try {
            const nodemailer = await import('nodemailer');
            const transporter = nodemailer.default.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                    user: smtpUser,
                    pass: gmailPass.replace(/\s+/g, '')
                }
            });
            const info = await transporter.sendMail({
                from: `"${config.sendgrid.fromName || 'VoxShield Fraud Intelligence'}" <${smtpUser}>`,
                to: recipient,
                replyTo: reporter.email,
                subject,
                text: textBody,
                html: htmlBody,
                attachments: [{
                    filename: `VoxShield-Incident-${incident.incidentId || incident.reportId}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }]
            });
            console.log(`[VoxShield] Live email dispatched via Gmail SMTP (Msg ID: ${info.messageId}) to ${recipient}`);
            return {
                provider: 'gmail_smtp',
                messageId: info.messageId,
                senderEmail: smtpUser,
                replyToEmail: reporter.email
            };
        } catch (gmailErr) {
            console.warn('[VoxShield] Gmail SMTP attempt failed, trying SendGrid:', gmailErr.message);
        }
    }

    const status = getSendGridStatus();
    if (!status.configured) {
        throw new ApiError('SENDGRID_NOT_CONFIGURED', 'SendGrid is not configured for incident-report delivery.', 503);
    }

    sendGridClient.setApiKey(config.sendgrid.apiKey);

    try {
        const [response] = await sendWithRetry({
            to: recipient,
            from: { email: config.sendgrid.fromEmail, name: config.sendgrid.fromName },
            replyTo: { email: reporter.email, name: reporter.name || reporter.email },
            subject,
            text: textBody,
            html: htmlBody,
            customArgs: { voxshield_report_id: incident.reportId },
            attachments: [{
                content: pdfBuffer.toString('base64'),
                filename: `VoxShield-Incident-${incident.incidentId || incident.reportId}.pdf`,
                type: 'application/pdf',
                disposition: 'attachment'
            }]
        });

        return {
            provider: 'sendgrid',
            messageId: response?.headers?.['x-message-id'] || null,
            deliveryStatus: 'ACCEPTED',
            senderEmail: config.sendgrid.fromEmail,
            replyToEmail: reporter.email,
            recipientEmail: recipient,
            organization
        };
    } catch (error) {
        const code = error.voxshieldDeliveryCode || classifyProviderError(error);
        throw new ApiError(code, 'Report created successfully, but email delivery could not be completed.', code === 'RATE_LIMITED' ? 429 : 502);
    }
}
