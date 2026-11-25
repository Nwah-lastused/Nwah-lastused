import {
  initPage, $, esc, t, getLang, toast, showFieldErrors, withBusy, confirmDialog, loadingState, errorState,
  formatNumber, getThemePref, setThemePref, setLangPref
} from './app.js';

const { adapter, user } = await initPage({ active: 'settings', titleKey: 'title.settings' });
const host = $('#settings-host');

const numberField = (name, min, max, value) => `
  <div class="field"><label for="${name}">${esc(t(`set.${name}`))}</label>
    <input id="${name}" name="${name}" type="number" min="${min}" max="${max}" value="${value}" inputmode="numeric">
    <span class="error" data-for="${name}"></span></div>`;

const options = (values, current, prefix) =>
  values.map((v) => `<option value="${v}" ${v === current ? 'selected' : ''}>${esc(t(`${prefix}${v}`))}</option>`).join('');

function render({ settings, profile }) {
  const local = adapter.mode === 'local';
  host.innerHTML = `
    <form id="settings-form" class="card stack" novalidate>
      <h2>${esc(t('set.alerts'))}</h2>
      <div class="form-grid">
        ${numberField('unusedDays', 1, 3650, settings.unusedDays)}
        ${numberField('expiryAlertDays', 0, 365, settings.expiryAlertDays)}
        ${numberField('replacementAlertDays', 0, 365, settings.replacementAlertDays)}
        ${numberField('upcomingWindowDays', 1, 365, settings.upcomingWindowDays)}
        <div class="field"><label for="itemsView">${esc(t('set.itemsView'))}</label>
          <select id="itemsView" name="itemsView">
            <option value="cards" ${settings.itemsView === 'cards' ? 'selected' : ''}>${esc(t('items.cards'))}</option>
            <option value="table" ${settings.itemsView === 'table' ? 'selected' : ''}>${esc(t('items.table'))}</option>
          </select></div>
        <div class="field"><label for="full_name">${esc(t('set.name'))}</label>
          <input id="full_name" name="full_name" type="text" maxlength="60" value="${esc(profile?.full_name || user.full_name)}">
          <span class="error" data-for="full_name"></span></div>
      </div>
      <p class="small muted">${esc(t('set.perItem'))}</p>
      <div><button class="btn btn-primary" type="submit">${esc(t('set.save'))}</button></div>
    </form>

    <section class="card stack" aria-labelledby="appearance-title">
      <h2 id="appearance-title">${esc(t('set.appearance'))}</h2>
      <div class="form-grid">
        <div class="field"><label for="theme-select">${esc(t('set.theme'))}</label>
          <select id="theme-select">${options(['light', 'dark', 'system'], getThemePref(), 'theme.')}</select></div>
        <div class="field"><label for="lang-select">${esc(t('set.language'))}</label>
          <select id="lang-select">
            <option value="ar" ${getLang() === 'ar' ? 'selected' : ''}>العربية</option>
            <option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option>
          </select></div>
      </div>
    </section>

    <section class="card stack" aria-labelledby="demo-title">
      <h2 id="demo-title">${esc(t('set.demoTitle'))}</h2>
      <p class="muted">${esc(t('set.demoText'))}</p>
      ${adapter.demo.allowed
        ? `<div class="row"><button class="btn btn-sand" type="button" id="demo-load">${esc(t('demo.load'))}</button>
           <button class="btn btn-danger" type="button" id="demo-clear">${esc(t('demo.clear'))}</button></div>`
        : `<div class="alert alert-info">${esc(t('set.demoDisabled'))}</div>`}
    </section>

    <section class="card stack" aria-labelledby="notify-title">
      <h2 id="notify-title">${esc(t('set.channels'))}</h2>
      <label class="checkbox"><input type="checkbox" checked disabled> ${esc(t('set.inApp'))}</label>
      <label class="checkbox"><input type="checkbox" disabled> ${esc(t('set.push'))}</label>
      <p class="small muted">${esc(t('set.pushNote'))}</p>
    </section>

    <section class="card stack" aria-labelledby="acc-title">
      <h2 id="acc-title">${esc(t('set.account'))}</h2>
      <dl class="facts">
        <dt>${esc(t('set.username'))}</dt><dd dir="ltr" class="start-align">@${esc(user.username)}</dd>
        <dt>${esc(t('set.source'))}</dt><dd>${esc(t(local ? 'set.sourceLocal' : 'set.sourceRemote'))}</dd>
      </dl>
      ${local ? `<div class="alert alert-warn small">${esc(t('set.localWarn'))}</div>
        <div><button class="btn btn-danger" type="button" id="wipe">${esc(t('set.wipe'))}</button></div>` : ''}
    </section>`;

  bind();
}

function bind() {
  const form = $('#settings-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    showFieldErrors(form, {});
    await withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        await adapter.settings.update(data);
        toast(t('set.saved'));
        if (data.full_name !== user.full_name) setTimeout(() => location.reload(), 600);
      } catch (err) {
        if (err.details) showFieldErrors(form, err.details);
        toast(err.message, 'error');
      }
    });
  });

  $('#theme-select').addEventListener('change', (e) => setThemePref(e.target.value));
  $('#lang-select').addEventListener('change', (e) => setLangPref(e.target.value));

  $('#demo-load')?.addEventListener('click', (e) =>
    withBusy(e.currentTarget, async () => {
      try {
        const r = await adapter.demo.load({ replace: true });
        toast(t('demo.loaded', { n: formatNumber(r.count) }));
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );

  $('#demo-clear')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ok = await confirmDialog({ title: t('demo.clearTitle'), message: t('demo.clearMessage'), confirmText: t('ui.delete'), danger: true });
    if (!ok) return;
    withBusy(btn, async () => {
      try {
        const r = await adapter.demo.clear();
        toast(t('demo.cleared', { n: formatNumber(r.removed) }));
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  $('#wipe')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: t('set.wipeTitle'), message: t('set.wipeMessage'), confirmText: t('set.wipeConfirm'), danger: true });
    if (!ok) return;
    await adapter.demo.wipeAll();
    toast(t('set.wiped'));
    load();
  });
}

async function load() {
  host.innerHTML = loadingState();
  try {
    render(await adapter.settings.get());
  } catch (e) {
    host.innerHTML = errorState(e, 'retry');
    $('#retry')?.addEventListener('click', load);
  }
}

load();
