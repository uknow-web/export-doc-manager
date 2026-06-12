// ============================================================================
// クラウドDB層 — Supabase をプライマリ、ローカル sql.js をミラーにする
// ----------------------------------------------------------------------------
// アーキテクチャ（Step 2）:
//
//   読み取り: ログイン時に pullAllToMirror() で全テーブルを取得し、
//             メモリ内 sql.js DB に展開。既存の同期 read 関数は無改修で動く。
//
//   書き込み: db.js の各 save/delete 関数が cloud 関数を await
//             → Supabase に書けたらローカルミラーへ反映（ライトスルー）。
//             INSERT の ID は Supabase 採番（複数ユーザーの衝突を防ぐ）。
//
//   鮮度:     他ユーザーの変更はログイン時 or 「🔄 再読込」で反映。
//             リアルタイム同期は Step 3 で Supabase Realtime を検討。
// ============================================================================

import { getCloudConfig } from './cloud-config.js';

let sb = null;          // Supabase クライアント（シングルトン）
let cloudActive = false; // pull 完了後 true → db.js がライトスルーを有効化

export function isCloudActive() { return cloudActive; }
export function setCloudActive(v) { cloudActive = !!v; }
export function getClient() { return sb; }

/** クライアント初期化（セッションは localStorage に永続化される） */
export function initCloudClient() {
  if (sb) return sb;
  const cfg = getCloudConfig();
  if (cfg.mode !== 'cloud') return null;
  if (!window.supabase?.createClient) {
    throw new Error('vendor/supabase.js が読み込まれていません');
  }
  sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return sb;
}

// ---------------------------------------------------------------------------
// 型変換 — Postgres boolean ⇄ SQLite 0/1
// ---------------------------------------------------------------------------
const BOOL_COLUMNS = {
  cases: ['is_favorite', 'dereg_transfer_needed'],
  case_dereg_checklist: ['completed'],
};

function toMirrorRow(table, row) {
  const out = { ...row };
  for (const col of BOOL_COLUMNS[table] || []) {
    if (col in out) out[col] = out[col] ? 1 : 0;
  }
  return out;
}

