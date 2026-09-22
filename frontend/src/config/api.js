const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');

// Local development works without a Vite proxy; production must supply VITE_API_URL.
export const API_BASE_URL = configuredApiUrl || (import.meta.env.DEV ? 'http://localhost:5000' : '');

export function apiUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function webSocketUrl(path = '/ws/live-analysis') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const backendUrl = API_BASE_URL || window.location.origin;
  const url = new URL(backendUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = normalizedPath;
  url.search = '';
  url.hash = '';
  return url.toString();
}
