import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function sendSample() {
  const user = process.env.GMAIL_USER || 'katarapchandrashekargoud@gmail.com';
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const recipient = 'katarapchandrashekargoud@gmail.com';

  console.log(`[Test] Connecting to smtp.gmail.com with user: ${user}...`);

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: user,
      pass: pass
    }
  });

  try {
    const info = await transporter.sendMail({
      from: `"VoiceShield Fraud Intelligence" <${user}>`,
      to: recipient,
      subject: '[VoiceShield Test] Live Fraud Reporting Channel Verified (Kotak Bank)',
      text: `Hello,\n\nThis is a sample test notification from VoiceShield AI confirming that the live secure email relay is fully configured and operational for Kotak Mahindra Bank incident reporting.\n\nRecipient: ${recipient}\nStatus: Verified\nTimestamp: ${new Date().toISOString()}\n\nRegards,\nVoiceShield AI Security Desk`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background: #0b1d3a; color: #ffffff; padding: 20px; border-bottom: 3px solid #00d2ff;">
            <h2 style="margin: 0; color: #00d2ff;">VOICESHIELD AI</h2>
            <p style="margin: 4px 0 0; font-size: 12px; color: #cbd5e1;">Live Fraud Reporting Channel Verified</p>
          </div>
          <div style="padding: 24px; background: #ffffff; color: #1e293b;">
            <p>Hello,</p>
            <p>This is a test notification confirming that the <strong>VoiceShield AI</strong> secure incident dispatch channel for <strong>Kotak Mahindra Bank</strong> is operational.</p>
            <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 12px 16px; margin: 16px 0;">
              <span style="color: #166534; font-weight: bold;">✓ Secure Relay Connected Successfully</span>
            </div>
            <p style="font-size: 13px; color: #64748b;">
              Recipient: <strong>${recipient}</strong><br>
              Timestamp: <strong>${new Date().toLocaleString()}</strong>
            </p>
          </div>
          <div style="background: #f8fafc; padding: 12px 24px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            VoiceShield AI — Voice Fraud Intelligence & Defense System
          </div>
        </div>
      `
    });

    console.log(`[Success] Email sent successfully! Message ID: ${info.messageId}`);
  } catch (err) {
    console.error(`[Error] Failed to send email:`, err.message);
  }
}

sendSample();
