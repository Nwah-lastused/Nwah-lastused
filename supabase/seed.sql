-- =====================================================================
-- Last Use — demo data functions (admin only). Running this file inserts no data.
--   select public.load_demo_data('<username>');
--   select public.clear_demo_data('<username>');
-- =====================================================================

create or replace function public.load_demo_data(p_username text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_count integer;
begin
  select id into v_uid from public.profiles where lower(username) = lower(p_username);
  if v_uid is null then
    raise exception 'user % not found', p_username;
  end if;

  delete from public.items where owner_id = v_uid and is_demo;

  insert into public.items (owner_id, is_demo, name, category, category_other, purchase_date, expiry_date, last_used_at,
                            needs_replacement, replacement_interval, replacement_unit, alert_days_before, unused_after_days, condition, notes)
  select v_uid, true, d.name, d.category, d.category_other,
         v_today + d.purchase_off, v_today + d.expiry_off,
         ((v_today + d.used_off)::timestamp + time '12:00') at time zone 'Asia/Riyadh',
         d.needs_rep, d.rep_interval, d.rep_unit, d.alert_days, d.unused_after, d.cond, d.notes
  from (values
    ('حليب طويل الأجل',              'food',        null,   -20,  3,    -2,   false, null::int, null, 7,    null::int, 'good',   'كرتونة ٦ عبوات في المخزن.'),
    ('فيتامين د',                     'medicine',    null,   -80,  10,   -1,   false, null,      null, null, null,      'good',   null),
    ('واقي شمس',                      'cosmetics',   null,   -400, -5,   -50,  false, null,      null, null, null,      'good',   'من الصيف الماضي.'),
    ('شاحن متنقل ٢٠٠٠٠ مللي أمبير',   'electronics', null,   -300, null, -95,  false, null,      null, null, null,      'good',   null),
    ('خلاط يدوي',                     'kitchen',     null,   -500, null, -200, false, null,      null, null, 90,        'good',   null),
    ('فلتر مياه الثلاجة',             'appliances',  null,   -175, null, 0,    true,  6,         'months', 14, null,    'good',   null),
    ('رأس فرشاة الأسنان الكهربائية',  'cosmetics',   null,   -95,  null, 0,    true,  90,        'days', null, null,    'good',   null),
    ('مكواة بخار',                    'appliances',  null,   -700, null, -40,  false, null,      null, null, null,      'broken', 'لا يخرج منها البخار.'),
    ('حقيبة سفر كبيرة',               'other',       'سفر',  -600, null, -30,  false, null,      null, null, 365,       'good',   null),
    ('سماعات لاسلكية',                'electronics', null,   -150, null, -1,   false, null,      null, null, null,      'good',   null),
    ('مثقاب كهربائي',                 'tools',       null,   -365, null, -45,  false, null,      null, null, 180,       'good',   null),
    ('كتاب «عادات صغيرة»',            'books',       null,   -60,  null, -12,  false, null,      null, null, null,      'good',   null)
  ) as d(name, category, category_other, purchase_off, expiry_off, used_off, needs_rep, rep_interval, rep_unit, alert_days, unused_after, cond, notes);

  get diagnostics v_count = row_count;

  insert into public.item_usage_logs (owner_id, item_id, used_at)
  select owner_id, id, last_used_at from public.items where owner_id = v_uid and is_demo and last_used_at is not null;

  return v_count;
end $$;

create or replace function public.clear_demo_data(p_username text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.items i using public.profiles p
  where p.id = i.owner_id and lower(p.username) = lower(p_username) and i.is_demo;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.load_demo_data(text)  from public, anon, authenticated;
revoke all on function public.clear_demo_data(text) from public, anon, authenticated;
