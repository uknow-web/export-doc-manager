// ============================================================================
// Public shop (Malaysian customers) — standalone module.
// Reads ONLY the anon-safe views (shop_catalog / shop_listing_photos) and
// writes ONLY shop_inquiries. Never touches admin tables directly.
// ============================================================================
import { getCloudConfig } from './cloud-config.js';

const cfg = getCloudConfig();
const sb = (cfg.mode !== 'local' && window.supabase?.createClient)
  ? window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } })
  : null;

let LISTINGS = [];          // cached catalog rows
let FILTER = { cat: 'all', q: '' };
let CURRENT = null;         // listing shown in detail view

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function priceLabel(row) {
  if (row.price_amount == null) return 'Ask for price';
  const n = Number(row.price_amount).toLocaleString('en-US');
  const sym = { USD: '$', JPY: '¥', MYR: 'RM ' }[row.price_currency] || '';
  return `${sym}${n}`;
}

function listingTitle(row) {
  if (row.title_en) return row.title_en;
  const year = (row.year_month || '').split('/').pop()?.trim() || '';
  return [year, row.maker, row.model_name].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
async function loadCatalog() {
  if (!sb) {
    $('shop-grid').innerHTML = '<div class="shop-empty">Shop is not available right now. Please try again later.</div>';
    return;
  }
  const { data, error } = await sb
    .from('shop_catalog')
    .select('id,status,title_en,price_amount,price_currency,price_note_en,published_at,vehicle_category,maker,model_name,year_month,mileage,exterior_color,fuel,engine_capacity,cover_photo')
    .order('published_at', { ascending: false, nullsFirst: false });
  if (error) {
    $('shop-grid').innerHTML = `<div class="shop-empty">Failed to load vehicles.<br><small>${esc(error.message)}</small></div>`;
    return;
  }
  LISTINGS = data || [];
  renderGrid();
  routeFromHash(); // 直接 #v123 で開かれた場合に対応
}

function renderGrid() {
  const grid = $('shop-grid');
  const rows = LISTINGS.filter(r => {
    if (FILTER.cat !== 'all' && (r.vehicle_category || 'car') !== FILTER.cat) return false;
    if (FILTER.q) {
      const hay = `${r.maker} ${r.model_name} ${r.title_en || ''}`.toLowerCase();
      if (!hay.includes(FILTER.q)) return false;
    }
    return true;
  });
  if (!rows.length) {
    grid.innerHTML = `<div class="shop-empty" style="grid-column:1/-1">
      <div class="shop-empty__icon">🚗</div>
      No vehicles match your search right now.<br>
      New stock is added regularly — please check back soon.</div>`;
    return;
  }
  grid.innerHTML = rows.map(r => {
    const ribbon = r.status === 'reserved'
      ? '<span class="shop-card__ribbon shop-card__ribbon--reserved">RESERVED</span>'
      : r.status === 'sold'
        ? '<span class="shop-card__ribbon shop-card__ribbon--sold">SOLD</span>' : '';
    const photo = r.cover_photo
      ? `<img src="${r.cover_photo}" alt="${esc(listingTitle(r))}" loading="lazy">`
      : '<div class="shop-card__photo--empty" aria-hidden="true">🚗</div>';
    const meta = [r.year_month, r.mileage, r.exterior_color, r.fuel]
      .filter(Boolean).map(esc).join(' ・ ');
    return `<article class="shop-card" tabindex="0" role="link" data-listing="${r.id}"
              aria-label="${esc(listingTitle(r))}">
      <div class="shop-card__photo">${photo}${ribbon}</div>
      <div class="shop-card__body">
        <h2 class="shop-card__title">${esc(listingTitle(r))}</h2>
        <div class="shop-card__meta">${meta}</div>
        <div class="shop-card__price">${esc(priceLabel(r))}
          ${r.price_note_en ? `<small>${esc(r.price_note_en)}</small>` : ''}</div>
      </div>
    </article>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
async function openDetail(id) {
  const row = LISTINGS.find(r => r.id === id);
  if (!row) return;
  CURRENT = row;
  history.replaceState(null, '', '#v' + id);

  $('shop-catalog-view').classList.add('hidden');
  $('shop-hero').classList.add('hidden');
  $('shop-detail-view').classList.remove('hidden');
  window.scrollTo({ top: 0 });

  const statusLine = row.status === 'reserved'
    ? '<div class="shop-status-line shop-status-line--reserved">⏳ RESERVED — accepting backup applications</div>'
    : row.status === 'sold'
      ? '<div class="shop-status-line shop-status-line--sold">SOLD</div>' : '';

  const specs = [
    ['Maker', row.maker], ['Model', row.model_name],
    ['Year / Month', row.year_month], ['Mileage', row.mileage],
    ['Color', row.exterior_color], ['Fuel', row.fuel],
    ['Engine', row.engine_capacity],
  ].filter(([, v]) => v);

  $('shop-detail-panel').innerHTML = `
    ${statusLine}
    <h1>${esc(listingTitle(row))}</h1>
    <div class="price">${esc(priceLabel(row))}</div>
    <div class="price-note">${esc(row.price_note_en || 'CIF price — shipping & insurance to Port Klang included')}</div>
    <table class="shop-specs">${specs.map(([k, v]) =>
      `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    ${row.description_en ? `<div class="shop-desc">${esc(row.description_en)}</div>` : ''}
    ${row.specification ? `<div class="shop-desc">${esc(row.specification)}</div>` : ''}
    <button type="button" class="shop-cta" id="btn-apply"
      ${row.status === 'sold' ? 'disabled' : ''}>
      ${row.status === 'sold' ? 'Sold Out' : row.status === 'reserved' ? 'Apply as Backup Buyer' : 'Apply to Purchase'}
    </button>
    <button type="button" class="shop-cta shop-cta--secondary" id="btn-question">Ask a Question</button>
  `;
  $('btn-apply')?.addEventListener('click', () => openInquiry('purchase'));
  $('btn-question')?.addEventListener('click', () => openInquiry('question'));

  // Photos
  const main = $('shop-photo-main');
  const thumbs = $('shop-photo-thumbs');
  main.src = row.cover_photo || '';
  thumbs.innerHTML = '';
  if (sb) {
    const { data: photos } = await sb
      .from('shop_listing_photos')
      .select('id,data_url,caption,sort_order')
      .eq('listing_id', id)
      .order('sort_order', { ascending: true });
    if (photos?.length) {
      main.src = photos[0].data_url;
      thumbs.innerHTML = photos.map((p, i) =>
        `<img src="${p.data_url}" alt="Photo ${i + 1}" class="${i === 0 ? 'is-active' : ''}" data-photo="${i}">`
      ).join('');
      thumbs.querySelectorAll('img').forEach(img => {
        img.addEventListener('click', () => {
          main.src = photos[Number(img.dataset.photo)].data_url;
          thumbs.querySelectorAll('img').forEach(t => t.classList.toggle('is-active', t === img));
        });
      });
    }
  }
}

function closeDetail() {
  CURRENT = null;
  history.replaceState(null, '', location.pathname);
  $('shop-detail-view').classList.add('hidden');
  $('shop-catalog-view').classList.remove('hidden');
  $('shop-hero').classList.remove('hidden');
}

function routeFromHash() {
  const m = location.hash.match(/^#v(\d+)$/);
  if (m) openDetail(Number(m[1]));
}

// ---------------------------------------------------------------------------
// Inquiry modal
// ---------------------------------------------------------------------------
function openInquiry(type) {
  if (!CURRENT) return;
  $('shop-inquiry-title').textContent =
    type === 'purchase' ? 'Purchase Application' : 'Ask a Question';
  $('shop-inquiry-sub').textContent = listingTitle(CURRENT);
  $('shop-inquiry-form').dataset.type = type;
  $('shop-inquiry-form').classList.remove('hidden');
  $('shop-inquiry-done').classList.add('hidden');
  $('shop-inquiry-error').classList.add('hidden');
  $('shop-inquiry-modal').classList.remove('hidden');
  $('shop-inquiry-form').elements.customer_name.focus();
}

function closeInquiry() {
  $('shop-inquiry-modal').classList.add('hidden');
}

async function submitInquiry(e) {
  e.preventDefault();
  const form = e.target;
  const err = $('shop-inquiry-error');
  err.classList.add('hidden');
  // Honeypot: 入力されていたらbot — 黙って成功画面
  if (form.elements.company_website.value) {
    form.classList.add('hidden');
    $('shop-inquiry-done').classList.remove('hidden');
    return;
  }
  const btn = $('shop-inquiry-submit');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const { error } = await sb.from('shop_inquiries').insert({
      listing_id: CURRENT?.id ?? null,
      inquiry_type: form.dataset.type || 'purchase',
      customer_name: form.elements.customer_name.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim() || null,
      country: form.elements.country.value,
      message: form.elements.message.value.trim() || null,
    });
    if (error) throw error;
    form.reset();
    form.classList.add('hidden');
    $('shop-inquiry-done').classList.remove('hidden');
  } catch (e2) {
    err.textContent = 'Failed to send. Please try again, or email us directly. (' + e2.message + ')';
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Application';
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
document.querySelectorAll('#shop-filters .shop-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#shop-filters .shop-chip').forEach(c =>
      c.classList.toggle('shop-chip--active', c === chip));
    FILTER.cat = chip.dataset.cat;
    renderGrid();
  });
});
$('shop-search').addEventListener('input', (e) => {
  FILTER.q = e.target.value.trim().toLowerCase();
  renderGrid();
});
$('shop-grid').addEventListener('click', (e) => {
  const card = e.target.closest('[data-listing]');
  if (card) openDetail(Number(card.dataset.listing));
});
$('shop-grid').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const card = e.target.closest('[data-listing]');
    if (card) openDetail(Number(card.dataset.listing));
  }
});
$('shop-back').addEventListener('click', closeDetail);
window.addEventListener('hashchange', () => {
  if (!location.hash) closeDetail(); else routeFromHash();
});
$('shop-inquiry-form').addEventListener('submit', submitInquiry);
document.querySelectorAll('[data-close-inquiry]').forEach(el =>
  el.addEventListener('click', closeInquiry));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeInquiry();
});

loadCatalog();
