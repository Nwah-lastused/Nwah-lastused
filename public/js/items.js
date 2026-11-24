import {
  initPage, $, $$, esc, toast, confirmDialog, loadingState, errorState, emptyState,
  formatDate, formatNumber, relativeDays, stateChip, catIcon, refreshBadge, withBusy, params, daysBetween, todayISO, toDateISO
} from './app.js';
import { CATEGORIES, SORTS, STATE_FILTERS, categoryLabel } from './shared/constants.js';

const { adapter } = await initPage({ active: 'items' });
const host = $('#items');
const form = $('#filters');
form.addEventListener('submit', (e) => e.preventDefault());

$('#f-category').insertAdjacentHTML('beforeend', CATEGORIES.map((c) => `<option value="${c.value}">${c.icon} ${c.label}</option>`).join(''));
$('#f-state').innerHTML = Object.entries(STATE_FILTERS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
$('#f-sort').innerHTML = Object.entries(SORTS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

// استرجاع الفلاتر من الرابط
const p = params();
for (const key of ['q', 'category', 'state', 'sort']) if (p.get(key)) form.elements[key].value = p.get(key);

let view = 'cards';
try {
  const s = await adapter.settings.get();
  view = p.get('view') || s.settings.itemsView || 'cards';
} catch { /* الافتراضي */ }

function setView(v) {
  view = v;
  $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
}
setView(view);
$$('.seg button').forEach((b) => b.addEventListener('click', () => { setView(b.dataset.view); load(); }));

function query() {
  return Object.fromEntries(['q', 'category', 'state', 'sort'].map((k) => [k, form.elements[k].value]));
}

function lastUsedText(item) {
  const d = toDateISO(item.last_used_at);
  if (!d) return 'لم يُسجَّل استخدام';
  return relativeDays(daysBetween(todayISO(), d));
}

function actionsHtml(item, compact = false) {
  const id = esc(item.id);
  const active = item.evaluation.active;
  return `
    ${active ? `<button class="btn btn-sm btn-primary" data-act="use" data-id="${id}">استخدمته الآن</button>` : ''}
    <a class="btn btn-sm" href="item.html?id=${encodeURIComponent(item.id)}">التفاصيل</a>
    <a class="btn btn-sm" href="item-form.html?id=${encodeURIComponent(item.id)}" aria-label="تعديل ${esc(item.name)}">${compact ? '✏️' : 'تعديل'}</a>
    <button class="btn btn-sm btn-danger" data-act="delete" data-id="${id}" data-name="${esc(item.name)}" aria-label="حذف ${esc(item.name)}">${compact ? '🗑️' : 'حذف'}</button>`;
}

function renderCards(items) {
  return `<div class="items-grid">${items.map((it) => `
    <article class="card item-card">
      <div class="thumb">${it.image_url ? `<img src="${esc(it.image_url)}" alt="صورة ${esc(it.name)}" loading="lazy">` : `<span aria-hidden="true">${catIcon(it.category)}</span>`}${stateChip(it.evaluation)}</div>
      <div class="body">
        <h3><a href="item.html?id=${encodeURIComponent(it.id)}">${esc(it.name)}</a></h3>
        <div class="facts">
          <span>${catIcon(it.category)} ${esc(categoryLabel(it))}</span>
          <span>آخر استخدام: ${lastUsedText(it)}</span>
          ${it.expiry_date ? `<span>الصلاحية: ${formatDate(it.expiry_date)}</span>` : ''}
          ${it.evaluation.triggers.length ? `<span style="color:var(--warn)">${esc(it.evaluation.triggers[0].reason)}</span>` : ''}
        </div>
      </div>
      <div class="foot">${actionsHtml(it)}</div>
    </article>`).join('')}</div>`;
}

function renderTable(items) {
  return `<div class="table-wrap"><table>
    <caption class="sr-only">قائمة الأغراض</caption>
    <thead><tr><th scope="col">الغرض</th><th scope="col">التصنيف</th><th scope="col">آخر استخدام</th><th scope="col">الصلاحية</th><th scope="col">الحالة</th><th scope="col">إجراءات</th></tr></thead>
    <tbody>${items.map((it) => `<tr>
      <td><a href="item.html?id=${encodeURIComponent(it.id)}"><strong>${esc(it.name)}</strong></a></td>
      <td>${catIcon(it.category)} ${esc(categoryLabel(it))}</td>
      <td>${lastUsedText(it)}</td>
      <td>${it.expiry_date ? formatDate(it.expiry_date) : '—'}</td>
      <td>${stateChip(it.evaluation)}</td>
      <td><div class="row">${actionsHtml(it, true)}</div></td></tr>`).join('')}</tbody></table></div>`;
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
    $('#count-line').textContent = `${formatNumber(total)} غرضًا مطابقًا`;
    if (!items.length) {
      const filtered = q.q || q.category || (q.state && q.state !== 'active');
      host.innerHTML = `<div class="card">${filtered
        ? emptyState({ icon: '🔍', title: 'لا توجد نتائج مطابقة', text: 'جرّب كلمة بحث أخرى أو غيّر التصفية.', action: '<button class="btn" type="button" id="clear-filters">مسح التصفية</button>' })
        : emptyState({ icon: '📦', title: 'لم تضف أي غرض بعد', text: 'سجّل أغراضك لتصلك التذكيرات في وقتها.', action: '<a class="btn btn-primary" href="item-form.html">＋ إضافة غرض</a>' })}</div>`;
      $('#clear-filters')?.addEventListener('click', () => { form.reset(); load(); });
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
        toast(`سُجّل استخدام «${item.name}».`);
        refreshBadge(adapter);
        load();
      } catch (err) { toast(err.message, 'error'); }
    });
  } else if (btn.dataset.act === 'delete') {
    const ok = await confirmDialog({
      title: 'حذف الغرض',
      message: `سيُحذف «${btn.dataset.name}» مع سجل استخدامه وتنبيهاته نهائيًا. لا يمكن التراجع.`,
      confirmText: 'حذف نهائي',
      danger: true
    });
    if (!ok) return;
    try {
      await adapter.items.remove(id);
      toast('تم حذف الغرض.');
      refreshBadge(adapter);
      load();
    } catch (err) { toast(err.message, 'error'); }
  }
});

let timer;
form.addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(load, e.target.name === 'q' ? 250 : 0);
});

load();
