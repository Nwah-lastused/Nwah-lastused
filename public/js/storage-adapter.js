// طبقة مصدر البيانات القابلة للتبديل:
// - LocalAdapter: يعمل في المتصفح فقط (localStorage) عندما لا يكون Supabase مُعدًّا — للتجربة فقط.
// - RemoteAdapter: يستدعي واجهات الخادم /api المتصلة بـ Supabase.
// كلاهما يقدّم الواجهة نفسها، ويشتركان في منطق التذكيرات والتحقق (js/shared) فلا يتكرر منطق الواجهة.
import { api, ApiError, getSession, setSession } from './api.js';
import { validateItem, validateRegistration, validateLogin, validateSettings, validateAction, validateUsageNote, validateImageDataUrl } from './shared/validation.js';
import { desiredNotifications, planNotificationSync, mergeSettings, actionEffects, evaluateItem } from './shared/reminders.js';
import { queryItems, buildDashboard } from './shared/summary.js';
import { buildDemoItems } from './shared/demo-data.js';

const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);

const fail = (message, errors) => {
  throw new ApiError(message, { status: 422, code: 'validation', details: errors });
};

// ======================================================================
// المحول المحلي
// ======================================================================
const USERS_KEY = 'lu_local_users';
const SESSION_KEY = 'lu_local_session';
const dataKey = (uid) => `lu_local_data_${uid}`;

async function hashPassword(password, saltB64) {
  if (!crypto?.subtle) throw new ApiError('المتصفح لا يدعم التشفير الآمن. افتح المنصة عبر http://localhost.');
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { salt: toB64(salt), hash: toB64(bits) };
}

