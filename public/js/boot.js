// Applies saved language and theme before first paint to avoid a flash of the wrong state.
(function () {
  var root = document.documentElement;
  var lang = 'ar';
  var theme = 'system';
  try {
    lang = localStorage.getItem('lu_lang') || 'ar';
    theme = localStorage.getItem('lu_theme') || 'system';
  } catch (e) {}
  if (lang !== 'en') lang = 'ar';
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.lang = lang;
  root.dir = lang === 'en' ? 'ltr' : 'rtl';
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (lang !== 'ar') {
    root.classList.add('i18n-pending');
    setTimeout(function () { root.classList.remove('i18n-pending'); }, 1500);
  }
})();