function toCloudRow(table, row) {
  const out = { ...row };
  for (const col of BOOL_COLUMNS[table] || []) {
    if (col in out) out[col] = !!out[col] && out[col] !== 0 && out[col] !== '0';
  }
  // SQLite の空文字は Postgres では null に寄せる（型エラー防止）
  for (const k of Object.keys(out)) {
    if (out[k] === '') out[k] = null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pull: 全テーブル → ローカルミラー
// ---------------------------------------------------------------------------
// 取得順は任意（sql.js は FK 強制無効）。1000行ずつページング。
const PULL_TABLES = [
  'parties', 'vehicle_models', 'cases', 'case_documents',
  'registration_events', 'payments', 'costs', 'photos',
  'doc_issue_log', 'ap_holder_history', 'case_dereg_checklist',
  'case_documents_archive', 'settings',
];

async function fetchAllRows(table) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} の取得失敗: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/**
 * Supabase の全データをローカル sql.js ミラーに展開する。
 * @param {object} dbApi — db.js の { run, query } を受け取る（循環import回避）
 * @param {(msg: string) => void} onLog
 */
export async function pullAllToMirror(dbApi, onLog = () => {}) {
  const { run } = dbApi;
  for (const table of PULL_TABLES) {
    const rows = await fetchAllRows(table);
    run(`DELETE FROM ${table}`);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]).filter(c => c !== 'storage_path' && c !== 'actor_uuid');
    const ph = cols.map(() => '?').join(',');
    for (const row of rows) {
      const m = toMirrorRow(table, row);
      run(
        `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${ph})`,
        cols.map(c => m[c] === undefined ? null : m[c])
      );
    }
    onLog(`${table}: ${rows.length}行`);
  }
  // audit_log は直近のみ（肥大化対策）
  const { data: audits, error: auditErr } = await sb
    .from('audit_log')
    .select('id, actor_user_id, actor_username, action, target_type, target_id, summary, ip, created_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (!auditErr && audits) {
    run('DELETE FROM audit_log');
    for (const a of audits) {
      run(
        `INSERT OR REPLACE INTO audit_log
         (id, actor_user_id, actor_username, action, target_type, target_id, summary, ip, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [a.id, a.actor_user_id, a.actor_username, a.action, a.target_type,
         a.target_id, a.summary, a.ip, a.created_at]
      );
    }
    onLog(`audit_log: ${audits.length}行（直近分）`);
  }
}

// ---------------------------------------------------------------------------
// Push: ライトスルーヘルパー（db.js の書き込み関数から呼ばれる）
// ---------------------------------------------------------------------------

/** INSERT — Supabase 採番の ID を返す。失敗時は throw。 */
export async function cloudInsert(table, data) {
  const row = toCloudRow(table, data);
  delete row.id; // 採番はクラウド側
  const { data: inserted, error } = await sb
    .from(table)
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`クラウド保存失敗 (${table}): ${error.message}`);
  return toMirrorRow(table, inserted);
}

/** UPDATE by id。失敗時は throw。 */
export async function cloudUpdate(table, id, data) {
  const row = toCloudRow(table, data);
  delete row.id;
  const { error } = await sb.from(table).update(row).eq('id', id);
  if (error) throw new Error(`クラウド更新失敗 (${table}#${id}): ${error.message}`);
}

/** DELETE by id。失敗時は throw（FK違反含む）。 */
export async function cloudDelete(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new Error('他のデータから参照されているため削除できません');
    }
    throw new Error(`クラウド削除失敗 (${table}#${id}): ${error.message}`);
  }
}

/** 条件付き DELETE（カラム一致）。 */
export async function cloudDeleteWhere(table, column, value) {
  const { error } = await sb.from(table).delete().eq(column, value);
  if (error) throw new Error(`クラウド削除失敗 (${table}): ${error.message}`);
}

/** UPSERT（onConflict 指定） — 反映後の行を返す。 */
export async function cloudUpsert(table, data, conflictColumns) {
  const row = toCloudRow(table, data);
  if (row.id == null) delete row.id;
  const { data: saved, error } = await sb
    .from(table)
    .upsert(row, { onConflict: conflictColumns })
    .select('*')
    .single();
  if (error) throw new Error(`クラウド保存失敗 (${table}): ${error.message}`);
  return toMirrorRow(table, saved);
}

/** 任意条件の UPDATE（vehicle_model_id の付け替え等）。 */
export async function cloudUpdateWhere(table, column, value, patch) {
  const { error } = await sb.from(table).update(toCloudRow(table, patch)).eq(column, value);
  if (error) throw new Error(`クラウド更新失敗 (${table}): ${error.message}`);
}

// ---------------------------------------------------------------------------
// profiles（ユーザー管理） — クラウドモードでは users テーブルの代替
// ---------------------------------------------------------------------------
let profilesCache = [];

export async function refreshProfilesCache() {
  const { data, error } = await sb
    .from('profiles')
    .select('id, username, display_name, role, party_id, is_active, created_at')
    .order('created_at');
  if (error) throw new Error('profiles 取得失敗: ' + error.message);
  profilesCache = data || [];
  return profilesCache;
}

export function getProfilesCache() { return profilesCache; }

export async function updateProfile(id, patch) {
  const { error } = await sb.from('profiles').update(patch).eq('id', id);
  if (error) throw new Error('プロファイル更新失敗: ' + error.message);
  await refreshProfilesCache();
}

// ---------------------------------------------------------------------------
// 監査ログ（クラウド直書き）
// ---------------------------------------------------------------------------
export async function cloudAppendAudit(entry) {
  const { error } = await sb.from('audit_log').insert({
    actor_uuid: entry.actor_uuid ?? null,
    actor_username: entry.actor_username ?? null,
    action: entry.action ?? null,
    target_type: entry.target_type ?? null,
    target_id: entry.target_id ?? null,
    summary: entry.summary ?? null,
  });
  if (error) console.warn('audit_log insert failed:', error.message);
}
