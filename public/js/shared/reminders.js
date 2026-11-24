// منطق التذكيرات والحالات والتوصيات — مصدر واحد يستخدمه المحول المحلي والخادم.
import { DEFAULT_SETTINGS, categoryInfo } from './constants.js';
import { todayISO, toDateISO, daysBetween, addDays, addMonths, daysLabel } from './dates.js';

export function mergeSettings(settings) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

/** الإعدادات الفعلية للغرض: إعداد الغرض إن وُجد، وإلا الإعداد العام. */
export function effectiveItemSettings(item, settings) {
  const s = mergeSettings(settings);
  const own = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    unusedDays: own(item.unused_after_days) ?? s.unusedDays,
    expiryAlertDays: own(item.alert_days_before) ?? s.expiryAlertDays,
    replacementAlertDays: own(item.alert_days_before) ?? s.replacementAlertDays
  };
}

/**
 * أساس حساب «قلة الاستخدام»: آخر استخدام، وإن لم يوجد فتاريخ الشراء، وإلا تاريخ الإضافة.
 */
export function usageBaseDate(item) {
  return toDateISO(item.last_used_at) || item.purchase_date || toDateISO(item.created_at);
}

/**
 * موعد الاستبدال الدوري.
 * الأساس المختار: تاريخ الشراء (بداية عمر الوحدة الحالية)، لأن الاستبدال الدوري
 * (فلتر، رأس فرشاة...) يرتبط بعمر القطعة لا بآخر مرة استُخدمت فيها؛ لو اعتمدنا
 * آخر استخدام لتأجّل الموعد مع كل استخدام وهذا عكس المقصود.
 * عند غياب تاريخ الشراء نرجع إلى آخر استخدام ثم تاريخ الإضافة.
 * قرار «استبدلته» يحدّث تاريخ الشراء إلى اليوم فتبدأ دورة جديدة.
 */
export function replacementDueDate(item) {
  if (!item.needs_replacement || !item.replacement_interval) return null;
  const base = item.purchase_date || toDateISO(item.last_used_at) || toDateISO(item.created_at);
  if (!base) return null;
  const n = Number(item.replacement_interval);
  return item.replacement_unit === 'months' ? addMonths(base, n) : addDays(base, n);
}

function isConsumable(item) {
  return Boolean(categoryInfo(item.category).consumable);
}

/** توصية قابلة للتجاهل — اقتراح وليست حكمًا نهائيًا. */
export function recommend(item, ev) {
  if (item.status && item.status !== 'active') return null;
  if (item.condition === 'broken') {
    return {
      key: 'repair',
      title: 'أصلحه',
      text: 'ذكرت أنه معطّل؛ إصلاحه لدى فنّي موثوق غالبًا أوفر وأقل هدرًا من شراء بديل.'
    };
  }
  if (item.condition === 'damaged' || ev.expired) {
    const medicine = item.category === 'medicine';
    return {
      key: 'dispose',
      title: 'تخلّص منه بطريقة مناسبة',
      text: medicine
        ? 'لا تستخدم الأدوية المنتهية. اسأل الصيدلية القريبة إن كانت تستقبلها لإتلافها بأمان.'
        : 'لا تستخدمه إن انتهت صلاحيته أو تلف. افصله عن النفايات العامة إن أمكن واتّبع إرشادات جهتك المحلية لإعادة التدوير.'
    };
  }
  if (ev.isUnused) {
    if (isConsumable(item)) {
      return {
        key: 'use-or-gift',
        title: 'استخدمه أو أهدِه قبل أن يتلف',
        text: 'ما زال صالحًا؛ ضعه في مكان ظاهر لتستخدمه، أو أهدِه لمن يحتاجه قبل انتهاء صلاحيته.'
      };
    }
    if (ev.daysSinceUse >= ev.settings.unusedDays * 2) {
      return {
        key: 'gift-donate',
        title: 'أهدِه أو تبرّع به',
        text: 'لم تستخدمه منذ مدة طويلة وهو صالح؛ قد يكون أنفع لشخص آخر أو لجهة خيرية.'
      };
    }
    return {
      key: 'reuse',
      title: 'أعد استخدامه',
      text: 'ربما له استعمال آخر لم تفكر فيه، أو يكفي أن تضعه في مكان تراه فيه لتتذكره.'
    };
  }
  return null;
}

/**
 * تقييم شامل للغرض في يوم معيّن: الحالات، المسببات، التوصية.
 * triggers = التنبيهات المستحقة الآن (كل منها له مفتاح type + dueDate لمنع التكرار).
 */
