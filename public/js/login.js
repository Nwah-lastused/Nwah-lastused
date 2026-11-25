import { initPage, $, $$, t, showFieldErrors, withBusy, params } from './app.js';

const { adapter } = await initPage({ auth: 'guest', titleKey: 'title.login' });

const loginForm = $('#login-form');
const registerForm = $('#register-form');
const tabs = { login: $('#tab-login'), register: $('#tab-register') };

function select(which) {
  const isLogin = which === 'login';
  tabs.login.setAttribute('aria-selected', String(isLogin));
  tabs.register.setAttribute('aria-selected', String(!isLogin));
  loginForm.classList.toggle('hidden', !isLogin);
  registerForm.classList.toggle('hidden', isLogin);
  (isLogin ? loginForm : registerForm).querySelector('input').focus();
}

tabs.login.addEventListener('click', () => select('login'));
tabs.register.addEventListener('click', () => select('register'));
if (params().get('tab') === 'register') select('register');

if (adapter.mode === 'local') {
  $('#mode-alert').innerHTML = `<div class="alert alert-info small mb-1">${t('login.localNote')}</div>`;
}

$$('.pw-toggle').forEach((btn) =>
  btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = t(show ? 'login.hide' : 'login.show');
    btn.setAttribute('aria-label', t(show ? 'login.hidePw' : 'login.showPw'));
  })
);

/** Redirects to a same-site page only. */
function goNext() {
  const next = params().get('next');
  location.href = next && /^[a-z-]+\.html(\?[^#]*)?$/i.test(next) ? next : 'dashboard.html';
}

function bind(form, errorBox, action) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');
    showFieldErrors(form, {});
    const data = Object.fromEntries(new FormData(form));
    try {
      await withBusy(form.querySelector('[type=submit]'), () => action(data));
      goNext();
    } catch (err) {
      if (err.details) showFieldErrors(form, err.details);
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    }
  });
}

bind(loginForm, $('#login-error'), (d) => adapter.auth.login(d));
bind(registerForm, $('#register-error'), (d) => adapter.auth.register(d));
$$('form [type=submit]').forEach((b) => (b.disabled = false));
