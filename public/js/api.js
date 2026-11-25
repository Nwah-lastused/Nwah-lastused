// HTTP client for /api: stores the session, refreshes expired tokens and sends the UI language.
import { t, getLang } from './shared/i18n.js';

const SESSION_KEY = 'lu_session';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', details = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function raw(method, path, body, token) {
  const headers = { Accept: 'application/json', 'X-Lang': getLang() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(t('errors.network'), { code: 'network' });
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || json?.ok === false) {
    const err = json?.error || {};
    throw new ApiError(err.message || t('ui.unexpected'), { status: res.status, code: err.code, details: err.details });
  }
  return json?.data;
}

let refreshing = null;

async function refreshSession() {
  const s = getSession();
  if (!s?.refresh_token) return null;
  if (!refreshing) {
    refreshing = raw('POST', '/api/auth/refresh', { refresh_token: s.refresh_token })
      .then((data) => {
        setSession({ ...s, ...data.session });
        return data.session;
      })
      .catch(() => {
        setSession(null);
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/** Authenticated request; retries once after refreshing on 401. */
export async function request(method, path, body) {
  const s = getSession();
  try {
    return await raw(method, path, body, s?.access_token);
  } catch (e) {
    if (e.status === 401 && s?.refresh_token) {
      const fresh = await refreshSession();
      if (fresh) return raw(method, path, body, fresh.access_token);
    }
    throw e;
  }
}

export const api = {
  config: () => raw('GET', '/api/config'),
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  publicPost: (p, b) => raw('POST', p, b)
};
