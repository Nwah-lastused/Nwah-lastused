# التشغيل والنشر

## المتطلبات

- Node.js 20.12 أو أحدث
- مشروع Supabase (اختياري؛ بدونه تعمل المنصة في الوضع التجريبي المحلي)

## التشغيل محليًا

```bash
npm install
cp .env.example .env
npm start
```

العنوان: `http://localhost:3000`

```bash
npm test
```

## Supabase

1. نفّذ `supabase/schema.sql` في SQL Editor.
2. (اختياري) نفّذ `supabase/seed.sql`، ثم:
   ```sql
   select public.load_demo_data('<username>');
   ```
3. ضع القيم في `.env`:

| المتغير | المصدر |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key (للخادم فقط) |

## متغيرات البيئة

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `3000` | منفذ الخادم |
| `AUTH_EMAIL_DOMAIN` | `users.lastuse.local` | نطاق البريد التقني المشتق من اسم المستخدم |
| `SUPABASE_STORAGE_BUCKET` | `item-images` | حاوية الصور |
| `ALLOW_DEMO_DATA` | `true` (تطوير) / `false` (إنتاج) | زر البيانات التجريبية |
| `REMINDER_INTERVAL_MINUTES` | `0` | فحص دوري للتذكيرات (0 = معطّل) |
| `TRUST_PROXY` | `false` | عند التشغيل خلف وكيل عكسي |

## النشر

| المنصة | الملف | الوضع |
|---|---|---|
| Render | `render.yaml` | كامل مع Supabase |
| GitHub Pages | `.github/workflows/pages.yml` | الواجهة فقط (وضع محلي) |

## واجهات API

| الطريقة | المسار |
|---|---|
| GET | `/api/config` · `/api/health` |
| POST | `/api/auth/register` · `/api/auth/login` · `/api/auth/refresh` · `/api/auth/logout` |
| GET | `/api/auth/me` · `/api/dashboard` |
| GET / POST | `/api/items` |
| GET / PATCH / DELETE | `/api/items/:id` |
| POST | `/api/items/:id/use` · `/api/items/:id/action` |
| GET | `/api/notifications` |
| PATCH | `/api/notifications/:id` |
| POST | `/api/notifications/read-all` · `/api/reminders/check` |
| GET / PATCH | `/api/settings` |
| POST / DELETE | `/api/demo/load` · `/api/demo` |

ترسل الواجهة الترويسة `X-Lang: ar | en`، فتصل رسائل الخطأ والتحقق باللغة المختارة.
