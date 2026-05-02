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
    // Common HS code for passenger cars (1500-3000cc gasoline);
    // user can override per model.
    hsPrefix:  '8703',
    hsDefault: '8703.23',
  },
  {
    key: 'bike',
    label: 'オートバイ',
    en:    'Motorcycles',
    icon:  '🏍',
    badge: 'purple',
    hsPrefix:  '8711',
    hsDefault: '8711',
  },
];

/** Default HS code for a category (used when creating a new model). */
export function defaultHsCode(catKey) {
  return VEHICLE_CATEGORIES.find(c => c.key === catKey)?.hsDefault || '';
}

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
