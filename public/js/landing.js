import { initPage, $ } from './app.js';

const { adapter, user } = await initPage({ auth: 'optional' });
const start = $('#start-btn');
start.href = user ? 'dashboard.html' : 'login.html';
if (user) start.textContent = 'اذهب إلى لوحة التحكم';
$('#mode-note').textContent =
  adapter.mode === 'local'
    ? 'تعمل المنصة الآن في الوضع التجريبي المحلي: البيانات تُحفظ في هذا المتصفح فقط.'
    : 'بياناتك محفوظة بأمان في السحابة ومتاحة من أي جهاز.';
