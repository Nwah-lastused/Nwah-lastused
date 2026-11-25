// Domain constants shared by the browser and the server. Labels live in the locale files.
import { t } from './i18n.js';

export const TIMEZONE = 'Asia/Riyadh';

export const CATEGORIES = [
  { value: 'food', icon: '🥫', consumable: true },
  { value: 'medicine', icon: '💊', consumable: true },
  { value: 'cosmetics', icon: '🧴', consumable: true },
  { value: 'cleaning', icon: '🧽', consumable: true },
  { value: 'electronics', icon: '🔌' },
  { value: 'appliances', icon: '🏠' },
  { value: 'kitchen', icon: '🍳' },
  { value: 'clothing', icon: '👕' },
  { value: 'tools', icon: '🛠️' },
  { value: 'sports', icon: '⚽' },
  { value: 'books', icon: '📚' },
  { value: 'kids', icon: '🧸' },
  { value: 'other', icon: '📦' }
];

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);

export function categoryInfo(value) {
  return CATEGORIES.find((c) => c.value === value) || CATEGORIES[CATEGORIES.length - 1];
}

export function categoryName(value, lang) {
  return t(`cat.${categoryInfo(value).value}`, {}, lang);
}

export function categoryLabel(item, lang) {
  if (item.category === 'other' && item.category_other) return item.category_other;
  return categoryName(item.category, lang);
}

export const CONDITIONS = ['good', 'broken', 'damaged'];
export const ITEM_STATUSES = ['active', 'gifted', 'donated', 'disposed'];
export const ARCHIVE_ACTIONS = ['gifted', 'donated', 'disposed'];

export const ACTIONS = {
  kept: { icon: '🤍', rescued: false },
  reused: { icon: '♻️', rescued: true },
  repaired: { icon: '🔧', rescued: true },
  replaced: { icon: '🔄', rescued: false },
  gifted: { icon: '🎁', rescued: true },
  donated: { icon: '🤲', rescued: true },
  disposed: { icon: '🗑️', rescued: false }
};
export const ACTION_TYPES = Object.keys(ACTIONS);

export const NOTIFICATION_TYPES = ['expiry', 'unused', 'replacement'];
export const NOTIFICATION_STATUSES = ['new', 'read', 'closed'];

export const DEFAULT_SETTINGS = {
  unusedDays: 60,
  expiryAlertDays: 14,
  replacementAlertDays: 7,
  upcomingWindowDays: 30,
  itemsView: 'cards'
};

export const IMAGE_RULES = {
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp']
};

export const SORTS = ['last_used_asc', 'last_used_desc', 'expiry_asc', 'name_asc', 'created_desc'];
export const STATE_FILTERS = ['active', 'attention', 'regular', 'expiring', 'unused', 'replacement', 'archived'];
