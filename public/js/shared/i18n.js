// Translation core shared by the browser and the server.
import ar from './locales/ar.js';
import en from './locales/en.js';

export const LANGUAGES = {
  ar: { dir: 'rtl', locale: 'ar-SA-u-ca-gregory-nu-arab' },
  en: { dir: 'ltr', locale: 'en-GB' }
};

export const DEFAULT_LANG = 'ar';
const DICTIONARIES = { ar, en };
export const normalizeLang = (lang) => (LANGUAGES[lang] ? lang : DEFAULT_LANG);

let current = typeof document !== 'undefined' ? normalizeLang(document.documentElement.lang) : DEFAULT_LANG;

export function setLang(lang) {
  current = normalizeLang(lang);
}

export function getLang() {
  return current;
}

export function hasKey(key, lang = current) {
  return key in DICTIONARIES[normalizeLang(lang)];
}

/** Translate a key, interpolating {placeholders}. Falls back to Arabic, then to the key itself. */
export function t(key, params = {}, lang = current) {
  const dict = DICTIONARIES[normalizeLang(lang)];
  const template = dict[key] ?? ar[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
}
