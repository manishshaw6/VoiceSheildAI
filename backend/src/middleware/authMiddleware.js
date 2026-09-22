/**
 * VoxShield AI — Authentication Middleware
 * Supports both:
 * 1. HTTP-only session cookies
 * 2. JWT Bearer tokens
 */

import jwt from 'jsonwebtoken';

import { getUserFromSession } from '../services/authService.js';
import { config } from '../config/index.js';
import { ApiError } from '../schemas/errors.js';
import { query } from '../database/db.js';

/**
 * Attach authenticated user if a valid session or JWT exists.
 *
 * Priority:
 * 1. Session cookie
 * 2. Authorization: Bearer <JWT>
 */
export async function attachUser(req, res, next) {
  try {
    let sessionId = req.cookies?.voxshield_session;

    // --------------------------------------------------
    // 1. Try HTTP-only session cookie
    // --------------------------------------------------
    if (sessionId) {
      try {
        const user = await getUserFromSession(sessionId);

        if (user) {
          req.user = user;
          return next();
        }
      } catch {
        // Session invalid/expired.
        // Continue and try JWT authentication.
      }
    }

    // --------------------------------------------------
    // 2. Try JWT Bearer token
    // --------------------------------------------------
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];

      if (token) {
        try {
          const decoded = jwt.verify(
            token,
            config.jwtSecret
          );

          const user = await query.get(
            `SELECT
              id,
              full_name,
              name,
              email,
              username,
              picture,
              created_at,
              last_login_at
             FROM users
             WHERE id = ?`,
            [decoded.id]
          );

          if (user) {
            req.user = {
              id: user.id,
              fullName: user.full_name || user.name,
              name: user.name || user.full_name,
              email: user.email,
              username: user.username,
              picture: user.picture,
              createdAt: user.created_at,
              lastLoginAt: user.last_login_at
            };

            return next();
          }
        } catch {
          // Invalid JWT — treat as unauthenticated.
        }
      }
    }

    // No valid authentication found.
    req.user = null;

    next();
  } catch {
    req.user = null;
    next();
  }
}

/**
 * Require authentication.
 *
 * Works with either:
 * - voxshield_session cookie
 * - Authorization: Bearer <JWT>
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return next(
      new ApiError(
        'UNAUTHORIZED',
        'Authentication is required to perform this action.',
        401
      )
    );
  }

  next();
}

/**
 * Optional authentication.
 *
 * Does not reject the request when the user is unauthenticated.
 */
export function optionalAuth(req, res, next) {
  return attachUser(req, res, next);
}
