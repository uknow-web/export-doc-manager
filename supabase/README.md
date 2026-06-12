# Supabase クラウド移行 セットアップガイド (Step 1)

ローカル（ブラウザ内）SQLite から Supabase Postgres へデータを移行するための手順です。
**所要時間: 約15分**（Supabaseアカウント作成含む）

---

## 1. Supabase プロジェクトを作成する

1. https://supabase.com/ を開き「Start your project」→ GitHub または メールでサインアップ（無料）
2. 「New Project」をクリック
3. 以下を設定:
   | 項目 | 設定値 |
   |---|---|
   | Name | `export-doc-manager`（任意） |
   | Database Password | **強固なパスワードを生成して保管**（後で使うことは稀） |
   | Region | **Northeast Asia (Tokyo)** ← 必ず東京を選択 |
4. 「Create new project」→ 1〜2分でプロビジョニング完了

## 2. スキーマとRLSポリシーを流し込む

1. 左メニュー「SQL Editor」→「New query」
2. このリポジトリの `supabase/migrations/001_schema.sql` の内容を全コピー＆ペースト → 「Run」
   - `Success. No rows returned` と出ればOK
3. 同様に `supabase/migrations/002_rls.sql` を実行
4. 同様に `supabase/migrations/003_archive_documents.sql` を実行（提出書類アーカイブ用）

## 3. 管理者ユーザーを作成する

1. 左メニュー「Authentication」→「Users」→「Add user」→「Create new user」
2. 自分のメールアドレスとパスワードを入力（**Auto Confirm User にチェック**）
3. 作成されたユーザーの行をクリックし、**UUID をコピー**（または次のSQLでメール指定）
4. SQL Editor で以下を実行（メールアドレスは自分のものに置換）:

```sql
update public.profiles
set role = 'admin', username = 'admin', display_name = '管理者'
where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');
```

> `profiles` 行はユーザー作成時にトリガーで自動生成されています（デフォルト role='viewer'）。
> 上のSQLで admin に昇格させます。

## 4. API キーを取得する

1. 左メニュー「Project Settings」→「API」
2. 以下の2つをコピー:
   - **Project URL** — `https://xxxx.supabase.co`
   - **anon public** キー — `eyJhbGciOi...`（公開しても安全な設計のキー。RLSがデータを守る）

> ⚠️ `service_role` キーは**絶対にコピーしない・アプリに貼らない**こと。RLSをバイパスする全権キーです。

## 5. アプリから移行を実行する

1. Export Document Manager に **adminでログイン**
2. 「設定」タブ → 「☁️ クラウド移行」
3. 手順4でコピーした URL / anon キー、手順3で作った管理者のメール / パスワードを入力
4. 「**1. 接続テスト＆サインイン**」→ 緑のOKが出るまで確認
5. 「**2. 全データを移行**」→ 進捗バーが100%になるまで待つ
6. 「**3. 件数照合**」→ 全テーブル ✅ になれば移行完了

- 移行は**再実行可能**（同じIDは上書き）。エラーが出たらもう一度「全データを移行」
- ローカルデータは消えません。アプリは引き続きローカルDBで動きます（クラウド切替は Step 2）

## 6. スタッフユーザーの再作成について

ローカルの users テーブル（パスワード）は**移行されません**。
Supabase Auth でスタッフを追加してください:

1. Authentication → Users → Add user で各スタッフを作成
2. SQL Editor でロールを設定:

```sql
update public.profiles set role = 'editor'  -- または 'viewer'
where id = (select id from auth.users where email = 'staff@example.com');
```

Buyer / AP Holder ポータルユーザーは Step 3 で招待フローを実装します（手作業不要）。

---

## トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| 接続テストで `profiles の取得に失敗` | 001/002 のSQLが未実行 → 手順2を確認 |
| `admin role required` / `role が viewer` | 手順3のUPDATE文が未実行 |
| 移行で `new row violates row-level security` | サインインユーザーが admin でない |
| `relation "xxx" does not exist` | 001_schema.sql の実行が部分的に失敗 → 再実行 |
| 写真の移行が遅い | 正常です（Base64を1枚ずつ送信）。Step 2 で Storage に移します |

## 次のステップ

- **Step 2**: アプリ本体をクラウドDB読み書きに切替（db.js置換・Supabase Auth・写真Storage化）
- **Step 3**: Buyer / AP Holder の実ログインポータル + 招待メール
