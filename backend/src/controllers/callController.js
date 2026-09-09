import { randomUUID } from 'node:crypto';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config/index.js';

function roomIdForContact(contactId, roomCode) {
  const requestedRoom = roomCode || contactId;
  const normalized = String(requestedRoom || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  return normalized ? `voxcall-${normalized}` : null;
}

export async function createCallToken(req, res) {
  const room = roomIdForContact(req.body?.contactId, req.body?.roomCode);
  const participantName = String(req.body?.participantName || 'VoxCall guest').trim().slice(0, 80);

  if (!room) {
    return res.status(400).json({ error: 'A contact is required to join a call.' });
  }

  if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
    const missing = [
      ['LIVEKIT_URL', config.livekit.url],
      ['LIVEKIT_API_KEY', config.livekit.apiKey],
      ['LIVEKIT_API_SECRET', config.livekit.apiSecret]
    ].filter(([, value]) => !value).map(([name]) => name);

    return res.status(503).json({
      error: `LiveKit calling requires these backend environment variables: ${missing.join(', ')}.`,
      missingVariables: missing
    });
  }

  const identity = `voxcall-${randomUUID()}`;
  const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity,
    name: participantName || identity,
    ttl: `${config.livekit.tokenTtlSeconds}s`
  });

  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true
  });

  return res.status(200).json({
    token: await token.toJwt(),
    url: config.livekit.url,
    room
  });
}

export async function terminateCall(req, res) {
  const room = roomIdForContact(req.body?.contactId, req.body?.roomCode) || req.body?.room;
  if (!room) {
    return res.status(400).json({ error: 'A room identifier is required to terminate the call.' });
  }

  if (config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret) {
    try {
      const httpUrl = config.livekit.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
      const roomService = new RoomServiceClient(httpUrl, config.livekit.apiKey, config.livekit.apiSecret);
      await roomService.deleteRoom(room);
      return res.status(200).json({ success: true, message: `Room ${room} terminated for all users.` });
    } catch (err) {
      return res.status(200).json({ success: true, warning: err.message });
    }
  }

  return res.status(200).json({ success: true });
}