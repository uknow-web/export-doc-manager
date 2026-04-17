// ============================================================================
// Sales Confirmation renderer.
// Takes (case, seller, buyer, doc) and produces an HTMLElement ready to print.
// ============================================================================

import { formatMoney, formatDateLong, escapeHtml, bulletize } from '../util.js';
import { getLogo, getSignerName, getSignerTitle, getExtraNote } from './template.js';

export function renderSalesConfirmation({ caseRow, seller, buyer, doc }) {
  const root = document.createElement('div');
  root.className = 'doc-sheet doc-sheet--sales-confirmation';

  const h = escapeHtml;
  const amount = caseRow.amount_jpy ? `¥${formatMoney(caseRow.amount_jpy)}` : '';
  const qty = caseRow.qty ?? 1;
  const docDate = doc?.doc_date || caseRow.invoice_date || '';
  const refNo = doc?.doc_ref_no || caseRow.invoice_ref_no || '';
  const dueDate = doc?.payment_due_date || caseRow.payment_due_date || '';
  const terms = doc?.terms_condition || 'CASH TERM';
  const atten = doc?.atten_text || buyer?.attn_name
    ? (doc?.atten_text || [buyer?.attn_name, buyer?.attn_tel].filter(Boolean).join(' '))
    : '';

  const logo = getLogo();
  root.innerHTML = `
    <header class="doc-company">
      ${logo ? `<img src="${h(logo)}" class="doc-company__logo" alt="">` : ''}
      <h1 class="doc-company__name">${h(seller?.company_name || '')}</h1>
      <p class="doc-company__address">${h(seller?.address || '')}</p>
      <p class="doc-company__address">
        ${seller?.tel ? `TEL: ${h(seller.tel)}` : ''}
        ${seller?.email ? `email: ${h(seller.email)}` : ''}
      </p>
    </header>

    <div class="doc-title">SALES CONFIRMATION</div>

    <div class="doc-topinfo">
      <dl class="doc-topinfo__party">
        <dt>Sold to:</dt>
        <dd>
          <div><strong>${h(buyer?.company_name || '')}</strong></div>
          <div>${h(buyer?.address || '').replace(/\n/g, '<br>')}</div>
        </dd>
      </dl>
      <dl class="doc-topinfo__meta">
        <dt>Date</dt>              <dd>${h(formatDateLong(docDate))}</dd>
        <dt>Invoice Ref No.</dt>   <dd>${h(refNo)}</dd>
        <dt>Payment due date</dt>  <dd>${h(formatDateLong(dueDate))}</dd>
      </dl>
    </div>

    ${atten ? `
    <dl class="doc-atten">
      <dt>Atten to:</dt>
      <dd>${h(atten)}</dd>
    </dl>` : ''}

    <table class="doc-items">
      <thead>
        <tr>
          <th class="doc-items__item">Item</th>
          <th>Description</th>
          <th class="doc-items__qty">Qty</th>
          <th class="doc-items__amount">CIF Amount JPY</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="doc-items__item">${h(caseRow.case_code || '')}</td>
          <td>${renderVehicleCell(caseRow)}</td>
          <td class="doc-items__qty">${h(String(qty))}</td>
          <td class="doc-items__amount">${amount}</td>
        </tr>
        <tr>
          <td colspan="3" class="doc-items__total-label">TOTAL AMOUNT</td>
          <td class="doc-items__total-amount">${amount}</td>
        </tr>
      </tbody>
    </table>

    <div class="doc-block">
      <div class="doc-block__head">SHIPMENT CONDITION</div>
      <div class="doc-block__body">
        <dl class="doc-kv">
          <dt>OCEAN VESSEL</dt> <dd>${h(joinVessel(caseRow))}</dd>
          <dt>Port of Loading</dt>     <dd>${h(caseRow.port_of_loading || '')}</dd>
          <dt>ETD</dt> <dd>${h(formatDateLong(caseRow.etd))}</dd>
          <dt>Port of discharging</dt> <dd>${h(caseRow.port_of_discharge || '')}</dd>
          <dt>ETA</dt> <dd>${h(formatDateLong(caseRow.eta))}</dd>
          <dt>Type of service</dt>     <dd>${h(caseRow.type_of_service || '')}</dd>
        </dl>
      </div>
    </div>

    <div class="doc-block doc-terms">
      <div class="doc-block__head">
        <span>Terms and Conditions</span>
        <span>${h(terms)}</span>
      </div>
      <div class="doc-block__body">
        <ol>
          <li>Vehicles are sold on 'as is where is' without any warranty unless where stated.</li>
          <li>This invoice shall be stamped with Buyer's official stamp. Buyer's signatory is deemed to have authority by Buyer to order the vehicles on behalf of Buyer.</li>
          <li>Full payment shall be made BEFORE shipment and any extension of time to pay given to the Buyer shall be in writing and shall not amount to a waiver of ${h(seller?.company_name || 'Seller')}'s rights.</li>
          <li>The Original Bill of Lading shall be couriered to the Buyer within 5 working days from receipt of purchase price in cleared funds.</li>
          <li>The Vehicle shall be deemed to be delivered upon arrival at the port of destination and the Buyer shall bear all port charges or penalties. If the Vehicle is seized by the authorities at the port of destination for any reason whatsoever, the Buyer shall be responsible for the full purchase price of the Vehicle to ${h(seller?.company_name || 'Seller')}.</li>
          <li>In the event of cancellation by Buyer, Buyer agrees to pay to ${h(seller?.company_name || 'Seller')} a sum equivalent to 20% of the purchase price being agreed compensation of estimated expenses incurred and estimated loss of profits. No cancellation is allowed after the Vehicle arrives at the port of destination.</li>
        </ol>
      </div>
    </div>

    ${renderBankBlock(seller)}

    ${renderExtraNote('sales_confirmation')}

    <div class="doc-signatures">
      <div class="doc-sig__line">
        <div class="doc-sig__name">${h(getSignerName())}</div>
        <div class="doc-sig__title">(${h(getSignerTitle())})</div>
      </div>
      <div class="doc-sig__line">
        <div class="doc-sig__name">&nbsp;</div>
        <div class="doc-sig__title">Buyer signature and chop</div>
      </div>
    </div>
  `;
  return root;
}

