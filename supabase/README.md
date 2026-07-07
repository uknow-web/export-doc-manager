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

---

# Step 3: Buyer / AP Holder ポータルの招待設定

外部の Buyer / AP Holder が自分でログインして自社の案件を閲覧できる
ポータルです。招待メール送信に **service_role キー** を使うため、
Vercel 側の環境変数設定が必要です。

## A. Vercel 環境変数を設定

Vercel ダッシュボード → プロジェクト → Settings → Environment Variables に
以下の3つ（既にあるものは流用可）を追加 → 再デプロイ:

| 変数名 | 値 |
|---|---|
| `SUPABASE_URL` | `https://jlqeauvotbnzwlgxklim.supabase.co` |
| `SUPABASE_ANON_KEY` | anon public キー |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role キー**（Project Settings → API Keys。秘密厳守） |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` はサーバー側（`/api/invite`）でのみ使われ、
> ブラウザには絶対に渡りません。アプリの画面には入力しないでください。

## B. Supabase の Redirect URL を許可

Supabase ダッシュボード → Authentication → URL Configuration:

- **Site URL**: `https://export-doc-manager.vercel.app`
- **Redirect URLs** に追加: `https://export-doc-manager.vercel.app/set-password`

（独自ドメインを使う場合はそのドメインも追加）

## C. 招待メールの文面（任意）

Authentication → Email Templates → 「Invite user」テンプレートを
日本語に編集できます。リンクは `{{ .ConfirmationURL }}` のままにしてください。

## D. 招待の送り方（アプリ操作）

1. 管理者でログイン → 「Seller / Buyer 管理」
2. 招待したい Buyer または AP Holder の行の「📧 ポータル招待」ボタン
3. 相手のメールアドレスを入力 → 送信
4. 相手に招待メールが届く → リンクをクリック → パスワード設定画面
5. パスワード設定後、自動的に自分専用ポータルにログイン

## E. ポータルで見えるもの（RLSで自動制御）

- **Buyer**: 自分が primary_buyer または書類のbuyerになっている案件のみ
- **AP Holder**: 自分が ap_holder（案件 or 書類 or 履歴）の案件のみ
- 原価・他社の案件・社内管理画面は一切見えません（RLSでサーバー側強制）

---

# Step 4: 公開ショップ（マレーシア顧客向け購入サイト）

在庫車両を `https://export-doc-manager.vercel.app/shop` で一般公開し、
購入申込を受け付ける機能です。

## A. SQL を実行

SQL Editor で `supabase/migrations/004_shop.sql` を実行してください。
（shop_listings / shop_inquiries テーブルと公開用ビューが作成されます）

## B. 使い方

1. 管理画面にログイン → 「🛒 ショップ管理」タブ
2. 掲載する案件を選択 → 英語タイトル・価格・紹介文を入力 → 「公開中」で保存
3. 公開サイト `/shop` に表示される（写真・スペック・価格のみ。原価やシャシ番号などの社内情報は公開されません）
4. 顧客が購入申込 → 「購入申込・問い合わせ」欄に表示
5. 「Buyer登録+招待」ボタン → Buyer登録 → 既存のポータル招待メールを送信
6. 以後、その顧客はポータルで自分の案件の進捗を追跡できます

## セキュリティ設計

- 公開されるのは `shop_catalog` / `shop_listing_photos` ビューの厳選カラムのみ
- 未ログイン客ができる書き込みは `shop_inquiries` への INSERT だけ（読み返し不可）
- 掲載・申込対応の操作は editor 以上のスタッフのみ（RLSで強制）

## トラブルシューティング（Step 3）

| 症状 | 対処 |
|---|---|
| 招待ボタンで `環境変数が未設定` | A の3変数を Vercel に設定 → 再デプロイ |
| `招待を送れるのは管理者のみ` | ログイン中のアカウントが admin か確認 |
| リンクを開いて `リンクが無効か期限切れ` | B のRedirect URL未登録、または24時間超過。再招待 |
| ポータルに案件が出ない | その party が案件の Buyer/AP Holder に設定されているか確認 |
