// ============================================================================
// Export Certificate renderer.
// Mirrors the official 輸出抹消仮登録証明書 (English version) layout.
// ============================================================================

import { formatDateLong, escapeHtml } from '../util.js';

export function renderExportCertificate({ caseRow, seller, doc }) {
  const h = escapeHtml;
  const root = document.createElement('div');
  root.className = 'doc-sheet doc-sheet--ec';

  const certNo = doc?.doc_ref_no || caseRow.export_cert_no || '';
  const refNo  = caseRow.reference_no || '';
  const issueDate = doc?.doc_date || caseRow.registration_date || '';
  const ownerLine = seller?.address
    ? `${seller.address}${caseRow.owner_code ? ` [ ${caseRow.owner_code} ]` : ''}`
    : '';

  root.innerHTML = `
    <div class="ec-topline">
      <div>No. <strong>${h(certNo)}</strong></div>
      <div>Reference No. <strong>${h(refNo)}</strong></div>
      <h1 class="ec-title">Export Certificate</h1>
    </div>

    <table class="ec-table">
      <tbody>
        <tr>
          <th class="ec-head">Registration No</th>
          <th class="ec-head">Registration Date</th>
          <th class="ec-head">First Reg. Date</th>
          <th class="ec-head">Maker's serial number</th>
        </tr>
        <tr>
          <td class="ec-val">${h(caseRow.registration_no || '')}</td>
          <td class="ec-val">${h(formatDateLong(caseRow.registration_date))}</td>
          <td class="ec-val">${h(caseRow.first_reg_date || '')}</td>
          <td class="ec-val">${h(caseRow.chassis_no || '')}</td>
        </tr>
        <tr>
          <th class="ec-head" colspan="2">Trademark of the maker of the vehicle</th>
          <th class="ec-head">Model</th>
          <th class="ec-head">Engine Model</th>
        </tr>
        <tr>
          <td class="ec-val" colspan="2">${h(caseRow.maker || '')}${caseRow.maker_code ? ` [ ${h(caseRow.maker_code)} ]` : ''}</td>
          <td class="ec-val">${h(caseRow.model_code || '')}</td>
          <td class="ec-val">${h(caseRow.engine_model || '')}</td>
        </tr>
        <tr>
          <th class="ec-head">Name of Owner</th>
          <td class="ec-val" colspan="3">${h(seller?.company_name || '')}</td>
        </tr>
        <tr>
          <th class="ec-head">Address of Owner</th>
          <td class="ec-val" colspan="3">${h(ownerLine)}</td>
        </tr>
        <tr>
          <th class="ec-head">Name of User</th>
          <td class="ec-val" colspan="3">***</td>
        </tr>
        <tr>
          <th class="ec-head">Address of User</th>
          <td class="ec-val" colspan="3">***</td>
        </tr>
        <tr>
          <th class="ec-head">Locality of principal abode of use</th>
          <td class="ec-val" colspan="3">***</td>
        </tr>
      </tbody>
    </table>

    <table class="ec-grid">
      <tbody>
        <tr>
          <th>Classification of Vehicle</th>
          <th>Use</th>
          <th>Purpose</th>
          <th>Type of Body</th>
          <th>Fixed Number</th>
          <th colspan="2">Maxim. Carry</th>
          <th colspan="2">Weight</th>
          <th colspan="2">G/Weight</th>
        </tr>
        <tr>
          <td>${h(caseRow.classification_vehicle || 'Standard')}</td>
          <td>${h(caseRow.vehicle_use || 'Passenger')}</td>
          <td>${h(caseRow.vehicle_purpose || 'Private')}</td>
          <td>${h(caseRow.body_type || '')}${caseRow.classification_body_no ? ` [ ${h(caseRow.classification_body_no)} ]` : ''}</td>
          <td>${h(caseRow.fixed_number || '')}${caseRow.fixed_number ? ' person' : ''}</td>
          <td colspan="2">${h(caseRow.max_carry_weight || '-')} kg</td>
          <td colspan="2">${h(caseRow.weight_kg || '')} kg</td>
          <td colspan="2">${h(caseRow.gross_weight || caseRow.weight_kg || '')} kg</td>
        </tr>
        <tr>
          <th>Engine Capacity</th>
          <th>Classification of Fuel</th>
          <th>Specification No.</th>
          <th>Classification No.</th>
          <th>Length</th>
          <th>Width</th>
          <th>Height</th>
          <th>FF Weight</th>
          <th>FR Weight</th>
          <th>RF Weight</th>
          <th>RR Weight</th>
        </tr>
        <tr>
          <td>${h(caseRow.fuel_classification_spec || (caseRow.displacement_cc ? (Number(caseRow.displacement_cc)/1000).toFixed(2) + 'L' : ''))}</td>
          <td>${h(caseRow.fuel || 'Petrol')}</td>
          <td>${h(caseRow.spec_no || '')}</td>
          <td>${h(caseRow.classification_no || '')}</td>
          <td>${h(caseRow.length_cm || '')}${caseRow.length_cm ? ' cm' : ''}</td>
          <td>${h(caseRow.width_cm || '')}${caseRow.width_cm ? ' cm' : ''}</td>
          <td>${h(caseRow.height_cm || '')}${caseRow.height_cm ? ' cm' : ''}</td>
          <td>${h(caseRow.ff_weight || '-')} kg</td>
          <td>${h(caseRow.fr_weight || '-')} kg</td>
          <td>${h(caseRow.rf_weight || '-')} kg</td>
          <td>${h(caseRow.rr_weight || '-')} kg</td>
        </tr>
      </tbody>
    </table>

    <table class="ec-schedule">
      <tbody>
        <tr>
          <th>Export scheduled Day</th>
          <td>${h(formatDateLong(caseRow.export_scheduled_date))}</td>
        </tr>
      </tbody>
    </table>

    <div class="ec-remarks">
      <strong>Remarks</strong>
      <div>[Kyoto] Export Notification</div>
      <p>If the owner who submitted an export notification does not export the vehicle associated with the Certificate of Scheduled Export Notification and the validity period of the certificate expires, the owner must return the certificate to the nearest Transport Bureau Office within 15 days from the date of expiration.</p>
      ${caseRow.previous_reg_no ? `<p>[Previous registration number] ${h(caseRow.previous_reg_no)}</p>` : ''}
      <p>(Blank space below)</p>
    </div>

    <div class="ec-footer">
      <div class="ec-footer__date">${h(formatDateLong(issueDate))}</div>
      <div class="ec-footer__issuer">
        Director-General of the District Transport Bureau or<br>
        Director-General of the Transport Branch of the District Transport Bureau,<br>
        Ministry of Land, Infrastructure, Transport and Tourism, Japan
      </div>
      <div class="ec-footer__office">
        ${h(caseRow.issuer_title || 'Director of the Kyoto Transport Bureau Office')}
      </div>
    </div>
  `;
  return root;
}
