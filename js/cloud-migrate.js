// ============================================================================
// クラウド移行エンジン — ローカル SQLite (sql.js) → Supabase Postgres
// ----------------------------------------------------------------------------
// メインアプリ内（設定 → クラウド移行）から実行する。
// ログイン済みでローカルDBが復号された状態で動くため、暗号化の問題は無い。
//
// 前提:
//   * Supabase 側で 001_schema.sql / 002_rls.sql が実行済み
//   * 移行実行者は Supabase 上で admin ロールの profiles を持つこと
//     (RLS の can_edit() を通すため)
//   * vendor/supabase.js (UMD) が読み込まれ window.supabase が存在すること
//
// 方針:
//   * id を明示 INSERT で保持（FK 整合性を守る）
//   * upsert(onConflict: id) — 再実行で部分失敗を修復できる冪等設計
//   * 依存順にテーブルを処理（親 → 子）
//   * users テーブルは移行しない（Supabase Auth に置換。README参照）
//   * 写真は1件ずつ（Base64で大きいため）、他は200行バッチ
// ============================================================================

import { query } from './db.js';

// 移行対象テーブル: [テーブル名, 行変換関数, バッチサイズ]
// 変換関数: SQLite の行 → Postgres の行（型変換が必要な列だけ触る）
const bool = v => !!v && v !== 0 && v !== '0';

const MIGRATION_PLAN = [
  {
    table: 'parties',
    batch: 200,
    transform: r => r,
  },
  {
    table: 'vehicle_models',
    batch: 200,
    transform: r => r,
  },
  {
    table: 'cases',
    batch: 100,
    transform: r => ({
      ...r,
      is_favorite: bool(r.is_favorite),
      dereg_transfer_needed: bool(r.dereg_transfer_needed),
      // SQLite の空文字日付を null に
      status_updated_at: r.status_updated_at || null,
      created_at: r.created_at || null,
    }),
  },
  {
    table: 'case_documents',
    batch: 200,
    transform: r => r,
  },
  {
    table: 'registration_events',
    batch: 200,
    transform: r => r,
  },
  {
    table: 'payments',
    batch: 200,
    transform: r => ({ ...r, created_at: r.created_at || null }),
  },
  {
    table: 'costs',
    batch: 200,
    transform: r => ({ ...r, created_at: r.created_at || null }),
  },
  {
    table: 'photos',
    batch: 1, // Base64 が大きいので1件ずつ
    transform: r => ({ ...r, created_at: r.created_at || null }),
  },
  {
    table: 'doc_issue_log',
    batch: 200,
    transform: r => ({ ...r, issued_at: r.issued_at || null }),
  },
  {
    table: 'audit_log',
    batch: 200,
    transform: r => ({
      ...r,
      created_at: r.created_at || null,
      // ローカルの整数IDは actor_user_id 列にそのまま保全
    }),
  },
  {
    table: 'ap_holder_history',
    batch: 200,
    transform: r => ({ ...r, changed_at: r.changed_at || null }),
  },
  {
    table: 'case_dereg_checklist',
    batch: 200,
    transform: r => ({
      ...r,
      completed: bool(r.completed),
      completed_at: r.completed_at || null,
    }),
  },
  {
    table: 'settings',
    batch: 200,
    transform: r => r,
    conflictKey: 'key',
  },
];

/** Supabase クライアントを生成（vendor/supabase.js の UMD グローバルを使用） */
export function createSupabaseClient(url, anonKey) {
  if (!window.supabase?.createClient) {
    throw new Error('vendor/supabase.js が読み込まれていません');
  }
  return window.supabase.createClient(url, anonKey, {
    auth: { persistSession: false }, // 移行ツールはセッション保存しない
  });
}

