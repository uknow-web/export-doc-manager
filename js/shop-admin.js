// ============================================================================
// ショップ管理（管理画面側）— 掲載管理 + 購入申込への対応
// ----------------------------------------------------------------------------
// クラウドモード専用。shop_listings / shop_inquiries は sql.js ミラーには
// 置かず、Supabase を直接読み書きする（公開サイトと同じソースを見るため）。
// 依存（toast / saveParty / openInviteDialog 等）は app.js から注入される。
// ============================================================================
import { getClient } from './cloud-db.js';
import { escapeHtml as esc } from './util.js';

let deps = null; // { toast, saveParty, openInviteDialog, canEdit, renderParties }

export function setupShopAdmin(d) {
  deps = d;
  const host = document.getElementById('tab-shop');
  if (!host) return;
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  document.getElementById('form-shop-listing')?.addEventListener('submit', onSaveListing);
  document.getElementById('btn-shop-listing-cancel')?.addEventListener('click', closeListingEditor);
}

const CURRENCY_SYMBOL = { USD: '$', JPY: '¥', MYR: 'RM ' };
const STATUS_LABEL = {
  draft: '下書き', published: '公開中', reserved: '商談中', sold: '成約済み',
};
const STATUS_BADGE = {
  draft: 'badge--gray', published: 'badge--green', reserved: 'badge--amber', sold: 'badge--gray',
};
const INQUIRY_STATUS_LABEL = {
  new: '新規', in_progress: '対応中', converted: 'Buyer登録済み', closed: '完了',
};

let LISTINGS = [];
let CASES = [];
let INQUIRIES = [];

// ---------------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------------
export async function renderShopAdmin() {
  const sb = getClient();
  if (!sb) {
    document.getElementById('shop-admin-listings').innerHTML =
      '<p class="hint">ショップ管理はクラウドモードでのみ利用できます。</p>';
    return;
  }
  await Promise.all([loadListings(sb), loadInquiries(sb)]);
  renderListingsTable();
  renderInquiriesTable();
}

async function loadListings(sb) {
  const [l, c] = await Promise.all([
    sb.from('shop_listings').select('*').order('updated_at', { ascending: false }),
    sb.from('cases').select('id,case_code,maker,model_name,year_month,vehicle_category,specification').order('id', { ascending: false }),
  ]);
  if (l.error) { deps.toast('掲載一覧の取得に失敗: ' + l.error.message, 'error'); return; }
  if (c.error) { deps.toast('案件一覧の取得に失敗: ' + c.error.message, 'error'); return; }
  LISTINGS = l.data || [];
  CASES = c.data || [];
}

async function loadInquiries(sb) {
  const { data, error } = await sb
    .from('shop_inquiries')
    .select('*, shop_listings(title_en, case_id)')
    .order('created_at', { ascending: false });
  if (error) { deps.toast('申込一覧の取得に失敗: ' + error.message, 'error'); return; }
  INQUIRIES = data || [];
}

function vehicleLabel(c) {
  if (!c) return '（案件なし）';
  return [c.case_code, c.maker, c.model_name, c.year_month].filter(Boolean).join(' / ');
}

function renderListingsTable() {
  const host = document.getElementById('shop-admin-listings');
  const listedIds = new Set(LISTINGS.map(l => l.case_id));
  const published = LISTINGS.filter(l => l.status === 'published').length;

  const listingRows = LISTINGS.map(l => {
    const c = CASES.find(x => x.id === l.case_id);
    const price = l.price_amount != null
      ? (CURRENCY_SYMBOL[l.price_currency] || '') + Number(l.price_amount).toLocaleString()
      : '—';
    return `<tr>
      <td><span class="badge ${STATUS_BADGE[l.status] || 'badge--gray'}">${STATUS_LABEL[l.status] || l.status}</span></td>
      <td>${esc(vehicleLabel(c))}</td>
      <td>${esc(l.title_en || '')}</td>
      <td style="text-align:right">${esc(price)}</td>
      <td>
        <button type="button" class="btn" data-shop-edit="${l.id}">編集</button>
        <a class="btn btn--ghost" href="/shop#v${l.id}" target="_blank" rel="noopener">プレビュー</a>
      </td>
    </tr>`;
  }).join('');

  const unlisted = CASES.filter(c => !listedIds.has(c.id));
  const options = unlisted.map(c =>
    `<option value="${c.id}">${esc(vehicleLabel(c))}</option>`).join('');

  host.innerHTML = `
    <div class="stat-row" style="margin-bottom:12px">
      <div class="stat-row__item"><span class="stat-row__label">掲載数</span>
        <span class="stat-row__value">${LISTINGS.length}</span></div>
      <div class="stat-row__item"><span class="stat-row__label">公開中</span>
        <span class="stat-row__value">${published}</span></div>
      <div class="stat-row__item"><span class="stat-row__label">未掲載の案件</span>
        <span class="stat-row__value">${unlisted.length}</span></div>
    </div>
    <div class="toolbar">
      <select id="shop-new-case" class="input" style="max-width:380px">
        <option value="">掲載する案件を選択…</option>${options}
      </select>
      <button type="button" class="btn btn--primary" data-shop-new>+ この案件を掲載</button>
      <a class="btn btn--ghost" href="/shop" target="_blank" rel="noopener">🛒 公開サイトを開く</a>
    </div>
    ${LISTINGS.length ? `<table class="data-table">
      <thead><tr><th style="width:90px">状態</th><th>案件</th><th>掲載タイトル</th>
        <th style="text-align:right">価格</th><th style="width:170px">アクション</th></tr></thead>
      <tbody>${listingRows}</tbody>
    </table>` : '<p class="hint">まだ掲載がありません。上のセレクトから案件を選んで掲載してください。</p>'}
  `;
}

