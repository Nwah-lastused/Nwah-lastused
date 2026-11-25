// Demo items with dates relative to today, covering every reminder state.
import { todayISO, addDays, dateInputToTimestamp } from './dates.js';

const ITEMS = [
  { ar: 'حليب طويل الأجل', en: 'Long-life milk', category: 'food', purchase: -20, expiry: 3, used: -2, alert_days_before: 7, uses: [-2, -6, -11], notes: { ar: 'كرتونة ٦ عبوات في المخزن.', en: 'A pack of 6 in the pantry.' } },
  { ar: 'فيتامين د', en: 'Vitamin D', category: 'medicine', purchase: -80, expiry: 10, used: -1, uses: [-1, -2, -3, -4] },
  { ar: 'واقي شمس', en: 'Sunscreen', category: 'cosmetics', purchase: -400, expiry: -5, used: -50, uses: [-50], notes: { ar: 'من الصيف الماضي.', en: 'From last summer.' } },
  { ar: 'شاحن متنقل ٢٠٠٠٠ مللي أمبير', en: 'Power bank 20,000 mAh', category: 'electronics', purchase: -300, used: -95, uses: [-95, -140] },
  { ar: 'خلاط يدوي', en: 'Hand blender', category: 'kitchen', purchase: -500, used: -200, unused_after_days: 90, uses: [-200] },
  { ar: 'فلتر مياه الثلاجة', en: 'Fridge water filter', category: 'appliances', purchase: -175, used: 0, needs_replacement: true, replacement_interval: 6, replacement_unit: 'months', alert_days_before: 14, uses: [0] },
  { ar: 'رأس فرشاة الأسنان الكهربائية', en: 'Electric toothbrush head', category: 'cosmetics', purchase: -95, used: 0, needs_replacement: true, replacement_interval: 90, replacement_unit: 'days', uses: [0, -1] },
  { ar: 'مكواة بخار', en: 'Steam iron', category: 'appliances', purchase: -700, used: -40, condition: 'broken', uses: [-40], notes: { ar: 'لا يخرج منها البخار.', en: 'No steam comes out.' } },
  { ar: 'حقيبة سفر كبيرة', en: 'Large suitcase', category: 'other', category_other: { ar: 'سفر', en: 'Travel' }, purchase: -600, used: -30, unused_after_days: 365, uses: [-30] },
  { ar: 'سماعات لاسلكية', en: 'Wireless earbuds', category: 'electronics', purchase: -150, used: -1, uses: [-1, -3, -5, -8] },
  { ar: 'مثقاب كهربائي', en: 'Power drill', category: 'tools', purchase: -365, used: -45, unused_after_days: 180, uses: [-45] },
  { ar: 'كتاب «عادات صغيرة»', en: 'Book: “Tiny Habits”', category: 'books', purchase: -60, used: -12, uses: [-12, -20] }
];

export function buildDemoItems(now = new Date(), lang = 'ar') {
  const today = todayISO(now);
  const day = (n) => addDays(today, n);
  const at = (n) => dateInputToTimestamp(day(n), now);
  const pick = (v) => (v && typeof v === 'object' ? v[lang] || v.ar : v ?? null);

  return ITEMS.map((x) => ({
    is_demo: true,
    name: x[lang] || x.ar,
    category: x.category,
    category_other: pick(x.category_other),
    purchase_date: day(x.purchase),
    expiry_date: x.expiry === undefined ? null : day(x.expiry),
    last_used_at: at(x.used),
    needs_replacement: Boolean(x.needs_replacement),
    replacement_interval: x.replacement_interval ?? null,
    replacement_unit: x.replacement_unit ?? null,
    alert_days_before: x.alert_days_before ?? null,
    unused_after_days: x.unused_after_days ?? null,
    condition: x.condition || 'good',
    notes: pick(x.notes),
    usesAt: x.uses.map(at)
  }));
}