function renderExtraNote(docType) {
  const n = getExtraNote(docType);
  if (!n || !n.trim()) return '';
  return `<div class="doc-block"><div class="doc-block__body">${escapeHtml(n).replace(/\n/g, '<br>')}</div></div>`;
}

// ---- helpers --------------------------------------------------------------

function renderVehicleCell(c) {
  const h = escapeHtml;
  const rows = [
    ['PURCHASE FOR', c.description || ''],
    ['', `${c.maker || ''} ${c.model_name || ''}`.trim()],
    ['YEAR',            c.year_month || ''],
    ['MODEL CODE',      c.model_code || ''],
    ['CHASSIS NO.',     c.chassis_no || ''],
    ['ENGINE CAPACITY', c.engine_capacity || ''],
    ['MILEAGE',         c.mileage || ''],
    ['EXTERIOR COLOR',  c.exterior_color || ''],
    ['FUEL',            c.fuel || ''],
    ['AUCTION GRADE',   c.auction_grade || ''],
  ].filter(([, v]) => v !== '');

  const specItems = bulletize(c.specification);
  const remarkItems = bulletize(c.remark);

  let html = '<dl class="veh-spec">';
  for (const [k, v] of rows) {
    html += `<dt>${h(k)}</dt><dd>${h(v)}</dd>`;
  }
  html += '</dl>';

  if (specItems.length) {
    html += '<div class="veh-section-title">SPECIFICATION &amp; REMARK</div>';
    html += '<ul class="veh-bullets">';
    for (const item of specItems) html += `<li>${h(item)}</li>`;
    html += '</ul>';
  }
  if (remarkItems.length) {
    html += '<div class="veh-section-title">REMARK</div>';
    html += '<ul class="veh-bullets">';
    for (const item of remarkItems) html += `<li>${h(item)}</li>`;
    html += '</ul>';
  }
  return html;
}

function joinVessel(c) {
  return [c.vessel_name, c.voyage_no].filter(Boolean).join(' ');
}

function renderBankBlock(seller) {
  if (!seller) return '';
  const rows = [
    ['Bank name',     seller.bank_name],
    ['Branch Name',   seller.bank_branch],
    ['Bank Address',  seller.bank_address],
    ['Branch Code',   seller.bank_branch_code],
    ['Account No.',   seller.bank_account_no],
    ['Account Name',  seller.bank_account_name],
    ['Swift Code',    seller.bank_swift],
  ].filter(([, v]) => v);
  if (!rows.length) return '';
  const h = escapeHtml;
  return `
    <div class="doc-block doc-bank">
      <div class="doc-block__head">Bank Details: Japanese Yen Account</div>
      <div class="doc-block__body">
        <dl class="doc-kv">
          ${rows.map(([k, v]) => `<dt>${h(k)}</dt><dd>${h(v)}</dd>`).join('')}
        </dl>
      </div>
    </div>
  `;
}

function deriveSignerName(seller) {
  if (!seller) return '';
  // Placeholder — could be extended with a dedicated column.
  return 'MAKOTO Kubota';
}
