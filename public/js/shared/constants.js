// ثوابت مشتركة بين المتصفح والخادم (ES Module بلا اعتمادات).

export const TIMEZONE = 'Asia/Riyadh';

export const CATEGORIES = [
  { value: 'food', label: 'طعام ومشروبات', icon: '🥫', consumable: true },
  { value: 'medicine', label: 'أدوية ومستلزمات صحية', icon: '💊', consumable: true },
  { value: 'cosmetics', label: 'عناية شخصية وتجميل', icon: '🧴', consumable: true },
  { value: 'cleaning', label: 'منظفات', icon: '🧽', consumable: true },
  { value: 'electronics', label: 'إلكترونيات', icon: '🔌' },
  { value: 'appliances', label: 'أجهزة منزلية', icon: '🏠' },
  { value: 'kitchen', label: 'أدوات مطبخ', icon: '🍳' },
  { value: 'clothing', label: 'ملابس وأحذية', icon: '👕' },
  { value: 'tools', label: 'عُدد وأدوات', icon: '🛠️' },
  { value: 'sports', label: 'رياضة وهوايات', icon: '⚽' },
  { value: 'books', label: 'كتب وقرطاسية', icon: '📚' },
  { value: 'kids', label: 'أطفال وألعاب', icon: '🧸' },
  { value: 'other', label: 'أخرى', icon: '📦' }
];

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);

export function categoryInfo(value) {
  return CATEGORIES.find((c) => c.value === value) || CATEGORIES[CATEGORIES.length - 1];
}

export function categoryLabel(item) {
  if (item.category === 'other' && item.category_other) return item.category_other;
  return categoryInfo(item.category).label;
}

export const CONDITIONS = {
  good: 'صالح للاستخدام',
  broken: 'معطّل',
  damaged: 'تالف أو لا يصلح'
};

export const ITEM_STATUSES = {
  active: 'نشط',
  gifted: 'تم إهداؤه',
  donated: 'تم التبرع به',
  disposed: 'تم التخلص منه'
};

// قرارات الاستدامة وأثر كل قرار على الغرض.
export const ACTIONS = {
  kept: { label: 'احتفظت به', icon: '🤍', rescued: false },
  reused: { label: 'أعدت استخدامه', icon: '♻️', rescued: true },
  repaired: { label: 'أصلحته', icon: '🔧', rescued: true },
  replaced: { label: 'استبدلته بجديد', icon: '🔄', rescued: false },
  gifted: { label: 'أهديته', icon: '🎁', rescued: true },
  donated: { label: 'تبرعت به', icon: '🤲', rescued: true },
  disposed: { label: 'تم التخلص منه', icon: '🗑️', rescued: false }
};

export const ACTION_TYPES = Object.keys(ACTIONS);

export const NOTIFICATION_TYPES = {
  expiry: 'انتهاء الصلاحية',
  unused: 'قلة الاستخدام',
  replacement: 'استبدال دوري'
};

export const NOTIFICATION_STATUSES = {
  new: 'جديد',
  read: 'مقروء',
  closed: 'مغلق'
};

export const DEFAULT_SETTINGS = {
  unusedDays: 60, // بعدها يُعدّ الغرض قليل الاستخدام
  expiryAlertDays: 14, // التنبيه قبل انتهاء الصلاحية
  replacementAlertDays: 7, // التنبيه قبل موعد الاستبدال
  upcomingWindowDays: 30, // نافذة «القريب» في لوحة التحكم
  itemsView: 'cards' // cards | table
};

export const IMAGE_RULES = {
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp']
};

export const SORTS = {
  last_used_asc: 'الأقدم استخدامًا أولًا',
  last_used_desc: 'الأحدث استخدامًا أولًا',
  expiry_asc: 'الأقرب انتهاءً أولًا',
  name_asc: 'الاسم (أ - ي)',
  created_desc: 'الأحدث إضافة'
};

export const STATE_FILTERS = {
  active: 'كل الأغراض النشطة',
  attention: 'يحتاج انتباهك',
  regular: 'منتظم',
  expiring: 'قريب الانتهاء أو منتهٍ',
  unused: 'قليل الاستخدام',
  replacement: 'يحتاج استبدالًا',
  archived: 'المؤرشفة (أُهديت أو تُبرع بها أو تُخلص منها)'
};
