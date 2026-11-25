// Security headers, request language and a simple in-memory rate limiter.
import { env } from '../config/env.js';
import { normalizeLang } from '../../public/js/shared/i18n.js';
import { HttpError } from '../utils/http.js';

export function securityHeaders(req, res, next) {
  const imgSrc = ["'self'", 'data:', 'blob:'];
  if (env.supabaseUrl) imgSrc.push(new URL(env.supabaseUrl).origin);
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src ${imgSrc.join(' ')}`,
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

export function requestLang(req, res, next) {
  req.lang = normalizeLang(String(req.headers['x-lang'] || '').toLowerCase());
  next();
}

export function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
    } else if (++entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.start + windowMs - now) / 1000));
      return next(new HttpError(429, 'rate_limited'));
    }
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    next();
  };
}
