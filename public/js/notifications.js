import {
  initPage, $, esc, t, toast, loadingState, errorState, emptyState, formatDate, formatNumber,
  relativeDays, daysBetween, todayISO, refreshBadge, withBusy
} from './app.js';
import { NOTIFICATION_TYPES } from './shared/constants.js';
import { formatTrigger } from './shared/reminders.js';

const { adapter } = await initPage({ active: 'notifications', titleKey: 'title.notifications' });
const host = $('#list');
const ICONS = { expiry: '⏳', unused: '💤', replacement: '🔄' };
const CHIP = { expiry: 'danger', unused: '', replacement: 'sand' };
const TABS = ['open', 'new', 'read', 'closed', 'all'];
let status = 'open';

$('#type-filter').innerHTML = `<option value="">${esc(t('notif.allTypes'))}</option>` +
  NOTIFICATION_TYPES.map((v) => `<option value="${v}">${esc(t(`ntype.${v}`))}</option>`).join('');

function renderTabs(counts = {}) {
  const open = (counts.new || 0) + (counts.read || 0);
  const c = { ...counts, open, all: open + (counts.closed || 0) };
  $('#status-tabs').innerHTML = TABS.map((v) =>
    `<button type="button" role="tab" data-status="${v}" aria-selected="${v === status}">${esc(t(`notif.tab.${v}`))} (${formatNumber(c[v] || 0)})</button>`
  ).join('');
}

function card(n) {
  const name = n.item_name || t('notif.deletedItem');
  const text = formatTrigger({ type: n.type, dueDate: n.due_date }, name);
  const due = daysBetween(todayISO(), n.due_date);
  const closedLabel = n.closed_reason === 'resolved' ? t('notif.autoResolved') : t('notif.closed');
  return `<article class="card notif ${n.status === 'new' ? 'is-new' : ''} ${n.status === 'closed' ? 'is-closed' : ''}">
    <div class="ico ${n.type}" aria-hidden="true">${ICONS[n.type]}</div>
    <div>
      <div class="row tight">
        <span class="chip ${CHIP[n.type]}">${esc(t(`ntype.${n.type}`))}</span>
        ${n.status === 'new' ? `<span class="chip new">${esc(t('notif.new'))}</span>` : ''}
        ${n.status === 'closed' ? `<span class="chip archived">${esc(closedLabel)}</span>` : ''}
      </div>
      <h3 class="notif-title"><a href="item.html?id=${encodeURIComponent(n.item_id)}">${esc(name)}</a></h3>
      <p class="m-0">${esc(text.reason)}</p>
      <p class="small suggestion-text">💡 ${esc(text.suggestion)}</p>
      <p class="small muted m-0">${esc(t('notif.meta', { created: formatDate(n.created_at), due: formatDate(n.due_date), rel: relativeDays(due) }))}</p>
    </div>
    <div class="actions">
      <a class="btn btn-sm" href="item.html?id=${encodeURIComponent(n.item_id)}">${esc(t('notif.open'))}</a>
      ${n.status === 'new' ? `<button class="btn btn-sm" data-id="${esc(n.id)}" data-status="read">${esc(t('notif.markRead'))}</button>` : ''}
      ${n.status !== 'closed' ? `<button class="btn btn-sm btn-danger" data-id="${esc(n.id)}" data-status="closed">${esc(t('notif.close'))}</button>` : ''}
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
      : `<div class="card">${emptyState({ icon: '🔕', title: t('notif.emptyTitle'), text: status === 'open' ? t('notif.emptyOpen') : '' })}</div>`;
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
      toast(t(b.dataset.status === 'closed' ? 'notif.closedToast' : 'notif.readToast'));
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});

$('#read-all').addEventListener('click', (e) =>
  withBusy(e.currentTarget, async () => {
    try {
      await adapter.notifications.markAllRead();
      toast(t('notif.allReadToast'));
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  })
);

$('#run-check').addEventListener('click', (e) =>
  withBusy(e.currentTarget, async () => {
    try {
      const r = await adapter.reminders.check();
      toast(t('notif.checkDone', { created: formatNumber(r.created), closed: formatNumber(r.closed) }));
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  })
);

renderTabs();
load();
