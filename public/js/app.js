// غلاف التطبيق المشترك: الترويسة والتنقل، حماية الصفحات، الرسائل المنبثقة، حوار التأكيد، وأدوات العرض.
import { getAdapter } from './storage-adapter.js';
import { categoryInfo } from './shared/constants.js';

export * from './shared/dates.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const NAV = [
  { key: 'dashboard', href: 'dashboard.html', label: 'لوحة التحكم', icon: '🏡' },
  { key: 'items', href: 'items.html', label: 'أغراضي', icon: '📦' },
  { key: 'notifications', href: 'notifications.html', label: 'التنبيهات', icon: '🔔', badge: true },
  { key: 'settings', href: 'settings.html', label: 'الإعدادات', icon: '⚙️' }
];

function renderHeader({ active, user, adapter }) {
  const header = $('#app-header');
  if (!header) return;
  const modePill = adapter.mode === 'local'
    ? '<span class="mode-pill" title="البيانات محفوظة في هذا المتصفح فقط">وضع تجريبي محلي</span>'
    : '<span class="mode-pill remote" title="البيانات محفوظة في Supabase"> متصل</span>';
  const links = user
    ? NAV.map((n) => `<a href="${n.href}" ${n.key === active ? 'aria-current="page"' : ''}><span aria-hidden="true">${n.icon}</span>${n.label}${n.badge ? '<span class="badge hidden" id="notif-badge" aria-label="تنبيهات جديدة"></span>' : ''}</a>`).join('')
    : '';
  const userBox = user
    ? `<div class="user-chip"><span class="avatar" aria-hidden="true">${esc(user.full_name?.trim()?.[0] || '؟')}</span>
         <span class="small"><strong>${esc(user.full_name)}</strong><br><span class="muted" dir="ltr">@${esc(user.username)}</span></span>
         <button class="btn btn-sm" id="logout-btn" type="button">خروج</button></div>`
    : `<a class="btn btn-primary btn-sm" href="login.html">تسجيل الدخول</a>`;
  header.className = 'site-header';
  header.innerHTML = `
    <div class="container bar">
      <a class="brand" href="${user ? 'dashboard.html' : 'index.html'}" aria-label="آخر استخدام — الرئيسية">
        <img src="assets/logo-mark.png" alt="" width="42" height="41">
        <span><strong>آخر استخدام</strong><small>لا تدع أغراضك تُنسى</small></span>
      </a>
      ${modePill}
      <button class="btn btn-icon menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="القائمة">☰</button>
      <nav class="nav" id="main-nav" aria-label="التنقل الرئيسي">${links}${userBox}</nav>
    </div>`;
  const toggle = $('.menu-toggle', header);
  const nav = $('#main-nav', header);
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  $('#logout-btn', header)?.addEventListener('click', async () => {
    await adapter.auth.logout();
    location.href = 'login.html';
  });
}

function renderFooter() {
  const f = $('#app-footer');
  if (!f) return;
  f.className = 'site-footer';
  f.innerHTML = `<div class="container"><span>© ${new Date().getFullYear()}  منصة «آخر استخدام فريق نواه»</span><span class="spacer"></span><span>أعد استخدام ما يهمك.. واصنع فرقًا 🌿</span></div>`;
}

export async function refreshBadge(adapter) {
  const badge = $('#notif-badge');
  if (!badge) return;
  try {
    const { counts } = await adapter.notifications.list({ status: 'new' });
    badge.textContent = counts.new > 0 ? new Intl.NumberFormat('ar-SA-u-nu-arab').format(counts.new) : '';
    badge.classList.toggle('hidden', !counts.new);
  } catch {
    badge.classList.add('hidden');
  }
}

/**
 * تهيئة أي صفحة.
 * auth: 'required' (يحوّل غير المسجّل إلى الدخول) | 'guest' (يحوّل المسجّل إلى اللوحة) | 'optional'
 */
