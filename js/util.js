// ============================================================================
// Shared formatting / helper utilities used across document renderers.
// ============================================================================

export function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatMoney(n) {
  if (n == null || n === '') return '';
  const num = typeof n === 'number' ? n : parseInt(String(n).replace(/[^\d-]/g, ''), 10);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString('en-US');
}

// ISO "2025-09-18" → "18th September 2025". Pass-through for already-formatted strings.
export function formatDateLong(value) {
  if (!value) return '';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return value;
  const [, y, mo, d] = m;
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const day = parseInt(d, 10);
  return `${day}${ordinalSuffix(day)} ${months[parseInt(mo, 10) - 1]} ${y}`;
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// Split a textarea value by lines; strip leading bullet markers.
export function bulletize(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n/)
    .map(line => line.replace(/^[\s•\-・]+/, '').trim())
    .filter(Boolean);
}

// Serialize a <form> into a plain object (handles multi-value inputs minimally).
export function formToObject(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') { out[el.name] = el.checked ? 1 : 0; continue; }
    if (el.type === 'number')   { out[el.name] = el.value === '' ? null : Number(el.value); continue; }
    out[el.name] = el.value;
  }
  return out;
}

export function fillForm(form, data) {
  if (!data) { form.reset(); return; }
  for (const el of form.elements) {
    if (!el.name) continue;
    const v = data[el.name];
    if (v == null) { el.value = ''; continue; }
    el.value = String(v);
  }
}
