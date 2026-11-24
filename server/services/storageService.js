// صور الأغراض في Supabase Storage داخل مسار يبدأ بمعرف المستخدم: <user_id>/<item_id>/<timestamp>.<ext>
// الحاوية خاصة، وتُعرض الصور عبر روابط موقّعة مؤقتة.
import { env } from '../config/env.js';
import { validateImageDataUrl } from '../utils/validation.js';
import { badRequest, HttpError } from '../utils/http.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SIGNED_TTL = 60 * 60; // ساعة

/** التحقق من بصمة الملف الفعلية (لا نثق بنوع MIME المعلن فقط). */
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export async function uploadItemImage(db, userId, itemId, dataUrl) {
  const v = validateImageDataUrl(dataUrl);
  if (!v.ok) throw badRequest(v.error, { image: v.error });
  const buf = Buffer.from(v.base64, 'base64');
  const real = sniff(buf);
  if (!real || real !== v.mime) throw badRequest('محتوى الملف لا يطابق صورة صالحة.', { image: 'محتوى الملف لا يطابق صورة صالحة.' });
  const path = `${userId}/${itemId}/${Date.now()}.${EXT[real]}`;
  const { error } = await db.storage.from(env.storageBucket).upload(path, buf, { contentType: real, upsert: false });
  if (error) {
    const e = new HttpError(502, 'تعذّر رفع الصورة إلى التخزين.', { code: 'storage_error' });
    e.cause = error;
    throw e;
  }
  return path;
}

export async function removeImages(db, paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await db.storage.from(env.storageBucket).remove(list);
  if (error) console.warn('[storage] تعذّر حذف صور:', error.message);
}

/** يضيف image_url (رابط موقّع) لكل غرض له صورة. */
export async function attachImageUrls(db, items) {
  const paths = [...new Set(items.map((i) => i.image_path).filter(Boolean))];
  const map = new Map();
  if (paths.length) {
    const { data, error } = await db.storage.from(env.storageBucket).createSignedUrls(paths, SIGNED_TTL);
    if (!error) for (const row of data || []) if (row.signedUrl) map.set(row.path, row.signedUrl);
  }
  return items.map((i) => ({ ...i, image_url: i.image_path ? map.get(i.image_path) || null : null }));
}
