import { initPage, $, t } from './app.js';

const { adapter, user } = await initPage({ auth: 'optional', titleKey: 'title.home' });

const start = $('#start-btn');
start.href = user ? 'dashboard.html' : 'login.html';
start.textContent = t(user ? 'home.goDashboard' : 'home.start');
$('#mode-note').textContent = t(adapter.mode === 'local' ? 'home.modeLocal' : 'home.modeRemote');
