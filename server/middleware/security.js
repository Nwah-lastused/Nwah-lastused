// ترويسات أمان أساسية وحدّ بسيط لمعدل الطلبات (في الذاكرة — يكفي لنسخة أولية بخادم واحد).
import { env } from '../config/env.js';

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

export function rateLimit({ windowMs = 60_000, max = 20, message = 'محاولات كثيرة، انتظر دقيقة ثم حاول مجددًا.' } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
    } else if (++entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.start + windowMs - now) / 1000));
      return res.status(429).json({ ok: false, error: { code: 'rate_limited', message } });
    }
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    next();
  };
}
