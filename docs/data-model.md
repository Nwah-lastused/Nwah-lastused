# نموذج البيانات — «آخر استخدام»

المصدر: `supabase/schema.sql`. كل الجداول في المخطط `public`، وكل سجل مرتبط بمالكه في `auth.users`.

```
auth.users ──1:1── profiles
     │
     └──1:N── items ──1:N── item_usage_logs
                  ├──1:N── notifications   (UNIQUE item_id + type + due_date)
                  └──1:N── item_actions
```

حذف المستخدم يحذف كل بياناته، وحذف الغرض يحذف سجلاته وتنبيهاته وقراراته (`ON DELETE CASCADE`).

## الجداول

### `profiles`
| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid PK → auth.users | = معرف المستخدم |
| `username` | text | `^[a-z0-9_.]{3,30}$`، فريد على `lower(username)` |
| `full_name` | text | ٢–٦٠ حرفًا |
| `settings` | jsonb | `unusedDays`, `expiryAlertDays`, `replacementAlertDays`, `upcomingWindowDays`, `itemsView` |
| `created_at`, `updated_at` | timestamptz | trigger لتحديث `updated_at` |

يُنشأ تلقائيًا بـ trigger `on_auth_user_created` من `raw_user_meta_data` (`full_name`, `username`). إن كان اسم المستخدم محجوزًا يفشل إنشاء المستخدم كاملًا، فلا تبقى حسابات بلا ملف.

### `items`
| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid → auth.users | افتراضيًا `auth.uid()` |
| `name` | text | إلزامي، ١–١٢٠ حرفًا |
| `category` / `category_other` | text | قائمة ثابتة + نص حر لـ«أخرى» |
| `image_path` | text | مسار داخل الحاوية، ويجب أن يبدأ بـ `owner_id/` |
| `purchase_date`, `expiry_date` | date | قيد: الانتهاء ≥ الشراء |
| `last_used_at` | timestamptz | |
| `needs_replacement`, `replacement_interval`, `replacement_unit` | bool / int / `days\|months` | قيد: المدة والوحدة مطلوبتان عند التفعيل |
| `alert_days_before` | int 0–365 | يتجاوز الإعداد العام لتنبيه الصلاحية والاستبدال |
| `unused_after_days` | int 1–3650 | يتجاوز الإعداد العام لقلة الاستخدام |
| `condition` | `good\|broken\|damaged` | |
| `notes` | text ≤ 1000 | |
| `status` | `active\|gifted\|donated\|disposed` | غير `active` = مؤرشف |
| `is_demo` | bool | لتمييز البيانات التجريبية وحذفها دون المساس بغيرها |

الفهارس: `(owner_id, status)` و`(owner_id, expiry_date)` و`(owner_id, last_used_at)`.

### `item_usage_logs`
`id`, `item_id`, `owner_id`, `used_at`, `note` (≤ 500). الفهارس: `(item_id, used_at desc)` و`(owner_id, used_at desc)`.

### `notifications`
| العمود | ملاحظات |
|---|---|
| `type` | `expiry\|unused\|replacement` |
| `title`, `reason`, `suggestion` | نصوص عربية محسوبة وقت الإنشاء |
| `due_date` | date — جزء من مفتاح منع التكرار |
| `status` | `new\|read\|closed` |
| `closed_reason` | `user` (أغلقه المستخدم) أو `resolved` (لم يعد مستحقًا) |

القيد `UNIQUE (item_id, type, due_date)` يضمن ألا يتكرر التنبيه حتى لو تزامن طلبان. الخادم يستخدم `upsert ... ignoreDuplicates`.

### `item_actions`
`id`, `item_id`, `owner_id`, `action_type` (`kept\|reused\|repaired\|replaced\|gifted\|donated\|disposed`), `note`, `created_at`.

## سياسات الوصول (RLS)

RLS مفعّلة على الجداول الخمسة. السياسات تخص الدور `authenticated` فقط، وصلاحيات `anon` مسحوبة.

| الجدول | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | `id = auth.uid()` | عبر trigger فقط | `id = auth.uid()` | بحذف المستخدم |
| items | `owner_id = auth.uid()` | `owner_id = auth.uid()` | المالك (using + with check) | المالك |
| item_usage_logs | المالك | المالك **و** `owns_item(item_id)` | — | المالك |
| notifications | المالك | المالك **و** `owns_item(item_id)` | المالك | المالك |
| item_actions | المالك | المالك **و** `owns_item(item_id)` | — | المالك |

الدالة `owns_item(item_id)` (security definer) تمنع ربط سجل بغرض يملكه مستخدم آخر.

## التخزين (Storage)

- حاوية خاصة `item-images`: حد ٢ ميغابايت، والأنواع `image/jpeg`, `image/png`, `image/webp`.
- مسار الملف: `<user_id>/<item_id>/<timestamp>.<ext>`.
- سياسات `storage.objects` للعمليات الأربع: `bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text`.
- العرض عبر روابط موقّعة صالحة لساعة، تُولَّد في الخادم.

## طبقات الحماية في الخادم

1. `requireAuth` يتحقق من JWT عبر `auth.getUser`، ويضع `req.user.id` من الجلسة وحدها.
2. `req.db` عميل Supabase يحمل JWT المستخدم، فتسري RLS على كل استعلام.
3. كل استعلام يضيف `.eq('owner_id', req.user.id)` كطبقة ثانية، وهي ضرورية أيضًا عند استخدام عميل الخادم في الفحص الدوري.
4. التحقق من المدخلات بالقواعد المشتركة نفسها في الواجهة والخادم (`public/js/shared/validation.js`)، مع حقول مسموحة فقط.

## بيانات الوضع المحلي (localStorage)

| المفتاح | المحتوى |
|---|---|
| `lu_local_users` | مستخدمون محليون (كلمة المرور مشفّرة بـ PBKDF2-SHA256 مع salt) |
| `lu_local_session` | معرف المستخدم الحالي |
| `lu_local_data_<uid>` | `{ items, logs, notifications, actions, settings }` بنفس أشكال جداول Supabase |

هذا الوضع للتجربة فقط وليس بديلًا آمنًا لقاعدة البيانات.
