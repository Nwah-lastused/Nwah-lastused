import { initPage, $, esc, toast, showFieldErrors, withBusy, confirmDialog, loadingState, errorState, formatNumber } from './app.js';

const { adapter, user } = await initPage({ active: 'settings' });
const host = $('#settings-host');

function render({ settings, profile }) {
  const local = adapter.mode === 'local';
  host.innerHTML = `
    <form id="settings-form" class="card stack" novalidate>
      <h2>التنبيهات والعرض</h2>
      <div class="form-grid">
        <div class="field"><label for="unusedDays">مهلة «قلة الاستخدام» الافتراضية (أيام)</label><input id="unusedDays" name="unusedDays" type="number" min="1" max="3650" value="${settings.unusedDays}" inputmode="numeric"><span class="error" data-for="unusedDays"></span></div>
        <div class="field"><label for="expiryAlertDays">التنبيه قبل انتهاء الصلاحية (أيام)</label><input id="expiryAlertDays" name="expiryAlertDays" type="number" min="0" max="365" value="${settings.expiryAlertDays}" inputmode="numeric"><span class="error" data-for="expiryAlertDays"></span></div>
        <div class="field"><label for="replacementAlertDays">التنبيه قبل موعد الاستبدال (أيام)</label><input id="replacementAlertDays" name="replacementAlertDays" type="number" min="0" max="365" value="${settings.replacementAlertDays}" inputmode="numeric"><span class="error" data-for="replacementAlertDays"></span></div>
        <div class="field"><label for="upcomingWindowDays">نافذة «القريب» في لوحة التحكم (أيام)</label><input id="upcomingWindowDays" name="upcomingWindowDays" type="number" min="1" max="365" value="${settings.upcomingWindowDays}" inputmode="numeric"><span class="error" data-for="upcomingWindowDays"></span></div>
        <div class="field"><label for="itemsView">طريقة عرض الأغراض الافتراضية</label>
          <select id="itemsView" name="itemsView"><option value="cards" ${settings.itemsView === 'cards' ? 'selected' : ''}>بطاقات</option><option value="table" ${settings.itemsView === 'table' ? 'selected' : ''}>جدول</option></select></div>
        <div class="field"><label for="full_name">اسمك</label><input id="full_name" name="full_name" type="text" maxlength="60" value="${esc(profile?.full_name || user.full_name)}"><span class="error" data-for="full_name"></span></div>
      </div>
      <p class="small muted">يمكنك تخصيص المهل لكل غرض من نموذجه؛ القيم هنا تُستخدم عندما يُترك حقل الغرض فارغًا.</p>
      <div><button class="btn btn-primary" type="submit">حفظ الإعدادات</button></div>
    </form>

    <section class="card stack" aria-labelledby="demo-title">
      <h2 id="demo-title">البيانات التجريبية</h2>
      <p class="muted">تضيف ١٢ غرضًا توضيحيًا بتواريخ نسبية لليوم (قريب الانتهاء، منتهٍ، قليل الاستخدام، يحتاج استبدالًا، معطّل، ومنتظم). لا تُضاف إلى حسابك إلا بضغطك على الزر، وإعادة التحميل تستبدل الأغراض التجريبية السابقة فقط ولا تمس أغراضك.</p>
      ${adapter.demo.allowed
        ? `<div class="row"><button class="btn btn-sand" type="button" id="demo-load">تحميل البيانات التجريبية</button>
           <button class="btn btn-danger" type="button" id="demo-clear">حذف البيانات التجريبية</button></div>`
        : '<div class="alert alert-info">تحميل البيانات التجريبية معطّل في بيئة الإنتاج (ALLOW_DEMO_DATA=false).</div>'}
    </section>

    <section class="card stack" aria-labelledby="notify-title">
      <h2 id="notify-title">قنوات الإشعار</h2>
      <label class="checkbox"><input type="checkbox" checked disabled> تنبيهات داخل المنصة (مفعّلة)</label>
      <label class="checkbox"><input type="checkbox" disabled> إشعارات البريد الإلكتروني أو الجوال</label>
      <p class="small muted">غير متاحة في هذه النسخة الأولية لأنها تتطلب خدمة إرسال خارجية؛ نقطة التكامل موثقة في README.</p>
    </section>

    <section class="card stack" aria-labelledby="acc-title">
      <h2 id="acc-title">الحساب ومصدر البيانات</h2>
      <dl class="facts">
        <dt>اسم المستخدم</dt><dd dir="ltr" style="text-align:right">@${esc(user.username)}</dd>
        <dt>مصدر البيانات</dt><dd>${local ? 'هذا المتصفح (localStorage) — وضع تجريبي' : 'Supabase (قاعدة بيانات سحابية محمية بـ RLS)'}</dd>
      </dl>
      ${local ? `<div class="alert alert-warn small">في الوضع المحلي تُحفظ البيانات في هذا المتصفح فقط، وتضيع عند مسح بيانات المتصفح. اربط Supabase للحفظ الدائم.</div>
        <div><button class="btn btn-danger" type="button" id="wipe">حذف كل بياناتي المحلية</button></div>` : ''}
    </section>`;

  const form = $('#settings-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    showFieldErrors(form, {});
    await withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        await adapter.settings.update(data);
        toast('حُفظت الإعدادات.');
        if (data.full_name !== user.full_name) setTimeout(() => location.reload(), 600);
      } catch (err) {
        if (err.details) showFieldErrors(form, err.details);
        toast(err.message, 'error');
      }
    });
  });

  $('#demo-load')?.addEventListener('click', (e) =>
    withBusy(e.currentTarget, async () => {
      try {
        const r = await adapter.demo.load({ replace: true });
        toast(`تم تحميل ${formatNumber(r.count)} أغراض تجريبية.`);
      } catch (err) { toast(err.message, 'error'); }
    })
  );
  $('#demo-clear')?.addEventListener('click', async (e) => {
    const ok = await confirmDialog({ title: 'حذف البيانات التجريبية', message: 'ستُحذف الأغراض التجريبية فقط مع سجلاتها. أغراضك الحقيقية لن تتأثر.', confirmText: 'حذف', danger: true });
    if (!ok) return;
    withBusy(e.target, async () => {
      try {
        const r = await adapter.demo.clear();
        toast(`حُذف ${formatNumber(r.removed)} غرضًا تجريبيًا.`);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
  $('#wipe')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'حذف كل البيانات المحلية', message: 'ستُحذف كل أغراضك وسجلاتك وتنبيهاتك من هذا المتصفح نهائيًا. يبقى حسابك المحلي.', confirmText: 'حذف الكل', danger: true });
    if (!ok) return;
    await adapter.demo.wipeAll();
    toast('حُذفت البيانات المحلية.');
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
