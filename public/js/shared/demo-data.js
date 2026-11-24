// بيانات توضيحية بتواريخ نسبية لليوم، حتى تُظهر دائمًا كل الحالات:
// قريب الانتهاء، منتهٍ، قليل الاستخدام، يحتاج استبدالًا، معطّل، ومنتظم.
import { todayISO, addDays, dateInputToTimestamp } from './dates.js';

export function buildDemoItems(now = new Date()) {
  const t = todayISO(now);
  const d = (n) => addDays(t, n);
  const used = (n) => dateInputToTimestamp(d(n), now);
  return [
    { name: 'حليب طويل الأجل', category: 'food', purchase_date: d(-20), expiry_date: d(3), last_used_at: used(-2), alert_days_before: 7, notes: 'كرتونة ٦ عبوات في المخزن.', uses: [-2, -6, -11] },
    { name: 'فيتامين د', category: 'medicine', purchase_date: d(-80), expiry_date: d(10), last_used_at: used(-1), uses: [-1, -2, -3, -4] },
    { name: 'واقي شمس', category: 'cosmetics', purchase_date: d(-400), expiry_date: d(-5), last_used_at: used(-50), notes: 'من الصيف الماضي.', uses: [-50] },
    { name: 'شاحن متنقل ٢٠٠٠٠ مللي أمبير', category: 'electronics', purchase_date: d(-300), last_used_at: used(-95), uses: [-95, -140] },
    { name: 'خلاط يدوي', category: 'kitchen', purchase_date: d(-500), last_used_at: used(-200), unused_after_days: 90, uses: [-200] },
    { name: 'فلتر مياه الثلاجة', category: 'appliances', purchase_date: d(-175), needs_replacement: true, replacement_interval: 6, replacement_unit: 'months', alert_days_before: 14, last_used_at: used(0), uses: [0] },
    { name: 'رأس فرشاة الأسنان الكهربائية', category: 'cosmetics', purchase_date: d(-95), needs_replacement: true, replacement_interval: 90, replacement_unit: 'days', last_used_at: used(0), uses: [0, -1] },
    { name: 'مكواة بخار', category: 'appliances', purchase_date: d(-700), last_used_at: used(-40), condition: 'broken', notes: 'لا يخرج منها البخار.', uses: [-40] },
    { name: 'حقيبة سفر كبيرة', category: 'other', category_other: 'سفر', purchase_date: d(-600), last_used_at: used(-30), unused_after_days: 365, uses: [-30] },
    { name: 'سماعات لاسلكية', category: 'electronics', purchase_date: d(-150), last_used_at: used(-1), uses: [-1, -3, -5, -8] },
    { name: 'مثقاب كهربائي', category: 'tools', purchase_date: d(-365), last_used_at: used(-45), unused_after_days: 180, uses: [-45] },
    { name: 'كتاب «عادات صغيرة»', category: 'books', purchase_date: d(-60), last_used_at: used(-12), uses: [-12, -20] }
  ].map((x) => ({ is_demo: true, needs_replacement: false, condition: 'good', ...x, usesAt: x.uses.map((n) => used(n)) }));
}
