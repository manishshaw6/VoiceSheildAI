/**
 * VoiceShieldAI - Secure Audio Upload Middleware
 * File validation, MIME check, extension check, size limits, and filename sanitization.
 * Uses centralized constants instead of hardcoded values.
 */

import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES } from '../core/constants.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename & prevent path traversal — never trust client filename
    const safeExt = path.extname(file.originalname).toLowerCase() || '.wav';
    const randomHash = crypto.randomBytes(12).toString('hex');
    const safeName = `audio_${Date.now()}_${randomHash}${safeExt}`;
    cb(null, safeName);
  }
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  const isAllowedExt = ext ? (ALLOWED_EXTENSIONS.has(ext) || /\.(wav|mp3|m4a|webm|ogg|mpeg|mpg|aac|flac|mpga|opus)$/i.test(file.originalname)) : false;
  const isAllowedMime = mime ? (ALLOWED_MIME_TYPES.has(mime) || mime.startsWith('audio/') || mime.includes('mpeg') || mime.includes('webm')) : false;

  // Allow browser MediaRecorder default blobs, allowed extensions, or allowed audio MIME types
  if (isAllowedExt || isAllowedMime || !ext) {
    return cb(null, true);
  }

  return cb(new Error(`Invalid file format: ${ext || mime}. Supported formats: WAV, MP3, MPEG, M4A, WEBM, OGG.`), false);
}

export const uploadAudio = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.audio.maxUploadSizeMB * 1024 * 1024
  }
});
