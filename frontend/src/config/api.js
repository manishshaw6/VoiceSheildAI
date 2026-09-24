import { Capacitor } from '@capacitor/core';

const isAndroid = Capacitor.getPlatform() === 'android';

// The Android bundle cannot rely on deployment-time Vite variables, so its
// production HTTP and WebSocket endpoints are embedded in the application.
const configuredApiBase = isAndroid
  ? 'https://voicesheildai-b6p4.onrender.com'
  : String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
const configuredWsBase = isAndroid
  ? 'wss://voicesheildai-b6p4.onrender.com'
  : String(import.meta.env.VITE_WS_BASE_URL || '').trim().replace(/\/$/, '');

export function apiUrl(path) {
  if (!path || !configuredApiBase || !String(path).startsWith('/api')) return path;
  return `${configuredApiBase}${path}`;
}

export function webSocketUrl(path = '/ws/live-analysis') {
  if (configuredWsBase) return `${configuredWsBase}${path}`;

  if (configuredApiBase) {
    const url = new URL(configuredApiBase);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${url.origin}${path}`;
  }

  if (window.location.port === '5173') {
    return `ws://${window.location.hostname || 'localhost'}:5000${path}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

export function installApiFetch() {
  if (!configuredApiBase || window.__voxshieldApiFetchInstalled) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (resource, options = {}) => {
    const resolved = typeof resource === 'string' ? apiUrl(resource) : resource;
    return nativeFetch(resolved, { credentials: 'include', ...options });
  };
  window.__voxshieldApiFetchInstalled = true;
}
