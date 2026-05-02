// ============================================================================
// Vehicle category definitions — central source of truth for car/bike split.
//
// Add new categories here (e.g. 'truck') and the rest of the app will pick
// them up automatically (filters, badges, master selectors).
// ============================================================================

export const VEHICLE_CATEGORIES = [
  {
    key: 'car',
    label: '自動車',
    en:    'Cars',
    icon:  '🚗',
    badge: 'blue',
    // Common HS code prefix for cars (8703.xx)
    hsPrefix: '8703',
  },
  {
    key: 'bike',
    label: 'オートバイ',
    en:    'Motorcycles',
    icon:  '🏍',
    badge: 'purple',
    // Common HS code prefix for motorcycles (8711.xx)
    hsPrefix: '8711',
  },
];

export function categoryLabel(key) {
  return VEHICLE_CATEGORIES.find(c => c.key === key)?.label || key || '—';
}

export function categoryEnLabel(key) {
  return VEHICLE_CATEGORIES.find(c => c.key === key)?.en || key || '—';
}

export function categoryIcon(key) {
  return VEHICLE_CATEGORIES.find(c => c.key === key)?.icon || '';
}

export function categoryBadge(key) {
  return VEHICLE_CATEGORIES.find(c => c.key === key)?.badge || 'gray';
}

/**
 * Returns the category key, defaulting to 'car' when unset (treats legacy data
 * as cars since that's the historical default).
 */
export function normalizeCategory(key) {
  if (!key) return 'car';
  return VEHICLE_CATEGORIES.find(c => c.key === key) ? key : 'car';
}