function renderInquiriesTable() {
  const host = document.getElementById('shop-admin-inquiries');
  const newCount = INQUIRIES.filter(i => i.status === 'new').length;
  document.getElementById('shop-inquiry-count').textContent =
    newCount ? `（新規 ${newCount} 件）` : '';

  if (!INQUIRIES.length) {
    host.innerHTML = '<p class="hint">申込・問い合わせはまだありません。</p>';
    return;
  }
  host.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>受信日時</th><th>種別</th><th>車両</th><th>顧客</th><th>連絡先</th>
      <th>メッセージ</th><th style="width:130px">状態</th><th style="width:200px">アクション</th>
    </tr></thead>
    <tbody>${INQUIRIES.map(i => {
      const dt = new Date(i.created_at).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });
      const typeBadge = i.inquiry_type === 'purchase'
        ? '<span class="badge badge--blue">購入申込</span>'
        : '<span class="badge badge--gray">質問</span>';
      const statusSel = `<select class="input" data-shop-inq-status="${i.id}">
        ${Object.entries(INQUIRY_STATUS_LABEL).map(([k, v]) =>
          `<option value="${k}" ${i.status === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>`;
      const msg = i.message
        ? `<span title="${esc(i.message)}">${esc(i.message.length > 40 ? i.message.slice(0, 40) + '…' : i.message)}</span>`
        : '—';
      const convertBtn = i.party_id
        ? '<span class="hint" style="margin:0">✅ 登録済み</span>'
        : `<button type="button" class="btn btn--primary" data-shop-convert="${i.id}">Buyer登録+招待</button>`;
      return `<tr ${i.status === 'new' ? 'style="background:#eff6ff"' : ''}>
        <td>${esc(dt)}</td>
        <td>${typeBadge}</td>
        <td>${esc(i.shop_listings?.title_en || '#' + (i.listing_id ?? '—'))}</td>
        <td>${esc(i.customer_name)}<br><small style="color:var(--gray-500)">${esc(i.country || '')}</small></td>
        <td><a href="mailto:${esc(i.email)}">${esc(i.email)}</a>${i.phone ? '<br>' + esc(i.phone) : ''}</td>
        <td>${msg}</td>
        <td>${statusSel}</td>
        <td>${convertBtn}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

// ---------------------------------------------------------------------------
// 掲載の作成・編集
// ---------------------------------------------------------------------------
function openListingEditor(listing, caseRow) {
  const panel = document.getElementById('shop-listing-editor');
  const form = document.getElementById('form-shop-listing');
  panel.classList.remove('hidden');
  document.getElementById('shop-listing-editor-title').textContent =
    listing?.id ? `掲載を編集 — ${vehicleLabel(caseRow)}` : `新規掲載 — ${vehicleLabel(caseRow)}`;
  form.elements.listing_id.value = listing?.id || '';
  form.elements.case_id.value = listing?.case_id || caseRow.id;
  form.elements.status.value = listing?.status || 'draft';
  form.elements.title_en.value = listing?.title_en ||
    [(caseRow.year_month || '').split('/').pop()?.trim(), caseRow.maker, caseRow.model_name]
      .filter(Boolean).join(' ');
  form.elements.price_amount.value = listing?.price_amount ?? '';
  form.elements.price_currency.value = listing?.price_currency || 'USD';
  form.elements.price_note_en.value = listing?.price_note_en || 'CIF Port Klang';
  form.elements.description_en.value = listing?.description_en || '';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeListingEditor() {
  document.getElementById('shop-listing-editor').classList.add('hidden');
}

async function onSaveListing(e) {
  e.preventDefault();
  if (!deps.canEdit()) { deps.toast('この操作には編集権限が必要です', 'error'); return; }
  const sb = getClient();
  const form = e.target;
  const id = form.elements.listing_id.value ? Number(form.elements.listing_id.value) : null;
  const status = form.elements.status.value;
  const prev = id ? LISTINGS.find(l => l.id === id) : null;
  const row = {
    case_id: Number(form.elements.case_id.value),
    status,
    title_en: form.elements.title_en.value.trim() || null,
    price_amount: form.elements.price_amount.value ? Number(form.elements.price_amount.value) : null,
    price_currency: form.elements.price_currency.value,
    price_note_en: form.elements.price_note_en.value.trim() || null,
    description_en: form.elements.description_en.value.trim() || null,
    updated_at: new Date().toISOString(),
    // 初めて公開になった時刻を記録（並び順に使用）
    published_at: (status === 'published' && !prev?.published_at)
      ? new Date().toISOString()
      : prev?.published_at ?? null,
  };
  const q = id
    ? sb.from('shop_listings').update(row).eq('id', id)
    : sb.from('shop_listings').insert(row);
  const { error } = await q;
  if (error) { deps.toast('保存失敗: ' + error.message, 'error'); return; }
  deps.toast(status === 'published' ? '公開しました 🛒' : '保存しました', 'success');
  closeListingEditor();
  await renderShopAdmin();
}

// ---------------------------------------------------------------------------
// 申込 → Buyer 登録 → 招待
// ---------------------------------------------------------------------------
async function convertInquiry(inqId) {
  if (!deps.canEdit()) { deps.toast('この操作には編集権限が必要です', 'error'); return; }
  const i = INQUIRIES.find(x => x.id === inqId);
  if (!i) return;
  if (!confirm(`「${i.customer_name}」を Buyer として登録し、ポータル招待に進みますか？`)) return;
  try {
    // 1) Party 登録（write-through で cloud + ミラー両方に入る）
    const partyId = await deps.saveParty({
      role: 'buyer',
      company_name: i.customer_name,
      email: i.email,
      tel: i.phone || null,
      address: i.country || null,
    });
    // 2) 申込に紐付け
    const sb = getClient();
    const { error } = await sb.from('shop_inquiries')
      .update({ party_id: partyId, status: 'converted' }).eq('id', inqId);
    if (error) throw error;
    deps.renderParties?.();
    deps.toast(`Buyer「${i.customer_name}」を登録しました`, 'success');
    // 3) 既存の招待フローへ（メールはプリセット済み）
    await deps.openInviteDialog(partyId, 'buyer');
    await renderShopAdmin();
  } catch (e) {
    deps.toast('Buyer登録に失敗: ' + e.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// イベント
// ---------------------------------------------------------------------------
function onClick(e) {
  const editBtn = e.target.closest('[data-shop-edit]');
  if (editBtn) {
    const l = LISTINGS.find(x => x.id === Number(editBtn.dataset.shopEdit));
    if (l) openListingEditor(l, CASES.find(c => c.id === l.case_id));
    return;
  }
  if (e.target.closest('[data-shop-new]')) {
    const sel = document.getElementById('shop-new-case');
    const caseId = Number(sel?.value);
    if (!caseId) { deps.toast('掲載する案件を選択してください', 'error'); return; }
    openListingEditor(null, CASES.find(c => c.id === caseId));
    return;
  }
  const convBtn = e.target.closest('[data-shop-convert]');
  if (convBtn) convertInquiry(Number(convBtn.dataset.shopConvert));
}

async function onChange(e) {
  const sel = e.target.closest('[data-shop-inq-status]');
  if (!sel) return;
  if (!deps.canEdit()) { deps.toast('この操作には編集権限が必要です', 'error'); return; }
  const sb = getClient();
  const { error } = await sb.from('shop_inquiries')
    .update({ status: sel.value }).eq('id', Number(sel.dataset.shopInqStatus));
  if (error) deps.toast('更新失敗: ' + error.message, 'error');
  else deps.toast('ステータスを更新しました', 'success');
}
