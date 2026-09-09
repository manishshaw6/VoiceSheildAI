/**
 * VoiceShieldAI - REST API Routes
 */

import { Router } from 'express';
import { uploadAudio } from '../middleware/uploadMiddleware.js';
import { getHealth, getReadiness, getProviderStatus, getPreflight } from '../controllers/healthController.js';
import { analyzeAudio, getAnalysisForensics } from '../controllers/audioController.js';
import { enroll, verify, listProfiles } from '../controllers/speakerController.js';
import { getHistory, getHistoryById, deleteHistory, getSecurityReport } from '../controllers/historyController.js';
import { getIncident, getAuditTrail } from '../controllers/securityController.js';
import { getMe, signup, login, demoLoginEndpoint, saveMailPasswordEndpoint, googleLogin, googleCallback, logout } from '../controllers/authController.js';
import { getMailStatus, googleMailConnect, googleMailCallback, disconnectMail } from '../controllers/mailController.js';
import { getOrganizations, getOrganization } from '../controllers/organizationController.js';
import {
  generateReport,
  getReport,
  getReportPdf,
  verifyReport,
  approveReport,
  cancelReport,
  sendReport,
  getReportStatus
} from '../controllers/reportController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// Health Check
router.get('/health', getHealth);
router.get('/ready', getReadiness);
router.get('/system/providers', getProviderStatus);
router.get('/system/preflight', getPreflight);

// Audio Pipeline Analysis
router.post('/audio/analyze', uploadAudio.single('audio'), analyzeAudio);

// Speaker Identity Verification & Enrollment
router.post('/speaker/enroll', uploadAudio.single('audio'), enroll);
router.post('/speaker/verify', uploadAudio.single('audio'), verify);
router.get('/speaker/profiles', listProfiles);
router.post('/voice/enroll', uploadAudio.single('audio'), enroll);
router.post('/voice/verify', uploadAudio.single('audio'), verify);

// History & Auditing
router.get('/history', getHistory);
router.get('/history/:id', getHistoryById);
router.delete('/history/:id', deleteHistory);

// Security Reports (Legacy & Native)
router.get('/analysis/:id/report', getSecurityReport);
router.get('/analysis/:id/forensics', getAnalysisForensics);
router.get('/incidents/:id', getIncident);
router.get('/audit', getAuditTrail);

// User Authentication (Standard Sign In / Sign Up & Google OAuth)
router.get('/auth/me', getMe);
router.post('/auth/signup', signup);
router.post('/auth/login', login);
router.post('/auth/demo-login', demoLoginEndpoint);
router.post('/auth/mail-password', requireAuth, saveMailPasswordEndpoint);
router.get('/auth/google', googleLogin);
router.get('/auth/google/callback', googleCallback);
router.post('/auth/logout', logout);

// Incremental Mail-Send Authorization (Gmail API Send Scope)
router.get('/mail/status', getMailStatus);
router.get('/mail/google/connect', requireAuth, googleMailConnect);
router.get('/mail/google/callback', googleMailCallback);
router.post('/mail/disconnect', requireAuth, disconnectMail);

// Trusted Organization Directory
router.get('/organizations', getOrganizations);
router.get('/organizations/search', getOrganizations);
router.get('/organizations/:id', getOrganization);

// Digitally Verifiable Incident Reports & Authorized Dispatch
router.post('/reports/generate', requireAuth, generateReport);
router.get('/reports/:id', getReport);
router.get('/reports/:id/pdf', getReportPdf);
router.get('/reports/:id/verify', verifyReport);
router.post('/reports/:id/approve', requireAuth, approveReport);
router.post('/reports/:id/cancel', requireAuth, cancelReport);
router.post('/reports/:id/send', requireAuth, sendReport);
router.get('/reports/:id/status', getReportStatus);

export default router;
