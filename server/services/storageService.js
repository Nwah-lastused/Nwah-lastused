// Item photos in Supabase Storage at <user_id>/<item_id>/<timestamp>.<ext> (private bucket, signed URLs).
import { env } from '../config/env.js';
import { validateImageDataUrl } from '../utils/validation.js';
import { badRequest, HttpError } from '../utils/http.js';
import { t } from '../../public/js/shared/i18n.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SIGNED_URL_TTL = 60 * 60;

/** Detects the real image type from magic bytes. */
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export async function uploadItemImage(db, userId, itemId, dataUrl, lang) {
  const v = validateImageDataUrl(dataUrl, lang);
  if (!v.ok) throw badRequest({ image: v.error });
  const buf = Buffer.from(v.base64, 'base64');
  const real = sniff(buf);
  if (!real || real !== v.mime) throw badRequest({ image: t('v.imageContent', {}, lang) });

  const path = `${userId}/${itemId}/${Date.now()}.${EXT[real]}`;
  const { error } = await db.storage.from(env.storageBucket).upload(path, buf, { contentType: real, upsert: false });
  if (error) {
    const e = new HttpError(502, 'storage_error');
    e.cause = error;
    throw e;
  }
  return path;
}

export async function removeImages(db, paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await db.storage.from(env.storageBucket).remove(list);
  if (error) console.warn('[storage] remove failed:', error.message);
}

export async function attachImageUrls(db, items) {
  const paths = [...new Set(items.map((i) => i.image_path).filter(Boolean))];
  const urls = new Map();
  if (paths.length) {
    const { data, error } = await db.storage.from(env.storageBucket).createSignedUrls(paths, SIGNED_URL_TTL);
    if (!error) for (const row of data || []) if (row.signedUrl) urls.set(row.path, row.signedUrl);
  }
  return items.map((i) => ({ ...i, image_url: i.image_path ? urls.get(i.image_path) || null : null }));
}
