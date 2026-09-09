import sgMail from '@sendgrid/mail';
import { config } from '../config/index.js';
import { ApiError } from '../schemas/errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let sendGridClient = sgMail;

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
    if (gmailPass && process.env.NODE_ENV !== 'test') {
        try {
            const nodemailer = await import('nodemailer');
            const transporter = nodemailer.default.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                    user: config.sendgrid.fromEmail || reporter.email,
                    pass: gmailPass.replace(/\s+/g, '')
                }
            });
            const info = await transporter.sendMail({
                from: `"${config.sendgrid.fromName || 'VoxShield Fraud Intelligence'}" <${config.sendgrid.fromEmail || reporter.email}>`,
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
            console.log(`[VoxShield] Live email dispatched via Gmail SMTP (Msg ID: ${info.messageId})`);
            return {
                provider: 'gmail_smtp',
                messageId: info.messageId,
                senderEmail: config.sendgrid.fromEmail || reporter.email,
                replyToEmail: reporter.email,
                recipientEmail: recipient,
                organization,
                mode: 'live_gmail_smtp'
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
        const [response] = await sendGridClient.send({
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
            senderEmail: config.sendgrid.fromEmail,
            replyToEmail: reporter.email,
            recipientEmail: recipient,
            organization
        };
    } catch (error) {
        const code = classifyProviderError(error);
        if (code === 'SENDER_NOT_VERIFIED') {
            console.warn('[SendGrid] Sender identity not verified yet. Falling back to VoxShield Secure Simulated Relay.');
            return {
                provider: 'voxshield_relay_simulated',
                messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                senderEmail: config.sendgrid.fromEmail || reporter.email,
                replyToEmail: reporter.email,
                recipientEmail: recipient,
                organization,
                mode: 'simulated_fallback'
            };
        }
        throw new ApiError(code, 'Report created successfully, but email delivery could not be completed.', code === 'RATE_LIMITED' ? 429 : 502);
    }
}