class LocalAdapter {
  constructor(config) {
    this.mode = 'local';
    this.config = config;
    this.auth = {
      register: (input) => this.#register(input),
      login: (input) => this.#login(input),
      logout: async () => localStorage.removeItem(SESSION_KEY),
      me: async () => this.#currentUser()
    };
    this.items = {
      list: async (query) => {
        const d = this.#syncAll();
        const items = queryItems(d.items, query, d.settings).map((i) => this.#present(i));
        return { items, total: items.length };
      },
      get: async (id) => this.#getItem(id),
      create: async (input, opts) => this.#saveItem(null, input, opts),
      update: async (id, input, opts) => this.#saveItem(id, input, opts),
      remove: async (id) => this.#mutate((d) => {
        this.#findItem(d, id);
        d.items = d.items.filter((i) => i.id !== id);
        d.logs = d.logs.filter((l) => l.item_id !== id);
        d.notifications = d.notifications.filter((n) => n.item_id !== id);
        d.actions = d.actions.filter((a) => a.item_id !== id);
      }),
      use: async (id, note) => this.#useItem(id, note),
      action: async (id, input) => this.#action(id, input)
    };
    this.notifications = {
      list: async (filter = {}) => {
        const d = this.#syncAll();
        const names = new Map(d.items.map((i) => [i.id, i.name]));
        let list = d.notifications.map((n) => ({ ...n, item_name: names.get(n.item_id) || 'غرض محذوف' }));
        const counts = { new: 0, read: 0, closed: 0 };
        list.forEach((n) => counts[n.status]++);
        if (filter.status === 'open') list = list.filter((n) => n.status !== 'closed');
        else if (filter.status && filter.status !== 'all') list = list.filter((n) => n.status === filter.status);
        if (filter.type) list = list.filter((n) => n.type === filter.type);
        list.sort((a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1) || b.created_at.localeCompare(a.created_at));
        return { notifications: list, counts };
      },
      update: async (id, status) => this.#mutate((d) => {
        const n = d.notifications.find((x) => x.id === id);
        if (!n) throw new ApiError('التنبيه غير موجود.', { status: 404 });
        if (!['read', 'closed', 'new'].includes(status)) fail('حالة غير صالحة.');
        n.status = status;
        n.closed_reason = status === 'closed' ? 'user' : null;
        n.updated_at = new Date().toISOString();
        return n;
      }),
      markAllRead: async () => this.#mutate((d) => {
        d.notifications.forEach((n) => { if (n.status === 'new') n.status = 'read'; });
      })
    };
    this.reminders = { check: async () => this.#syncAll().stats };
    this.settings = {
      get: async () => {
        const d = this.#data();
        return { settings: mergeSettings(d.settings), profile: this.#currentUserSync() };
      },
      update: async (input) => {
        const r = validateSettings(input);
        if (!r.ok) fail('تحقق من قيم الإعدادات.', r.errors);
        if (r.full_name) {
          const users = this.#users();
          const u = users.find((x) => x.id === this.#uid());
          u.full_name = r.full_name;
          localStorage.setItem(USERS_KEY, JSON.stringify(users));
        }
        return this.#mutate((d) => {
          d.settings = mergeSettings({ ...d.settings, ...r.value });
          return d.settings;
        });
      }
    };
    this.dashboard = async () => {
      const d = this.#syncAll();
      return buildDashboard(d, d.settings);
    };
    this.demo = {
      allowed: true,
      load: async ({ replace = true } = {}) => this.#loadDemo(replace),
      clear: async () => this.#mutate((d) => {
        const ids = new Set(d.items.filter((i) => i.is_demo).map((i) => i.id));
        this.#dropItems(d, ids);
        return { removed: ids.size };
      }),
      wipeAll: async () => {
        localStorage.removeItem(dataKey(this.#uid()));
      }
    };
  }

  // ---------- المصادقة المحلية ----------
  #users() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
  }
  #uid() {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) throw new ApiError('يجب تسجيل الدخول.', { status: 401, code: 'unauthorized' });
    return id;
  }
  #currentUserSync() {
    const id = localStorage.getItem(SESSION_KEY);
    const u = id && this.#users().find((x) => x.id === id);
    return u ? { id: u.id, username: u.username, full_name: u.full_name } : null;
  }
  async #currentUser() {
    const u = this.#currentUserSync();
    if (!u) localStorage.removeItem(SESSION_KEY);
    return u;
  }
  async #register(input) {
    const r = validateRegistration(input);
    if (!r.ok) fail('تحقق من بيانات التسجيل.', r.errors);
    const users = this.#users();
    if (users.some((u) => u.username === r.value.username)) fail('اسم المستخدم مستخدم من قبل.', { username: 'اسم المستخدم محجوز، اختر اسمًا آخر.' });
    const { salt, hash } = await hashPassword(r.value.password);
    const user = { id: uuid(), username: r.value.username, full_name: r.value.full_name, salt, hash, created_at: new Date().toISOString() };
    users.push(user);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    localStorage.setItem(SESSION_KEY, user.id);
    return { id: user.id, username: user.username, full_name: user.full_name };
  }
  async #login(input) {
    const r = validateLogin(input);
    if (!r.ok) fail('اكتب اسم المستخدم وكلمة المرور.', r.errors);
    const user = this.#users().find((u) => u.username === r.value.username);
    const bad = () => { throw new ApiError('اسم المستخدم أو كلمة المرور غير صحيحة.', { status: 401, code: 'invalid_credentials' }); };
    if (!user) bad();
    const { hash } = await hashPassword(r.value.password, user.salt);
    if (hash !== user.hash) bad();
    localStorage.setItem(SESSION_KEY, user.id);
    return { id: user.id, username: user.username, full_name: user.full_name };
  }

  // ---------- البيانات ----------
  #data() {
    const empty = { items: [], logs: [], notifications: [], actions: [], settings: {} };
    try {
      const d = JSON.parse(localStorage.getItem(dataKey(this.#uid())) || 'null');
      return { ...empty, ...(d || {}), settings: mergeSettings(d?.settings) };
    } catch {
      return { ...empty, settings: mergeSettings() };
    }
  }
  #save(d) {
    try {
      localStorage.setItem(dataKey(this.#uid()), JSON.stringify(d));
    } catch (e) {
      throw new ApiError('امتلأت مساحة التخزين المحلي في المتصفح. احذف بعض الصور أو الأغراض.', { code: 'quota' });
    }
  }
  #mutate(fn) {
    const d = this.#data();
    const result = fn(d);
    this.#save(d);
    return result;
  }
  #findItem(d, id) {
    const item = d.items.find((i) => i.id === id);
    if (!item) throw new ApiError('الغرض غير موجود.', { status: 404, code: 'not_found' });
    return item;
  }
  #dropItems(d, ids) {
    d.items = d.items.filter((i) => !ids.has(i.id));
    d.logs = d.logs.filter((l) => !ids.has(l.item_id));
    d.notifications = d.notifications.filter((n) => !ids.has(n.item_id));
    d.actions = d.actions.filter((a) => !ids.has(a.item_id));
  }
  #present(item) {
    const { image_data, ...rest } = item;
    return { ...rest, image_url: image_data || null, evaluation: item.evaluation || evaluateItem(item, this.#data().settings) };
  }

  /** مزامنة تنبيهات غرض واحد (إنشاء غير المكرر + إغلاق ما لم يعد مستحقًا). */
  #syncItem(d, item, now = new Date()) {
    const existing = d.notifications.filter((n) => n.item_id === item.id);
    const { toInsert, toClose } = planNotificationSync(existing, desiredNotifications(item, d.settings, now));
    const ts = now.toISOString();
    for (const n of toInsert) {
      d.notifications.push({ id: uuid(), owner_id: item.owner_id, status: 'new', closed_reason: null, created_at: ts, updated_at: ts, ...n });
    }
    for (const id of toClose) {
      const n = d.notifications.find((x) => x.id === id);
      n.status = 'closed';
      n.closed_reason = 'resolved';
      n.updated_at = ts;
    }
    return { created: toInsert.length, closed: toClose.length };
  }
  #syncAll() {
    const d = this.#data();
    const stats = { created: 0, closed: 0 };
    for (const item of d.items) {
      const r = this.#syncItem(d, item);
      stats.created += r.created;
      stats.closed += r.closed;
    }
    if (stats.created || stats.closed) this.#save(d);
    d.stats = stats;
    return d;
  }

  async #getItem(id) {
    const d = this.#syncAll();
    const item = this.#findItem(d, id);
    return {
      item: this.#present(item),
      logs: d.logs.filter((l) => l.item_id === id).sort((a, b) => b.used_at.localeCompare(a.used_at)),
      notifications: d.notifications.filter((n) => n.item_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      actions: d.actions.filter((a) => a.item_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
    };
  }

  async #saveItem(id, input, { image, removeImage } = {}) {
    if (image) {
      const img = validateImageDataUrl(image);
      if (!img.ok) fail(img.error, { image: img.error });
    }
    return this.#mutate((d) => {
      const existing = id ? this.#findItem(d, id) : null;
      const merged = { ...(existing || {}), ...input };
      const r = validateItem(merged);
      if (!r.ok) fail('تحقق من الحقول المظللة.', r.errors);
      const ts = new Date().toISOString();
      let item;
      if (existing) {
        const prevUsed = existing.last_used_at;
        Object.assign(existing, r.value, { updated_at: ts });
        if (removeImage) existing.image_data = null;
        if (image) existing.image_data = image;
        if (r.value.last_used_at && r.value.last_used_at !== prevUsed && (!prevUsed || r.value.last_used_at > prevUsed)) {
          d.logs.push({ id: uuid(), item_id: id, owner_id: existing.owner_id, used_at: r.value.last_used_at, note: 'تحديث من نموذج التعديل', created_at: ts });
        }
        item = existing;
      } else {
        item = { id: uuid(), owner_id: this.#uid(), is_demo: Boolean(input.is_demo), image_data: image || null, created_at: ts, updated_at: ts, ...r.value };
        d.items.push(item);
        if (item.last_used_at) d.logs.push({ id: uuid(), item_id: item.id, owner_id: item.owner_id, used_at: item.last_used_at, note: null, created_at: ts });
      }
      this.#syncItem(d, item);
      return this.#present(item);
    });
  }

  async #useItem(id, note) {
    const r = validateUsageNote({ note });
    if (!r.ok) fail('تحقق من الملاحظة.', r.errors);
    return this.#mutate((d) => {
      const item = this.#findItem(d, id);
      if (item.status !== 'active') fail('لا يمكن تسجيل استخدام لغرض مؤرشف.');
      const now = new Date();
      item.last_used_at = now.toISOString();
      item.updated_at = now.toISOString();
      d.logs.push({ id: uuid(), item_id: id, owner_id: item.owner_id, used_at: item.last_used_at, note: r.value.note, created_at: item.last_used_at });
      this.#syncItem(d, item, now);
      return this.#present(item);
    });
  }

  async #action(id, input) {
    const r = validateAction(input);
    if (!r.ok) fail('قرار غير صالح.', r.errors);
    return this.#mutate((d) => {
      const item = this.#findItem(d, id);
      const now = new Date();
      const ts = now.toISOString();
      const fx = actionEffects(r.value.action_type, now);
      Object.assign(item, fx.patch, { updated_at: ts });
      d.actions.push({ id: uuid(), item_id: id, owner_id: item.owner_id, ...r.value, created_at: ts });
      if (fx.logUsage) d.logs.push({ id: uuid(), item_id: id, owner_id: item.owner_id, used_at: ts, note: r.value.note, created_at: ts });
      for (const n of d.notifications) {
        if (n.item_id === id && n.status !== 'closed' && fx.closeTypes?.includes(n.type)) {
          n.status = 'closed';
          n.closed_reason = 'user';
          n.updated_at = ts;
        }
      }
      this.#syncItem(d, item, now);
      return this.#present(item);
    });
  }

  async #loadDemo(replace) {
    if (replace) await this.demo.clear();
    const demo = buildDemoItems();
    let count = 0;
    for (const x of demo) {
      const { uses, usesAt, ...input } = x;
      const item = await this.#saveItem(null, input);
      this.#mutate((d) => {
        d.logs = d.logs.filter((l) => l.item_id !== item.id);
        for (const at of usesAt) d.logs.push({ id: uuid(), item_id: item.id, owner_id: item.owner_id, used_at: at, note: null, created_at: at });
      });
      count++;
    }
    return { count };
  }
}

