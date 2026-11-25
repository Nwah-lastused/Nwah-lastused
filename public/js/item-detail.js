import {
  initPage, $, esc, t, toast, confirmDialog, loadingState, errorState, emptyState, formatDate, formatDateTime,
  daysLabel, monthsLabel, relativeDays, stateChip, catIcon, refreshBadge, withBusy, params, setTitle
} from './app.js';
import { ACTIONS, ARCHIVE_ACTIONS, categoryLabel } from './shared/constants.js';
import { formatTrigger, recommendationText } from './shared/reminders.js';

const { adapter } = await initPage({ active: 'items', titleKey: 'title.item' });
const host = $('#detail');
const id = params().get('id');
const DISMISS_KEY = 'lu_dismissed_suggestions';

function dismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
  } catch {
    return {};
  }
}

const card = (titleKey, body) =>
  `<section class="card"><h2>${esc(t(titleKey))}</h2>${body}</section>`;

function factsHtml(item, ev) {
  const replacement = item.needs_replacement
    ? t('detail.every', {
        period: item.replacement_unit === 'months' ? monthsLabel(item.replacement_interval) : daysLabel(item.replacement_interval),
        date: formatDate(ev.replacementDue),
        rel: relativeDays(ev.daysToReplacement)
      })
    : t('detail.no');
  const rows = [
    ['detail.lastUsed', item.last_used_at ? `${formatDate(item.last_used_at)} (${relativeDays(-ev.daysSinceUse)})` : t('detail.notLogged')],
    ['detail.purchase', formatDate(item.purchase_date)],
    ['detail.expiry', item.expiry_date ? `${formatDate(item.expiry_date)} (${relativeDays(ev.daysToExpiry)})` : '—'],
    ['detail.replacement', replacement],
    ['detail.unusedAfter', `${daysLabel(ev.settings.unusedDays)}${item.unused_after_days ? '' : ` ${t('detail.default')}`}`],
    ['detail.condition', t(`cond.${item.condition}`)],
    ['detail.status', t(`status.${item.status}`)]
  ];
  if (item.notes) rows.push(['detail.notes', item.notes]);
  return `<dl class="facts">${rows.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd class="pre-wrap">${esc(v)}</dd>`).join('')}</dl>`;
}

function render({ item, logs, notifications, actions }) {
  setTitle(item.name);
  const ev = item.evaluation;
  const rec = recommendationText(ev.recommendation);
  const recKey = rec ? `${item.id}:${rec.key}` : null;
  const showRec = rec && !dismissed()[recKey];
  const reasons = ev.triggers.map((tr) => formatTrigger({ ...tr, recommendation: ev.recommendation }, item.name).reason);

  host.innerHTML = `
    <div class="page-head page-head-tight">
      <div><h1>${esc(item.name)}</h1><p>${catIcon(item.category)} ${esc(categoryLabel(item))} · ${stateChip(ev)}</p></div>
      <div class="actions">
        ${ev.active
          ? `<button class="btn btn-primary" id="use-now" type="button">${esc(t('detail.useNow'))}</button>`
          : `<button class="btn" id="reactivate" type="button">${esc(t('detail.reactivate'))}</button>`}
        <a class="btn" href="item-form.html?id=${encodeURIComponent(item.id)}">${esc(t('detail.edit'))}</a>
        <button class="btn btn-danger" id="delete" type="button">${esc(t('detail.delete'))}</button>
      </div>
    </div>

    <div class="detail-layout">
      <div class="stack">
        <div class="detail-img">${item.image_url ? `<img src="${esc(item.image_url)}" alt="${esc(t('items.photoAlt', { name: item.name }))}">` : `<span aria-hidden="true">${catIcon(item.category)}</span>`}</div>
        ${card('detail.data', factsHtml(item, ev))}
      </div>

      <div class="stack">
        ${reasons.length
          ? `<div class="alert alert-warn"><strong>${esc(t('detail.attention'))}</strong><ul class="plain-list">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`
          : ev.active ? `<div class="alert alert-ok">${esc(t('detail.allGood'))}</div>` : ''}

        ${showRec ? `<section class="suggestion" aria-labelledby="rec-title">
          <div class="row"><h3 id="rec-title">${esc(t('detail.suggestion', { title: rec.title }))}</h3><span class="spacer"></span>
          <button class="btn btn-sm btn-ghost" id="dismiss-rec" type="button">${esc(t('detail.dismiss'))}</button></div>
          <p>${esc(rec.text)}</p>
          <p class="small muted">${esc(t('detail.suggestionNote'))}</p>
        </section>` : ''}

        ${ev.active ? card('detail.decide', `
          <p class="small muted">${esc(t('detail.decideNote'))}</p>
          <div class="row">${Object.entries(ACTIONS).map(([k, a]) => `<button class="btn btn-sm" type="button" data-action="${k}">${a.icon} ${esc(t(`action.${k}`))}</button>`).join('')}</div>`) : ''}

        ${card('detail.usage', logs.length
          ? `<ul class="timeline">${logs.slice(0, 30).map((l) => `<li><strong>${formatDateTime(l.used_at)}</strong>${l.note ? `<br><span class="muted small">${esc(l.note)}</span>` : ''}</li>`).join('')}</ul>`
          : `<p class="muted">${esc(t('detail.noUsage'))}</p>`)}

        ${card('detail.related', notifications.length
          ? `<ul class="list">${notifications.map((nt) => `<li><div class="grow">
              <span class="title">${esc(formatTrigger({ type: nt.type, dueDate: nt.due_date }, item.name).title)}</span>
              <span class="meta">${esc(t(`ntype.${nt.type}`))} · ${esc(t('detail.due', { date: formatDate(nt.due_date) }))} · ${esc(t(`nstatus.${nt.status}`))}${nt.closed_reason === 'resolved' ? ` ${esc(t('detail.autoResolved'))}` : ''}</span>
            </div></li>`).join('')}</ul>`
          : `<p class="muted">${esc(t('detail.noAlerts'))}</p>`)}

        ${card('detail.impact', actions.length
          ? `<ul class="timeline">${actions.map((a) => `<li><strong>${ACTIONS[a.action_type]?.icon || ''} ${esc(t(`action.${a.action_type}`))}</strong> — <span class="small muted">${formatDateTime(a.created_at)}</span>${a.note ? `<br><span class="small">${esc(a.note)}</span>` : ''}</li>`).join('')}</ul>`
          : `<p class="muted">${esc(t('detail.noActions'))}</p>`)}
      </div>
    </div>`;

  bindActions(item, recKey);
}

function bindActions(item, recKey) {
  $('#use-now')?.addEventListener('click', async (e) => {
    const r = await confirmDialog({
      title: t('detail.useTitle'),
      message: t('detail.useMessage', { name: item.name }),
      confirmText: t('ui.useNow'),
      input: { label: t('ui.noteOptional') }
    });
    if (r) run(e.target, () => adapter.items.use(item.id, r.value), t('detail.used'));
  });

  $('#reactivate')?.addEventListener('click', (e) =>
    run(e.currentTarget, () => adapter.items.update(item.id, { status: 'active' }), t('detail.reactivated'))
  );

  $('#delete').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: t('delete.title'),
      message: t('delete.message', { name: item.name }),
      confirmText: t('delete.confirm'),
      danger: true
    });
    if (!ok) return;
    try {
      await adapter.items.remove(item.id);
      toast(t('delete.done'));
      location.href = 'items.html';
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#dismiss-rec')?.addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ ...dismissed(), [recKey]: true }));
    load();
  });

  host.querySelectorAll('[data-action]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const type = btn.dataset.action;
      const label = t(`action.${type}`);
      const r = await confirmDialog({
        title: label,
        message: ARCHIVE_ACTIONS.includes(type) ? t('detail.archiveMessage', { name: item.name }) : t('detail.actionMessage', { label }),
        confirmText: t('detail.recordAction'),
        input: { label: t('ui.noteOptional'), placeholder: type === 'donated' ? t('detail.donatePh') : '' }
      });
      if (r) run(btn, () => adapter.items.action(item.id, { action_type: type, note: r.value }), t('detail.actionDone', { label }));
    })
  );
}

async function run(btn, fn, message) {
  await withBusy(btn, async () => {
    try {
      await fn();
      toast(message);
      refreshBadge(adapter);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

async function load() {
  const back = `<a class="btn" href="items.html">${esc(t('detail.toItems'))}</a>`;
  if (!id) {
    host.innerHTML = `<div class="card">${emptyState({ icon: '🤔', title: t('detail.noId'), action: back })}</div>`;
    return;
  }
  if (!host.innerHTML) host.innerHTML = loadingState();
  try {
    render(await adapter.items.get(id));
  } catch (e) {
    host.innerHTML = e.status === 404
      ? `<div class="card">${emptyState({ icon: '🔍', title: t('detail.notFound'), text: t('detail.maybeDeleted'), action: back })}</div>`
      : errorState(e, 'retry');
    $('#retry')?.addEventListener('click', load);
  }
}

load();
