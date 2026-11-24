import {
  initPage, $, esc, toast, loadingState, errorState, emptyState, formatDate, formatNumber,
  daysLabel, relativeDays, catIcon, refreshBadge, withBusy
} from './app.js';

const { adapter, user } = await initPage({ active: 'dashboard' });
const host = $('#dashboard');

$('#greeting').textContent = `أهلًا ${user.full_name} 👋`;
$('#today-line').textContent = `اليوم ${formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

const n = (x) => formatNumber(x);

function statCard(label, value, sub = '', cls = '') {
  return `<div class="card stat ${cls}"><span class="lbl">${label}</span><span class="num">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
}

function render(d) {
  const t = d.totals;
  if (t.active === 0 && t.archived === 0) {
    host.innerHTML = `<div class="card">${emptyState({
      icon: '🌱',
      title: 'لا توجد أغراض بعد',
      text: 'ابدأ بإضافة أول غرض، أو حمّل بيانات تجريبية لتتعرف على المنصة.',
      action: `<div class="row" style="justify-content:center">
        <a class="btn btn-primary" href="item-form.html">＋ أضف أول غرض</a>
        ${adapter.demo.allowed ? '<button class="btn btn-sand" id="load-demo" type="button">تحميل البيانات التجريبية</button>' : ''}
      </div>`
    })}</div>`;
    $('#load-demo')?.addEventListener('click', async (e) => {
      await withBusy(e.currentTarget, async () => {
        try {
          const r = await adapter.demo.load({ replace: true });
          toast(`تم تحميل ${n(r.count)} أغراض تجريبية.`);
          load();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
    return;
  }

  const usage = t.usageRate === null ? '—' : `${n(t.usageRate)}٪`;
  const maxCat = Math.max(1, ...d.byCategory.map((c) => c.count));

  host.innerHTML = `
    <div class="grid grid-stats">
      ${statCard('الأغراض النشطة', n(t.active), t.archived ? `و${n(t.archived)} مؤرشفة` : '')}
      ${statCard('تحتاج انتباهك', n(t.attention), 'صلاحية أو استبدال أو قلة استخدام أو عطل', t.attention ? 'warn' : '')}
      ${statCard('تنبيهات جديدة', n(t.openNotifications), '<a href="notifications.html">عرض التنبيهات</a>')}
      ${statCard('مؤشر الاستخدام', usage, `أغراض استُخدمت ضمن مهلتها<div class="meter" aria-hidden="true"><span style="width:${t.usageRate || 0}%"></span></div>`)}
      ${statCard('أغراض أُنقذت من النسيان', n(t.rescued), `${n(t.usesLast30)} استخدامًا مسجّلًا خلال ٣٠ يومًا`)}
    </div>

    <div class="grid grid-2" style="margin-top:1rem">
      <section class="card" aria-labelledby="exp-title">
        <div class="card-head"><h2 id="exp-title">⏳ صلاحية قريبة أو منتهية</h2><span class="spacer"></span><a class="small" href="items.html?state=expiring&sort=expiry_asc">الكل</a></div>
        ${d.expiringSoon.length ? `<ul class="list">${d.expiringSoon.map((i) => `
          <li><span class="cat-ico" aria-hidden="true">${catIcon(i.category)}</span>
            <div class="grow"><a class="title" href="item.html?id=${encodeURIComponent(i.id)}">${esc(i.name)}</a>
            <span class="meta">${formatDate(i.expiry_date)}</span></div>
            <span class="chip ${i.daysLeft < 0 ? 'danger' : i.daysLeft <= 7 ? 'attention' : ''}">${i.daysLeft < 0 ? `انتهت ${relativeDays(i.daysLeft)}` : i.daysLeft === 0 ? 'تنتهي اليوم' : `باقي ${daysLabel(i.daysLeft)}`}</span></li>`).join('')}</ul>`
          : `<p class="muted">لا توجد أغراض تنتهي صلاحيتها خلال ${daysLabel(d.settings.upcomingWindowDays)}.</p>`}
      </section>

      <section class="card" aria-labelledby="unused-title">
        <div class="card-head"><h2 id="unused-title">💤 لم تُستخدم منذ مدة</h2><span class="spacer"></span><a class="small" href="items.html?state=unused">الكل</a></div>
        <p class="small muted">المهلة العامة: ${daysLabel(d.settings.unusedDays)} — <a href="settings.html">تغييرها</a></p>
        ${d.unused.length ? `<ul class="list">${d.unused.map((i) => `
          <li><span class="cat-ico" aria-hidden="true">${catIcon(i.category)}</span>
            <div class="grow"><a class="title" href="item.html?id=${encodeURIComponent(i.id)}">${esc(i.name)}</a>
            <span class="meta">آخر استخدام ${relativeDays(-i.daysSince)}</span></div>
            <button class="btn btn-sm" type="button" data-use="${esc(i.id)}">استخدمته الآن</button></li>`).join('')}</ul>`
          : '<p class="muted">رائع! كل أغراضك مستخدمة ضمن مهلتها.</p>'}
      </section>

      <section class="card" aria-labelledby="up-title">
        <div class="card-head"><h2 id="up-title">📅 أقرب التذكيرات القادمة</h2></div>
        ${d.upcoming.length ? `<ul class="list">${d.upcoming.map((u) => `
          <li><div class="grow"><a class="title" href="item.html?id=${encodeURIComponent(u.itemId)}">${esc(u.name)}</a>
            <span class="meta">${esc(u.label)} · ${formatDate(u.date)}</span></div>
            <span class="chip sand">${relativeDays(u.daysLeft)}</span></li>`).join('')}</ul>`
          : `<p class="muted">لا تذكيرات خلال ${daysLabel(d.settings.upcomingWindowDays)} القادمة.</p>`}
      </section>

      <section class="card" aria-labelledby="cat-title">
        <div class="card-head"><h2 id="cat-title">🗂️ توزيع الأغراض حسب التصنيف</h2></div>
        ${d.byCategory.length ? `<div class="bars">${d.byCategory.map((c) => `
          <a class="bar-row" href="items.html?category=${c.category}" style="text-decoration:none;color:inherit">
            <span>${c.icon} ${esc(c.label)}</span>
            <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="display:block;width:${(c.count / maxCat) * 100}%"></span></span>
            <strong>${n(c.count)}</strong></a>`).join('')}</div>`
          : '<p class="muted">لا توجد أغراض نشطة.</p>'}
      </section>
    </div>`;

  host.querySelectorAll('[data-use]').forEach((btn) =>
    btn.addEventListener('click', () => useItem(btn.dataset.use, btn))
  );
}

async function useItem(id, btn) {
  await withBusy(btn, async () => {
    try {
      const item = await adapter.items.use(id);
      toast(`سُجّل استخدام «${item.name}».`);
      load();
      refreshBadge(adapter);
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

async function load() {
  host.innerHTML = loadingState('جارٍ حساب ملخص أغراضك…');
  try {
    render(await adapter.dashboard());
    refreshBadge(adapter);
  } catch (e) {
    host.innerHTML = errorState(e, 'retry');
    $('#retry')?.addEventListener('click', load);
  }
}

// إجراء سريع: تسجيل استخدام أي غرض
$('#quick-use').addEventListener('click', async () => {
  let items;
  try {
    ({ items } = await adapter.items.list({ state: 'active', sort: 'name_asc' }));
  } catch (e) {
    return toast(e.message, 'error');
  }
  if (!items.length) return toast('أضف غرضًا أولًا لتسجيل استخدامه.', 'error');
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog">
    <div class="dlg-body stack">
      <h2>تسجيل استخدام</h2>
      <div class="field"><label for="qu-item">الغرض</label>
        <select id="qu-item">${items.map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="qu-note">ملاحظة (اختيارية)</label><input id="qu-note" type="text" maxlength="500"></div>
    </div>
    <div class="dlg-foot"><button class="btn" value="cancel">إلغاء</button><button class="btn btn-primary" value="ok">استخدمته الآن</button></div>
  </form>`;
  document.body.append(dlg);
  dlg.addEventListener('close', async () => {
    const ok = dlg.returnValue === 'ok';
    const id = $('#qu-item', dlg).value;
    const note = $('#qu-note', dlg).value.trim() || null;
    dlg.remove();
    if (!ok) return;
    try {
      const item = await adapter.items.use(id, note);
      toast(`سُجّل استخدام «${item.name}».`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  dlg.showModal();
});

load();
