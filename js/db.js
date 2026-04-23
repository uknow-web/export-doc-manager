// ============================================================================
// SQLite (sql.js) wrapper with IndexedDB persistence.
// Single source of truth for schema + CRUD. The raw DB is a Uint8Array
// that can also be exported/imported as a .sqlite file.
// ============================================================================

// IndexedDB layout (v2):
//   store 'sqlite':
//     key 'db'             → plain SQLite bytes (legacy / encryption disabled)
//     key 'encrypted_db'   → encrypted SQLite bytes (EDM2 magic-prefixed)
//     key 'bootstrap_meta' → { version, encryption_enabled, users: [{ username,
//                             password_salt, password_hash, dek_envelope }] }
//
// On load we first check bootstrap_meta + encrypted_db. If encryption is
// disabled we fall back to the legacy 'db' key.
const IDB_NAME  = 'export-doc-mgr';
const IDB_STORE = 'sqlite';
const IDB_KEY_PLAIN     = 'db';
const IDB_KEY_ENCRYPTED = 'encrypted_db';
const IDB_KEY_BOOTSTRAP = 'bootstrap_meta';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGetKey(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbPutKey(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDeleteKey(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Legacy aliases used before encryption support was added.
async function idbGet() { return idbGetKey(IDB_KEY_PLAIN); }
async function idbPut(bytes) { return idbPutKey(IDB_KEY_PLAIN, bytes); }

// ---- Bootstrap meta (plain JSON in IndexedDB, holds login bootstrap data)
export async function getBootstrapMeta() {
  const v = await idbGetKey(IDB_KEY_BOOTSTRAP);
  if (!v) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}
export async function saveBootstrapMeta(meta) {
  await idbPutKey(IDB_KEY_BOOTSTRAP, JSON.stringify(meta));
}
export async function getEncryptedDbBytes() {
  return idbGetKey(IDB_KEY_ENCRYPTED);
}
export async function saveEncryptedDbBytes(bytes) {
  return idbPutKey(IDB_KEY_ENCRYPTED, bytes);
}
export async function deletePlainDb() {
  return idbDeleteKey(IDB_KEY_PLAIN);
}

// ---- Schema ---------------------------------------------------------------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS parties (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  role             TEXT NOT NULL,
  company_name     TEXT NOT NULL,
  address          TEXT,
  tel              TEXT,
  email            TEXT,
  attn_name        TEXT,
  attn_tel         TEXT,
  bank_name        TEXT,
  bank_branch      TEXT,
  bank_address     TEXT,
  bank_branch_code TEXT,
  bank_account_no  TEXT,
  bank_account_name TEXT,
  bank_swift       TEXT,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_models (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  maker              TEXT,
  model_name         TEXT,
  model_code         TEXT,
  engine_capacity    TEXT,
  displacement_cc    TEXT,
  fuel               TEXT,
  weight_kg          TEXT,
  measurement_m3     TEXT,
  hs_code            TEXT,
  specification      TEXT,
  note               TEXT,
  created_at         TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cases (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  case_code          TEXT,
  invoice_ref_no     TEXT,
  invoice_date       TEXT,
  payment_due_date   TEXT,
  seller_id          INTEGER,
  primary_buyer_id   INTEGER,
  vehicle_model_id   INTEGER,
  qty                INTEGER DEFAULT 1,
  amount_jpy         INTEGER,

  description        TEXT,
  maker              TEXT,
  model_name         TEXT,
  year_month         TEXT,
  model_code         TEXT,
  chassis_no         TEXT,
  engine_no          TEXT,
  engine_capacity    TEXT,
  displacement_cc    TEXT,
  mileage            TEXT,
  exterior_color     TEXT,
  fuel               TEXT,
  auction_grade      TEXT,
  weight_kg          TEXT,
  measurement_m3     TEXT,
  hs_code            TEXT,
  specification      TEXT,
  remark             TEXT,

  vessel_name        TEXT,
  voyage_no          TEXT,
  etd                TEXT,
  eta                TEXT,
  port_of_loading    TEXT,
  port_of_discharge  TEXT,
  place_of_delivery  TEXT,
  type_of_service    TEXT,
  delivery_term      TEXT,

  /* --- Shipping Instruction specific --- */
  shipping_company          TEXT,
  booking_no                TEXT,
  volume                    TEXT,
  freight_term              TEXT,
  place_of_receipt          TEXT,
  place_of_issue            TEXT,
  no_of_original_bl         TEXT,
  local_vessel              TEXT,
  local_voyage_no           TEXT,
  cut_date                  TEXT,
  booked_by                 TEXT,
  forwarder                 TEXT,
  notify_party_id           INTEGER,
  warehouse_name            TEXT,
  warehouse_date            TEXT,
  shipping_instruction_note TEXT,

  /* --- Export Certificate / Preserved Record specific --- */
  registration_no           TEXT,
  registration_date         TEXT,
  first_reg_date            TEXT,
  previous_reg_no           TEXT,
  reference_no              TEXT,
  export_cert_no            TEXT,
  preserve_record_no        TEXT,
  export_scheduled_date     TEXT,
  vehicle_use               TEXT,
  vehicle_purpose           TEXT,
  body_type                 TEXT,
  classification_vehicle    TEXT,
  classification_body_no    TEXT,
  fixed_number              TEXT,
  max_carry_weight          TEXT,
  gross_weight              TEXT,
  length_cm                 TEXT,
  width_cm                  TEXT,
  height_cm                 TEXT,
  ff_weight                 TEXT,
  fr_weight                 TEXT,
  rf_weight                 TEXT,
  rr_weight                 TEXT,
  spec_no                   TEXT,
  classification_no         TEXT,
  owner_code                TEXT,
  fuel_classification_spec  TEXT,
  engine_model              TEXT,
  maker_code                TEXT,
  issuer_title              TEXT,

  /* --- Status tracking --- */
  progress_status           TEXT DEFAULT 'inquiry',
  payment_status            TEXT DEFAULT 'unpaid',
  status_note               TEXT,
  status_updated_at         TEXT,

  /* --- Tags & favorites --- */
  tags                      TEXT,
  is_favorite               INTEGER DEFAULT 0,

  created_at         TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id)        REFERENCES parties(id),
  FOREIGN KEY (vehicle_model_id) REFERENCES vehicle_models(id),
  FOREIGN KEY (notify_party_id)  REFERENCES parties(id)
);

CREATE TABLE IF NOT EXISTS costs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id       INTEGER NOT NULL,
  cost_type     TEXT,
  amount_jpy    INTEGER,
  vendor        TEXT,
  cost_date     TEXT,
  note          TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT NOT NULL UNIQUE,
  display_name          TEXT,
  password_hash         TEXT NOT NULL,
  password_salt         TEXT NOT NULL,
  role                  TEXT NOT NULL DEFAULT 'viewer',
  is_active             INTEGER DEFAULT 1,
  totp_secret           TEXT,
  totp_enabled          INTEGER DEFAULT 0,
  failed_login_count    INTEGER DEFAULT 0,
  lock_until            TEXT,
  password_changed_at   TEXT,
  created_at            TEXT DEFAULT CURRENT_TIMESTAMP,
  last_login_at         TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id   INTEGER,
  actor_username  TEXT,
  action          TEXT,
  target_type     TEXT,
  target_id       INTEGER,
  summary         TEXT,
  ip              TEXT,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id);

CREATE TABLE IF NOT EXISTS photos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id       INTEGER NOT NULL,
  filename      TEXT,
  mime_type     TEXT,
  data_url      TEXT,
  caption       TEXT,
  sort_order    INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS doc_issue_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id       INTEGER NOT NULL,
  doc_type      TEXT NOT NULL,
  issued_at     TEXT DEFAULT CURRENT_TIMESTAMP,
  version       INTEGER DEFAULT 1,
  issued_by     TEXT,
  note          TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id       INTEGER NOT NULL,
  payment_date  TEXT,
  amount_jpy    INTEGER,
  method        TEXT,
  reference_no  TEXT,
  note          TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registration_events (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id                  INTEGER NOT NULL,
  sort_order               INTEGER DEFAULT 0,
  event_date               TEXT,
  event_type               TEXT,
  acceptance_number        TEXT,
  registration_number      TEXT,
  owner_name               TEXT,
  owner_address            TEXT,
  user_name                TEXT,
  user_address             TEXT,
  principal_place_of_use   TEXT,
  scheduled_export_date    TEXT,
  notes                    TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS case_documents (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id           INTEGER NOT NULL,
  doc_type          TEXT NOT NULL,
  buyer_id          INTEGER,
  doc_date          TEXT,
  doc_ref_no        TEXT,
  payment_due_date  TEXT,
  terms_condition   TEXT,
  atten_text        TEXT,
  custom_fields     TEXT,
  UNIQUE (case_id, doc_type),
  FOREIGN KEY (case_id)  REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_id) REFERENCES parties(id)
);
`;

// ---- Module-level state ---------------------------------------------------
let SQL = null;
let db  = null;
let currentDek = null; // AES-GCM CryptoKey, set after successful login when DB is encrypted

/** Called by auth.js after the user's password has unwrapped the DEK. */
export function setDek(dek) { currentDek = dek; }
export function clearDek() { currentDek = null; }
export function hasDek() { return currentDek !== null; }
export function getDek() { return currentDek; }

/**
 * Boot the database. This does NOT decrypt an encrypted DB — that happens
 * later during the authentication flow via `loadEncryptedDb(dek)`.
 *
 * On first run: creates plain DB. On an upgrade from legacy (unencrypted) DB
 * the plain DB is loaded so auth.js can later encrypt it atomically.
 */
export async function initDB() {
  if (db) return db;
  SQL = await initSqlJs({ locateFile: file => `vendor/${file}` });

  const meta = await getBootstrapMeta();
  if (meta && meta.encryption_enabled) {
    // Defer: we need the user's password to decrypt. Create empty in-memory
    // DB shell so calls that only need schema bootstrap don't fail.
    db = new SQL.Database();
    db.exec(SCHEMA);
    return db;
  }

  // Either fresh install, or legacy unencrypted deploy.
  const saved = await idbGet();
  db = saved ? new SQL.Database(saved) : new SQL.Database();
  db.exec(SCHEMA);
  migrate();
  const n = db.exec('SELECT COUNT(*) FROM parties')[0].values[0][0];
  if (n === 0) seedDefaultSeller();
  const m = db.exec('SELECT COUNT(*) FROM vehicle_models')[0].values[0][0];
  if (m === 0) seedDefaultVehicleModel();
  // Backfill primary_buyer_id for legacy cases (runs once; no-op after)
  await backfillPrimaryBuyers();
  await persist();
  return db;
}

/**
 * Replace the in-memory DB with the decrypted bytes from IndexedDB.
 * Called by auth.js once a user has logged in and unwrapped the DEK.
 */
export async function loadEncryptedDb(dek) {
  const { decryptWithDek } = await import('./crypto.js');
  const encBytes = await getEncryptedDbBytes();
  if (!encBytes) throw new Error('暗号化DBが見つかりません');
  const plain = await decryptWithDek(encBytes, dek);
  db = new SQL.Database(plain);
  db.exec(SCHEMA);
  migrate();
  currentDek = dek;
  // Run backfill for any legacy cases that predate primary_buyer_id
  await backfillPrimaryBuyers();
  return db;
}

/**
 * First-time encryption: take the current plain DB, encrypt it under DEK,
 * save to IndexedDB as the encrypted copy, and delete the plain copy.
 */
export async function encryptExistingDb(dek) {
  const { encryptWithDek } = await import('./crypto.js');
  if (!db) throw new Error('DB not loaded');
  const plain = db.export();
  const enc = await encryptWithDek(plain, dek);
  await saveEncryptedDbBytes(enc);
  await deletePlainDb();
  currentDek = dek;
}

// Idempotent column additions for DBs created before the column existed.
function migrate() {
  const addColumnIfMissing = (table, column, decl) => {
    const rows = db.exec(`PRAGMA table_info(${table})`)[0]?.values || [];
    const has = rows.some(r => r[1] === column);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  };
  const newCaseCols = [
    ['vehicle_model_id','INTEGER'],
    ['shipping_company','TEXT'],['booking_no','TEXT'],['volume','TEXT'],
    ['freight_term','TEXT'],['place_of_receipt','TEXT'],['place_of_issue','TEXT'],
    ['no_of_original_bl','TEXT'],['local_vessel','TEXT'],['local_voyage_no','TEXT'],
    ['cut_date','TEXT'],['booked_by','TEXT'],['forwarder','TEXT'],
    ['notify_party_id','INTEGER'],['warehouse_name','TEXT'],['warehouse_date','TEXT'],
    ['shipping_instruction_note','TEXT'],
    ['registration_no','TEXT'],['registration_date','TEXT'],['first_reg_date','TEXT'],
    ['previous_reg_no','TEXT'],['reference_no','TEXT'],['export_cert_no','TEXT'],
    ['preserve_record_no','TEXT'],['export_scheduled_date','TEXT'],
    ['vehicle_use','TEXT'],['vehicle_purpose','TEXT'],['body_type','TEXT'],
    ['classification_vehicle','TEXT'],['classification_body_no','TEXT'],
    ['fixed_number','TEXT'],['max_carry_weight','TEXT'],['gross_weight','TEXT'],
    ['length_cm','TEXT'],['width_cm','TEXT'],['height_cm','TEXT'],
    ['ff_weight','TEXT'],['fr_weight','TEXT'],['rf_weight','TEXT'],['rr_weight','TEXT'],
    ['spec_no','TEXT'],['classification_no','TEXT'],['owner_code','TEXT'],
    ['fuel_classification_spec','TEXT'],['engine_model','TEXT'],['maker_code','TEXT'],
    ['issuer_title','TEXT'],
    ['progress_status',"TEXT DEFAULT 'inquiry'"],
    ['payment_status',"TEXT DEFAULT 'unpaid'"],
    ['status_note','TEXT'],
    ['status_updated_at','TEXT'],
    ['tags','TEXT'],
    ['is_favorite','INTEGER DEFAULT 0'],
    ['primary_buyer_id','INTEGER'],
  ];
  for (const [c, d] of newCaseCols) addColumnIfMissing('cases', c, d);

  // Newer columns added to users table for 2FA + brute force protection
  const newUserCols = [
    ['totp_secret', 'TEXT'],
    ['totp_enabled', 'INTEGER DEFAULT 0'],
    ['failed_login_count', 'INTEGER DEFAULT 0'],
    ['lock_until', 'TEXT'],
    ['password_changed_at', 'TEXT'],
  ];
  for (const [c, d] of newUserCols) addColumnIfMissing('users', c, d);
}

function seedDefaultSeller() {
  const stmt = db.prepare(`INSERT INTO parties
    (role, company_name, address, tel, email,
     bank_name, bank_branch, bank_address, bank_branch_code,
     bank_account_no, bank_account_name, bank_swift)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  stmt.run([
    'seller',
    'KMT Corporation',
    '26 Sotoyama-cho, Nakajima, Fushimi-ku, Kyoto-city, Kyoto, 612-8455, JAPAN',
    '+81-75-605-4919',
    'info@kmt.kyoto',
    'MUFG BANK,LTD.',
    'TOJI Branch',
    '74, Hieijocho, Nishikujo, Minami-ku, Kyoto-shi, Kyoto, Japan.',
    '436',
    '3896499',
    'KMT.INK',
    'BOTKJPJT',
  ]);
  stmt.free();
}

function seedDefaultVehicleModel() {
  const stmt = db.prepare(`INSERT INTO vehicle_models
    (maker, model_name, model_code, engine_capacity, displacement_cc, fuel,
     weight_kg, measurement_m3, hs_code, specification, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  stmt.run([
    'TOYOTA',
    'ALPHARD Z',
    '3BA-AGH40W',
    '2500CC',
    '2500',
    'PETROL',
    '2465',
    '17.88',
    '8703 23',
    [
      'Right and left independent moon roof.',
      'Genuine 13.2 inch OEL rear seat display.',
      'TOYOTA TEAMMATE',
      'Digital inner mirror.',
      'Color head-up display.',
    ].join('\n'),
    'サンプルデータ（RAYA_003 Alphard Z から作成）',
  ]);
  stmt.free();
}

export async function persist() {
  if (!db) return;
  const bytes = db.export();
  if (currentDek) {
    const { encryptWithDek } = await import('./crypto.js');
    const enc = await encryptWithDek(bytes, currentDek);
    await saveEncryptedDbBytes(enc);
  } else {
    // Plain storage (legacy / pre-encryption-enabled)
    await idbPut(bytes);
  }
}

// ---- Generic helpers ------------------------------------------------------
function rowToObject(columns, values) {
  const o = {};
  columns.forEach((c, i) => { o[c] = values[i]; });
  return o;
}

export function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

export function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
}

export function lastInsertId() {
  return db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
}

// ---- Party ----------------------------------------------------------------
const PARTY_FIELDS = [
  'role','company_name','address','tel','email','attn_name','attn_tel',
  'bank_name','bank_branch','bank_address','bank_branch_code',
  'bank_account_no','bank_account_name','bank_swift',
];

export async function saveParty(data) {
  const cols = PARTY_FIELDS;
  const vals = cols.map(k => data[k] ?? null);
  if (data.id) {
    const sets = cols.map(c => `${c}=?`).join(', ');
    run(`UPDATE parties SET ${sets} WHERE id=?`, [...vals, data.id]);
    await persist();
    return data.id;
  } else {
    const ph = cols.map(() => '?').join(',');
    run(`INSERT INTO parties (${cols.join(',')}) VALUES (${ph})`, vals);
    const id = lastInsertId();
    await persist();
    return id;
  }
}

export async function deleteParty(id) {
  run('DELETE FROM parties WHERE id=?', [id]);
  await persist();
}

export function listParties(role = 'all') {
  if (role === 'all') return query('SELECT * FROM parties ORDER BY role, company_name');
  return query('SELECT * FROM parties WHERE role=? ORDER BY company_name', [role]);
}

export function getParty(id) {
  return queryOne('SELECT * FROM parties WHERE id=?', [id]);
}

// ---- Vehicle Model --------------------------------------------------------
const VEHICLE_MODEL_FIELDS = [
  'maker','model_name','model_code','engine_capacity','displacement_cc','fuel',
  'weight_kg','measurement_m3','hs_code','specification','note',
];

export async function saveVehicleModel(data) {
  const cols = VEHICLE_MODEL_FIELDS;
  const vals = cols.map(k => {
    const v = data[k];
    if (v === '' || v === undefined) return null;
    return v;
  });
  if (data.id) {
    const sets = cols.map(c => `${c}=?`).join(', ');
    run(`UPDATE vehicle_models SET ${sets} WHERE id=?`, [...vals, data.id]);
    await persist();
    return data.id;
  } else {
    const ph = cols.map(() => '?').join(',');
    run(`INSERT INTO vehicle_models (${cols.join(',')}) VALUES (${ph})`, vals);
    const id = lastInsertId();
    await persist();
    return id;
  }
}

export async function deleteVehicleModel(id) {
  run('UPDATE cases SET vehicle_model_id=NULL WHERE vehicle_model_id=?', [id]);
  run('DELETE FROM vehicle_models WHERE id=?', [id]);
  await persist();
}

export function listVehicleModels() {
  return query('SELECT * FROM vehicle_models ORDER BY maker, model_name');
}

export function getVehicleModel(id) {
  return queryOne('SELECT * FROM vehicle_models WHERE id=?', [id]);
}

// ---- Case -----------------------------------------------------------------
const CASE_FIELDS = [
  'case_code','invoice_ref_no','invoice_date','payment_due_date','seller_id','primary_buyer_id','vehicle_model_id','qty','amount_jpy',
  'description','maker','model_name','year_month','model_code','chassis_no','engine_no',
  'engine_capacity','displacement_cc','mileage','exterior_color','fuel','auction_grade',
  'weight_kg','measurement_m3','hs_code','specification','remark',
  'vessel_name','voyage_no','etd','eta','port_of_loading','port_of_discharge',
  'place_of_delivery','type_of_service','delivery_term',
  'shipping_company','booking_no','volume','freight_term',
  'place_of_receipt','place_of_issue','no_of_original_bl',
  'local_vessel','local_voyage_no','cut_date','booked_by','forwarder',
  'notify_party_id','warehouse_name','warehouse_date','shipping_instruction_note',
  'registration_no','registration_date','first_reg_date','previous_reg_no',
  'reference_no','export_cert_no','preserve_record_no','export_scheduled_date',
  'vehicle_use','vehicle_purpose','body_type','classification_vehicle','classification_body_no',
  'fixed_number','max_carry_weight','gross_weight',
  'length_cm','width_cm','height_cm',
  'ff_weight','fr_weight','rf_weight','rr_weight',
  'spec_no','classification_no','owner_code',
  'fuel_classification_spec','engine_model','maker_code','issuer_title',
  'progress_status','payment_status','status_note','status_updated_at',
  'tags','is_favorite',
];

export async function saveCase(data) {
  const cols = CASE_FIELDS;
  const vals = cols.map(k => {
    const v = data[k];
    if (v === '' || v === undefined) return null;
    return v;
  });
  if (data.id) {
    const sets = cols.map(c => `${c}=?`).join(', ');
    run(`UPDATE cases SET ${sets} WHERE id=?`, [...vals, data.id]);
    await persist();
    return data.id;
  } else {
    const ph = cols.map(() => '?').join(',');
    run(`INSERT INTO cases (${cols.join(',')}) VALUES (${ph})`, vals);
    const id = lastInsertId();
    await persist();
    return id;
  }
}

export async function deleteCase(id) {
  run('DELETE FROM case_documents WHERE case_id=?', [id]);
  run('DELETE FROM cases WHERE id=?', [id]);
  await persist();
}

export function listCases(search = '', filters = {}) {
  const where = [];
  const params = [];
  if (search) {
    where.push('(case_code LIKE ? OR chassis_no LIKE ? OR invoice_ref_no LIKE ? OR tags LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  if (filters.progress_status && filters.progress_status !== 'all') {
    where.push('COALESCE(progress_status, \'inquiry\') = ?');
    params.push(filters.progress_status);
  }
  if (filters.payment_status && filters.payment_status !== 'all') {
    where.push('COALESCE(payment_status, \'unpaid\') = ?');
    params.push(filters.payment_status);
  }
  if (filters.tag) {
    // Tags are stored as comma-separated values — use pattern to match a single tag.
    where.push('(\',\' || COALESCE(tags,\'\') || \',\') LIKE ?');
    params.push(`%,${filters.tag},%`);
  }
  if (filters.favorites_only) {
    where.push('is_favorite = 1');
  }
  // Favorites pinned to top, then newest first.
  const sql = `SELECT * FROM cases${where.length ? ' WHERE ' + where.join(' AND ') : ''}
               ORDER BY is_favorite DESC, id DESC`;
  return query(sql, params);
}

// Collect distinct tags across all cases for filter UI / autocomplete.
export function listAllTags() {
  const rows = query("SELECT tags FROM cases WHERE tags IS NOT NULL AND tags != ''");
  const set = new Set();
  for (const r of rows) {
    String(r.tags).split(',').map(s => s.trim()).filter(Boolean).forEach(t => set.add(t));
  }
  return [...set].sort();
}

export async function toggleFavorite(caseId) {
  const c = queryOne('SELECT is_favorite FROM cases WHERE id=?', [caseId]);
  if (!c) return false;
  const next = c.is_favorite ? 0 : 1;
  run('UPDATE cases SET is_favorite=? WHERE id=?', [next, caseId]);
  await persist();
  return next === 1;
}

/**
 * One-time backfill of primary_buyer_id from per-document buyer_ids for
 * cases that were created before the primary buyer field existed. Priority
 * order: Invoice buyer → Sales Confirmation buyer → Shipping Instruction
 * buyer. Cases that already have primary_buyer_id set are left alone.
 */
export async function backfillPrimaryBuyers() {
  const cases = query('SELECT id FROM cases WHERE primary_buyer_id IS NULL');
  let patched = 0;
  for (const c of cases) {
    const order = ['invoice', 'sales_confirmation', 'shipping_instruction'];
    let buyerId = null;
    for (const t of order) {
      const d = queryOne(
        'SELECT buyer_id FROM case_documents WHERE case_id=? AND doc_type=? AND buyer_id IS NOT NULL',
        [c.id, t]
      );
      if (d?.buyer_id) { buyerId = d.buyer_id; break; }
    }
    if (buyerId) {
      run('UPDATE cases SET primary_buyer_id=? WHERE id=?', [buyerId, c.id]);
      patched++;
    }
  }
  if (patched > 0) await persist();
  return patched;
}

// Lightweight stat summary used by the case list footer and the dashboard.
// Includes paid totals (summed from the payments table, not just by status)
// and outstanding balance.
export function casesSummary(filters = {}) {
  const rows = listCases('', filters);
  const totalCount = rows.length;
  const totalAmount = rows.reduce((s, r) => s + (Number(r.amount_jpy) || 0), 0);
  let paidAmount = 0;
  let paidCount = 0;
  let costTotal = 0;
  for (const r of rows) {
    const p = paymentsTotal(r.id);
    const c = costsTotal(r.id);
    paidAmount += p;
    costTotal += c;
    if (r.payment_status === 'paid') paidCount++;
  }
  const outstanding = Math.max(0, totalAmount - paidAmount);
  const profit = totalAmount - costTotal;
  return { totalCount, totalAmount, paidCount, paidAmount, outstanding, costTotal, profit };
}

export function getCase(id) {
  return queryOne('SELECT * FROM cases WHERE id=?', [id]);
}

// ---- Case documents -------------------------------------------------------
const DOC_FIELDS = [
  'case_id','doc_type','buyer_id','doc_date','doc_ref_no',
  'payment_due_date','terms_condition','atten_text','custom_fields',
];

export async function saveCaseDoc(data) {
  const existing = queryOne(
    'SELECT id FROM case_documents WHERE case_id=? AND doc_type=?',
    [data.case_id, data.doc_type],
  );
  const vals = DOC_FIELDS.map(k => {
    const v = data[k];
    if (v === '' || v === undefined) return null;
    return v;
  });
  if (existing) {
    const sets = DOC_FIELDS.map(c => `${c}=?`).join(', ');
    run(`UPDATE case_documents SET ${sets} WHERE id=?`, [...vals, existing.id]);
  } else {
    const ph = DOC_FIELDS.map(() => '?').join(',');
    run(`INSERT INTO case_documents (${DOC_FIELDS.join(',')}) VALUES (${ph})`, vals);
  }
  await persist();
}

export function getCaseDoc(case_id, doc_type) {
  return queryOne(
    'SELECT * FROM case_documents WHERE case_id=? AND doc_type=?',
    [case_id, doc_type],
  );
}

export function listCaseDocs(case_id) {
  return query('SELECT * FROM case_documents WHERE case_id=?', [case_id]);
}

// ---- Payments -------------------------------------------------------------
// Multiple payments per case. Totals automatically flow into payment_status.
const PAYMENT_FIELDS = ['case_id','payment_date','amount_jpy','method','reference_no','note'];

export async function savePayment(data) {
  const cols = PAYMENT_FIELDS;
  const vals = cols.map(k => {
    const v = data[k];
    if (v === '' || v === undefined) return null;
    return v;
  });
  if (data.id) {
    const sets = cols.map(c => `${c}=?`).join(', ');
    run(`UPDATE payments SET ${sets} WHERE id=?`, [...vals, data.id]);
  } else {
    const ph = cols.map(() => '?').join(',');
    run(`INSERT INTO payments (${cols.join(',')}) VALUES (${ph})`, vals);
  }
  await syncPaymentStatus(data.case_id);
  await persist();
  return data.id || lastInsertId();
}

export async function deletePayment(id) {
  const row = queryOne('SELECT case_id FROM payments WHERE id=?', [id]);
  run('DELETE FROM payments WHERE id=?', [id]);
  if (row) await syncPaymentStatus(row.case_id);
  await persist();
}

export function listPayments(case_id) {
  return query('SELECT * FROM payments WHERE case_id=? ORDER BY payment_date, id', [case_id]);
}

export function paymentsTotal(case_id) {
  const r = queryOne('SELECT COALESCE(SUM(amount_jpy),0) AS total FROM payments WHERE case_id=?', [case_id]);
  return Number(r?.total || 0);
}

// Recompute payment_status from the payment rows. Runs whenever payments
// change. Leaves explicit 'cancelled' alone — only switches between
// unpaid / partial / paid based on sums.
async function syncPaymentStatus(case_id) {
  const c = getCase(case_id);
  if (!c) return;
  if (c.payment_status === 'cancelled') return;
  const paid = paymentsTotal(case_id);
  const due  = Number(c.amount_jpy) || 0;
  let next;
  if (paid <= 0) next = 'unpaid';
  else if (due > 0 && paid >= due) next = 'paid';
  else next = 'partial';
  if (next !== c.payment_status) {
    run('UPDATE cases SET payment_status=?, status_updated_at=? WHERE id=?',
        [next, new Date().toISOString(), case_id]);
  }
}

// ---- Photos ---------------------------------------------------------------
const PHOTO_FIELDS = ['case_id','filename','mime_type','data_url','caption','sort_order'];

export async function savePhoto(data) {
  const cols = PHOTO_FIELDS;
  const vals = cols.map(k => {
    const v = data[k];
    if (v === '' || v === undefined) return null;
    return v;
  });
  if (data.id) {
    const sets = cols.map(c => `${c}=?`).join(', ');
    run(`UPDATE photos SET ${sets} WHERE id=?`, [...vals, data.id]);
  } else {
    const ph = cols.map(() => '?').join(',');
    run(`INSERT INTO photos (${cols.join(',')}) VALUES (${ph})`, vals);
  }
  await persist();
  return data.id || lastInsertId();
}

export async function deletePhoto(id) {
  run('DELETE FROM photos WHERE id=?', [id]);
  await persist();
}

export async function updatePhotoCaption(id, caption) {
  run('UPDATE photos SET caption=? WHERE id=?', [caption, id]);
  await persist();
}

export async function updatePhotoOrder(orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    run('UPDATE photos SET sort_order=? WHERE id=?', [i, orderedIds[i]]);
  }
  await persist();
}

export function listPhotos(case_id) {
  return query('SELECT * FROM photos WHERE case_id=? ORDER BY sort_order, id', [case_id]);
}

// Thin projection used for listings (omits huge data_url for performance).
export function listPhotosSummary(case_id) {
  return query('SELECT id, filename, caption, sort_order FROM photos WHERE case_id=? ORDER BY sort_order, id', [case_id]);
}

// ---- Costs (for profit calculation) ---------------------------------------
const COST_FIELDS = ['case_id','cost_type','amount_jpy','vendor','cost_date','note'];

export async function saveCost(data) {
  const cols = COST_FIELDS;
  const vals = cols.map(k => {
    const v = data[k];
    if (v === '' || v === undefined) return null;
    return v;
  });
  if (data.id) {
    const sets = cols.map(c => `${c}=?`).join(', ');
    run(`UPDATE costs SET ${sets} WHERE id=?`, [...vals, data.id]);
  } else {
    const ph = cols.map(() => '?').join(',');
    run(`INSERT INTO costs (${cols.join(',')}) VALUES (${ph})`, vals);
  }
  await persist();
  return data.id || lastInsertId();
}

export async function deleteCost(id) {
  run('DELETE FROM costs WHERE id=?', [id]);
  await persist();
}

export function listCosts(case_id) {
  return query('SELECT * FROM costs WHERE case_id=? ORDER BY cost_date, id', [case_id]);
}

export function costsTotal(case_id) {
  const r = queryOne('SELECT COALESCE(SUM(amount_jpy),0) AS total FROM costs WHERE case_id=?', [case_id]);
  return Number(r?.total || 0);
}

// ---- Document issue log ---------------------------------------------------
export async function logDocIssued(case_id, doc_type, issued_by = '') {
  const last = queryOne(
    'SELECT MAX(version) AS v FROM doc_issue_log WHERE case_id=? AND doc_type=?',
    [case_id, doc_type]);
  const version = (last?.v || 0) + 1;
  run(`INSERT INTO doc_issue_log (case_id, doc_type, version, issued_by, issued_at) VALUES (?, ?, ?, ?, ?)`,
      [case_id, doc_type, version, issued_by, new Date().toISOString()]);
  await persist();
  return version;
}

export function listDocIssueLog(case_id) {
  return query('SELECT * FROM doc_issue_log WHERE case_id=? ORDER BY issued_at DESC', [case_id]);
}

// ---- Registration events (for Preserved Record) --------------------------
const EVENT_FIELDS = [
  'case_id','sort_order','event_date','event_type','acceptance_number',
  'registration_number','owner_name','owner_address','user_name','user_address',
  'principal_place_of_use','scheduled_export_date','notes',
];

export async function replaceCaseEvents(case_id, events) {
  run('DELETE FROM registration_events WHERE case_id=?', [case_id]);
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const vals = EVENT_FIELDS.map(k => {
      if (k === 'case_id') return case_id;
      if (k === 'sort_order') return i;
      const v = e[k];
      return (v === '' || v === undefined) ? null : v;
    });
    const ph = EVENT_FIELDS.map(() => '?').join(',');
    run(`INSERT INTO registration_events (${EVENT_FIELDS.join(',')}) VALUES (${ph})`, vals);
  }
  await persist();
}

export function listCaseEvents(case_id) {
  return query('SELECT * FROM registration_events WHERE case_id=? ORDER BY sort_order, id', [case_id]);
}

// ---- Users (authentication) -----------------------------------------------
const USER_FIELDS = [
  'username','display_name','password_hash','password_salt','role','is_active',
  'totp_secret','totp_enabled','failed_login_count','lock_until',
  'password_changed_at','last_login_at',
];

export async function createUser(data) {
  const cols = USER_FIELDS;
  const vals = cols.map(k => {
    const v = data[k];
    if (v === '' || v === undefined) return null;
    return v;
  });
  const ph = cols.map(() => '?').join(',');
  run(`INSERT INTO users (${cols.join(',')}) VALUES (${ph})`, vals);
  const id = lastInsertId();
  await persist();
  return id;
}

export async function updateUser(id, data) {
  const cols = Object.keys(data).filter(k => USER_FIELDS.includes(k));
  if (!cols.length) return;
  const vals = cols.map(k => {
    const v = data[k];
    if (v === '' || v === undefined) return null;
    return v;
  });
  const sets = cols.map(c => `${c}=?`).join(', ');
  run(`UPDATE users SET ${sets} WHERE id=?`, [...vals, id]);
  await persist();
}

export async function deleteUser(id) {
  run('DELETE FROM users WHERE id=?', [id]);
  await persist();
}

export function getUserByUsername(username) {
  return queryOne('SELECT * FROM users WHERE username=?', [username]);
}

export function getUser(id) {
  return queryOne('SELECT * FROM users WHERE id=?', [id]);
}

export function listUsers() {
  return query('SELECT id, username, display_name, role, is_active, created_at, last_login_at FROM users ORDER BY id');
}

export function usersCount() {
  const r = queryOne('SELECT COUNT(*) AS c FROM users');
  return Number(r?.c || 0);
}

// ---- Audit log ------------------------------------------------------------
export async function appendAuditLog(entry) {
  run(
    `INSERT INTO audit_log (actor_user_id, actor_username, action, target_type, target_id, summary)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.actor_user_id ?? null,
      entry.actor_username ?? null,
      entry.action ?? null,
      entry.target_type ?? null,
      entry.target_id ?? null,
      entry.summary ?? null,
    ]
  );
  await persist();
}

