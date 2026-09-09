import {
  getGoogleMailConnectUrl,
  handleGoogleMailCallback,
  disconnectMailPermission
} from '../services/authService.js';
import { getUserMailProvider } from '../services/mail/index.js';
import { config } from '../config/index.js';

export async function getMailStatus(req, res, next) {
  try {
    if (!req.user) {
      return res.status(200).json({
        connected: false,
        provider: 'gmail',
        senderEmail: null,
        expiresAt: null
      });
    }

    const provider = getUserMailProvider('gmail');
    const status = await provider.getConnectionStatus(req.user.id);
    return res.status(200).json({
      success: true,
      ...status
    });
  } catch (err) {
    return next(err);
  }
}

export async function googleMailConnect(req, res, next) {
  try {
    const returnTo = req.query.returnTo || '/scanner';
    const { authUrl, state, mode } = getGoogleMailConnectUrl({ userId: req.user.id, returnTo });

    if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
      return res.status(200).json({ authUrl, state, mode });
    }

    return res.redirect(authUrl);
  } catch (err) {
    return next(err);
  }
}

export async function googleMailCallback(req, res, next) {
  try {
    const { code, state } = req.query;
    const { returnTo } = await handleGoogleMailCallback({ code, state });

    if (req.headers.accept?.includes('application/json')) {
      return res.status(200).json({ success: true, connected: true, returnTo });
    }

    const redirectTarget = returnTo && returnTo.startsWith('/') ? `${config.frontendUrl}${returnTo}` : config.frontendUrl;
    return res.redirect(redirectTarget);
  } catch (err) {
    return next(err);
  }
}

export async function disconnectMail(req, res, next) {
  try {
    await disconnectMailPermission(req.user.id);
    return res.status(200).json({ success: true, message: 'Mail permission revoked successfully.' });
  } catch (err) {
    return next(err);
  }
}
