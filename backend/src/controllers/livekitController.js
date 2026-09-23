import crypto from 'crypto';
import os from 'os';
import jwt from 'jsonwebtoken';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config/index.js';
import { ApiError } from '../schemas/errors.js';

const INVITE_AUDIENCE = 'voxshield-livekit-call';
const safeName = value => String(value || 'Participant').trim().slice(0, 60) || 'Participant';

function getLanIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254')) {
          return iface.address;
        }
      }
    }
  } catch (_) {}
  return null;
}

function assertConfigured() {
  if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
    throw new ApiError('LIVEKIT_NOT_CONFIGURED', 'Secure calling is not configured on this server.', 503);
  }
}

function livekitServiceError(error) {
  if (error instanceof ApiError) return error;
  const message = String(error?.message || '');
  if (/invalid api key/i.test(message)) {
    return new ApiError(
      'LIVEKIT_API_KEY_INVALID',
      'LiveKit does not recognize LIVEKIT_API_KEY for the configured LIVEKIT_URL. Copy the WebSocket URL and API key from the same LiveKit Cloud project, or generate a new key pair, then restart the backend.',
      503
    );
  }
  if (error?.status === 401 || /unauthorized|invalid token/i.test(message)) {
    return new ApiError(
      'LIVEKIT_AUTH_FAILED',
      'LiveKit rejected the API secret for the configured URL and API key. Copy the complete secret from the same LiveKit Cloud key pair, then restart the backend.',
      503
    );
  }
  if (/fetch failed|network|enotfound|econnrefused|timeout/i.test(message)) {
    return new ApiError(
      'LIVEKIT_UNREACHABLE',
      'The backend could not reach LiveKit Cloud. Check the network connection and LIVEKIT_URL.',
      503
    );
  }
  return error;
}

function roomService() {
  const httpUrl = config.livekit.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  return new RoomServiceClient(httpUrl, config.livekit.apiKey, config.livekit.apiSecret);
}

function signInvite(roomName, role) {
  return jwt.sign({ roomName, role }, config.sessionSecret, {
    audience: INVITE_AUDIENCE,
    issuer: 'voxshield',
    expiresIn: config.livekit.inviteTtlSeconds
  });
}

function verifyInvite(invite, requiredRole = null) {
  try {
    const claims = jwt.verify(invite, config.sessionSecret, {
      audience: INVITE_AUDIENCE,
      issuer: 'voxshield'
    });
    if (!claims.roomName || (requiredRole && claims.role !== requiredRole)) throw new Error('Invalid role');
    return claims;
  } catch {
    throw new ApiError('INVALID_CALL_INVITE', 'This call invitation is invalid or has expired.', 401);
  }
}

async function participantToken({ roomName, identity, name, canPublish = true }) {
  const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity,
    name: safeName(name),
    ttl: config.livekit.tokenTtlSeconds
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: true
  });
  return token.toJwt();
}

export async function createLiveCall(req, res, next) {
  try {
    assertConfigured();
    const roomName = `vox-${crypto.randomBytes(12).toString('hex')}`;
    await roomService().createRoom({
      name: roomName,
      maxParticipants: config.livekit.maxParticipants,
      emptyTimeout: 120,
      departureTimeout: 20
    });

    const hostName = safeName(req.body?.name || req.user?.name || req.user?.fullName || 'Call host');
    const hostIdentity = `host-${req.user?.id || crypto.randomUUID()}`;
    const hostInvite = signInvite(roomName, 'host');
    const guestInvite = signInvite(roomName, 'guest');
    const token = await participantToken({ roomName, identity: hostIdentity, name: hostName });
    const publicBaseUrl = (config.isProduction ? config.frontendUrl : (req.get('origin') || config.frontendUrl)).replace(/\/$/, '');
    const joinUrl = `${publicBaseUrl}/join-call?invite=${encodeURIComponent(guestInvite)}`;

    let lanJoinUrl = null;
    const lanIp = getLanIp();
    if (lanIp) {
      try {
        const originObj = new URL(publicBaseUrl);
        const port = originObj.port ? `:${originObj.port}` : '';
        lanJoinUrl = `http://${lanIp}${port}/join-call?invite=${encodeURIComponent(guestInvite)}`;
      } catch (_) {}
    }

    return res.status(201).json({
      success: true,
      roomName,
      livekitUrl: config.livekit.url,
      token,
      hostInvite,
      joinUrl,
      lanJoinUrl,
      expiresIn: config.livekit.inviteTtlSeconds
    });
  } catch (error) { return next(livekitServiceError(error)); }
}

export async function joinLiveCall(req, res, next) {
  try {
    assertConfigured();
    const claims = verifyInvite(req.body?.invite, 'guest');
    const name = safeName(req.body?.name || 'Guest');
    const identity = `guest-${crypto.randomUUID()}`;
    const token = await participantToken({ roomName: claims.roomName, identity, name });
    return res.json({ success: true, roomName: claims.roomName, livekitUrl: config.livekit.url, token });
  } catch (error) { return next(livekitServiceError(error)); }
}

export async function endLiveCall(req, res, next) {
  try {
    assertConfigured();
    const claims = verifyInvite(req.body?.hostInvite, 'host');
    await roomService().deleteRoom(claims.roomName).catch(error => {
      if (!/not found/i.test(error.message)) throw error;
    });
    return res.json({ success: true, roomName: claims.roomName, reason: safeName(req.body?.reason || 'ended') });
  } catch (error) { return next(livekitServiceError(error)); }
}

export const livekitInternals = { signInvite, verifyInvite };
