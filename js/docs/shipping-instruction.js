// ============================================================================
// Shipping Instruction renderer.
// Matches the KMT template: single 4-column table where the left 2 columns
// carry party info (with section headers spanning both) and the right 2
// columns are a continuous stream of alternating label/value rows.
// ============================================================================

import { formatMoney, formatDateLong, escapeHtml } from '../util.js';
import { getLogo, getExtraNote } from './template.js';

export function renderShippingInstruction({ caseRow, seller, buyer, doc, notifyParty }) {
  const h = escapeHtml;
  const root = document.createElement('div');
  root.className = 'doc-sheet doc-sheet--si';

  const amount = caseRow.amount_jpy ? `¥${formatMoney(caseRow.amount_jpy)}` : '';
  const docDate = doc?.doc_date || caseRow.invoice_date || '';
  const refNo = doc?.doc_ref_no || caseRow.invoice_ref_no || '';

  // Right side is 11 label/value pairs, emitted in order.
  // Each pair produces a <tr class="si-r-label"> followed by <tr class="si-r-value">.
  const rightPairs = [
    ['Invoice No.',       refNo,                                 'Date',                formatDateLong(docDate)],
    ['Shipping Company',  caseRow.shipping_company,              'Booking No.',         caseRow.booking_no],
    ['Type of Service',   caseRow.type_of_service || 'RO/RO',    'Volume',              caseRow.volume],
    ['Freight',           caseRow.freight_term || 'PREPAID',     'Delivery Term',       caseRow.delivery_term || 'CIF'],
    ['Place of Recipt',   caseRow.place_of_receipt,              'Port of Loading',     caseRow.port_of_loading],
    ['Port of Discharge', caseRow.port_of_discharge,             'Place of Delivery',   caseRow.place_of_delivery],
    ['Place of Issue',    caseRow.place_of_issue,                'No. of Original B/L', caseRow.no_of_original_bl],
    ['Vessel Name',       caseRow.vessel_name,                   'Voyage No.',          caseRow.voyage_no],
    ['Local Vessel',      caseRow.local_vessel,                  'Voyage No.',          caseRow.local_voyage_no],
    ['ETD',               formatDateLong(caseRow.etd),           'Cut',                 formatDateLong(caseRow.cut_date)],
    ['Booked by',         caseRow.booked_by,                     'Forwarder',           caseRow.forwarder],
  ];
  // Flatten to 22 row-contents: [label1, label2, value1, value2, label1, label2, ...]
  const rightRows = [];
  for (const [l1, v1, l2, v2] of rightPairs) {
    rightRows.push({ isLabel: true,  c1: l1, c2: l2 });
    rightRows.push({ isLabel: false, c1: v1, c2: v2 });
  }

  // Left side: build a sequence of rows. Each row has a kind:
  //   'header'        — section header spanning both left cells
  //   'labeled'       — left label + left value
  //   'span'          — value only, spanning both left cells (used for notify party address)
  const leftRows = [];
  const pushHeader = (text) => leftRows.push({ kind: 'header', text });
  const pushLabeled = (label, value) => leftRows.push({ kind: 'labeled', label, value });
  const pushSpan = (text) => leftRows.push({ kind: 'span', text });

  // Emit an address across multiple rows, with the label only on the first row.
  const pushAddress = (label, address) => {
    const lines = String(address || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) { pushLabeled(label, ''); return; }
    pushLabeled(label, lines[0]);
    for (let i = 1; i < lines.length; i++) pushLabeled('', lines[i]);
  };

  // --- Shipper ---
  pushHeader('Shipper');
  pushLabeled('Company Name', seller?.company_name);
  pushAddress('Address',      seller?.address);
  pushLabeled('TEL:',         seller?.tel);
  pushLabeled('E-MAIL',       seller?.email);

  // --- Consignee ---
  pushHeader('Consignee');
  pushLabeled('Company Name', buyer?.company_name);
  pushAddress('Address',      buyer?.address);
  pushLabeled('TEL:',         buyer?.tel);
  pushLabeled('E-MAIL',       buyer?.email);

  // --- Notify Party (company + multi-line address, no sub-labels) ---
  pushHeader('Notify Party');
  if (notifyParty?.company_name) pushSpan(notifyParty.company_name);
  if (notifyParty?.address) {
    // Prefer explicit line breaks in the stored address. Fallback: single block.
    const lines = String(notifyParty.address).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length) {
      for (const line of lines) pushSpan(line);
    } else {
      pushSpan(notifyParty.address);
    }
  }

  // Pad left rows to match right side row count (22).
  while (leftRows.length < rightRows.length) leftRows.push({ kind: 'span', text: '' });
  // If left longer, extend right (shouldn't normally happen).
  while (rightRows.length < leftRows.length) rightRows.push({ isLabel: false, c1: '', c2: '' });

  // Compose rows
  let bodyHtml = '';
  for (let i = 0; i < leftRows.length; i++) {
    const L = leftRows[i];
    const R = rightRows[i];
    let left = '';
    if (L.kind === 'header') {
      left = `<td class="si-group" colspan="2">${h(L.text)}</td>`;
    } else if (L.kind === 'labeled') {
      left = `<td class="si-l-label">${h(L.label || '')}</td><td class="si-l-value">${h(L.value || '')}</td>`;
    } else {
      left = `<td class="si-l-span" colspan="2">${h(L.text || '')}</td>`;
    }
    const right = R.isLabel
      ? `<td class="si-r-label">${h(R.c1 || '')}</td><td class="si-r-label">${h(R.c2 || '')}</td>`
      : `<td class="si-r-value">${h(R.c1 || '')}</td><td class="si-r-value">${h(R.c2 || '')}</td>`;
    bodyHtml += `<tr>${left}${right}</tr>`;
  }

  const logo = getLogo();
  const extraNote = getExtraNote('shipping_instruction');
  root.innerHTML = `
    ${logo ? `<div class="si-logo"><img src="${h(logo)}" alt=""></div>` : ''}
    <h1 class="si-title">SHIPPING INSTRUCTION</h1>

    <table class="si-table">
      <colgroup>
        <col style="width:130px">
        <col>
        <col style="width:140px">
        <col style="width:140px">
      </colgroup>
      <tbody>${bodyHtml}</tbody>
    </table>

    <table class="si-items">
      <thead>
        <tr>
          <th class="si-items__marks">Marks and Nos.</th>
          <th class="si-items__qty">No. of Pkgs</th>
          <th>Description of goods</th>
          <th class="si-items__weight">Weight</th>
          <th class="si-items__measure">Measurement</th>
          <th class="si-items__term">Term</th>
          <th class="si-items__total">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="si-items__marks">${h(caseRow.case_code || '')}</td>
          <td class="si-items__qty">${h(caseRow.volume || (caseRow.qty ? `${caseRow.qty} UNIT` : '1 UNIT'))}</td>
          <td>${renderSiVehicleCell(caseRow)}</td>
          <td class="si-items__weight">${h(caseRow.weight_kg ? caseRow.weight_kg + ' KGS.' : '')}</td>
          <td class="si-items__measure">${h(caseRow.measurement_m3 ? caseRow.measurement_m3 + ' M3' : '')}</td>
          <td class="si-items__term">${h(caseRow.delivery_term || 'CIF')}</td>
          <td class="si-items__total">${amount}</td>
        </tr>
      </tbody>
    </table>

    <table class="si-bottom">
      <tbody>
        <tr>
          <th>搬入先</th>
          <th>備考（追加依頼）</th>
        </tr>
        <tr>
          <td class="si-bottom__cell">${h(caseRow.warehouse_name || '')}</td>
          <td class="si-bottom__cell">${h(caseRow.shipping_instruction_note || '').replace(/\n/g, '<br>')}</td>
        </tr>
        <tr>
          <th>搬入予定日</th>
          <th></th>
        </tr>
        <tr>
          <td class="si-bottom__cell">${h(formatDateLong(caseRow.warehouse_date))}</td>
          <td class="si-bottom__cell"></td>
        </tr>
      </tbody>
    </table>

    ${extraNote ? `<div class="doc-block"><div class="doc-block__body">${h(extraNote).replace(/\n/g, '<br>')}</div></div>` : ''}
  `;
  return root;
}

function renderSiVehicleCell(c) {
  const h = escapeHtml;
  const rows = [
    ['PURCHASE FOR',    c.description || ''],
    ['',                `${c.maker || ''} ${c.model_name || ''}`.trim()],
    ['YEAR',            c.year_month || ''],
    ['MODEL CODE',      c.model_code || ''],
    ['COLOUR',          c.exterior_color || ''],
    ['CHASSIS NO.',     c.chassis_no || ''],
    ['DISPLACEMENT (CC)', c.displacement_cc || ''],
    ['ENGIN No.',       c.engine_no || ''],
    ['HS CODE',         c.hs_code || ''],
  ].filter(([, v]) => v !== '');
  let html = '<dl class="veh-spec">';
  for (const [k, v] of rows) html += `<dt>${h(k)}</dt><dd>${h(v)}</dd>`;
  html += '</dl>';
  return html;
}
