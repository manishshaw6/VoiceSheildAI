/**
 * VoiceShieldAI - REST API Routes
 */

import { Router } from 'express';
import { uploadAudio } from '../middleware/uploadMiddleware.js';
import { getHealth, getReadiness, getProviderStatus, getPreflight } from '../controllers/healthController.js';
import { analyzeAudio } from '../controllers/audioController.js';
import { enroll, verify, listProfiles } from '../controllers/speakerController.js';
import { getHistory, getHistoryById, deleteHistory, getSecurityReport } from '../controllers/historyController.js';
import { getIncident, getAuditTrail } from '../controllers/securityController.js';
import { register, login, getProfile, logout } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// Authentication Routes
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', requireAuth, getProfile);
router.post('/auth/logout', logout);

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

// Security Reports
router.get('/analysis/:id/report', getSecurityReport);
router.get('/incidents/:id', getIncident);
router.get('/audit', getAuditTrail);

export default router;
