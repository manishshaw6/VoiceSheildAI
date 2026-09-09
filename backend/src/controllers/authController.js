import {
  getGoogleLoginUrl,
  handleGoogleLoginCallback,
  destroySession,
  registerWithPassword,
  loginWithPassword,
  saveMailPassword,
  loginDemoUser
} from '../services/authService.js';
import { config } from '../config/index.js';
import { ApiError } from '../schemas/errors.js';

export async function getMe(req, res) {
  if (!req.user) {
    return res.status(200).json({
      authenticated: false,
      user: null
    });
  }

  // Never return sensitive tokens or secrets to client
  return res.status(200).json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      picture: req.user.picture,
      hasMailPermission: req.user.hasMailPermission,
      lastLoginAt: req.user.last_login_at
    }
  });
}

export async function googleLogin(req, res, next) {
  try {
    const returnTo = req.query.returnTo || req.query.state || '/';
    const { authUrl, state, mode } = getGoogleLoginUrl({ returnTo });

    if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
      return res.status(200).json({ authUrl, state, mode });
    }

    return res.redirect(authUrl);
  } catch (err) {
    return next(err);
  }
}

export async function googleCallback(req, res, next) {
  try {
    const { code, state } = req.query;
    const { sessionId, user, returnTo } = await handleGoogleLoginCallback({ code, state });

    // Set secure HTTP-only session cookie
    res.cookie('voxshield_session', sessionId, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    if (req.headers.accept?.includes('application/json')) {
      return res.status(200).json({
        success: true,
        sessionId,
        user,
        returnTo
      });
    }

    const redirectTarget = returnTo && returnTo.startsWith('/') ? `${config.frontendUrl}${returnTo}` : config.frontendUrl;
    return res.redirect(redirectTarget);
  } catch (err) {
    return next(err);
  }
}

export async function signup(req, res, next) {
  try {
    const { name, email, password, gmailAppPassword } = req.body;
    const { sessionId, user } = await registerWithPassword({ name, email, password, gmailAppPassword });

    res.cookie('voxshield_session', sessionId, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(201).json({
      success: true,
      sessionId,
      user
    });
  } catch (err) {
    return next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { sessionId, user } = await loginWithPassword({ email, password });

    res.cookie('voxshield_session', sessionId, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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

export async function demoLoginEndpoint(req, res, next) {
  try {
    const isProduction = process.env.NODE_ENV === 'production' || config.isProduction;
    const isEnabled = process.env.ENABLE_DEMO_LOGIN === 'true';

    if (isProduction && !isEnabled) {
      throw new ApiError('FORBIDDEN', 'Demo login is disabled in production environments.', 403);
    }

    const { sessionId, user } = await loginDemoUser();

    res.cookie('voxshield_session', sessionId, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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

export async function saveMailPasswordEndpoint(req, res, next) {
  try {
    const { gmailAppPassword } = req.body;
    await saveMailPassword(req.user.id, { gmailAppPassword });
    return res.status(200).json({
      success: true,
      message: 'Gmail App Password saved and verified for fraud reporting.'
    });
  } catch (err) {
    return next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const sessionId = req.cookies?.voxshield_session || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
    if (sessionId) {
      await destroySession(sessionId);
    }

    res.clearCookie('voxshield_session', {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax'
    });

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    return next(err);
  }
}
