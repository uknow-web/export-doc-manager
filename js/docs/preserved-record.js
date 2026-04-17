// ============================================================================
// Preserved Record (Certificate of Registration Preserve Record) renderer.
// Renders chronological registration events as an "event-per-block" table.
// ============================================================================

import { formatDateLong, escapeHtml } from '../util.js';

export function renderPreservedRecord({ caseRow, seller, doc, events = [] }) {
  const h = escapeHtml;
  const root = document.createElement('div');
  root.className = 'doc-sheet doc-sheet--pr';

  const no = caseRow.preserve_record_no || '';
  const issueDate = doc?.doc_date || caseRow.registration_date || '';

  // Build rows: for each event, emit one row with event_date/event_type,
  // then follow-up rows (blank first cols) listing each item.
  const rows = [];
  for (const ev of events) {
    const items = buildItems(ev);
    items.forEach((it, i) => {
      rows.push({
        event_date: i === 0 ? ev.event_date : '',
        event_type: i === 0 ? ev.event_type : '',
        item_name: it.label,
        item_value: it.value,
      });
    });
  }

  root.innerHTML = `
    <div class="pr-topline">
      <div>No <strong>${h(no)}</strong></div>
      <h1 class="pr-title">Certificate of Registration Preserve Record</h1>
      <div class="pr-pagenum">(1/1)</div>
    </div>

    <table class="pr-table">
      <thead>
        <tr>
          <th colspan="2">Vehicle Registration Number</th>
          <th colspan="2">Vehicle Identification Number (VIN)</th>
        </tr>
        <tr>
          <td colspan="2" class="pr-val">${h(caseRow.registration_no || '')}</td>
          <td colspan="2" class="pr-val">${h(caseRow.chassis_no || '')}</td>
        </tr>
        <tr>
          <th>Date of Registration</th>
          <th>Type of Registration</th>
          <th>Item Name</th>
          <th>Registered Information / Registration Details</th>
        </tr>
        ${rows.length ? rows.map(r => `
          <tr>
            <td class="pr-val">${h(formatDateLong(r.event_date))}</td>
            <td class="pr-val">${h(r.event_type)}</td>
            <td class="pr-val">${h(r.item_name)}</td>
            <td class="pr-val">${h(r.item_value)}</td>
          </tr>
        `).join('') : `
          <tr>
            <td colspan="4" class="pr-empty">登録イベントがまだ入力されていません。案件編集画面で追加してください。</td>
          </tr>`}
        ${Array.from({length: Math.max(0, 12 - rows.length)}).map(() => `
          <tr>
            <td class="pr-val">&nbsp;</td>
            <td class="pr-val">&nbsp;</td>
            <td class="pr-val">&nbsp;</td>
            <td class="pr-val">&nbsp;</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div class="pr-footer">
      <div class="pr-footer__date">${h(formatDateLong(issueDate))}</div>
      <div class="pr-footer__issuer">${h(caseRow.issuer_title || 'Director of the Kyoto Transport Bureau Office')}</div>
    </div>
  `;
  return root;
}

function buildItems(ev) {
  // Emit each non-empty field as its own item row, matching the sample layout.
  const items = [];
  const add = (label, value) => { if (value) items.push({ label, value }); };
  add('Acceptance Number', ev.acceptance_number);
  add('Registration Number', ev.registration_number);
  add('Owner\'s Name', ev.owner_name);
  add('Owner\'s Address', ev.owner_address);
  add('User\'s Name', ev.user_name);
  add('User\'s Address', ev.user_address);
  add('Principal Place of Use', ev.principal_place_of_use);
  add('Scheduled Export Date', ev.scheduled_export_date);
  if (ev.notes) add('Notes', ev.notes);
  if (!items.length) items.push({ label: '', value: '' });
  return items;
}
