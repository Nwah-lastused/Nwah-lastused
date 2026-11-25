// Unified add / edit item form.
import { initPage, $, esc, t, toast, showFieldErrors, withBusy, params, loadingState, errorState, todayISO, toDateISO, daysLabel, setTitle } from './app.js';
import { CATEGORIES, CONDITIONS, IMAGE_RULES } from './shared/constants.js';
import { validateItem } from './shared/validation.js';

const id = params().get('id');
const { adapter } = await initPage({ active: 'items', titleKey: id ? 'title.editItem' : 'title.addItem' });
const form = $('#item-form');
const today = todayISO();
const MAX_SIDE = 1280;
const MAX_RAW_BYTES = 10 * 1024 * 1024;

$('#category').innerHTML = CATEGORIES.map((c) => `<option value="${c.value}">${c.icon} ${esc(t(`cat.${c.value}`))}</option>`).join('');
$('#condition').innerHTML = CONDITIONS.map((v) => `<option value="${v}">${esc(t(`cond.${v}`))}</option>`).join('');
['purchase_date', 'last_used_at'].forEach((name) => (form.elements[name].max = today));

let imageData = null;
let removeImage = false;
let hadImage = false;
let original = null;

function syncVisibility() {
  $('#other-wrap').classList.toggle('hidden', form.elements.category.value !== 'other');
  const rep = form.elements.needs_replacement.checked;
  $('#rep-wrap').classList.toggle('hidden', !rep);
  form.elements.replacement_interval.required = rep;
}
form.elements.category.addEventListener('change', syncVisibility);
form.elements.needs_replacement.addEventListener('change', syncVisibility);
form.elements.purchase_date.addEventListener('change', () => {
  form.elements.expiry_date.min = form.elements.purchase_date.value || '';
  form.elements.last_used_at.min = form.elements.purchase_date.value || '';
});

try {
  const { settings } = await adapter.settings.get();
  $('#alert-hint').textContent = t('form.alertHint', {
    expiry: daysLabel(settings.expiryAlertDays),
    replacement: daysLabel(settings.replacementAlertDays)
  });
  $('#unused-hint').textContent = t('form.unusedHint', { days: daysLabel(settings.unusedDays) });
} catch {
  /* hints are optional */
}

function setPreview(src) {
  $('#img-preview').innerHTML = src ? `<img src="${esc(src)}" alt="">` : '🖼️';
  $('#remove-image').classList.toggle('hidden', !src);
}

/** Downscales an image in the browser before upload. */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t('form.imgRead')));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(t('form.imgInvalid')));
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        let out = canvas.toDataURL('image/webp', 0.82);
        if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', 0.82);
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

form.elements.image.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  showFieldErrors(form, {});
  if (!file) return;
  const reject = (message) => {
    imageData = null;
    e.target.value = '';
    showFieldErrors(form, { image: message });
  };
  if (!IMAGE_RULES.mimeTypes.includes(file.type)) return reject(t('v.imageTypes'));
  if (file.size > MAX_RAW_BYTES) return reject(t('form.imgRawTooBig'));
  try {
    imageData = await compressImage(file);
    if (imageData.length * 0.75 > IMAGE_RULES.maxBytes) throw new Error(t('form.imgTooBig'));
    removeImage = false;
    setPreview(imageData);
  } catch (err) {
    reject(err.message);
  }
});

$('#remove-image').addEventListener('click', () => {
  imageData = null;
  removeImage = hadImage;
  form.elements.image.value = '';
  setPreview(null);
});

function fill(item) {
  const f = form.elements;
  f.name.value = item.name || '';
  f.category.value = item.category || 'other';
  f.category_other.value = item.category_other || '';
  f.condition.value = item.condition || 'good';
  f.purchase_date.value = item.purchase_date || '';
  f.expiry_date.value = item.expiry_date || '';
  f.last_used_at.value = toDateISO(item.last_used_at) || '';
  f.needs_replacement.checked = Boolean(item.needs_replacement);
  f.replacement_interval.value = item.replacement_interval ?? '';
  f.replacement_unit.value = item.replacement_unit || 'days';
  f.alert_days_before.value = item.alert_days_before ?? '';
  f.unused_after_days.value = item.unused_after_days ?? '';
  f.notes.value = item.notes || '';
  hadImage = Boolean(item.image_url);
  setPreview(item.image_url);
}

if (id) {
  $('#form-title').textContent = t('form.editTitle');
  $('#cancel-link').href = `item.html?id=${encodeURIComponent(id)}`;
  $('#form-host').insertAdjacentHTML('afterbegin', `<div id="form-loading">${loadingState()}</div>`);
  try {
    original = (await adapter.items.get(id)).item;
    setTitle(original.name);
    fill(original);
    form.classList.remove('hidden');
    $('#form-loading').remove();
  } catch (e) {
    $('#form-loading').innerHTML = errorState(e);
  }
} else {
  form.elements.purchase_date.value = today;
  form.elements.last_used_at.value = today;
  form.classList.remove('hidden');
}
syncVisibility();

function collect() {
  const f = form.elements;
  const data = {
    name: f.name.value,
    category: f.category.value,
    category_other: f.category_other.value,
    condition: f.condition.value,
    purchase_date: f.purchase_date.value,
    expiry_date: f.expiry_date.value,
    needs_replacement: f.needs_replacement.checked,
    replacement_interval: f.replacement_interval.value,
    replacement_unit: f.replacement_unit.value,
    alert_days_before: f.alert_days_before.value,
    unused_after_days: f.unused_after_days.value,
    notes: f.notes.value
  };
  // Keep the exact original timestamp when the date was not changed.
  const lastUsed = f.last_used_at.value;
  data.last_used_at = original && lastUsed === (toDateISO(original.last_used_at) || '') ? original.last_used_at : lastUsed;
  if (original) data.status = original.status;
  return data;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('#form-error');
  errBox.classList.add('hidden');
  const data = collect();
  const check = validateItem(data);
  showFieldErrors(form, check.errors);
  if (!check.ok) {
    errBox.textContent = t('form.fixFields');
    errBox.classList.remove('hidden');
    return;
  }
  await withBusy($('#save-btn'), async () => {
    try {
      const saved = id
        ? await adapter.items.update(id, data, { image: imageData || undefined, removeImage })
        : await adapter.items.create(data, { image: imageData || undefined });
      toast(t(id ? 'form.saved' : 'form.added'));
      location.href = `item.html?id=${encodeURIComponent(saved.id)}`;
    } catch (err) {
      if (err.details) showFieldErrors(form, err.details);
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    }
  });
});
