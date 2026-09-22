/**
 * VoxShield AI — Authentication Controller
 * Handles Google OAuth, registration, login, profile retrieval, mail password,
 * demo login, and logout.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import {
  getGoogleLoginUrl,
  handleGoogleLoginCallback,
  destroySession,
  registerWithPassword,
  verifyPassword,
  saveMailPassword,
  loginDemoUser
} from '../services/authService.js';

import { query } from '../database/db.js';
import { config } from '../config/index.js';
import { ApiError } from '../schemas/errors.js';

/**
 * Generate JWT token for user.
 */
function generateToken(user) {
  const displayName = user.full_name || user.fullName || user.name || '';
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      name: displayName
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

  const displayName = req.user.fullName || req.user.full_name || req.user.name || 'User';

  return res.status(200).json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: displayName,
      fullName: displayName,
      username: req.user.username,
      picture: req.user.picture,
      hasMailPermission: Boolean(req.user.hasMailPermission),
      lastLoginAt: req.user.lastLoginAt || req.user.last_login_at
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
 */
export async function register(req, res, next) {
  try {
    const body = req.body || {};
    let displayName = body.fullName || body.full_name || body.name || '';
    let userEmail = body.email || '';
    let userPassword = body.password || '';
    const confirmPassword = body.confirmPassword;
    const gmailAppPassword = body.gmailAppPassword;

    // Handle nested objects defensively
    if (typeof displayName === 'object' && displayName !== null) {
      displayName = displayName.fullName || displayName.name || '';
    }
    if (typeof userEmail === 'object' && userEmail !== null) {
      userEmail = userEmail.email || '';
    }
    displayName = String(displayName).trim();
    userEmail = String(userEmail).trim().toLowerCase();
    userPassword = String(userPassword || '');

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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
      String(confirmPassword) !== userPassword
    ) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Passwords do not match.',
        400
      );
    }

    // Determine unique username
    let userHandle = String(body.username || userEmail.split('@')[0]).trim().toLowerCase();
    userHandle = userHandle.replace(/[^a-z0-9_.]/g, '');
    if (!userHandle) {
      userHandle = `user_${Math.random().toString(36).slice(2, 8)}`;
    }

    // Check duplicate email or username
    const existing = await query.get(
      'SELECT id, email, username, password_hash FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
      [userEmail, userHandle]
    );

    if (existing && existing.password_hash) {
      throw new ApiError('DUPLICATE_USER', 'An account with this email address already exists.', 400);
    }

    const result = await registerWithPassword({
      name: displayName,
      email: userEmail,
      password: userPassword,
      gmailAppPassword
    });

    // Update full_name and username in SQLite
    await query.run(
      'UPDATE users SET full_name = ?, username = COALESCE(username, ?) WHERE id = ?',
      [displayName, userHandle, result.user.id]
    );

    const tokenUser = {
      id: result.user.id,
      email: userEmail,
      username: userHandle,
      full_name: displayName,
      fullName: displayName,
      name: displayName
    };

    const token = generateToken(tokenUser);

    res.cookie('voxshield_session', result.sessionId, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(201).json({
      success: true,
      status: 'ok',
      message: 'Account created successfully.',
      sessionId: result.sessionId,
      token,
      user: {
        id: result.user.id,
        fullName: displayName,
        name: displayName,
        email: userEmail,
        username: userHandle,
        hasMailPermission: Boolean(result.user.hasMailPermission),
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    return next(err);
  }
}

export const signup = register;

/**
 * Login user.
 * Supports email or username with password.
 */
export async function login(req, res, next) {
  try {
    const body = req.body || {};
    let loginId = body.login;
    let email = body.email;
    let username = body.username;
    let password = body.password;

    // Handle nested object defensively
    if (typeof loginId === 'object' && loginId !== null) {
      email = loginId.email || email;
      username = loginId.username || username;
      password = loginId.password || password;
      loginId = loginId.login || loginId.email || loginId.username;
    }
    if (typeof email === 'object' && email !== null) {
      password = email.password || password;
      username = email.username || username;
      email = email.email || email.username;
    }

    const identity = String(loginId || email || username || '').trim().toLowerCase();
    const userPassword = String(password || '');

    if (!identity) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'Email or username is required.',
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

    // Find user in database by email OR username
    const dbUser = await query.get(
      `SELECT id, email, name, full_name, username, picture, password_hash, password_salt, mail_password_encrypted, created_at
       FROM users
       WHERE LOWER(email) = ? OR LOWER(username) = ?`,
      [identity, identity]
    );

    if (!dbUser || !dbUser.password_hash) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    // Verify password: support bcrypt OR pbkdf2
    let isValid = false;
    if (dbUser.password_hash.startsWith('$2')) {
      isValid = await bcrypt.compare(userPassword, dbUser.password_hash);
    } else if (dbUser.password_salt) {
      isValid = verifyPassword(userPassword, dbUser.password_hash, dbUser.password_salt);
    }

    if (!isValid) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    // Update last login
    await query.run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [dbUser.id]);

    // Create session
    const sessionId = crypto.randomBytes(32).toString('hex');
    const sessionExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await query.run(
      'INSERT INTO user_sessions (session_id, user_id, expires_at) VALUES (?, ?, ?)',
      [sessionId, dbUser.id, sessionExpiresAt]
    );

    const mailToken = await query.get(
      "SELECT id FROM user_oauth_tokens WHERE user_id = ? AND scope_type = 'mail'",
      [dbUser.id]
    );
    const hasMailPermission = Boolean(mailToken) || Boolean(dbUser.mail_password_encrypted);

    const displayName = dbUser.full_name || dbUser.name || identity;
    const userHandle = dbUser.username || identity.split('@')[0];

    const tokenUser = {
      id: dbUser.id,
      email: dbUser.email,
      username: userHandle,
      full_name: displayName,
      fullName: displayName,
      name: displayName
    };

    const token = generateToken(tokenUser);

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
      token,
      user: {
        id: dbUser.id,
        fullName: displayName,
        name: displayName,
        email: dbUser.email,
        username: userHandle,
        picture: dbUser.picture,
        hasMailPermission,
        createdAt: dbUser.created_at
      }
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
    const displayName = req.user?.fullName || req.user?.full_name || req.user?.name || 'User';
    return res.status(200).json({
      status: 'ok',
      user: {
        ...req.user,
        fullName: displayName,
        name: displayName
      }
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

    const token = generateToken({
      ...user,
      full_name: user.name || 'Demo Investigator',
      username: 'demo_investigator'
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
      sessionId,
      token,
      user: {
        id: user.id,
        name: user.name || 'Demo Investigator',
        fullName: user.name || 'Demo Investigator',
        email: user.email,
        username: 'demo_investigator',
        hasMailPermission: true
      }
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Save Gmail App Password.
 */
export async function saveMailPasswordEndpoint(req, res, next) {
  try {
    const userId = req.user?.id;
    const { gmailAppPassword } = req.body || {};

    await saveMailPassword(userId, { gmailAppPassword });

    return res.status(200).json({
      success: true,
      status: 'ok',
      message: 'Gmail App Password saved successfully.'
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Logout user.
 */
export async function logout(req, res, next) {
  try {
    const sessionId = req.cookies?.voxshield_session;

    if (sessionId) {
      await destroySession(sessionId);
    }

    res.clearCookie('voxshield_session');

    return res.status(200).json({
      success: true,
      status: 'ok',
      message: 'Logged out successfully.'
    });
  } catch (err) {
    return next(err);
  }
}