export function evaluateItem(item, settings, now = new Date()) {
  const s = effectiveItemSettings(item, settings);
  const today = todayISO(now);
  const active = !item.status || item.status === 'active';

  const ev = {
    today,
    settings: s,
    active,
    daysToExpiry: null,
    expired: false,
    expiringSoon: false,
    daysSinceUse: null,
    unusedDueDate: null,
    isUnused: false,
    replacementDue: null,
    daysToReplacement: null,
    replacementSoon: false,
    triggers: []
  };

  if (item.expiry_date) {
    ev.daysToExpiry = daysBetween(today, item.expiry_date);
    ev.expired = ev.daysToExpiry < 0;
    ev.expiringSoon = ev.daysToExpiry <= s.expiryAlertDays;
  }

  const base = usageBaseDate(item);
  if (base) {
    ev.daysSinceUse = Math.max(0, daysBetween(base, today));
    ev.unusedDueDate = addDays(base, s.unusedDays);
    // المنتهي أو التالف لا يُنبَّه عليه كـ«قليل الاستخدام» لأن استخدامه غير مستحسن أصلًا.
    ev.isUnused = ev.daysSinceUse > s.unusedDays && !ev.expired && item.condition !== 'damaged';
  }

  ev.replacementDue = replacementDueDate(item);
  if (ev.replacementDue) {
    ev.daysToReplacement = daysBetween(today, ev.replacementDue);
    ev.replacementSoon = ev.daysToReplacement <= s.replacementAlertDays;
  }

  if (active) {
    if (item.expiry_date && ev.expiringSoon) {
      ev.triggers.push({
        type: 'expiry',
        dueDate: item.expiry_date,
        title: ev.expired ? `انتهت صلاحية «${item.name}»` : `صلاحية «${item.name}» تقترب من نهايتها`,
        reason: ev.expired
          ? `انتهت صلاحيته منذ ${daysLabel(ev.daysToExpiry)}.`
          : ev.daysToExpiry === 0
            ? 'تنتهي صلاحيته اليوم.'
            : `تنتهي صلاحيته خلال ${daysLabel(ev.daysToExpiry)}.`,
        suggestion: ev.expired
          ? 'لا تستخدمه، وتخلّص منه بطريقة مناسبة.'
          : 'استخدمه قريبًا أو أهدِه لمن يحتاجه قبل انتهاء صلاحيته.'
      });
    }
    if (ev.isUnused) {
      ev.triggers.push({
        type: 'unused',
        dueDate: ev.unusedDueDate,
        title: `«${item.name}» لم يُستخدم منذ مدة`,
        reason: `مضى ${daysLabel(ev.daysSinceUse)} دون استخدام (الحد ${daysLabel(s.unusedDays)}).`,
        suggestion: null // تُملأ من التوصية أدناه
      });
    }
    if (ev.replacementDue && ev.replacementSoon) {
      const d = ev.daysToReplacement;
      ev.triggers.push({
        type: 'replacement',
        dueDate: ev.replacementDue,
        title: `حان موعد استبدال «${item.name}»`,
        reason:
          d < 0 ? `تجاوز موعد الاستبدال بـ ${daysLabel(d)}.` : d === 0 ? 'موعد الاستبدال اليوم.' : `موعد الاستبدال بعد ${daysLabel(d)}.`,
        suggestion: 'استبدله بوحدة جديدة ثم سجّل «استبدلته» لتبدأ دورة جديدة.'
      });
    }
  }

  ev.recommendation = recommend(item, ev);
  for (const t of ev.triggers) {
    if (!t.suggestion) t.suggestion = ev.recommendation ? `${ev.recommendation.title}: ${ev.recommendation.text}` : null;
  }

  if (!active) {
    ev.state = 'archived';
    ev.stateLabel = 'مؤرشف';
  } else if (ev.triggers.length || item.condition === 'broken' || item.condition === 'damaged') {
    ev.state = 'attention';
    ev.stateLabel = 'يحتاج انتباهك';
  } else {
    ev.state = 'regular';
    ev.stateLabel = 'منتظم';
  }
  return ev;
}

export const notificationKey = (n) => `${n.type}|${n.due_date}`;

/** التنبيهات المرغوب وجودها الآن لغرض واحد (بصيغة سجلات قاعدة البيانات). */
export function desiredNotifications(item, settings, now = new Date()) {
  return evaluateItem(item, settings, now).triggers.map((t) => ({
    item_id: item.id,
    type: t.type,
    due_date: t.dueDate,
    title: t.title,
    reason: t.reason,
    suggestion: t.suggestion
  }));
}

/**
 * خطة المزامنة لمنع التكرار:
 * - يُنشأ التنبيه مرة واحدة فقط لكل (غرض، نوع، موعد استحقاق) — حتى لو أغلقه المستخدم لا يعود.
 * - أي تنبيه مفتوح لم يعد مستحقًا (مثلًا بعد تسجيل استخدام) يُغلق تلقائيًا بسبب resolved.
 */
export function planNotificationSync(existingForItem, desired) {
  const existingKeys = new Set(existingForItem.map(notificationKey));
  const desiredKeys = new Set(desired.map(notificationKey));
  return {
    toInsert: desired.filter((d) => !existingKeys.has(notificationKey(d))),
    toClose: existingForItem.filter((n) => n.status !== 'closed' && !desiredKeys.has(notificationKey(n))).map((n) => n.id)
  };
}

/** التعديلات التي يُحدثها قرار الاستدامة على الغرض. */
export function actionEffects(actionType, now = new Date()) {
  switch (actionType) {
    case 'reused':
      return { patch: { last_used_at: now.toISOString() }, logUsage: true };
    case 'repaired':
      return { patch: { condition: 'good' }, logUsage: false };
    case 'replaced':
      return { patch: { purchase_date: todayISO(now), condition: 'good', last_used_at: now.toISOString() }, logUsage: true };
    case 'gifted':
    case 'donated':
    case 'disposed':
      return { patch: { status: actionType }, logUsage: false };
    case 'kept':
    default:
      // «احتفظت به»: يغلق تنبيه قلة الاستخدام الحالي فقط، ولن يتكرر حتى يتغير موعد استحقاقه.
      return { patch: {}, logUsage: false, closeTypes: ['unused'] };
  }
}
