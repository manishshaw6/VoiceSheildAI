/**
 * VoxShield AI — Authentication Controller
 * Handles Google OAuth, registration, login, profile retrieval, mail password,
 * demo login, and logout.
 */

import {
  getGoogleLoginUrl,
  handleGoogleLoginCallback,
  destroySession,
  registerWithPassword,
  loginWithPassword,
  saveMailPassword,
  loginDemoUser
} from '../services/authService.js';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { query } from '../database/db.js';
import { config } from '../config/index.js';
import { ApiError } from '../schemas/errors.js';

/**
 * Generate JWT token for user.
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.full_name
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/**
 * Get current authenticated user.
 */
export async function getMe(req, res) {
  if (!req.user) {
    return res.status(200).json({
      authenticated: false,
      user: null
    });
  }

  return res.status(200).json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name || req.user.full_name,
      username: req.user.username,
      picture: req.user.picture,
      hasMailPermission: req.user.hasMailPermission,
      lastLoginAt: req.user.last_login_at
    }
  });
}

/**
 * Google login.
 */
export async function googleLogin(req, res, next) {
  try {
    const returnTo = req.query.returnTo || req.query.state || '/';

    const { authUrl, state, mode } =
      getGoogleLoginUrl({ returnTo });

    if (
      req.headers.accept?.includes('application/json') ||
      req.query.format === 'json'
    ) {
      return res.status(200).json({
        authUrl,
        state,
        mode
      });
    }

    return res.redirect(authUrl);
  } catch (err) {
    return next(err);
  }
}

/**
 * Google OAuth callback.
 */
export async function googleCallback(req, res, next) {
  try {
    const { code, state } = req.query;

    const {
      sessionId,
      user,
      returnTo
    } = await handleGoogleLoginCallback({
      code,
      state
    });

    res.cookie('voxshield_session', sessionId, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    if (req.headers.accept?.includes('application/json')) {
      return res.status(200).json({
        success: true,
        sessionId,
        user,
        returnTo
      });
    }

    const redirectTarget =
      returnTo && returnTo.startsWith('/')
        ? `${config.frontendUrl}${returnTo}`
        : config.frontendUrl;

    return res.redirect(redirectTarget);
  } catch (err) {
    return next(err);
  }
}

/**
 * Register a new user.
 *
 * Supports both the existing authService registration flow
 * and the SQLite/bcrypt registration flow.
 */
export async function register(req, res, next) {
  try {
    const {
      fullName,
      full_name,
      name,
      email,
      username,
      password,
      confirmPassword,
      gmailAppPassword
    } = req.body || {};

    const displayName =
      (fullName || full_name || name || '').trim();

    const userEmail =
      (email || '').trim().toLowerCase();

    const userPassword =
      password || '';

    if (!displayName) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Full name is required.',
        400
      );
    }

    if (!userEmail) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Email address is required.',
        400
      );
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(userEmail)) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Please enter a valid email address.',
        400
      );
    }

    if (!userPassword) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Password is required.',
        400
      );
    }

    if (userPassword.length < 6) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Password must be at least 6 characters long.',
        400
      );
    }

    if (
      confirmPassword !== undefined &&
      confirmPassword !== userPassword
    ) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Passwords do not match.',
        400
      );
    }

    /*
     * Use the existing authService when Gmail app-password
     * functionality is required.
     */
    const result = await registerWithPassword({
      name: displayName,
      email: userEmail,
      password: userPassword,
      gmailAppPassword
    });

    const { sessionId, user } = result;

    res.cookie('voxshield_session', sessionId, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(201).json({
      success: true,
      status: 'ok',
      message: 'Account created successfully.',
      sessionId,
      user
    });
  } catch (err) {
    return next(err);
  }
}

export const signup = register;

/**
 * Login user.
 *
 * Uses the existing authService so Google/session authentication
 * and Gmail-related functionality remain compatible.
 */
export async function login(req, res, next) {
  try {
    const {
      login: loginId,
      email,
      username,
      password
    } = req.body || {};

    const identity =
      (loginId || email || username || '')
        .trim()
        .toLowerCase();

    if (!identity) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Email or username is required.',
        400
      );
    }

    if (!password) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Password is required.',
        400
      );
    }

    const {
      sessionId,
      user
    } = await loginWithPassword({
      email: identity,
      password
    });

    res.cookie('voxshield_session', sessionId, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({
      success: true,
      status: 'ok',
      message: 'Logged in successfully.',
      sessionId,
      user
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Get current authenticated profile.
 */
export async function getProfile(req, res, next) {
  try {
    return res.status(200).json({
      status: 'ok',
      user: req.user
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Demo login.
 */
export async function demoLoginEndpoint(req, res, next) {
  try {
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      config.isProduction;

    const isEnabled =
      process.env.ENABLE_DEMO_LOGIN === 'true';

    if (isProduction && !isEnabled) {
      throw new ApiError(
        'FORBIDDEN',
        'Demo login is disabled in production environments.',
        403
      );
    }

    const {
      sessionId,
      user
    } = await loginDemoUser();

    res.cookie('voxshield_session', sessionId, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({
      success: true,
      sessionId,
      user
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Save Gmail app password.
 */
export async function saveMailPasswordEndpoint(
  req,
  res,
  next
) {
  try {
    const { gmailAppPassword } = req.body;

    await saveMailPassword(
      req.user.id,
      { gmailAppPassword }
    );

    return res.status(200).json({
      success: true,
      message:
        'Gmail App Password saved and verified for fraud reporting.'
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Logout.
 */
export async function logout(req, res, next) {
  try {
    const sessionId =
      req.cookies?.voxshield_session ||
      (
        req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.split(' ')[1]
          : null
      );

    if (sessionId) {
      await destroySession(sessionId);
    }

    res.clearCookie('voxshield_session', {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax'
    });

    return res.status(200).json({
      success: true,
      status: 'ok',
      message: 'Logged out successfully.'
    });
  } catch (err) {
    return next(err);
  }
}