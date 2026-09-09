import { getUserFromSession } from '../services/authService.js';
import { ApiError } from '../schemas/errors.js';

export async function attachUser(req, res, next) {
  try {
    let sessionId = req.cookies?.voxshield_session;

    // Support Authorization header Bearer token (useful for automated testing)
    if (!sessionId && req.headers.authorization?.startsWith('Bearer ')) {
      sessionId = req.headers.authorization.split(' ')[1];
    }

    if (sessionId) {
      req.user = await getUserFromSession(sessionId);
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return next(new ApiError('UNAUTHORIZED', 'Authentication is required to perform this action.', 401));
  }
  next();
}