export function listAuditLog({ limit = 500, action = null, actorId = null } = {}) {
  const where = [];
  const params = [];
  if (action) { where.push('action LIKE ?'); params.push(`%${action}%`); }
  if (actorId) { where.push('actor_user_id = ?'); params.push(actorId); }
  const sql = `SELECT * FROM audit_log${where.length ? ' WHERE ' + where.join(' AND ') : ''}
               ORDER BY created_at DESC LIMIT ?`;
  return query(sql, [...params, limit]);
}

// ---- Settings (key-value store for system-wide config) -------------------
export function getSetting(key, defaultValue = null) {
  const r = queryOne('SELECT value FROM settings WHERE key=?', [key]);
  if (!r) return defaultValue;
  try { return JSON.parse(r.value); } catch { return r.value; }
}

export async function setSetting(key, value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const existing = queryOne('SELECT key FROM settings WHERE key=?', [key]);
  if (existing) {
    run('UPDATE settings SET value=? WHERE key=?', [serialized, key]);
  } else {
    run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, serialized]);
  }
  await persist();
}

// Suggest the next Case Code given a prefix pattern.
// Pattern examples:
//   "RAYA_{###}"     → RAYA_001, RAYA_002, ...
//   "{YY}{MM}-{##}"  → 2510-01, 2510-02, ... (resets per month)
//   "CASE-{YYYY}-{###}" → CASE-2025-001
export function nextSequenceFromPattern(pattern, table = 'cases', column = 'case_code') {
  if (!pattern) return '';
  const now = new Date();
  const tokens = {
    YYYY: String(now.getFullYear()),
    YY:   String(now.getFullYear()).slice(-2),
    MM:   String(now.getMonth() + 1).padStart(2, '0'),
    DD:   String(now.getDate()).padStart(2, '0'),
  };
  // Replace date tokens first
  let prefix = pattern;
  for (const [tok, val] of Object.entries(tokens)) {
    prefix = prefix.replace(new RegExp(`\\{${tok}\\}`, 'g'), val);
  }
  // Find the {##...} placeholder (sequence width)
  const seqMatch = prefix.match(/\{(#+)\}/);
  if (!seqMatch) return prefix;
  const width = seqMatch[1].length;
  const seqToken = seqMatch[0];
  const prefixBefore = prefix.slice(0, prefix.indexOf(seqToken));
  const suffixAfter  = prefix.slice(prefix.indexOf(seqToken) + seqToken.length);

  // Find the highest existing number that matches the pattern
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^' + escape(prefixBefore) + '(\\d+)' + escape(suffixAfter) + '$');
  const rows = query(`SELECT ${column} AS v FROM ${table} WHERE ${column} IS NOT NULL`);
  let max = 0;
  for (const r of rows) {
    const m = String(r.v).match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const next = String(max + 1).padStart(width, '0');
  return prefixBefore + next + suffixAfter;
}

// ---- Import / Export ------------------------------------------------------
export function exportDB() {
  return db.export();
}

export async function importDB(bytes) {
  db.close();
  db = new SQL.Database(bytes);
  db.exec(SCHEMA);
  await persist();
}
