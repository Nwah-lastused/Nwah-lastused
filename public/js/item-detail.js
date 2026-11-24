import {
  initPage, $, esc, toast, confirmDialog, loadingState, errorState, emptyState, formatDate, formatDateTime,
  daysLabel, monthsLabel, relativeDays, stateChip, catIcon, refreshBadge, withBusy, params
} from './app.js';
import { ACTIONS, CONDITIONS, ITEM_STATUSES, NOTIFICATION_TYPES, NOTIFICATION_STATUSES, categoryLabel } from './shared/constants.js';

const { adapter } = await initPage({ active: 'items' });
const host = $('#detail');
const id = params().get('id');
const DISMISS_KEY = 'lu_dismissed_suggestions';

function dismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}'); } catch { return {}; }
}

function render({ item, logs, notifications, actions }) {
  document.title = `${item.name} — آخر استخدام`;
  const ev = item.evaluation;
  const rec = ev.recommendation;
  const recKey = rec ? `${item.id}:${rec.key}` : null;
  const showRec = rec && !dismissed()[recKey];
  const rep = item.needs_replacement
    ? `كل ${item.replacement_unit === 'months' ? monthsLabel(item.replacement_interval) : daysLabel(item.replacement_interval)} — الموعد القادم ${formatDate(ev.replacementDue)} (${relativeDays(ev.daysToReplacement)})`
    : 'لا';

  host.innerHTML = `
    <div class="page-head" style="padding-top:.5rem">
      <div><h1>${esc(item.name)}</h1><p>${catIcon(item.category)} ${esc(categoryLabel(item))} · ${stateChip(ev)}</p></div>
      <div class="actions">
        ${ev.active ? '<button class="btn btn-primary" id="use-now" type="button">✋ استخدمته الآن</button>' : '<button class="btn" id="reactivate" type="button">إعادته إلى الأغراض النشطة</button>'}
        <a class="btn" href="item-form.html?id=${encodeURIComponent(item.id)}">✏️ تعديل</a>
        <button class="btn btn-danger" id="delete" type="button">🗑️ حذف</button>
      </div>
    </div>

    <div class="detail-layout">
      <div class="stack">
        <div class="detail-img">${item.image_url ? `<img src="${esc(item.image_url)}" alt="صورة ${esc(item.name)}">` : `<span aria-hidden="true">${catIcon(item.category)}</span>`}</div>
        <div class="card">
          <h2>البيانات</h2>
          <dl class="facts">
            <dt>آخر استخدام</dt><dd>${item.last_used_at ? `${formatDate(item.last_used_at)} (${relativeDays(-ev.daysSinceUse)})` : 'لم يُسجَّل'}</dd>
            <dt>تاريخ الشراء</dt><dd>${formatDate(item.purchase_date)}</dd>
            <dt>انتهاء الصلاحية</dt><dd>${item.expiry_date ? `${formatDate(item.expiry_date)} (${relativeDays(ev.daysToExpiry)})` : '—'}</dd>
            <dt>استبدال دوري</dt><dd>${rep}</dd>
            <dt>قليل الاستخدام بعد</dt><dd>${daysLabel(ev.settings.unusedDays)}${item.unused_after_days ? '' : ' <span class="muted small">(الإعداد العام)</span>'}</dd>
            <dt>حالة الغرض</dt><dd>${esc(CONDITIONS[item.condition] || '—')}</dd>
            <dt>الوضع</dt><dd>${esc(ITEM_STATUSES[item.status] || '—')}</dd>
            ${item.notes ? `<dt>ملاحظات</dt><dd style="white-space:pre-wrap">${esc(item.notes)}</dd>` : ''}
          </dl>
        </div>
      </div>

      <div class="stack">
        ${ev.triggers.length ? `<div class="alert alert-warn"><strong>يحتاج انتباهك:</strong><ul style="margin:.3rem 0 0;padding-inline-start:1.2rem">${ev.triggers.map((t) => `<li>${esc(t.reason)}</li>`).join('')}</ul></div>` : ev.active ? '<div class="alert alert-ok">كل شيء منتظم مع هذا الغرض ✓</div>' : ''}

        ${showRec ? `<section class="suggestion" aria-labelledby="rec-title">
          <div class="row"><h3 id="rec-title" style="margin:0">💡 اقتراح: ${esc(rec.title)}</h3><span class="spacer"></span>
          <button class="btn btn-sm btn-ghost" id="dismiss-rec" type="button">تجاهل الاقتراح</button></div>
          <p style="margin:.4rem 0 0">${esc(rec.text)}</p>
          <p class="small muted" style="margin:.3rem 0 0">هذا اقتراح فقط، والقرار لك.</p>
        </section>` : ''}

        ${ev.active ? `<section class="card" aria-labelledby="dec-title">
          <h2 id="dec-title">سجّل قرارك</h2>
          <p class="small muted">قرارات الإهداء والتبرع والتخلص تنقل الغرض إلى الأرشيف، وتُحسب في سجل أثرك.</p>
          <div class="row">${Object.entries(ACTIONS).map(([k, a]) => `<button class="btn btn-sm" type="button" data-action="${k}">${a.icon} ${a.label}</button>`).join('')}</div>
        </section>` : ''}

        <section class="card" aria-labelledby="use-title">
          <h2 id="use-title">سجل الاستخدام</h2>
          ${logs.length ? `<ul class="timeline">${logs.slice(0, 30).map((l) => `<li><strong>${formatDateTime(l.used_at)}</strong>${l.note ? `<br><span class="muted small">${esc(l.note)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">لم يُسجَّل أي استخدام بعد.</p>'}
        </section>

        <section class="card" aria-labelledby="notif-title">
          <h2 id="notif-title">التنبيهات المرتبطة</h2>
          ${notifications.length ? `<ul class="list">${notifications.map((n) => `<li><div class="grow"><span class="title">${esc(n.title)}</span>
            <span class="meta">${NOTIFICATION_TYPES[n.type]} · الاستحقاق ${formatDate(n.due_date)} · ${NOTIFICATION_STATUSES[n.status]}${n.closed_reason === 'resolved' ? ' (حُلّ تلقائيًا)' : ''}</span></div></li>`).join('')}</ul>` : '<p class="muted">لا توجد تنبيهات لهذا الغرض.</p>'}
        </section>

        <section class="card" aria-labelledby="impact-title">
          <h2 id="impact-title">سجل الأثر</h2>
          ${actions.length ? `<ul class="timeline">${actions.map((a) => `<li><strong>${ACTIONS[a.action_type]?.icon || ''} ${esc(ACTIONS[a.action_type]?.label || a.action_type)}</strong> — <span class="small muted">${formatDateTime(a.created_at)}</span>${a.note ? `<br><span class="small">${esc(a.note)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">لم تُسجَّل قرارات بعد.</p>'}
        </section>
      </div>
    </div>`;

  $('#use-now')?.addEventListener('click', async (e) => {
    const r = await confirmDialog({ title: 'تسجيل استخدام', message: `تسجيل استخدام «${item.name}» الآن.`, confirmText: 'استخدمته الآن', input: { label: 'ملاحظة (اختيارية)' } });
    if (!r) return;
    run(e.currentTarget, () => adapter.items.use(item.id, r.value), 'سُجّل الاستخدام.');
  });
  $('#reactivate')?.addEventListener('click', (e) =>
    run(e.currentTarget, () => adapter.items.update(item.id, { status: 'active' }), 'أُعيد الغرض إلى الأغراض النشطة.')
  );
  $('#delete').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'حذف الغرض', message: `سيُحذف «${item.name}» مع سجله وتنبيهاته نهائيًا. لا يمكن التراجع.`, confirmText: 'حذف نهائي', danger: true });
    if (!ok) return;
    try {
      await adapter.items.remove(item.id);
      toast('تم حذف الغرض.');
      location.href = 'items.html';
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#dismiss-rec')?.addEventListener('click', () => {
    const d = dismissed();
    d[recKey] = true;
    localStorage.setItem(DISMISS_KEY, JSON.stringify(d));
    load();
  });
  host.querySelectorAll('[data-action]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const type = btn.dataset.action;
      const a = ACTIONS[type];
      const archiving = ['gifted', 'donated', 'disposed'].includes(type);
      const r = await confirmDialog({
        title: a.label,
        message: archiving ? `سيُنقل «${item.name}» إلى الأرشيف ويُسجّل القرار في سجل الأثر.` : `سيُسجّل القرار «${a.label}» في سجل الأثر.`,
        confirmText: 'تسجيل القرار',
        input: { label: 'ملاحظة (اختيارية)', placeholder: type === 'donated' ? 'مثال: لجمعية الحي' : '' }
      });
      if (!r) return;
      run(btn, () => adapter.items.action(item.id, { action_type: type, note: r.value }), `سُجّل القرار: ${a.label}.`);
    })
  );
}

async function run(btn, fn, msg) {
  await withBusy(btn, async () => {
    try {
      await fn();
      toast(msg);
      refreshBadge(adapter);
      load();
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function load() {
  if (!id) {
    host.innerHTML = `<div class="card">${emptyState({ icon: '🤔', title: 'لم يُحدد غرض', action: '<a class="btn" href="items.html">إلى أغراضي</a>' })}</div>`;
    return;
  }
  if (!host.innerHTML) host.innerHTML = loadingState();
  try {
    render(await adapter.items.get(id));
  } catch (e) {
    host.innerHTML = e.status === 404
      ? `<div class="card">${emptyState({ icon: '🔍', title: 'الغرض غير موجود', text: 'ربما حُذف.', action: '<a class="btn" href="items.html">إلى أغراضي</a>' })}</div>`
      : errorState(e, 'retry');
    $('#retry')?.addEventListener('click', load);
  }
}

load();