/** 接続 + サインイン + admin ロール確認。成功時はクライアントを返す */
export async function connectAndVerify(url, anonKey, email, password, onLog) {
  const log = onLog || (() => {});
  const sb = createSupabaseClient(url, anonKey);

  log('Supabase にサインイン中…');
  const { data: authData, error: authError } =
    await sb.auth.signInWithPassword({ email, password });
  if (authError) throw new Error('サインイン失敗: ' + authError.message);
  log(`サインイン成功: ${authData.user.email}`);

  log('プロファイル / ロールを確認中…');
  const { data: profile, error: profError } = await sb
    .from('profiles')
    .select('role, is_active')
    .eq('id', authData.user.id)
    .single();
  if (profError) {
    throw new Error(
      'profiles の取得に失敗: ' + profError.message +
      '\n→ 001_schema.sql / 002_rls.sql が実行済みか確認してください'
    );
  }
  if (!profile.is_active || profile.role !== 'admin') {
    throw new Error(
      `このユーザーのロールは "${profile.role}" です。移行には admin が必要です。\n` +
      '→ SQL Editor で UPDATE public.profiles SET role=\'admin\' WHERE id=auth.users のID を実行してください'
    );
  }
  log('admin ロール確認 OK');
  return sb;
}

/**
 * 全データを移行する。
 * @param {object} sb — connectAndVerify() が返したクライアント
 * @param {(msg: string) => void} onLog
 * @param {(done: number, total: number) => void} onProgress
 * @returns {{ migrated: Record<string, number>, errors: string[] }}
 */
export async function migrateAll(sb, onLog, onProgress) {
  const log = onLog || (() => {});
  const progress = onProgress || (() => {});
  const migrated = {};
  const errors = [];

  // 総行数を先に数える（進捗表示用）
  let totalRows = 0;
  const tableData = [];
  for (const plan of MIGRATION_PLAN) {
    const rows = query(`SELECT * FROM ${plan.table}`);
    tableData.push({ plan, rows });
    totalRows += rows.length;
  }
  log(`移行対象: ${MIGRATION_PLAN.length} テーブル / 合計 ${totalRows} 行`);

  let doneRows = 0;
  for (const { plan, rows } of tableData) {
    if (!rows.length) {
      log(`${plan.table}: 0行 — スキップ`);
      migrated[plan.table] = 0;
      continue;
    }
    log(`${plan.table}: ${rows.length}行を移行中…`);
    const transformed = rows.map(plan.transform);
    const conflictKey = plan.conflictKey || 'id';

    let tableMigrated = 0;
    for (let i = 0; i < transformed.length; i += plan.batch) {
      const chunk = transformed.slice(i, i + plan.batch);
      const { error } = await sb
        .from(plan.table)
        .upsert(chunk, { onConflict: conflictKey });
      if (error) {
        const msg = `${plan.table} (行 ${i + 1}〜${i + chunk.length}): ${error.message}`;
        errors.push(msg);
        log('❌ ' + msg);
        // このテーブルの残りは継続（部分成功を許容、再実行で修復可能）
      } else {
        tableMigrated += chunk.length;
      }
      doneRows += chunk.length;
      progress(doneRows, totalRows);
    }
    migrated[plan.table] = tableMigrated;
    log(`${plan.table}: ${tableMigrated}/${rows.length} 行 完了`);
  }

  // 明示IDでINSERTしたのでシーケンスを進める
  log('IDシーケンスをリセット中…');
  const { error: seqError } = await sb.rpc('reset_all_sequences');
  if (seqError) {
    errors.push('reset_all_sequences: ' + seqError.message);
    log('❌ シーケンスリセット失敗: ' + seqError.message);
  } else {
    log('シーケンスリセット OK');
  }

  return { migrated, errors };
}

/** 移行後の行数照合 — ローカルとクラウドの件数を比べて一覧を返す */
export async function verifyCounts(sb, onLog) {
  const log = onLog || (() => {});
  const results = [];
  for (const plan of MIGRATION_PLAN) {
    const localCount = query(`SELECT COUNT(*) AS c FROM ${plan.table}`)[0]?.c ?? 0;
    const { count, error } = await sb
      .from(plan.table)
      .select('*', { count: 'exact', head: true });
    const cloudCount = error ? `ERROR: ${error.message}` : count;
    const ok = !error && Number(localCount) === Number(cloudCount);
    results.push({ table: plan.table, local: localCount, cloud: cloudCount, ok });
    log(`${ok ? '✅' : '⚠️'} ${plan.table}: ローカル ${localCount} / クラウド ${cloudCount}`);
  }
  return results;
}
