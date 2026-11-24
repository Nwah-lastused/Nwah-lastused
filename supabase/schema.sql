-- =====================================================================
-- «آخر استخدام» — مخطط قاعدة البيانات (Supabase / PostgreSQL)
-- شغّل هذا الملف كاملًا من Supabase Dashboard → SQL Editor.
-- آمن لإعادة التشغيل (idempotent) قدر الإمكان.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- دالة عامة لتحديث updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1) profiles: ملف المستخدم (الاسم، اسم المستخدم، الإعدادات العامة)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null check (username ~ '^[a-z0-9_.]{3,30}$'),
  full_name   text not null check (char_length(full_name) between 2 and 60),
  settings    jsonb not null default jsonb_build_object(
                'unusedDays', 60, 'expiryAlertDays', 14, 'replacementAlertDays', 7,
                'upcomingWindowDays', 30, 'itemsView', 'cards'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- إنشاء الملف تلقائيًا عند تسجيل مستخدم جديد من بيانات user_metadata (full_name, username).
-- إذا كان اسم المستخدم محجوزًا يفشل إنشاء المستخدم كاملًا (لا حسابات يتيمة).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2) items: الأغراض
-- ---------------------------------------------------------------------
create table if not exists public.items (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 120),
  category              text not null default 'other' check (category in
                          ('food','medicine','cosmetics','cleaning','electronics','appliances','kitchen',
                           'clothing','tools','sports','books','kids','other')),
  category_other        text check (char_length(category_other) <= 40),
  image_path            text,
  purchase_date         date,
  expiry_date           date,
  last_used_at          timestamptz,
  needs_replacement     boolean not null default false,
  replacement_interval  integer check (replacement_interval between 1 and 3650),
  replacement_unit      text check (replacement_unit in ('days','months')),
  alert_days_before     integer check (alert_days_before between 0 and 365),
  unused_after_days     integer check (unused_after_days between 1 and 3650),
  condition             text not null default 'good' check (condition in ('good','broken','damaged')),
  notes                 text check (char_length(notes) <= 1000),
  status                text not null default 'active' check (status in ('active','gifted','donated','disposed')),
  is_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint items_expiry_after_purchase check (expiry_date is null or purchase_date is null or expiry_date >= purchase_date),
  constraint items_replacement_complete check (
    not needs_replacement or (replacement_interval is not null and replacement_unit is not null)),
  -- يمنع ربط صورة خارج مجلد المالك
  constraint items_image_in_owner_folder check (image_path is null or image_path like owner_id::text || '/%')
);
create index if not exists items_owner_idx on public.items (owner_id, status);
create index if not exists items_owner_expiry_idx on public.items (owner_id, expiry_date) where expiry_date is not null;
create index if not exists items_owner_last_used_idx on public.items (owner_id, last_used_at);

drop trigger if exists items_updated_at on public.items;
create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3) item_usage_logs: سجل الاستخدام
-- ---------------------------------------------------------------------
create table if not exists public.item_usage_logs (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items (id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  used_at     timestamptz not null default now(),
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now()
);
create index if not exists usage_item_idx on public.item_usage_logs (item_id, used_at desc);
create index if not exists usage_owner_idx on public.item_usage_logs (owner_id, used_at desc);

-- ---------------------------------------------------------------------
-- 4) notifications: التنبيهات (واحد فقط لكل غرض + نوع + موعد استحقاق)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id       uuid not null references public.items (id) on delete cascade,
  type          text not null check (type in ('expiry','unused','replacement')),
  title         text not null check (char_length(title) <= 200),
  reason        text check (char_length(reason) <= 300),
  suggestion    text check (char_length(suggestion) <= 400),
  due_date      date not null,
  status        text not null default 'new' check (status in ('new','read','closed')),
  closed_reason text check (closed_reason in ('user','resolved')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint notifications_unique_per_due unique (item_id, type, due_date)
);
create index if not exists notifications_owner_status_idx on public.notifications (owner_id, status, created_at desc);

drop trigger if exists notifications_updated_at on public.notifications;
create trigger notifications_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5) item_actions: قرارات الاستدامة (سجل الأثر)
-- ---------------------------------------------------------------------
create table if not exists public.item_actions (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action_type  text not null check (action_type in ('kept','reused','repaired','replaced','gifted','donated','disposed')),
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now()
);
create index if not exists actions_item_idx on public.item_actions (item_id, created_at desc);
create index if not exists actions_owner_idx on public.item_actions (owner_id, created_at desc);

-- ---------------------------------------------------------------------
-- يمنع ربط سجل بغرض يملكه مستخدم آخر (حتى مع RLS على كل جدول)
-- ---------------------------------------------------------------------
create or replace function public.owns_item(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.items where id = p_item and owner_id = auth.uid());
$$;

-- =====================================================================
-- سياسات RLS: كل مستخدم يرى ويعدّل بياناته فقط
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.items           enable row level security;
alter table public.item_usage_logs enable row level security;
alter table public.notifications   enable row level security;
alter table public.item_actions    enable row level security;

-- profiles: قراءة وتحديث الملف الشخصي فقط (الإنشاء عبر trigger، والحذف بحذف المستخدم)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- items
drop policy if exists "items_select_own" on public.items;
create policy "items_select_own" on public.items for select to authenticated using (owner_id = auth.uid());
drop policy if exists "items_insert_own" on public.items;
create policy "items_insert_own" on public.items for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "items_update_own" on public.items;
create policy "items_update_own" on public.items for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "items_delete_own" on public.items;
create policy "items_delete_own" on public.items for delete to authenticated using (owner_id = auth.uid());

-- item_usage_logs
drop policy if exists "usage_select_own" on public.item_usage_logs;
create policy "usage_select_own" on public.item_usage_logs for select to authenticated using (owner_id = auth.uid());
drop policy if exists "usage_insert_own" on public.item_usage_logs;
create policy "usage_insert_own" on public.item_usage_logs for insert to authenticated
  with check (owner_id = auth.uid() and public.owns_item(item_id));
drop policy if exists "usage_delete_own" on public.item_usage_logs;
create policy "usage_delete_own" on public.item_usage_logs for delete to authenticated using (owner_id = auth.uid());

-- notifications
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated using (owner_id = auth.uid());
drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own" on public.notifications for insert to authenticated
  with check (owner_id = auth.uid() and public.owns_item(item_id));
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications for delete to authenticated using (owner_id = auth.uid());

-- item_actions
drop policy if exists "actions_select_own" on public.item_actions;
create policy "actions_select_own" on public.item_actions for select to authenticated using (owner_id = auth.uid());
drop policy if exists "actions_insert_own" on public.item_actions;
create policy "actions_insert_own" on public.item_actions for insert to authenticated
  with check (owner_id = auth.uid() and public.owns_item(item_id));
drop policy if exists "actions_delete_own" on public.item_actions;
create policy "actions_delete_own" on public.item_actions for delete to authenticated using (owner_id = auth.uid());

-- لا صلاحيات للزوار غير المسجلين على الجداول
revoke all on public.profiles, public.items, public.item_usage_logs, public.notifications, public.item_actions from anon;

-- =====================================================================
-- التخزين: حاوية خاصة لصور الأغراض، المسار يبدأ بمعرف المستخدم: <uid>/<item_id>/<file>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-images', 'item-images', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "item_images_select_own" on storage.objects;
create policy "item_images_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "item_images_insert_own" on storage.objects;
create policy "item_images_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "item_images_update_own" on storage.objects;
create policy "item_images_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "item_images_delete_own" on storage.objects;
create policy "item_images_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
