// ============================================================================
// Shared template accessors for document renderers.
// Renderers call these to read user-configured values (logo, signer name/title,
// extra notes) from the settings table.
// ============================================================================

import { getSetting } from '../db.js';

export function getLogo() {
  return getSetting('company_logo', '') || '';
}

export function getSignerName() {
  return getSetting('signer_name', 'MAKOTO Kubota') || 'MAKOTO Kubota';
}

export function getSignerTitle() {
  return getSetting('signer_title', 'Managing Director') || 'Managing Director';
}

export function getExtraNote(docType) {
  if (docType === 'sales_confirmation' || docType === 'invoice') {
    return getSetting('extra_note_invoice', '') || '';
  }
  if (docType === 'shipping_instruction') {
    return getSetting('extra_note_si', '') || '';
  }
  return '';
}
