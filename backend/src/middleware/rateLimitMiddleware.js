import { config } from '../config/index.js';
import { rateLimitedError } from '../schemas/errors.js';

const clients = new Map();

export function rateLimitMiddleware(req, _res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = clients.get(key);
  if (!entry || now - entry.startedAt >= config.rateLimit.windowMs) entry = { startedAt: now, count: 0 };
  entry.count += 1;
  clients.set(key, entry);
  if (entry.count > config.rateLimit.maxRequests) return next(rateLimitedError());
  if (clients.size > 10000) {
    for (const [client, value] of clients) if (now - value.startedAt >= config.rateLimit.windowMs) clients.delete(client);
  }
  return next();
}
