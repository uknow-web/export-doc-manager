// ============================================================================
// Status catalog for cases. Centralized so UI, DB queries, and future sales
// reports all share the same keys, labels, and display order.
// ============================================================================

export const PROGRESS_STATUSES = [
  { key: 'inquiry',        label: '問合せ',           order: 10, color: 'gray'   },
  { key: 'sc_issued',      label: 'SC発行済み',       order: 20, color: 'blue'   },
  { key: 'invoice_issued', label: 'Invoice発行済み',  order: 30, color: 'indigo' },
  { key: 'si_issued',      label: 'SI発行済み',       order: 40, color: 'purple' },
  { key: 'shipped',        label: '船積完了',         order: 50, color: 'teal'   },
  { key: 'arrived',        label: '入港済み',         order: 60, color: 'cyan'   },
  { key: 'completed',      label: '完了',             order: 70, color: 'green'  },
  { key: 'cancelled',      label: 'キャンセル',       order: 99, color: 'red'    },
];

export const PAYMENT_STATUSES = [
  { key: 'unpaid',    label: '未入金',    color: 'red'    },
  { key: 'partial',   label: '一部入金',  color: 'amber'  },
  { key: 'paid',      label: '入金完了',  color: 'green'  },
  { key: 'cancelled', label: 'キャンセル', color: 'gray'  },
];

export function progressLabel(key) {
  return PROGRESS_STATUSES.find(s => s.key === key)?.label || key || '—';
}
export function paymentLabel(key) {
  return PAYMENT_STATUSES.find(s => s.key === key)?.label || key || '—';
}
export function progressColor(key) {
  return PROGRESS_STATUSES.find(s => s.key === key)?.color || 'gray';
}
export function paymentColor(key) {
  return PAYMENT_STATUSES.find(s => s.key === key)?.color || 'gray';
}

// Given which documents have been issued for a case, suggest the furthest
// progress status. Caller decides whether to auto-apply it.
export function suggestProgressFromDocs(issuedDocTypes, currentStatus) {
  // Don't downgrade; don't override shipped/arrived/completed/cancelled.
  const locked = ['shipped','arrived','completed','cancelled'];
  if (locked.includes(currentStatus)) return currentStatus;
  if (issuedDocTypes.has('shipping_instruction')) return 'si_issued';
  if (issuedDocTypes.has('invoice'))              return 'invoice_issued';
  if (issuedDocTypes.has('sales_confirmation'))   return 'sc_issued';
  return currentStatus || 'inquiry';
}
