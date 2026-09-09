/**
 * VoxShield AI — Authentication Middleware
 * Validates JWT tokens on protected routes.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { ApiError } from '../schemas/errors.js';
import { query } from '../database/db.js';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('UNAUTHORIZED', 'Authentication token required. Please log in.', 401);
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new ApiError('UNAUTHORIZED', 'Authentication token missing.', 401);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (jwtErr) {
      throw new ApiError('UNAUTHORIZED', 'Invalid or expired authentication token. Please log in again.', 401);
    }

    // Verify user exists in database
    const user = await query.get(
      'SELECT id, full_name, email, username, created_at FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      throw new ApiError('UNAUTHORIZED', 'User associated with this token no longer exists.', 401);
    }

    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      username: user.username,
      createdAt: user.created_at
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    query.get('SELECT id, full_name, email, username FROM users WHERE id = ?', [decoded.id])
      .then(user => {
        if (user) {
          req.user = {
            id: user.id,
            fullName: user.full_name,
            email: user.email,
            username: user.username
          };
        }
        next();
      })
      .catch(() => next());
  } catch {
    next();
  }
}
