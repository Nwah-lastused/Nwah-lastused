// App shell: header and navigation, page guards, translations, theme, toasts, dialogs and render helpers.
import { getAdapter } from './storage-adapter.js';
import { t, setLang, getLang, LANGUAGES } from './shared/i18n.js';
import { categoryInfo } from './shared/constants.js';
import { formatNumber } from './shared/dates.js';

export * from './shared/dates.js';
export { t, getLang };

setLang(document.documentElement.lang);

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Preferences ----------
const LANG_KEY = 'lu_lang';
const THEME_KEY = 'lu_theme';
const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function getThemePref() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system';
  } catch {
    return 'system';
  }
}

function resolvedTheme(pref = getThemePref()) {
  return pref === 'dark' || (pref === 'system' && darkQuery?.matches) ? 'dark' : 'light';
}

function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.setAttribute('data-theme', theme);
  $('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1714' : '#1f5a46');
  const btn = $('#theme-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

export function setThemePref(pref) {
  store(THEME_KEY, pref);
  applyTheme();
}

darkQuery?.addEventListener?.('change', () => getThemePref() === 'system' && applyTheme());

export function setLangPref(lang) {
  store(LANG_KEY, LANGUAGES[lang] ? lang : 'ar');
  location.reload();
}

// ---------- Translation of static markup ----------
export function applyI18n(root = document) {
  $$('[data-i18n]', root).forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  $$('[data-i18n-attr]', root).forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}

// ---------- Header & footer ----------
const NAV = [
  { key: 'dashboard', href: 'dashboard.html', icon: '🏡' },
  { key: 'items', href: 'items.html', icon: '📦' },
  { key: 'notifications', href: 'notifications.html', icon: '🔔', badge: true },
  { key: 'settings', href: 'settings.html', icon: '⚙️' }
];

function renderHeader({ active, user, adapter }) {
  const header = $('#app-header');
  if (!header) return;
  const local = adapter.mode === 'local';
  const modePill = `<span class="mode-pill ${local ? '' : 'remote'}" title="${esc(t(local ? 'mode.localTitle' : 'mode.remoteTitle'))}">${esc(t(local ? 'mode.local' : 'mode.remote'))}</span>`;
  const links = user
    ? NAV.map((n) => `<a href="${n.href}" ${n.key === active ? 'aria-current="page"' : ''}><span aria-hidden="true">${n.icon}</span>${esc(t(`nav.${n.key}`))}${n.badge ? `<span class="badge hidden" id="notif-badge" aria-label="${esc(t('nav.newAlerts'))}"></span>` : ''}</a>`).join('')
    : '';
  const userBox = user
    ? `<div class="user-chip">
         <span class="avatar" aria-hidden="true">${esc(user.full_name?.trim()?.[0] || '?')}</span>
         <span class="small"><strong>${esc(user.full_name)}</strong><br><span class="muted" dir="ltr">@${esc(user.username)}</span></span>
         <button class="btn btn-sm" id="logout-btn" type="button">${esc(t('nav.logout'))}</button>
       </div>`
    : `<a class="btn btn-primary btn-sm" href="login.html">${esc(t('nav.login'))}</a>`;

  header.className = 'site-header';
  header.innerHTML = `
    <div class="container bar">
      <a class="brand" href="${user ? 'dashboard.html' : 'index.html'}" aria-label="${esc(t('brand.home'))}">
        <img src="assets/logo-mark.png" alt="" width="42" height="41">
        <span><strong>${esc(t('brand.name'))}</strong><small>${esc(t('brand.tagline'))}</small></span>
      </a>
      ${modePill}
      <div class="header-tools">
        <button class="btn btn-icon btn-ghost" id="lang-btn" type="button" lang="${getLang() === 'ar' ? 'en' : 'ar'}" aria-label="${esc(t('lang.switchLabel'))}">${esc(t('lang.switch'))}</button>
        <button class="btn btn-icon btn-ghost" id="theme-btn" type="button" aria-label="${esc(t('theme.toggle'))}"></button>
        <button class="btn btn-icon menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="${esc(t('nav.menu'))}">☰</button>
      </div>
      <nav class="nav" id="main-nav" aria-label="${esc(t('nav.main'))}">${links}${userBox}</nav>
    </div>`;

  const toggle = $('.menu-toggle', header);
  const nav = $('#main-nav', header);
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  $('#lang-btn', header).addEventListener('click', () => setLangPref(getLang() === 'ar' ? 'en' : 'ar'));
  $('#theme-btn', header).addEventListener('click', () => setThemePref(resolvedTheme() === 'dark' ? 'light' : 'dark'));
  $('#logout-btn', header)?.addEventListener('click', async () => {
    await adapter.auth.logout();
    location.href = 'login.html';
  });
  applyTheme();
}

function renderFooter() {
  const f = $('#app-footer');
  if (!f) return;
  f.className = 'site-footer';
  f.innerHTML = `<div class="container">
    <span>${esc(t('footer.rights', { year: formatNumber(new Date().getFullYear(), { useGrouping: false }) }))}</span>
    <span class="spacer"></span>
    <span>${esc(t('footer.slogan'))}</span>
  </div>`;
}

export async function refreshBadge(adapter) {
  const badge = $('#notif-badge');
  if (!badge) return;
  try {
    const { counts } = await adapter.notifications.list({ status: 'new' });
    badge.textContent = counts.new > 0 ? formatNumber(counts.new) : '';
    badge.classList.toggle('hidden', !counts.new);
  } catch {
    badge.classList.add('hidden');
  }
}

/**
 * Initializes a page.
 * auth: 'required' redirects guests to login, 'guest' redirects users to the dashboard, 'optional' does neither.
 */
export async function initPage({ auth = 'required', active = null, titleKey = null } = {}) {
  applyI18n();
  if (titleKey) setTitle(t(titleKey));
  renderFooter();
  document.documentElement.classList.remove('i18n-pending');

  let adapter;
  try {
    adapter = await getAdapter();
  } catch (e) {
    showFatal(t('ui.initError'), e);
    throw e;
  }
  const user = await adapter.auth.me().catch(() => null);
  if (auth === 'required' && !user) {
    const next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace(`login.html?next=${next}`);
    return new Promise(() => {});
  }
  if (auth === 'guest' && user) {
    location.replace('dashboard.html');
    return new Promise(() => {});
  }
  renderHeader({ active, user, adapter });
  if (user) refreshBadge(adapter);
  return { adapter, user };
}

export function setTitle(text) {
  document.title = `${text} — ${t('brand.name')}`;
}

function showFatal(msg, e) {
  const main = $('main');
  if (main) main.innerHTML = `<div class="container"><div class="state-box error"><div class="big">⚠️</div><h3>${esc(msg)}</h3><p>${esc(e?.message || '')}</p></div></div>`;
}

// ---------- Toasts ----------
export function toast(message, type = 'ok') {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.innerHTML = `<span aria-hidden="true">${type === 'error' ? '⚠️' : '✓'}</span><span>${esc(message)}</span>`;
  box.append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

// ---------- Confirm dialog ----------
export function confirmDialog({ title, message, confirmText, danger = false, input = null }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.innerHTML = `
      <form method="dialog">
        <div class="dlg-body">
          <h2 id="dlg-title">${esc(title || t('ui.confirm'))}</h2>
          <p>${esc(message)}</p>
          ${input ? `<div class="field"><label for="dlg-input">${esc(input.label)}</label><input id="dlg-input" type="text" maxlength="500" placeholder="${esc(input.placeholder || '')}"></div>` : ''}
        </div>
        <div class="dlg-foot">
          <button class="btn" value="cancel" type="submit">${esc(t('ui.cancel'))}</button>
          <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" value="ok" type="submit">${esc(confirmText || t('ui.confirm'))}</button>
        </div>
      </form>`;
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      const ok = dlg.returnValue === 'ok';
      const value = $('#dlg-input', dlg)?.value?.trim() || null;
      dlg.remove();
      resolve(input ? (ok ? { value } : null) : ok);
    });
    dlg.showModal();
    ($('#dlg-input', dlg) || $('button[value="ok"]', dlg)).focus();
  });
}

