// Authentication. The user id always comes from the verified session, never from the request body.
import { isSupabaseConfigured, anonClient, userClient } from '../config/supabase.js';
import { HttpError } from '../utils/http.js';

export function requireSupabase(req, res, next) {
  if (!isSupabaseConfigured()) return next(new HttpError(503, 'supabase_not_configured'));
  next();
}

function bearer(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  return m ? m[1].trim() : null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) throw new HttpError(401, 'unauthorized');
    const anon = await anonClient();
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data?.user) throw new HttpError(401, 'unauthorized');
    req.user = { id: data.user.id };
    req.accessToken = token;
    req.db = await userClient(token);
    next();
  } catch (e) {
    next(e);
  }
}
