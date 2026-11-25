import {
  initPage, $, $$, esc, t, toast, confirmDialog, loadingState, errorState, emptyState,
  formatDate, formatNumber, relativeDays, stateChip, catIcon, refreshBadge, withBusy, params,
  daysBetween, todayISO, toDateISO
} from './app.js';
import { CATEGORIES, SORTS, STATE_FILTERS, categoryLabel } from './shared/constants.js';
import { formatTrigger } from './shared/reminders.js';

const { adapter } = await initPage({ active: 'items', titleKey: 'title.items' });
const host = $('#items');
const form = $('#filters');
form.addEventListener('submit', (e) => e.preventDefault());

$('#f-category').innerHTML = `<option value="">${esc(t('items.allCategories'))}</option>` +
  CATEGORIES.map((c) => `<option value="${c.value}">${c.icon} ${esc(t(`cat.${c.value}`))}</option>`).join('');
$('#f-state').innerHTML = STATE_FILTERS.map((v) => `<option value="${v}">${esc(t(`filter.${v}`))}</option>`).join('');
$('#f-sort').innerHTML = SORTS.map((v) => `<option value="${v}">${esc(t(`sort.${v}`))}</option>`).join('');

const urlParams = params();
for (const key of ['q', 'category', 'state', 'sort']) if (urlParams.get(key)) form.elements[key].value = urlParams.get(key);

let view = 'cards';
try {
  const { settings } = await adapter.settings.get();
  view = urlParams.get('view') || settings.itemsView || 'cards';
} catch {
  view = urlParams.get('view') || 'cards';
}

function setView(v) {
  view = v;
  $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
}
setView(view);
$$('.seg button').forEach((b) =>
  b.addEventListener('click', () => {
    setView(b.dataset.view);
    load();
  })
);

const query = () => Object.fromEntries(['q', 'category', 'state', 'sort'].map((k) => [k, form.elements[k].value]));

function lastUsedText(item) {
  const d = toDateISO(item.last_used_at);
  return d ? relativeDays(daysBetween(todayISO(), d)) : t('items.neverUsed');
}

function actionsHtml(item, compact = false) {
  const id = esc(item.id);
  const name = esc(item.name);
  return `
    ${item.evaluation.active ? `<button class="btn btn-sm btn-primary" data-act="use" data-id="${id}">${esc(t('ui.useNow'))}</button>` : ''}
    <a class="btn btn-sm" href="item.html?id=${encodeURIComponent(item.id)}">${esc(t('ui.details'))}</a>
    <a class="btn btn-sm" href="item-form.html?id=${encodeURIComponent(item.id)}" aria-label="${esc(t('items.editAria', { name: item.name }))}">${compact ? '✏️' : esc(t('ui.edit'))}</a>
    <button class="btn btn-sm btn-danger" data-act="delete" data-id="${id}" data-name="${name}" aria-label="${esc(t('items.deleteAria', { name: item.name }))}">${compact ? '🗑️' : esc(t('ui.delete'))}</button>`;
}

function thumb(item) {
  return item.image_url
    ? `<img src="${esc(item.image_url)}" alt="${esc(t('items.photoAlt', { name: item.name }))}" loading="lazy">`
    : `<span aria-hidden="true">${catIcon(item.category)}</span>`;
}

function renderCards(items) {
  return `<div class="items-grid">${items.map((it) => {
    const trigger = it.evaluation.triggers[0];
    const reason = trigger ? formatTrigger({ ...trigger, recommendation: it.evaluation.recommendation }, it.name).reason : '';
    return `
    <article class="card item-card">
      <div class="thumb">${thumb(it)}${stateChip(it.evaluation)}</div>
      <div class="body">
        <h3><a href="item.html?id=${encodeURIComponent(it.id)}">${esc(it.name)}</a></h3>
        <div class="facts">
          <span>${catIcon(it.category)} ${esc(categoryLabel(it))}</span>
          <span>${esc(t('items.lastUsed', { value: lastUsedText(it) }))}</span>
          ${it.expiry_date ? `<span>${esc(t('items.expiry', { date: formatDate(it.expiry_date) }))}</span>` : ''}
          ${reason ? `<span class="warn-text">${esc(reason)}</span>` : ''}
        </div>
      </div>
      <div class="foot">${actionsHtml(it)}</div>
    </article>`;
  }).join('')}</div>`;
}

function renderTable(items) {
  const cols = ['colItem', 'colCategory', 'colLastUsed', 'colExpiry', 'colStatus', 'colActions'];
  return `<div class="table-wrap"><table>
    <caption class="sr-only">${esc(t('items.caption'))}</caption>
    <thead><tr>${cols.map((c) => `<th scope="col">${esc(t(`items.${c}`))}</th>`).join('')}</tr></thead>
    <tbody>${items.map((it) => `<tr>
      <td><a href="item.html?id=${encodeURIComponent(it.id)}"><strong>${esc(it.name)}</strong></a></td>
      <td>${catIcon(it.category)} ${esc(categoryLabel(it))}</td>
      <td>${esc(lastUsedText(it))}</td>
      <td>${it.expiry_date ? formatDate(it.expiry_date) : '—'}</td>
      <td>${stateChip(it.evaluation)}</td>
      <td><div class="row nowrap">${actionsHtml(it, true)}</div></td></tr>`).join('')}</tbody></table></div>`;
}

let seq = 0;
async function load() {
  const my = ++seq;
  const q = query();
  const url = new URL(location.href);
  Object.entries({ ...q, view }).forEach(([k, v]) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k)));
  history.replaceState(null, '', url);
  host.innerHTML = loadingState();
  try {
    const { items, total } = await adapter.items.list(q);
    if (my !== seq) return;
    $('#count-line').textContent = t('items.count', { n: formatNumber(total) });
    if (!items.length) {
      const filtered = q.q || q.category || (q.state && q.state !== 'active');
      host.innerHTML = `<div class="card">${filtered
        ? emptyState({ icon: '🔍', title: t('items.noResults'), text: t('items.noResultsText'), action: `<button class="btn" type="button" id="clear-filters">${esc(t('items.clear'))}</button>` })
        : emptyState({ icon: '📦', title: t('items.emptyTitle'), text: t('items.emptyText'), action: `<a class="btn btn-primary" href="item-form.html">${esc(t('dash.addItem'))}</a>` })}</div>`;
      $('#clear-filters')?.addEventListener('click', () => {
        form.reset();
        load();
      });
      return;
    }
    host.innerHTML = view === 'table' ? renderTable(items) : renderCards(items);
  } catch (e) {
    host.innerHTML = errorState(e, 'retry');
    $('#retry')?.addEventListener('click', load);
  }
}

host.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;

  if (btn.dataset.act === 'use') {
    await withBusy(btn, async () => {
      try {
        const item = await adapter.items.use(id);
        toast(t('dash.used', { name: item.name }));
        refreshBadge(adapter);
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    return;
  }

  const ok = await confirmDialog({
    title: t('delete.title'),
    message: t('delete.message', { name: btn.dataset.name }),
    confirmText: t('delete.confirm'),
    danger: true
  });
  if (!ok) return;
  try {
    await adapter.items.remove(id);
    toast(t('delete.done'));
    refreshBadge(adapter);
    load();
  } catch (err) {
    toast(err.message, 'error');
  }
});

let timer;
form.addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(load, e.target.name === 'q' ? 250 : 0);
});

load();