// ---------- Render helpers ----------
export function loadingState(text = t('ui.loading')) {
  return `<div class="state-box" role="status"><span class="spinner" aria-hidden="true"></span><p>${esc(text)}</p></div>`;
}

export function emptyState({ icon = '🌱', title, text = '', action = '' }) {
  return `<div class="state-box"><div class="big" aria-hidden="true">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

export function errorState(e, retryId = '') {
  return `<div class="state-box error" role="alert"><div class="big" aria-hidden="true">⚠️</div><h3>${esc(t('ui.loadError'))}</h3><p>${esc(e?.message || t('ui.unexpected'))}</p>${retryId ? `<button class="btn" id="${retryId}" type="button">${esc(t('ui.retry'))}</button>` : ''}</div>`;
}

export function stateChip(ev) {
  const cls = ev.state === 'attention' ? (ev.expired ? 'danger' : 'attention') : ev.state === 'archived' ? 'archived' : '';
  return `<span class="chip ${cls}">${esc(t(`state.${ev.state}`))}</span>`;
}

export function catIcon(category) {
  return categoryInfo(category).icon;
}

/** Shows a spinner on a button while an async action runs. */
export async function withBusy(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${esc(t('ui.busy'))}`;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.innerHTML = html;
  }
}

export function showFieldErrors(form, errors = {}) {
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  $$('.error[data-for]', form).forEach((el) => (el.textContent = ''));
  let first = null;
  for (const [field, msg] of Object.entries(errors || {})) {
    const input = form.elements[field];
    const slot = $(`.error[data-for="${field}"]`, form);
    if (slot) slot.textContent = msg;
    if (input?.setAttribute) {
      input.setAttribute('aria-invalid', 'true');
      first = first || input;
    }
  }
  first?.focus?.();
}

export function params() {
  return new URLSearchParams(location.search);
}