// ======================================================================
// المحول البعيد (الخادم + Supabase)
// ======================================================================
class RemoteAdapter {
  constructor(config) {
    this.mode = 'remote';
    this.config = config;
    const qs = (o) => {
      const p = new URLSearchParams();
      Object.entries(o || {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.set(k, v));
      const s = p.toString();
      return s ? `?${s}` : '';
    };
    this.auth = {
      register: async (input) => {
        const r = validateRegistration(input);
        if (!r.ok) fail('تحقق من بيانات التسجيل.', r.errors);
        const data = await api.publicPost('/api/auth/register', input);
        setSession(data.session);
        return data.user;
      },
      login: async (input) => {
        const r = validateLogin(input);
        if (!r.ok) fail('اكتب اسم المستخدم وكلمة المرور.', r.errors);
        const data = await api.publicPost('/api/auth/login', r.value);
        setSession(data.session);
        return data.user;
      },
      logout: async () => {
        try { await api.post('/api/auth/logout'); } catch { /* الجلسة تُحذف محليًا على أي حال */ }
        setSession(null);
      },
      me: async () => {
        if (!getSession()) return null;
        try {
          return (await api.get('/api/auth/me')).user;
        } catch (e) {
          if (e.status === 401) { setSession(null); return null; }
          throw e;
        }
      }
    };
    this.items = {
      list: (query) => api.get(`/api/items${qs(query)}`),
      get: (id) => api.get(`/api/items/${encodeURIComponent(id)}`),
      create: (input, { image } = {}) => {
        const r = validateItem(input);
        if (!r.ok) fail('تحقق من الحقول المظللة.', r.errors);
        return api.post('/api/items', { ...input, image });
      },
      update: (id, input, { image, removeImage } = {}) =>
        api.patch(`/api/items/${encodeURIComponent(id)}`, { ...input, image, remove_image: removeImage || undefined }),
      remove: (id) => api.del(`/api/items/${encodeURIComponent(id)}`),
      use: (id, note) => api.post(`/api/items/${encodeURIComponent(id)}/use`, { note }),
      action: (id, input) => api.post(`/api/items/${encodeURIComponent(id)}/action`, input)
    };
    this.notifications = {
      list: (filter) => api.get(`/api/notifications${qs(filter)}`),
      update: (id, status) => api.patch(`/api/notifications/${encodeURIComponent(id)}`, { status }),
      markAllRead: () => api.post('/api/notifications/read-all')
    };
    this.reminders = { check: () => api.post('/api/reminders/check') };
    this.settings = { get: () => api.get('/api/settings'), update: (input) => api.patch('/api/settings', input) };
    this.dashboard = () => api.get('/api/dashboard');
    this.demo = {
      allowed: Boolean(config.demoDataAllowed),
      load: ({ replace = true } = {}) => api.post('/api/demo/load', { replace }),
      clear: () => api.del('/api/demo'),
      wipeAll: null
    };
  }
}

let adapterPromise = null;

/** يختار المحول حسب إعداد الخادم: Supabase مُعد → بعيد، وإلا محلي. */
export function getAdapter() {
  if (!adapterPromise) {
    adapterPromise = api
      .config()
      .catch(() => ({ mode: 'local', demoDataAllowed: true, serverless: true }))
      .then((config) => (config.mode === 'supabase' ? new RemoteAdapter(config) : new LocalAdapter(config)));
  }
  return adapterPromise;
}