export async function initPage({ auth = 'required', active = null } = {}) {
  renderFooter();
  let adapter;
  try {
    adapter = await getAdapter();
  } catch (e) {
    showFatal('تعذّر تهيئة المنصة.', e);
    throw e;
  }
  const user = await adapter.auth.me().catch(() => null);
  if (auth === 'required' && !user) {
    const next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace(`login.html?next=${next}`);
    return new Promise(() => {}); // إيقاف تنفيذ الصفحة أثناء التحويل
  }
  if (auth === 'guest' && user) {
    location.replace('dashboard.html');
    return new Promise(() => {});
  }
  renderHeader({ active, user, adapter });
  if (user) refreshBadge(adapter);
  return { adapter, user };
}

function showFatal(msg, e) {
  const main = $('main');
  if (main) main.innerHTML = `<div class="container"><div class="state-box error"><div class="big">⚠️</div><h3>${esc(msg)}</h3><p>${esc(e?.message || '')}</p></div></div>`;
}

// ---------- رسائل منبثقة ----------
export function toast(message, type = 'ok') {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${type === 'error' ? 'error' : ''}`;
  t.innerHTML = `<span aria-hidden="true">${type === 'error' ? '⚠️' : '✓'}</span><span>${esc(message)}</span>`;
  box.append(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3500);
}

// ---------- حوار التأكيد ----------
export function confirmDialog({ title = 'تأكيد', message, confirmText = 'تأكيد', danger = false, input = null }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.innerHTML = `
      <form method="dialog">
        <div class="dlg-body">
          <h2 id="dlg-title">${esc(title)}</h2>
          <p>${esc(message)}</p>
          ${input ? `<div class="field"><label for="dlg-input">${esc(input.label)}</label><input id="dlg-input" type="text" maxlength="500" placeholder="${esc(input.placeholder || '')}"></div>` : ''}
        </div>
        <div class="dlg-foot">
          <button class="btn" value="cancel" type="submit">إلغاء</button>
          <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" value="ok" type="submit">${esc(confirmText)}</button>
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

// ---------- حالات التحميل والفراغ والخطأ ----------
export function loadingState(text = 'جارٍ التحميل…') {
  return `<div class="state-box" role="status"><span class="spinner" aria-hidden="true"></span><p>${esc(text)}</p></div>`;
}
export function emptyState({ icon = '🌱', title, text = '', action = '' }) {
  return `<div class="state-box"><div class="big" aria-hidden="true">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}
export function errorState(e, retryId = '') {
  return `<div class="state-box error" role="alert"><div class="big" aria-hidden="true">⚠️</div><h3>تعذّر تحميل البيانات</h3><p>${esc(e?.message || 'خطأ غير متوقع')}</p>${retryId ? `<button class="btn" id="${retryId}" type="button">إعادة المحاولة</button>` : ''}</div>`;
}

export function stateChip(ev) {
  const cls = ev.state === 'attention' ? (ev.expired ? 'danger' : 'attention') : ev.state === 'archived' ? 'archived' : '';
  return `<span class="chip ${cls}">${esc(ev.stateLabel)}</span>`;
}

export function catIcon(category) {
  return categoryInfo(category).icon;
}

/** زر يعرض مؤشر انتظار أثناء عملية غير متزامنة. */
export async function withBusy(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> جارٍ التنفيذ…';
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.innerHTML = html;
  }
}

/** عرض أخطاء التحقق بجانب الحقول. */
export function showFieldErrors(form, errors = {}) {
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  $$('.error[data-for]', form).forEach((el) => (el.textContent = ''));
  let first = null;
  for (const [field, msg] of Object.entries(errors || {})) {
    const input = form.elements[field];
    const slot = $(`.error[data-for="${field}"]`, form);
    if (slot) slot.textContent = msg;
    if (input && input.setAttribute) {
      input.setAttribute('aria-invalid', 'true');
      first = first || input;
    }
  }
  first?.focus?.();
}

export function params() {
  return new URLSearchParams(location.search);
}
