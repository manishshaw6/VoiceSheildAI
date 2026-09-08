/**
 * VoiceShieldAI - Main Server Entry Point
 * Initializes HTTP server, Express application, and WebSocket server.
 * Runs startup config validation and structured logging.
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import app from './app.js';
import { config, validateConfig } from './config/index.js';
import { setupLiveAnalysisWebSocket } from './websocket/liveAnalysisHandler.js';
import logger from './core/logger.js';

// ─── Startup Validation ─────────────────────────────────────────────────────

const configWarnings = validateConfig();
for (const warning of configWarnings) {
  logger.warn('startup.config_warning', { message: warning });
}

logger.info('startup.mode', { mode: config.mode, demo: config.enableDemoMode });

// ─── HTTP Server ────────────────────────────────────────────────────────────

const server = http.createServer(app);

// ─── WebSocket Server ───────────────────────────────────────────────────────

const wss = new WebSocketServer({
  server,
  path: '/ws/live-analysis'
});

setupLiveAnalysisWebSocket(wss);

// ─── Listen ─────────────────────────────────────────────────────────────────

server.listen(config.port, () => {
  logger.info('startup.ready', {
    port: config.port,
    http_url: `http://localhost:${config.port}/api`,
    ws_url: `ws://localhost:${config.port}/ws/live-analysis`,
    health_url: `http://localhost:${config.port}/api/health`
  });

  // Keep the friendly console output for development
  if (config.isDevelopment || config.isDemo) {
    console.log('====================================================');
    console.log(`🛡️  VoiceShieldAI Backend Server Active`);
    console.log(`📡 HTTP REST API: http://localhost:${config.port}/api`);
    console.log(`⚡ WebSocket Stream: ws://localhost:${config.port}/ws/live-analysis`);
    console.log(`🏥 Health Check: http://localhost:${config.port}/api/health`);
    console.log(`📋 Mode: ${config.mode.toUpperCase()}`);
    console.log('====================================================');
  }
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

function shutdown(signal) {
  logger.info('shutdown.initiated', { signal });

  if (config.isDevelopment) {
    console.log(`\n[VoiceShieldAI] Shutting down gracefully (${signal})...`);
  }

  // Close WebSocket connections
  wss.clients.forEach(client => {
    try {
      client.close(1001, 'Server shutting down');
    } catch (_) { /* ignore */ }
  });

  server.close(() => {
    logger.info('shutdown.complete');
    process.exit(0);
  });

  // Force exit after 5 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.warn('shutdown.forced');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
