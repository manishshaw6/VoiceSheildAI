/**
 * VoxShield AI — Authentication Controller
 * Handles user registration, login, profile retrieval, and logout.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../database/db.js';
import { config } from '../config/index.js';
import { ApiError } from '../schemas/errors.js';

/**
 * Generate JWT token for user
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
 * Register a new user
 */
export async function register(req, res, next) {
  try {
    const { fullName, full_name, name, email, username, password, confirmPassword } = req.body || {};
    const displayName = (fullName || full_name || name || '').trim();
    const userEmail = (email || '').trim().toLowerCase();
    const userPassword = password || '';

    if (!displayName) {
      throw new ApiError('VALIDATION_FAILED', 'Full name is required.', 400);
    }
    if (!userEmail) {
      throw new ApiError('VALIDATION_FAILED', 'Email address is required.', 400);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      throw new ApiError('VALIDATION_FAILED', 'Please enter a valid email address.', 400);
    }
    if (!userPassword) {
      throw new ApiError('VALIDATION_FAILED', 'Password is required.', 400);
    }
    if (userPassword.length < 6) {
      throw new ApiError('VALIDATION_FAILED', 'Password must be at least 6 characters long.', 400);
    }

    if (confirmPassword !== undefined && confirmPassword !== userPassword) {
      throw new ApiError('VALIDATION_FAILED', 'Passwords do not match.', 400);
    }

    // Determine unique username
    let userHandle = (username || userEmail.split('@')[0]).trim().toLowerCase();
    userHandle = userHandle.replace(/[^a-z0-9_.]/g, '');
    if (!userHandle) {
      userHandle = `user_${Math.random().toString(36).slice(2, 8)}`;
    }

    // Check duplicate email or username
    const existingUser = await query.get(
      'SELECT id, email, username FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
      [userEmail, userHandle]
    );

    if (existingUser) {
      if (existingUser.email.toLowerCase() === userEmail) {
        throw new ApiError('DUPLICATE_USER', 'An account with this email address already exists.', 400);
      }
      if (existingUser.username.toLowerCase() === userHandle) {
        // If auto-generated username conflicted, append suffix
        userHandle = `${userHandle}_${Math.floor(100 + Math.random() * 900)}`;
      }
    }

    // Hash password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(userPassword, saltRounds);

    // Create user record
    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    await query.run(
      `INSERT INTO users (id, full_name, email, username, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, displayName, userEmail, userHandle, passwordHash, now, now]
    );

    const newUser = {
      id: userId,
      full_name: displayName,
      email: userEmail,
      username: userHandle,
      created_at: now
    };

    const token = generateToken(newUser);

    return res.status(201).json({
      status: 'ok',
      message: 'Account created successfully.',
      token,
      user: {
        id: newUser.id,
        fullName: newUser.full_name,
        email: newUser.email,
        username: newUser.username,
        createdAt: newUser.created_at
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Login user with email/username and password
 */
export async function login(req, res, next) {
  try {
    const { login: loginId, email, username, password } = req.body || {};
    const identity = (loginId || email || username || '').trim().toLowerCase();
    const userPassword = password || '';

    if (!identity) {
      throw new ApiError('VALIDATION_FAILED', 'Email or username is required.', 400);
    }
    if (!userPassword) {
      throw new ApiError('VALIDATION_FAILED', 'Password is required.', 400);
    }

    // Find user by email or username
    const user = await query.get(
      'SELECT id, full_name, email, username, password_hash, created_at FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
      [identity, identity]
    );

    if (!user) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email/username or password.', 401);
    }

    // Verify password hash
    const isPasswordValid = await bcrypt.compare(userPassword, user.password_hash);
    if (!isPasswordValid) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid email/username or password.', 401);
    }

    const token = generateToken(user);

    return res.status(200).json({
      status: 'ok',
      message: 'Logged in successfully.',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        username: user.username,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current authenticated user profile
 */
export async function getProfile(req, res, next) {
  try {
    return res.status(200).json({
      status: 'ok',
      user: req.user
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Logout endpoint
 */
export async function logout(req, res, next) {
  try {
    return res.status(200).json({
      status: 'ok',
      message: 'Logged out successfully.'
    });
  } catch (error) {
    next(error);
  }
}
