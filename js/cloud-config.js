// ============================================================================
// クラウド接続設定の解決
// ----------------------------------------------------------------------------
// 優先順位:
//   1. URLクエリ ?local=1            → 強制ローカルモード（開発・緊急用の逃げ道）
//   2. localStorage (edm_supabase_*) → ログイン画面の接続設定で保存された値
//   3. 下記の焼き込み定数            → デプロイ時の既定値
//
// anon キーは「公開キー」です（RLSがデータを守る設計）。コードに含めても
// セキュリティ上の問題はありませんが、リポジトリ公開範囲に応じて
// localStorage 運用も選べるよう両対応にしています。
// ============================================================================

// デプロイ済みの既定値（このプロジェクト専用）
// anon キーは Supabase 設計上の「公開キー」— RLS がデータを守るため、
// コードに焼き込んでも安全（招待されたポータルユーザーが設定なしで使える）
const BUILT_IN_URL = 'https://jlqeauvotbnzwlgxklim.supabase.co';
const BUILT_IN_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpscWVhdXZvdGJuendsZ3hrbGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDAwNDUsImV4cCI6MjA5NjgxNjA0NX0.7SfLTCB19aipPYjMSQN-nb170YGiIhpxnLKG_qFRN6A';

const LS_URL = 'edm_supabase_url';
const LS_KEY = 'edm_supabase_anon_key';

export function getCloudConfig() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('local') === '1') {
    return { mode: 'local', url: null, anonKey: null };
  }
  const url = localStorage.getItem(LS_URL) || BUILT_IN_URL;
  const anonKey = localStorage.getItem(LS_KEY) || BUILT_IN_ANON_KEY;
  if (url && anonKey) {
    return { mode: 'cloud', url, anonKey };
  }
  // URLはあるがキーが無い → ログイン画面で初回設定が必要な状態
  if (url && !anonKey) {
    return { mode: 'cloud-setup', url, anonKey: null };
  }
  return { mode: 'local', url: null, anonKey: null };
}

export function saveCloudConfig(url, anonKey) {
  localStorage.setItem(LS_URL, url.trim());
  localStorage.setItem(LS_KEY, anonKey.trim());
}

export function clearCloudConfig() {
  localStorage.removeItem(LS_URL);
  localStorage.removeItem(LS_KEY);
}

export function isCloudMode() {
  return getCloudConfig().mode === 'cloud';
}
