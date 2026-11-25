import {
  initPage, $, esc, t, toast, loadingState, errorState, emptyState, formatDate, formatNumber,
  daysLabel, relativeDays, catIcon, refreshBadge, withBusy
} from './app.js';
import { categoryName } from './shared/constants.js';

const { adapter, user } = await initPage({ active: 'dashboard', titleKey: 'title.dashboard' });
const host = $('#dashboard');
const n = (x) => formatNumber(x);
const itemLink = (id, name) => `<a class="title" href="item.html?id=${encodeURIComponent(id)}">${esc(name)}</a>`;

$('#greeting').textContent = t('dash.greeting', { name: user.full_name });
$('#today-line').textContent = t('dash.today', {
  date: formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
});

function statCard(label, value, sub = '', cls = '') {
  return `<div class="card stat ${cls}"><span class="lbl">${esc(label)}</span><span class="num">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
}

function expiryChip(daysLeft) {
  if (daysLeft < 0) return `<span class="chip danger">${esc(t('dash.expired', { rel: relativeDays(daysLeft) }))}</span>`;
  if (daysLeft === 0) return `<span class="chip attention">${esc(t('dash.expiresToday'))}</span>`;
  return `<span class="chip ${daysLeft <= 7 ? 'attention' : ''}">${esc(t('dash.daysLeft', { days: daysLabel(daysLeft) }))}</span>`;
}

function renderEmpty() {
  host.innerHTML = `<div class="card">${emptyState({
    icon: '🌱',
    title: t('dash.emptyTitle'),
    text: t('dash.emptyText'),
    action: `<div class="row center-row">
      <a class="btn btn-primary" href="item-form.html">${esc(t('dash.addFirst'))}</a>
      ${adapter.demo.allowed ? `<button class="btn btn-sand" id="load-demo" type="button">${esc(t('demo.load'))}</button>` : ''}
    </div>`
  })}</div>`;
  $('#load-demo')?.addEventListener('click', (e) =>
    withBusy(e.currentTarget, async () => {
      try {
        const r = await adapter.demo.load({ replace: true });
        toast(t('demo.loaded', { n: n(r.count) }));
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}

function render(d) {
  const tot = d.totals;
  if (tot.active === 0 && tot.archived === 0) return renderEmpty();

  const usage = tot.usageRate === null ? '—' : `${n(tot.usageRate)}%`;
  const maxCat = Math.max(1, ...d.byCategory.map((c) => c.count));
  const windowDays = daysLabel(d.settings.upcomingWindowDays);

  host.innerHTML = `
    <div class="grid grid-stats">
      ${statCard(t('dash.statActive'), n(tot.active), tot.archived ? esc(t('dash.statArchived', { n: n(tot.archived) })) : '')}
      ${statCard(t('dash.statAttention'), n(tot.attention), esc(t('dash.statAttentionSub')), tot.attention ? 'warn' : '')}
      ${statCard(t('dash.statNew'), n(tot.openNotifications), `<a href="notifications.html">${esc(t('dash.statNewLink'))}</a>`)}
      ${statCard(t('dash.statUsage'), usage, `${esc(t('dash.statUsageSub'))}<span class="meter" aria-hidden="true"><span style="width:${tot.usageRate || 0}%"></span></span>`)}
      ${statCard(t('dash.statRescued'), n(tot.rescued), esc(t('dash.statRescuedSub', { n: n(tot.usesLast30) })))}
    </div>

    <div class="grid grid-2 section-body">
      <section class="card" aria-labelledby="exp-title">
        <div class="card-head"><h2 id="exp-title">${esc(t('dash.expTitle'))}</h2><span class="spacer"></span><a class="small" href="items.html?state=expiring&sort=expiry_asc">${esc(t('ui.viewAll'))}</a></div>
        ${d.expiringSoon.length
          ? `<ul class="list">${d.expiringSoon.map((i) => `
              <li><span class="cat-ico" aria-hidden="true">${catIcon(i.category)}</span>
                <div class="grow">${itemLink(i.id, i.name)}<span class="meta">${formatDate(i.expiry_date)}</span></div>
                ${expiryChip(i.daysLeft)}</li>`).join('')}</ul>`
          : `<p class="muted">${esc(t('dash.noExpiring', { days: windowDays }))}</p>`}
      </section>

      <section class="card" aria-labelledby="unused-title">
        <div class="card-head"><h2 id="unused-title">${esc(t('dash.unusedTitle'))}</h2><span class="spacer"></span><a class="small" href="items.html?state=unused">${esc(t('ui.viewAll'))}</a></div>
        <p class="small muted">${esc(t('dash.threshold', { days: daysLabel(d.settings.unusedDays) }))} <a href="settings.html">${esc(t('dash.change'))}</a></p>
        ${d.unused.length
          ? `<ul class="list">${d.unused.map((i) => `
              <li><span class="cat-ico" aria-hidden="true">${catIcon(i.category)}</span>
                <div class="grow">${itemLink(i.id, i.name)}<span class="meta">${esc(t('dash.lastUsed', { rel: relativeDays(-i.daysSince) }))}</span></div>
                <button class="btn btn-sm" type="button" data-use="${esc(i.id)}">${esc(t('ui.useNow'))}</button></li>`).join('')}</ul>`
          : `<p class="muted">${esc(t('dash.allUsed'))}</p>`}
      </section>

      <section class="card" aria-labelledby="up-title">
        <div class="card-head"><h2 id="up-title">${esc(t('dash.upTitle'))}</h2></div>
        ${d.upcoming.length
          ? `<ul class="list">${d.upcoming.map((u) => `
              <li><div class="grow">${itemLink(u.itemId, u.name)}<span class="meta">${esc(t(`upcoming.${u.type}`))} · ${formatDate(u.date)}</span></div>
                <span class="chip sand">${esc(relativeDays(u.daysLeft))}</span></li>`).join('')}</ul>`
          : `<p class="muted">${esc(t('dash.noUpcoming', { days: windowDays }))}</p>`}
      </section>

      <section class="card" aria-labelledby="cat-title">
        <div class="card-head"><h2 id="cat-title">${esc(t('dash.catTitle'))}</h2></div>
        ${d.byCategory.length
          ? `<div class="bars">${d.byCategory.map((c) => `
              <a class="bar-row" href="items.html?category=${c.category}">
                <span>${c.icon} ${esc(categoryName(c.category))}</span>
                <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${(c.count / maxCat) * 100}%"></span></span>
                <strong>${n(c.count)}</strong></a>`).join('')}</div>`
          : `<p class="muted">${esc(t('dash.noActive'))}</p>`}
      </section>
    </div>`;

  host.querySelectorAll('[data-use]').forEach((btn) => btn.addEventListener('click', () => useItem(btn.dataset.use, btn)));
}

async function useItem(id, btn, note = null) {
  await withBusy(btn, async () => {
    try {
      const item = await adapter.items.use(id, note);
      toast(t('dash.used', { name: item.name }));
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

async function load() {
  host.innerHTML = loadingState(t('dash.loading'));
  try {
    render(await adapter.dashboard());
    refreshBadge(adapter);
  } catch (e) {
    host.innerHTML = errorState(e, 'retry');
    $('#retry')?.addEventListener('click', load);
  }
}

$('#quick-use').addEventListener('click', async () => {
  let items;
  try {
    ({ items } = await adapter.items.list({ state: 'active', sort: 'name_asc' }));
  } catch (e) {
    return toast(e.message, 'error');
  }
  if (!items.length) return toast(t('dash.addFirstToUse'), 'error');

  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog">
    <div class="dlg-body stack">
      <h2>${esc(t('dash.quickTitle'))}</h2>
      <div class="field"><label for="qu-item">${esc(t('dash.itemLabel'))}</label>
        <select id="qu-item">${items.map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="qu-note">${esc(t('ui.noteOptional'))}</label><input id="qu-note" type="text" maxlength="500"></div>
    </div>
    <div class="dlg-foot"><button class="btn" value="cancel">${esc(t('ui.cancel'))}</button><button class="btn btn-primary" value="ok">${esc(t('ui.useNow'))}</button></div>
  </form>`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => {
    const ok = dlg.returnValue === 'ok';
    const id = $('#qu-item', dlg).value;
    const note = $('#qu-note', dlg).value.trim() || null;
    dlg.remove();
    if (ok) useItem(id, null, note);
  });
  dlg.showModal();
});

load();
