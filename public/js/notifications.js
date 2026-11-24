import { initPage, $, esc, toast, loadingState, errorState, emptyState, formatDate, formatNumber, relativeDays, daysBetween, todayISO, refreshBadge, withBusy } from './app.js';
import { NOTIFICATION_TYPES } from './shared/constants.js';

const { adapter } = await initPage({ active: 'notifications' });
const host = $('#list');
const ICONS = { expiry: '⏳', unused: '💤', replacement: '🔄' };
const TABS = [
  ['open', 'غير المغلقة'],
  ['new', 'جديد'],
  ['read', 'مقروء'],
  ['closed', 'مغلق'],
  ['all', 'الكل']
];
let status = 'open';

$('#type-filter').insertAdjacentHTML('beforeend', Object.entries(NOTIFICATION_TYPES).map(([v, l]) => `<option value="${v}">${l}</option>`).join(''));

function renderTabs(counts = {}) {
  const c = { ...counts, open: (counts.new || 0) + (counts.read || 0), all: (counts.new || 0) + (counts.read || 0) + (counts.closed || 0) };
  $('#status-tabs').innerHTML = TABS.map(([v, l]) =>
    `<button type="button" role="tab" data-status="${v}" aria-selected="${v === status}">${l} (${formatNumber(c[v] || 0)})</button>`).join('');
}

function card(n) {
  const due = daysBetween(todayISO(), n.due_date);
  return `<article class="card notif ${n.status === 'new' ? 'is-new' : ''} ${n.status === 'closed' ? 'is-closed' : ''}">
    <div class="ico ${n.type}" aria-hidden="true">${ICONS[n.type]}</div>
    <div>
      <div class="row" style="gap:.4rem">
        <span class="chip ${n.type === 'expiry' ? 'danger' : n.type === 'replacement' ? 'sand' : ''}">${NOTIFICATION_TYPES[n.type]}</span>
        ${n.status === 'new' ? '<span class="chip new">جديد</span>' : ''}
        ${n.status === 'closed' ? `<span class="chip archived">${n.closed_reason === 'resolved' ? 'حُلّ تلقائيًا' : 'مغلق'}</span>` : ''}
      </div>
      <h3 style="margin:.35rem 0 .15rem"><a href="item.html?id=${encodeURIComponent(n.item_id)}">${esc(n.item_name)}</a></h3>
      <p style="margin:0">${esc(n.reason)}</p>
      ${n.suggestion ? `<p class="small" style="margin:.3rem 0 0;color:#5d4b27">💡 ${esc(n.suggestion)}</p>` : ''}
      <p class="small muted" style="margin:.3rem 0 0">أُنشئ ${formatDate(n.created_at)} · الاستحقاق ${formatDate(n.due_date)} (${relativeDays(due)})</p>
    </div>
    <div class="actions">
      <a class="btn btn-sm" href="item.html?id=${encodeURIComponent(n.item_id)}">فتح الغرض</a>
      ${n.status === 'new' ? `<button class="btn btn-sm" data-id="${esc(n.id)}" data-status="read">تعليم كمقروء</button>` : ''}
      ${n.status !== 'closed' ? `<button class="btn btn-sm btn-danger" data-id="${esc(n.id)}" data-status="closed">إغلاق</button>` : ''}
    </div>
  </article>`;
}

async function load() {
  host.innerHTML = loadingState();
  try {
    const { notifications, counts } = await adapter.notifications.list({ status, type: $('#type-filter').value });
    renderTabs(counts);
    host.innerHTML = notifications.length
      ? notifications.map(card).join('')
      : `<div class="card">${emptyState({ icon: '🔕', title: 'لا توجد تنبيهات هنا', text: status === 'open' ? 'لا شيء يحتاج انتباهك الآن.' : '' })}</div>`;
    refreshBadge(adapter);
  } catch (e) {
    host.innerHTML = errorState(e, 'retry');
    $('#retry')?.addEventListener('click', load);
  }
}

$('#status-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-status]');
  if (!b) return;
  status = b.dataset.status;
  load();
});
$('#type-filter').addEventListener('change', load);

host.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  await withBusy(b, async () => {
    try {
      await adapter.notifications.update(b.dataset.id, b.dataset.status);
      toast(b.dataset.status === 'closed' ? 'أُغلق التنبيه.' : 'عُلّم التنبيه كمقروء.');
      load();
    } catch (err) { toast(err.message, 'error'); }
  });
});

$('#read-all').addEventListener('click', (e) =>
  withBusy(e.currentTarget, async () => {
    try { await adapter.notifications.markAllRead(); toast('عُلّمت كل التنبيهات كمقروءة.'); load(); } catch (err) { toast(err.message, 'error'); }
  })
);
$('#run-check').addEventListener('click', (e) =>
  withBusy(e.currentTarget, async () => {
    try {
      const r = await adapter.reminders.check();
      toast(`اكتمل الفحص: ${formatNumber(r.created)} تنبيه جديد، و${formatNumber(r.closed)} أُغلق تلقائيًا.`);
      load();
    } catch (err) { toast(err.message, 'error'); }
  })
);

renderTabs();
load();
