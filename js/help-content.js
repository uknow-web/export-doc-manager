// ============================================================================
// Help / manual content for all features of the system.
// Content is organized by sections, rendered in the help modal.
// ============================================================================

export const HELP_SECTIONS = [
  // ===== OVERVIEW =====
  { group: '概要' },
  {
    id: 'overview',
    title: 'はじめに',
    content: `
<h1>Export Document Management System</h1>
<p>KMT Corporation 向けの車両輸出書類管理システムです。案件（車両輸出取引）を中心に、見積 → 発注確認 → インボイス → 船積 → 入金までを一気通貫で管理します。</p>

<h2>主な機能</h2>
<ul>
  <li>5種類の輸出書類を自動生成 — Sales Confirmation / Invoice / Shipping Instruction / Export Certificate / Preserved Record</li>
  <li>案件・Seller/Buyer・車両モデルをマスター管理</li>
  <li>進捗・決済ステータスの並行管理</li>
  <li>入金明細・原価明細による売上・粗利の可視化</li>
  <li>ダッシュボードでKPI・カンバン・月次推移を一画面で</li>
  <li>車検証/輸出抹消証明書のPDF・写真から自動入力（QR+OCR）</li>
  <li>自動採番・ロゴ付きテンプレート・入金/船積リマインダー</li>
  <li>書類一括ZIP発行、CSV入出力、SQLiteバックアップ</li>
</ul>

<h2>起動方法</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body">
    <p>プロジェクトフォルダにある <code>start.command</code> をダブルクリック</p>
  </div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body">
    <p>ターミナルが開いてローカルサーバーが起動（ポート 8765）</p>
  </div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body">
    <p>自動でブラウザが <code>http://localhost:8765/</code> を開く</p>
  </div>
</div>
<div class="help-step">
  <div class="help-step__num">4</div>
  <div class="help-step__body">
    <p>終了時はターミナルを閉じる、または <kbd>Ctrl</kbd>+<kbd>C</kbd></p>
  </div>
</div>

<blockquote>💡 データはブラウザ内（IndexedDB）に自動保存されます。別のPCへ移行する場合はヘッダーの「DBエクスポート」で .sqlite ファイルを出力し、移行先で「DBインポート」。</blockquote>
    `,
  },
  {
    id: 'quickstart',
    title: 'クイックスタート（5分で初回案件）',
    content: `
<h1>5分で始める初回案件作成</h1>
<p>初めて使う方向けの最短ルートです。順番通りに進めば初めの案件を登録して書類発行まで完了します。</p>

<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body">
    <p><strong>Buyer を登録</strong> — 「Seller / Buyer 管理」タブ → 「+ 新規Party」 → Role=Buyer → 会社名・住所・TELを入力 → 保存</p>
  </div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body">
    <p><strong>車両モデルを確認</strong> — 「車両モデル管理」タブ → サンプル「TOYOTA ALPHARD Z」が登録済み。必要に応じて新規追加</p>
  </div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body">
    <p><strong>案件を作成</strong> — 「案件一覧」タブ → 「+ 新規案件」</p>
  </div>
</div>
<div class="help-step">
  <div class="help-step__num">4</div>
  <div class="help-step__body">
    <p><strong>基本情報を入力</strong> — Case Code（例: RAYA_001）、Invoice Ref No、Seller=KMT、日付</p>
  </div>
</div>
<div class="help-step">
  <div class="help-step__num">5</div>
  <div class="help-step__body">
    <p><strong>車両情報タブ</strong> — 車両モデルを選択 → 「このモデルを適用」→ 個体情報（Chassis No.・Mileage・Exterior Color等）を入力 → CIF金額を入力</p>
  </div>
</div>
<div class="help-step">
  <div class="help-step__num">6</div>
  <div class="help-step__body">
    <p><strong>船積条件タブ</strong> — Vessel/Voyage/ETD/ETAを入力</p>
  </div>
</div>
<div class="help-step">
  <div class="help-step__num">7</div>
  <div class="help-step__body">
    <p><strong>「書類ごとの Buyer / 条件」タブ</strong> — 各書類に対してBuyerを指定</p>
  </div>
</div>
<div class="help-step">
  <div class="help-step__num">8</div>
  <div class="help-step__body">
    <p><strong>保存</strong> → 案件一覧に戻る → 「書類」ボタンで書類プレビュー → 「印刷/PDF出力」で発行</p>
  </div>
</div>

<blockquote>💡 慣れてきたら「設定 → 自動採番」でCase Codeを連番自動化、「設定 → テンプレート」でロゴを登録すると入力作業が大幅に減ります。</blockquote>
    `,
  },

  // ===== BASIC =====
  { group: '基本操作' },
  {
    id: 'cases',
    title: '案件一覧',
    content: `
<h1>案件一覧</h1>
<p>すべての輸出案件を一覧で管理する、このシステムの中心画面です。</p>

<h2>機能</h2>
<ul>
  <li><strong>検索</strong> — 案件コード・シャシ番号・Invoice Ref No で絞り込み</li>
  <li><strong>進捗フィルタ</strong> — 問合せ / SC発行済み / Invoice発行済み / SI発行済み / 船積完了 / 入港済み / 完了 / キャンセル</li>
  <li><strong>決済フィルタ</strong> — 未入金 / 一部入金 / 入金完了 / キャンセル</li>
  <li><strong>サマリ表示</strong> — 件数、CIF合計、入金完了率、入金済み金額、未回収残高、粗利</li>
</ul>

<h2>アクション列の各ボタン</h2>
<table>
  <tr><th>ボタン</th><th>動作</th></tr>
  <tr><td>編集</td><td>案件編集画面を開く（全情報を編集可能）</td></tr>
  <tr><td>書類</td><td>書類プレビュー画面にジャンプ</td></tr>
  <tr><td>複製</td><td>案件をコピーして新規作成（モデル情報・船積条件は引継、個体差はクリア）</td></tr>
</table>

<h2>ステータスバッジ</h2>
<p>進捗・決済は色分けバッジで一目でわかります:</p>
<ul>
  <li>グレー = 問合せ / キャンセル</li>
  <li>青系 = SC / Invoice / SI 発行済み</li>
  <li>緑 = 入金完了・案件完了</li>
  <li>赤 = 未入金・キャンセル</li>
  <li>黄 = 一部入金</li>
</ul>
    `,
  },
  {
    id: 'parties',
    title: 'Seller / Buyer 管理',
    content: `
<h1>Seller / Buyer 管理</h1>
<p>取引相手（輸出者・輸入者・通知先）を一元管理します。初回登録しておけば、以降の案件で選択するだけで使えます。</p>

<h2>3つのロール</h2>
<table>
  <tr><th>ロール</th><th>用途</th><th>登録する項目</th></tr>
  <tr><td>Seller（輸出者）</td><td>自社</td><td>会社名・住所・TEL・Email・銀行情報一式</td></tr>
  <tr><td>Buyer（輸入者）</td><td>取引先</td><td>会社名・住所・TEL・Email・担当者</td></tr>
  <tr><td>Notify Party（通知先）</td><td>SI上の通知先</td><td>会社名・住所・TEL</td></tr>
</table>

<h2>Seller の銀行情報</h2>
<p>Sales Confirmation / Invoice のフッターに自動的に印字されます。以下の項目を登録:</p>
<ul>
  <li>Bank Name（例: MUFG BANK,LTD.）</li>
  <li>Branch Name / Branch Code / Bank Address</li>
  <li>Account No. / Account Name</li>
  <li>Swift Code</li>
</ul>

<h2>書類ごとに異なるBuyerを指定できる</h2>
<p>Sales Confirmation と Invoice で宛先が異なる運用にも対応。案件編集 → 「書類ごとの Buyer / 条件」タブで書類ごとに指定します。</p>
<blockquote>例: Sales Confirmation → TRES BUMI SDN BHD、Invoice → RAYA KHAS SDN BHD</blockquote>
    `,
  },
  {
    id: 'models',
    title: '車両モデル管理',
    content: `
<h1>車両モデル管理</h1>
<p>車種ごとに繰り返し使う共通情報（メーカー/型式/HSコード/標準装備等）をマスター登録します。案件編集画面で「このモデルを適用」ボタンから一括入力できます。</p>

<h2>マスターで管理する項目</h2>
<ul>
  <li>Maker / Model Name / Model Code</li>
  <li>Engine Capacity / Displacement (CC) / Fuel</li>
  <li>Weight (kg) / Measurement (M3)</li>
  <li>HS Code</li>
  <li>標準 Specification（箇条書きの装備一覧）</li>
</ul>

<h2>案件ごとに入力する項目</h2>
<ul>
  <li>Year / Month（年式）</li>
  <li>Chassis No. / Engine No.</li>
  <li>Mileage</li>
  <li>Exterior Color</li>
  <li>Auction Grade</li>
  <li>Remark（個体の特記事項・キズなど）</li>
</ul>

<h2>使い方</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>「車両モデル管理」タブ → 「+ 新規モデル」</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>共通情報と標準装備を入力して保存</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>案件編集 → 車両情報タブ → モデルを選択 → 「このモデルを適用」</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">4</div>
  <div class="help-step__body"><p>自動入力された項目を確認し、個体差（Chassis No.等）を追加入力</p></div>
</div>

<blockquote>モデル定義を後から編集しても、既に発行済みの書類の内容は変わりません（案件に値がコピー保存されるため）。</blockquote>
    `,
  },
  {
    id: 'editor',
    title: '案件編集画面（9タブ）',
    content: `
<h1>案件編集画面</h1>
<p>すべての案件情報を9つのタブに分けて管理します。タブ上部はスクロールしても固定表示されるので切替が楽です。</p>

<h2>9つのタブ</h2>
<table>
  <tr><th>タブ</th><th>内容</th></tr>
  <tr><td>案件情報</td><td>Case Code・Invoice Ref No・日付・Seller・ステータス（進捗/決済/メモ）</td></tr>
  <tr><td>車両情報</td><td>モデル選択と車両の全情報（Maker/Chassis No/Specification等）</td></tr>
  <tr><td>船積条件</td><td>Vessel/Voyage/ETD/ETA/Ports/Delivery Term</td></tr>
  <tr><td>Shipping Instruction 情報</td><td>Shipping Company/Booking/Notify Party/搬入先等</td></tr>
  <tr><td>Export Certificate / Preserved Record 情報</td><td>官公庁書類用フィールド + 車検証アップロード</td></tr>
  <tr><td>登録履歴</td><td>Preserved Record用の登録イベント（新規登録・移転登録・輸出抹消）</td></tr>
  <tr><td>入金明細</td><td>入金の複数回記録、残高自動計算</td></tr>
  <tr><td>原価明細</td><td>仕入・手数料・輸送費などコスト記録、粗利自動算出</td></tr>
  <tr><td>書類ごとの Buyer / 条件</td><td>書類ごとの発行条件（Buyer・Terms・日付）</td></tr>
</table>

<h2>件数バッジ</h2>
<p>登録履歴・入金明細・原価明細タブには、登録件数が小さな数字バッジで表示されます（0件時は非表示）。</p>

<h2>保存時の検証</h2>
<blockquote>必須項目（Case Code・Seller等）が未入力のまま別タブから保存すると、自動的に未入力項目のあるタブへジャンプします。</blockquote>

<h2>複数案件対応</h2>
<p>同一車両で複数Buyer運用も可能。「書類ごとの Buyer / 条件」タブで書類ごとにBuyerを選べます。</p>
    `,
  },
  {
    id: 'status',
    title: 'ステータス管理',
    content: `
<h1>ステータス管理</h1>
<p>案件は「進捗」と「決済」の2軸で並行管理されます。</p>

<h2>進捗ステータス（8段階）</h2>
<ol>
  <li><strong>問合せ</strong> — 見積段階</li>
  <li><strong>SC発行済み</strong> — Sales Confirmation送付済み</li>
  <li><strong>Invoice発行済み</strong> — インボイス発行済み</li>
  <li><strong>SI発行済み</strong> — Shipping Instruction発行済み</li>
  <li><strong>船積完了</strong> — 本船積込み完了</li>
  <li><strong>入港済み</strong> — 荷揚地到着</li>
  <li><strong>完了</strong> — すべての手続きが完了</li>
  <li><strong>キャンセル</strong></li>
</ol>

<h2>決済ステータス（4段階）</h2>
<ol>
  <li><strong>未入金</strong></li>
  <li><strong>一部入金</strong> — 入金明細が請求額未満</li>
  <li><strong>入金完了</strong> — 入金明細が請求額以上</li>
  <li><strong>キャンセル</strong></li>
</ol>

<h2>自動更新</h2>
<ul>
  <li><strong>進捗</strong>: 書類を発行すると「◯◯発行済み」を自動提案（トースト通知、保存時反映）。船積以降は手動で設定</li>
  <li><strong>決済</strong>: 入金明細を追加/削除するたびに自動再計算（「キャンセル」は手動ステータスとして保持）</li>
</ul>

<blockquote>ステータスのメモ欄は自由記述。「一部入金 500万円（2025-10-01）、残金は船積後」などの補足を記録できます。</blockquote>
    `,
  },

  {
    id: 'detail-view',
    title: '案件詳細ビュー',
    content: `
<h1>案件詳細ビュー</h1>
<p>案件のすべての情報を1画面で俯瞰できる閲覧専用ビューです。編集画面と違って書類発行状況・入金進捗・写真まで一画面でわかります。</p>

<h2>表示内容</h2>
<ul>
  <li><strong>ヘッダー</strong>: 案件コード、進捗/決済バッジ、Buyer、ETD/ETA</li>
  <li><strong>車両情報カード</strong>: Maker/モデル・Chassis No・Mileage・CIF金額など</li>
  <li><strong>船積情報カード</strong>: Vessel・Ports・Booking No.等</li>
  <li><strong>書類発行状況</strong>: 5書類それぞれの発行済み/未発行、版番号、発行日</li>
  <li><strong>登録履歴タイムライン</strong>: 新規登録→移転→輸出抹消の時系列表示</li>
  <li><strong>取引相手カード</strong>: Seller/Buyer/Notify Party</li>
  <li><strong>入金進捗バー</strong>: 請求額/入金済み/残高 + 入金履歴</li>
  <li><strong>原価/粗利</strong>: 原価の明細と粗利率</li>
  <li><strong>写真アルバム</strong>: 車両写真の一覧と管理</li>
</ul>

<h2>使い方</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>案件一覧 → 任意の案件の「詳細」ボタン</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>情報を確認</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>「編集」ボタンで編集画面にジャンプ、または「🖨 印刷」でお客様向け案件レポートとして印刷</p></div>
</div>

<h2>書類のワンクリック発行</h2>
<p>書類発行状況の各書類の「発行」ボタンをクリック → 自動で発行前チェックが走り、問題なければ書類プレビュー画面へ直行します。</p>

<blockquote>💡 印刷モードでは編集ボタン等が非表示になり、1枚の案件レポート風に印字されます。取引先へのステータス報告にも使えます。</blockquote>
    `,
  },
  {
    id: 'photos',
    title: '写真アルバム',
    content: `
<h1>写真アルバム</h1>
<p>車両の写真を案件に紐付けて管理できます。</p>

<h2>機能</h2>
<ul>
  <li>ドラッグ&ドロップまたはファイル選択でアップロード</li>
  <li>複数ファイル同時アップロード対応</li>
  <li>自動リサイズ（長辺1600px、JPEG 85%）— 元ファイルが3MBを超えても最適化</li>
  <li>クリックで拡大表示（ライトボックス）</li>
  <li>マウスオーバーで削除ボタン表示</li>
  <li>一括発行ZIPに写真インデックスが同梱される</li>
</ul>

<h2>対応する画像形式</h2>
<ul>
  <li>PNG / JPG / WebP / HEIC（ブラウザが対応していれば）</li>
  <li>1枚あたり3MBまで</li>
</ul>

<h2>2箇所からアクセス可能</h2>
<ul>
  <li><strong>案件編集画面の「写真」タブ</strong> — 撮影・登録作業用</li>
  <li><strong>案件詳細ビューの写真セクション</strong> — 閲覧・確認用</li>
</ul>

<h2>使い方</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>案件を保存してから、写真タブを開く</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>ドロップゾーンに画像をドラッグするか、クリックしてファイル選択</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>サムネイル上にカーソル → × ボタンで削除 / クリックで拡大</p></div>
</div>

<blockquote>写真はDBに直接保存されるため、DBエクスポート時に一緒にバックアップされます。別ファイル管理不要。</blockquote>

<blockquote class="warn">多数の写真を保存するとDBサイズが急速に大きくなります（1枚あたり〜200KB）。1案件あたり20枚を目安に。</blockquote>
    `,
  },
  {
    id: 'validation',
    title: '発行前チェックリスト',
    content: `
<h1>発行前チェックリスト</h1>
<p>書類を発行する前に、必要な項目が埋まっているかを自動チェックします。</p>

<h2>チェックされるタイミング</h2>
<ul>
  <li>書類プレビューの「印刷 / PDF出力」ボタン押下時</li>
  <li>案件詳細ビューの書類発行ボタン押下時</li>
</ul>

<h2>2段階のレベル</h2>
<table>
  <tr><th>レベル</th><th>意味</th><th>対応</th></tr>
  <tr><td>❌ エラー</td><td>必須項目が未設定</td><td>警告モーダル表示、「それでも発行」or「編集に戻る」</td></tr>
  <tr><td>⚠️ 警告</td><td>推奨項目が未設定</td><td>警告モーダル表示、発行は可能</td></tr>
</table>

<h2>書類別のチェック項目</h2>

<h3>Sales Confirmation（エラー）</h3>
<ul>
  <li>Case Code / Seller / CIF金額 / Buyer(SC用)</li>
  <li>Seller の会社名・住所</li>
</ul>

<h3>Invoice（エラー）</h3>
<ul>
  <li>上記に加えて Invoice Date / Invoice用Buyer</li>
  <li>Seller の Bank 情報</li>
</ul>
<h3>Invoice（警告）</h3>
<ul>
  <li>Payment Due Date / Vessel / ETD / ETA</li>
</ul>

<h3>Shipping Instruction（エラー）</h3>
<ul>
  <li>Shipping Company / Vessel / ETD / Ports / Chassis No.</li>
</ul>
<h3>Shipping Instruction（警告）</h3>
<ul>
  <li>Weight / Measurement / HS Code / Notify Party</li>
</ul>

<h3>Export Certificate（エラー）</h3>
<ul>
  <li>Chassis No. / Registration No. / 各種日付</li>
</ul>

<h3>Preserved Record（エラー）</h3>
<ul>
  <li>Chassis No. / Registration No.</li>
</ul>
<h3>Preserved Record（警告）</h3>
<ul>
  <li>登録履歴が未入力の場合（最低1件の登録イベントを推奨）</li>
</ul>

<blockquote>💡 エラーが1件でもあると警告モーダルが表示されますが、「それでも発行する」で強制発行も可能です。不完全な書類を意図的に発行する必要がある場合に使ってください。</blockquote>
    `,
  },

  // ===== DOCUMENTS =====
  { group: '書類発行' },
  {
    id: 'docs',
    title: '書類プレビューと発行',
    content: `
<h1>書類プレビューと発行</h1>
<p>5種類の書類をブラウザ上でプレビュー → 印刷/PDF出力できます。</p>

<h2>5種類の書類</h2>
<ol>
  <li><strong>Sales Confirmation</strong> — 注文確認書（A4縦）</li>
  <li><strong>Invoice</strong> — 商業送り状（A4縦）</li>
  <li><strong>Shipping Instruction</strong> — 船積指示書（A4縦）</li>
  <li><strong>Export Certificate</strong> — 輸出抹消仮登録証明書の英訳版（A4横）</li>
  <li><strong>Preserved Record</strong> — 登録保存記録（A4横）</li>
</ol>

<h2>発行手順</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>「書類プレビュー」タブ → 案件と書類タイプを選択 → 「表示」</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>プレビューを確認</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>「印刷 / PDF出力」ボタン → ブラウザ印刷ダイアログ → 「PDFとして保存」</p></div>
</div>

<h2>用紙向きの自動切替</h2>
<p>Export Certificate と Preserved Record は自動的に A4横 で印刷されます。その他3書類は A4縦。</p>

<h2>一括発行（HTML+ZIP）</h2>
<p>「一括発行 (HTML+ZIP)」ボタンで、選択中の案件の5書類すべてをZIPで一括ダウンロード。各HTMLはオフラインでも開ける独立ファイルです。</p>

<h2>発行履歴</h2>
<p>「発行履歴」ボタンで、いつ・どの書類を・何版発行したかの記録を確認。印刷するたびに版番号が +1 されます。</p>

<h2>書類ごとの設定</h2>
<blockquote>各書類の日付・Ref No・Termsは案件編集画面の「書類ごとの Buyer / 条件」タブで個別に設定可能。空欄の場合は案件の基本情報を流用します。</blockquote>
    `,
  },
  {
    id: 'cert-import',
    title: '車検証PDF/写真から自動入力',
    content: `
<h1>車検証PDF/写真から自動入力</h1>
<p>車検証・輸出抹消仮登録証明書から、車両情報や登録情報を自動抽出してフォームに反映できます。</p>

<h2>対応ファイル</h2>
<ul>
  <li>PDF（スキャンしたもの、または運輸支局が発行する電子書類）</li>
  <li>画像（PNG / JPG / HEIC）— スマホで撮影した写真でもOK</li>
</ul>

<h2>処理方式（ハイブリッド）</h2>
<ol>
  <li><strong>QRコード検出</strong> — jsQR がページ内の2次元コードをすべて検出</li>
  <li><strong>PDFテキスト層</strong> — テキスト層があれば直接抽出（最高精度）</li>
  <li><strong>OCRフォールバック</strong> — テキスト層がなければ Tesseract.js で日本語+英語OCR</li>
  <li><strong>正規表現パーサー</strong> — 抽出テキストから各項目を構造化</li>
</ol>

<h2>使い方</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>案件編集 → 「Export Certificate / Preserved Record 情報」タブ</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>「📄 車検証/輸出抹消証明書をアップロード」ボタンをクリック</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>PDFまたは画像を選択 → 解析開始（初回のみOCRライブラリのダウンロードに約1分）</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">4</div>
  <div class="help-step__body"><p>モーダルで抽出結果を確認。値は編集可能、チェックを外すと反映しない</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">5</div>
  <div class="help-step__body"><p>「選択した項目をフォームに反映」でフォーム自動入力 → 保存</p></div>
</div>

<h2>自動抽出される項目</h2>
<ul>
  <li>証明書番号・整理番号・Registration No.</li>
  <li>登録年月日・初度登録年月・輸出予定日（和暦→西暦変換）</li>
  <li>車台番号・型式・原動機の型式・車名・メーカーコード</li>
  <li>寸法（長さ/幅/高さ）・車両重量・車両総重量・FF/RR重量</li>
  <li>総排気量（L→cc変換）・燃料種別（ガソリン→PETROL変換）</li>
  <li>型式指定番号・類別区分番号・車体形状・乗車定員</li>
  <li>走行距離・旧登録番号（備考欄から）</li>
</ul>

<blockquote>💡 完全ローカル処理でOCRが動くため、画像はサーバー送信されません。プライバシー面も安心です。</blockquote>

<blockquote class="warn">OCR精度は画像品質に左右されます。斜め歪みや影がある場合は正規表現で拾えないことも。その場合は手動で修正してください。</blockquote>
    `,
  },

  // ===== SALES =====
  { group: '売上管理' },
  {
    id: 'payments',
    title: '入金明細',
    content: `
<h1>入金明細</h1>
<p>案件ごとに複数回の入金を記録します。合計が請求額に達すると決済ステータスが自動的に「入金完了」へ切り替わります。</p>

<h2>入力項目</h2>
<ul>
  <li>入金日</li>
  <li>金額（JPY）</li>
  <li>方法 — 銀行振込 / LC（信用状）/ 手形 / その他</li>
  <li>参照No — 送金番号など</li>
  <li>メモ</li>
</ul>

<h2>自動計算</h2>
<table>
  <tr><th>条件</th><th>ステータス</th></tr>
  <tr><td>入金 0円</td><td>未入金</td></tr>
  <tr><td>0 &lt; 入金 &lt; 請求額</td><td>一部入金</td></tr>
  <tr><td>入金 ≥ 請求額</td><td>入金完了</td></tr>
  <tr><td>手動で「キャンセル」設定時</td><td>キャンセル（自動更新しない）</td></tr>
</table>

<h2>使い方</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>案件編集 → 入金明細タブ</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>下部の入力欄に入金情報を入力 → 「入金を追加」</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>上部の表に追加される。削除ボタンで個別削除可能</p></div>
</div>

<blockquote>入金明細を追加するたびに、案件一覧の決済ステータスバッジとダッシュボードKPIが即座に更新されます。</blockquote>
    `,
  },
  {
    id: 'costs',
    title: '原価明細（コスト管理）',
    content: `
<h1>原価明細（コスト管理）</h1>
<p>仕入価格・オークション手数料・輸送費などを記録することで、案件ごとの粗利を自動算出します。</p>

<h2>コスト区分</h2>
<ul>
  <li>仕入</li>
  <li>オークション手数料</li>
  <li>輸送費</li>
  <li>通関費</li>
  <li>保険料</li>
  <li>海上運賃</li>
  <li>陸送費</li>
  <li>検査費</li>
  <li>その他</li>
</ul>

<h2>粗利の計算</h2>
<pre>粗利 = CIF金額 − 原価合計</pre>
<p>案件編集画面のコストタブ下部に、リアルタイムで表示されます。粗利が赤字の場合は赤色で警告表示。</p>

<h2>入力項目</h2>
<ul>
  <li>計上日</li>
  <li>区分（ドロップダウン）</li>
  <li>金額（JPY）</li>
  <li>取引先</li>
  <li>メモ</li>
</ul>

<blockquote>ダッシュボードの「月次推移」で「粗利」「粗利率」を選択すれば、月別の収益性が可視化できます。</blockquote>
    `,
  },
  {
    id: 'dashboard',
    title: 'ダッシュボード',
    content: `
<h1>ダッシュボード</h1>
<p>経営判断に必要な情報を一画面で把握できる集約ビューです。</p>

<h2>4つのセクション</h2>

<h3>① 今月のサマリー + 今日やること</h3>
<ul>
  <li><strong>6つのKPI</strong>: 今月の売上（前月比%）、今月の案件数、今月の粗利、今月の出荷、今月の入金、総未回収残高</li>
  <li><strong>今日やること</strong>: 船積予定（7日以内）、入港予定（7日以内）、入金遅延、書類発行が遅れている案件</li>
</ul>
<p>タスクをクリックすると該当案件の編集画面にジャンプ。</p>

<h3>② 月次推移チャート</h3>
<p>6つの指標をチップで切替可能:</p>
<ul>
  <li>売上金額（月別CIF合計）</li>
  <li>案件数</li>
  <li>粗利</li>
  <li>粗利率</li>
  <li>新規案件</li>
  <li>入金速度（請求→最終入金の平均日数）</li>
</ul>
<p>期間は 6 / 12 / 24ヶ月から選択。棒ホバーでツールチップ表示。</p>

<h3>③ 出荷カンバンボード</h3>
<p>8ステータスを横並びで表示。各カードには案件コード・車種・金額・ETDが表示され、クリックで編集画面へ。ETD超過の案件は赤色警告。</p>

<h3>④ 内訳チャート</h3>
<ul>
  <li>得意先別 売上</li>
  <li>車種別 売上</li>
  <li>決済ステータス内訳</li>
  <li>進捗ステータス内訳</li>
</ul>
    `,
  },
  {
    id: 'receivables',
    title: '入金予定リスト',
    content: `
<h1>入金予定リスト</h1>
<p>回収待ちの案件を、期日ベースで一覧化します。キャッシュフロー管理と督促業務に活用できます。</p>

<h2>フィルタ</h2>
<ul>
  <li><strong>期日前（X日以内）</strong> — 日数は指定可能（1〜90日）</li>
  <li><strong>期日超過</strong> — Payment Due Date を過ぎた案件のみ</li>
  <li><strong>すべての未完了</strong> — 決済ステータスが「入金完了」「キャンセル」以外</li>
</ul>

<h2>表示項目</h2>
<table>
  <tr><th>列</th><th>内容</th></tr>
  <tr><td>Case Code</td><td>案件コード</td></tr>
  <tr><td>Buyer</td><td>Invoice/SC のBuyer</td></tr>
  <tr><td>Due Date</td><td>支払期日</td></tr>
  <tr><td>請求額</td><td>CIF金額</td></tr>
  <tr><td>入金済み</td><td>入金合計</td></tr>
  <tr><td>残高</td><td>請求額−入金合計（超過案件は赤色強調）</td></tr>
  <tr><td>状態</td><td>「あとN日」「本日」「N日超過」</td></tr>
</table>

<blockquote>「編集」ボタンから案件画面に直接アクセスできるので、督促メモの記録や入金登録がスムーズです。</blockquote>
    `,
  },

  // ===== SETTINGS =====
  { group: '設定' },
  {
    id: 'numbering',
    title: '自動採番',
    content: `
<h1>自動採番</h1>
<p>新規案件作成時に Case Code / Invoice Ref No を自動生成します。</p>

<h2>使えるプレースホルダー</h2>
<table>
  <tr><th>記号</th><th>意味</th><th>例</th></tr>
  <tr><td><code>{###}</code></td><td>連番3桁（001,002,...）</td><td><code>RAYA_{###}</code> → RAYA_001</td></tr>
  <tr><td><code>{####}</code></td><td>連番4桁</td><td><code>CASE_{####}</code> → CASE_0001</td></tr>
  <tr><td><code>{YYYY}</code></td><td>西暦4桁</td><td>2025</td></tr>
  <tr><td><code>{YY}</code></td><td>西暦2桁</td><td>25</td></tr>
  <tr><td><code>{MM}</code></td><td>月（ゼロ埋め）</td><td>04</td></tr>
  <tr><td><code>{DD}</code></td><td>日（ゼロ埋め）</td><td>17</td></tr>
</table>

<h2>パターン例</h2>
<ul>
  <li><code>RAYA_{###}</code> → RAYA_001, RAYA_002, ...</li>
  <li><code>MA_{YYYY}{MM}{DD}_{###}</code> → MA_20250918_001</li>
  <li><code>{YY}{MM}-{##}</code> → 2510-01（月ごとにリセット）</li>
  <li><code>CASE-{YYYY}-{####}</code> → CASE-2025-0001</li>
</ul>

<h2>設定方法</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>「設定」タブ → 自動採番</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>Case Code パターンに上記のような文字列を入力</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>「次回の採番プレビュー」にリアルタイムで次の番号が表示される</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">4</div>
  <div class="help-step__body"><p>「採番設定を保存」→ 以降、新規案件作成時に自動入力</p></div>
</div>

<blockquote>既存案件の最大番号 +1 を自動計算します。途中で手動入力して欠番ができても、最大番号ベースで次番号を決めるので衝突しません。</blockquote>
    `,
  },
  {
    id: 'template',
    title: '書類テンプレート（ロゴ・署名）',
    content: `
<h1>書類テンプレート</h1>
<p>書類に印字されるロゴ・署名者・定型文をカスタマイズできます。</p>

<h2>① 会社ロゴ</h2>
<ul>
  <li>PNG / JPG / SVG 対応</li>
  <li>500KB以下</li>
  <li>推奨幅: 300px程度</li>
</ul>
<p>Sales Confirmation と Invoice は会社名の上に、Shipping Instruction は左上にロゴが配置されます。</p>

<h2>② 署名者情報</h2>
<ul>
  <li>署名者名（例: MAKOTO Kubota）</li>
  <li>肩書（例: Managing Director）</li>
</ul>
<p>Sales Confirmation と Invoice のフッターに印字されます。</p>

<h2>③ 定型文カスタマイズ</h2>
<p>Invoice用 / SI用の追加注記を自由記述。書類下部に印字されます。</p>
<ul>
  <li>改行はそのまま反映</li>
  <li>空欄ならデフォルトのまま（注記は印字されない）</li>
</ul>

<h2>設定方法</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>「設定」タブ → 書類テンプレート</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>ロゴアップロード / 署名者情報 / 定型文を設定</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>「テンプレート設定を保存」</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">4</div>
  <div class="help-step__body"><p>書類プレビューで反映を確認</p></div>
</div>
    `,
  },
  {
    id: 'reminders',
    title: 'リマインダー・メール下書き',
    content: `
<h1>リマインダー・メール下書き</h1>

<h2>① ブラウザ通知</h2>
<p>船積予定・入金期日が近づいたときにOS通知でお知らせします。</p>

<h3>設定項目</h3>
<ul>
  <li><strong>通知を有効にする</strong>: 有効 / 無効</li>
  <li><strong>通知する猶予日数</strong>: 何日前から通知するか（デフォルト3日）</li>
  <li><strong>チェック頻度（分）</strong>: サイト開いている時の再チェック間隔（デフォルト60分）</li>
</ul>

<h3>初回セットアップ</h3>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>「設定」→ リマインダー → 「通知許可をリクエスト」</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>ブラウザ上部で「許可」をクリック</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>「テスト通知」で動作確認</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">4</div>
  <div class="help-step__body"><p>「リマインダー設定を保存」</p></div>
</div>

<h3>通知例</h3>
<blockquote>🚢 船積予定: RAYA_003 — TOYOTA ALPHARD Z — ETD 2025-09-30 (あと3日)</blockquote>
<blockquote>💰 入金期日: RAYA_003 — 残高 ¥6,645,000 — 期日 2025-10-31 (2日超過)</blockquote>

<h2>② メール下書き生成</h2>
<p>書類プレビュー画面から、Buyer宛のメール下書きをワンクリックで生成できます。</p>

<h3>設定項目</h3>
<ul>
  <li><strong>差出人（From）</strong>: 自分のメールアドレス</li>
  <li><strong>件名テンプレート</strong>: 例 <code>Documents for {case_code}</code></li>
  <li><strong>本文テンプレート</strong>: プレースホルダーを使用可能</li>
</ul>

<h3>プレースホルダー</h3>
<table>
  <tr><th>記号</th><th>置き換わる内容</th></tr>
  <tr><td><code>{case_code}</code></td><td>案件コード</td></tr>
  <tr><td><code>{buyer_name}</code></td><td>Buyer会社名</td></tr>
  <tr><td><code>{invoice_ref}</code></td><td>Invoice Ref No</td></tr>
  <tr><td><code>{vehicle}</code></td><td>メーカー + モデル名</td></tr>
  <tr><td><code>{chassis_no}</code></td><td>シャシ番号</td></tr>
  <tr><td><code>{amount}</code></td><td>CIF金額</td></tr>
  <tr><td><code>{etd}</code></td><td>ETD日付</td></tr>
  <tr><td><code>{eta}</code></td><td>ETA日付</td></tr>
  <tr><td><code>{signer_name}</code></td><td>署名者名</td></tr>
  <tr><td><code>{signer_title}</code></td><td>肩書</td></tr>
</table>

<h3>使い方</h3>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>書類プレビュー画面で案件と書類を選択</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>「📧 メール下書き」ボタン</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body">
    <p>選択ダイアログ:</p>
    <ul>
      <li><strong>OK</strong> → 既定のメーラーで開く（Mail.app / Outlook 等）</li>
      <li><strong>キャンセル</strong> → .eml ファイルとしてダウンロード</li>
    </ul>
  </div>
</div>

<blockquote>mailto: は一部の文字（改行、特殊記号）に制限があるため、.eml ファイルのほうが確実に本文が保持されます。</blockquote>
    `,
  },

  // ===== DATA =====
  { group: 'データ管理' },
  {
    id: 'csv',
    title: 'CSV 入出力',
    content: `
<h1>CSV 入出力</h1>
<p>Excelなどで一括編集したり、他システムとデータ連携したりできます。</p>

<h2>エクスポート対象</h2>
<ul>
  <li>案件 (cases)</li>
  <li>Seller / Buyer (parties)</li>
  <li>車両モデル (vehicle_models)</li>
  <li>入金明細 (payments)</li>
  <li>原価明細 (costs)</li>
</ul>

<h2>インポート対象</h2>
<ul>
  <li>案件 (cases)</li>
  <li>Seller / Buyer (parties)</li>
  <li>車両モデル (vehicle_models)</li>
</ul>

<h2>使い方</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>ヘッダー右上の「CSV ▾」メニューをクリック</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>エクスポート: 項目をクリックで <code>cases_2025-04-17.csv</code> 形式で保存</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>インポート: ファイル選択 → 既存データはキー列で自動判定し UPDATE / INSERT</p></div>
</div>

<h2>キー列（インポート時の重複判定）</h2>
<ul>
  <li>案件: <code>case_code</code></li>
  <li>Party: <code>company_name</code> + <code>role</code></li>
  <li>車両モデル: <code>maker</code> + <code>model_name</code></li>
</ul>

<h2>文字コード</h2>
<p>エクスポートは UTF-8 BOM 付き（Excel で開いても文字化けしません）。インポートも UTF-8 / UTF-8 BOM の両方対応。</p>
    `,
  },
  {
    id: 'backup',
    title: 'DBバックアップ・復元',
    content: `
<h1>DBバックアップ・復元</h1>
<p>SQLiteデータベース全体を1ファイルとして持ち運べます。別PCへの移行やバックアップに活用してください。</p>

<h2>DBエクスポート</h2>
<p>ヘッダー「DBエクスポート (.sqlite)」ボタン → <code>export-docs-2025-04-17.sqlite</code> がダウンロードされます。</p>

<h2>DBインポート</h2>
<p>ヘッダー「DBインポート」ボタン → .sqlite / .db ファイルを選択。現在のデータは上書きされます。</p>

<blockquote class="warn">⚠️ インポートすると現在のデータが上書きされます。先にエクスポートでバックアップを取ることを推奨します。</blockquote>

<h2>推奨運用</h2>
<ul>
  <li>週1回程度、DBエクスポートでバックアップファイルをクラウド（Google Drive / Dropbox）に保存</li>
  <li>月次で月初に別ファイル名で保存（世代管理）</li>
  <li>重要な変更前（大量インポート等）の直前にも手動バックアップ</li>
</ul>

<h2>データ保存場所</h2>
<p>通常運用時のデータはブラウザの <code>IndexedDB</code> に保存されています。ブラウザのキャッシュ削除時やシークレットウィンドウを閉じた時に失われるリスクがあるので、定期バックアップを推奨します。</p>
    `,
  },

  // ===== SECURITY =====
  { group: 'セキュリティ' },
  {
    id: 'urls',
    title: 'URL / ルーティング',
    content: `
<h1>URL / ルーティング</h1>
<p>本アプリには、以下の3つの特殊なURLパスがあります。ブックマークや共有URLに活用できます。</p>

<table>
  <tr><th>パス</th><th>役割</th></tr>
  <tr><td><code>/</code></td><td>メインアプリ。未ログイン時は自動的に <code>/login</code> にリダイレクト。</td></tr>
  <tr><td><code>/login</code></td><td>ログイン画面。ログイン成功後は <code>/</code> または <code>?return=</code> で指定されたパスへ。</td></tr>
  <tr><td><code>/setup</code></td><td>初回セットアップ画面（ユーザーがまだ存在しない時）。終了後は <code>/</code> へ。</td></tr>
  <tr><td><code>/logout</code></td><td>ログアウト用パス。内部的にセッションをクリアして <code>/login</code> に遷移。</td></tr>
</table>

<h2>リダイレクト付きリンク</h2>
<p>未ログイン状態で特定のページに直接アクセスすると、ログイン後にそこへ戻る仕組みがあります:</p>
<pre>https://<ホスト>/?page=dashboard
  ↓ 未ログインなので自動的に
https://<ホスト>/login?return=%2F%3Fpage%3Ddashboard
  ↓ ログイン成功後に
https://<ホスト>/?page=dashboard</pre>

<h2>ブックマーク推奨</h2>
<ul>
  <li><strong>ログインページをブックマーク</strong>: <code>https://<ホスト>/login</code></li>
  <li><strong>業務画面をブックマーク</strong>: <code>https://<ホスト>/</code></li>
</ul>

<blockquote>💡 どちらのURLをブックマークしても、セッション状態に応じて適切な画面に自動遷移します。</blockquote>
    `,
  },
  {
    id: 'auth',
    title: 'ユーザー認証とロール',
    content: `
<h1>ユーザー認証とロール</h1>
<p>本番環境での運用を安全にするため、ユーザー認証とロールベースのアクセス制御を実装しています。</p>

<h2>3つのロール</h2>
<table>
  <tr><th>ロール</th><th>できること</th></tr>
  <tr><td><strong>admin（管理者）</strong></td><td>すべての操作。ユーザー管理・監査ログ・DBエクスポート含む</td></tr>
  <tr><td><strong>editor（編集者）</strong></td><td>案件・書類の編集・発行。ユーザー管理と監査ログは不可</td></tr>
  <tr><td><strong>viewer（閲覧者）</strong></td><td>読み取り専用。金額・入金額はマスキング表示</td></tr>
</table>

<h2>初回セットアップ</h2>
<p>初めてシステムを起動すると、管理者アカウント作成画面が表示されます。ユーザー名・表示名・パスワード（8文字以上）を入力してください。</p>

<h2>ユーザー追加</h2>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>管理者でログイン → 「設定」タブ → 「ユーザー管理」</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>「+ 新規ユーザー」 → ユーザー名・表示名・ロール・パスワードを入力 → 保存</p></div>
</div>

<h2>パスワード変更</h2>
<p>ヘッダー右上のユーザー名 → ドロップダウン → 「パスワード変更」</p>

<h2>パスワード保護</h2>
<ul>
  <li>パスワードはPBKDF2-SHA-256（31万回イテレーション）でハッシュ化して保存</li>
  <li>セッションはブラウザ終了時に自動クリア（sessionStorage）</li>
  <li>ログイン失敗は監査ログに記録</li>
</ul>

<blockquote class="warn">初期adminアカウントのパスワードは忘れないでください。復旧にはDBの直接編集が必要になります。</blockquote>
    `,
  },
  {
    id: 'security',
    title: 'セキュリティ機能',
    content: `
<h1>セキュリティ機能</h1>

<h2>監査ログ</h2>
<p>すべての重要な操作が自動的に記録されます:</p>
<ul>
  <li>ログイン / ログアウト / ログイン失敗</li>
  <li>ユーザーの作成・編集・削除</li>
  <li>パスワード変更</li>
  <li>案件の作成・更新・削除</li>
  <li>DBエクスポート・インポート</li>
</ul>
<p>管理者は「設定」→「監査ログ」タブから全ログを閲覧・検索できます。</p>

<h2>DBエクスポートの暗号化</h2>
<p>DBエクスポート時にパスワード保護を選択できます:</p>
<ul>
  <li><strong>暗号化エクスポート（推奨）</strong>: AES-GCM 256bit + PBKDF2 でパスワード暗号化。拡張子 <code>.edm</code></li>
  <li><strong>平文エクスポート</strong>: SQLite素のファイル。拡張子 <code>.sqlite</code></li>
</ul>
<p>暗号化ファイルのインポート時は、エクスポート時のパスワードを入力すると自動的に復号されます。</p>

<h2>HTTPS/セキュリティヘッダー</h2>
<p>本番デプロイ（Vercel）では以下のヘッダーが自動設定されます:</p>
<ul>
  <li><code>Strict-Transport-Security</code>: HTTPS強制</li>
  <li><code>X-Frame-Options: DENY</code>: 他サイトのiframe埋め込みを禁止</li>
  <li><code>X-Content-Type-Options: nosniff</code>: MIMEスニッフィング防止</li>
  <li><code>Content-Security-Policy</code>: 外部スクリプトの読み込みを制限</li>
  <li><code>Referrer-Policy</code>: リファラ漏洩を制限</li>
  <li><code>Permissions-Policy</code>: カメラ・マイク・GPS等を無効化</li>
</ul>

<h2>機微情報のマスキング</h2>
<p>閲覧者（viewer）ロールでログインすると、案件一覧・ダッシュボード等の金額表示が自動的にマスキングされます。</p>

<blockquote>💡 業務上は見る必要のないメンバー（例: 外注スタッフ、監査人）には viewer ロールを付与することで、最小権限の原則を適用できます。</blockquote>

<h2>運用ベストプラクティス</h2>
<ol>
  <li>強固なパスワード（12文字以上、英数字記号混在）を使用</li>
  <li>定期的なパスワード変更（3ヶ月ごとなど）</li>
  <li>退職者のアカウントは「無効化」で即座にアクセス停止</li>
  <li>DBエクスポートは必ずパスワード暗号化を選択</li>
  <li>監査ログを定期的にチェック（不審なログイン試行がないか）</li>
</ol>
    `,
  },

  {
    id: 'db-encryption',
    title: 'IndexedDB暗号化（端末紛失対策）',
    content: `
<h1>IndexedDB暗号化</h1>
<p>ブラウザに保存される業務データを自動的に暗号化し、端末紛失時の情報漏洩を防ぎます。</p>

<h2>仕組み（KEK-DEK方式）</h2>
<ul>
  <li><strong>DEK（データ暗号化キー）</strong>: ランダム生成の AES-GCM 256bit キー。DB本体を暗号化。</li>
  <li><strong>KEK（キー暗号化キー）</strong>: 各ユーザーのパスワードから PBKDF2 で派生。</li>
  <li>各ユーザーごとにDEKを自分のKEKで暗号化した<strong>エンベロープ</strong>を保持。</li>
  <li>ログイン時: パスワード → KEK → エンベロープ復号 → DEK → DB復号</li>
</ul>

<h2>自動移行</h2>
<p>既存環境で新機能を反映した後、<strong>最初にadminがログインすると自動的に暗号化が有効化</strong>されます。</p>

<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>Adminが通常通りログイン</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>システムが暗号化状態を検出 → adminパスワードからKEK派生 → DEK生成 → DB全体をAES-GCMで暗号化</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>admin自身のDEKエンベロープを作成（admin以外のユーザーのエンベロープは未作成）</p></div>
</div>

<h2>他ユーザーのアクセス復旧</h2>
<p>暗号化有効化時点で存在する非adminユーザーは、初回ログイン時に以下のメッセージが表示されます:</p>
<blockquote class="warn">🔐 このアカウントはDB暗号化に対応していません。管理者に「ユーザー管理」からパスワードをリセットしてもらってください。</blockquote>

<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>Adminがログイン → 設定 → ユーザー管理</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>対象ユーザーを「編集」 → 新しいパスワードを入力 → 保存</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>Adminが設定したパスワードを本人に伝達 → 本人がログイン → 好みのパスワードに変更</p></div>
</div>

<h2>新規ユーザー作成</h2>
<p>管理者が新規ユーザーを作成すると、パスワードから自動的にDEKエンベロープが生成され、すぐにログイン可能になります。</p>

<h2>保護される対象</h2>
<table>
  <tr><th>対象</th><th>保護</th></tr>
  <tr><td>IndexedDB内のDB本体</td><td>✅ AES-GCM 256bit 暗号化</td></tr>
  <tr><td>パスワード・DEK</td><td>✅ PBKDF2 + 塩付きハッシュ</td></tr>
  <tr><td>ユーザー名一覧</td><td>⚠️ bootstrap_metaで平文（ログイン用に必要）</td></tr>
  <tr><td>セッション情報</td><td>✅ sessionStorageで保持、ブラウザ終了で破棄</td></tr>
  <tr><td>メモリ内のDEK</td><td>ログアウトで即クリア</td></tr>
</table>

<h2>重要な制約</h2>
<blockquote class="danger">
⚠️ <strong>パスワードを完全に忘れると復旧不可能です</strong>。<br>
暗号化DBは該当ユーザーのパスワードでしか復号できません。admin全員がパスワードを失えば、DBは永久に読めません。<br>
対策: <strong>定期的にDBエクスポート（暗号化または別パスワード）でバックアップ</strong>を取得してください。
</blockquote>

<h2>内部動作の詳細</h2>
<table>
  <tr><th>アルゴリズム</th><th>内容</th></tr>
  <tr><td>KEK派生</td><td>PBKDF2-SHA-256, 250,000回, 16-byte salt</td></tr>
  <tr><td>DEK</td><td>AES-GCM 256bit（extractable = true）</td></tr>
  <tr><td>エンベロープ</td><td>AES-GCM(iv=12byte, GCM タグ付)でDEKをラップ</td></tr>
  <tr><td>DB暗号化</td><td>AES-GCM(iv=12byte) + EDM2 マジックヘッダー</td></tr>
</table>

<blockquote>💡 FileVault / BitLocker 等のOSディスク暗号化と併用すれば多層防御になります。</blockquote>
    `,
  },
  {
    id: 'hardening',
    title: 'ハッキング対策・高度なセキュリティ',
    content: `
<h1>ハッキング対策・高度なセキュリティ</h1>
<p>API利用を想定した追加のセキュリティ機能を備えています。</p>

<h2>ブルートフォース対策</h2>
<ul>
  <li>ログイン失敗時は段階的に遅延が発生（1回目=即、2回目=1秒、3回目=2秒、4回目=5秒、5回目=10秒）</li>
  <li><strong>連続5回失敗で自動ロック</strong>（15分間ログイン不可）</li>
  <li>管理者は「設定 → ユーザー管理」からロック解除可能</li>
  <li>ユーザー列挙攻撃を防ぐため、ユーザー不明時もダミーハッシュを計算して応答時間を均一化</li>
</ul>

<h2>2段階認証（TOTP）</h2>
<ul>
  <li>Google Authenticator、1Password、Authy等の認証アプリに対応</li>
  <li>有効化手順: ヘッダーのユーザー名 → 「2段階認証（2FA）設定」</li>
  <li>QRコードをスキャン → 表示された6桁コードで有効化</li>
  <li>有効化後はログイン時に毎回コード入力が必要</li>
  <li>時計ずれ対応: ±30秒のウィンドウで検証</li>
</ul>

<blockquote class="warn">2FAを有効化した後、認証アプリを紛失するとログインできなくなります。管理者は他ユーザーの2FA無効化が可能ですが、唯一の管理者の場合は復旧が困難です。複数の管理者を作成することを推奨します。</blockquote>

<h2>セッションタイムアウト</h2>
<ul>
  <li><strong>アイドル8時間</strong>で自動ログアウト（最終操作からの時間）</li>
  <li><strong>絶対24時間</strong>で強制再ログイン</li>
  <li>クリック・入力・キー操作で自動的にタイマーがリセット</li>
</ul>

<h2>セキュリティアラート（管理者向け）</h2>
<p>ダッシュボードの「今日やること」欄に、24時間以内のログイン失敗が3件以上、またはロック発生時に警告を表示します。監査ログで詳細確認してください。</p>

<h2>APIプロキシ（サーバーサイド）</h2>
<p>外部APIを利用する場合、APIキーをブラウザに露出させないため<strong>Vercel Serverless Functions</strong>をプロキシとして使用します。</p>
<ul>
  <li>ファイル: <code>api/proxy/ai.js</code>, <code>api/proxy/mail.js</code></li>
  <li>APIキーはVercel環境変数に保存</li>
  <li>オリジン検証、レート制限（20-60 req/min）、リクエストボディサイズ制限（64KB）を実施</li>
  <li>対応プロバイダー: Anthropic Claude, OpenAI, Resend, SendGrid</li>
</ul>

<h3>Vercel環境変数の設定例</h3>
<pre>ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
RESEND_API_KEY=re_xxx
SENDGRID_API_KEY=SG.xxx
API_PROXY_SIGNING_SECRET=(32文字以上のランダム文字列)
API_RATE_LIMIT_PER_MINUTE=60
ALLOWED_ORIGINS=https://your-domain.vercel.app</pre>

<h2>Content Security Policy（CSP）</h2>
<ul>
  <li>外部スクリプトはCDN（jsDelivr, cdnjs）のみ許可</li>
  <li>インラインスクリプト禁止（<code>'unsafe-inline'</code>削除）</li>
  <li>iframe埋め込み禁止（<code>frame-ancestors 'none'</code>）</li>
  <li>HTTPS強制（<code>upgrade-insecure-requests</code>）</li>
  <li>object/embedタグ禁止（Flash等の古いプラグイン経由攻撃を遮断）</li>
</ul>

<h2>Subresource Integrity（SRI）</h2>
<p>CDN経由で読み込む <code>tesseract.js</code> にはSRIハッシュを埋め込み済み。CDNが侵害されても改竄されたスクリプトの実行を防ぎます。</p>

<h2>セキュリティヘッダー</h2>
<table>
  <tr><th>ヘッダー</th><th>役割</th></tr>
  <tr><td>Strict-Transport-Security</td><td>HTTPS強制（HSTS、2年有効）</td></tr>
  <tr><td>X-Frame-Options: DENY</td><td>iframe埋め込み禁止（クリックジャック対策）</td></tr>
  <tr><td>X-Content-Type-Options: nosniff</td><td>MIMEスニッフィング防止</td></tr>
  <tr><td>Referrer-Policy</td><td>リファラ漏洩制限</td></tr>
  <tr><td>Permissions-Policy</td><td>カメラ・マイク・GPS・決済APIを無効化</td></tr>
  <tr><td>Cross-Origin-Opener-Policy</td><td>ポップアップ経由の攻撃対策</td></tr>
  <tr><td>Cross-Origin-Resource-Policy</td><td>他サイトからの読込禁止</td></tr>
</table>

<h2>セキュリティ報告窓口</h2>
<p><code>/.well-known/security.txt</code> で脆弱性報告先を明記（<code>info@kmt.kyoto</code>）。</p>

<h2>推奨運用</h2>
<ol>
  <li>管理者アカウントには必ず2FAを有効化</li>
  <li>パスワードは12文字以上、英数字記号混在</li>
  <li>退職者は即座にアカウント無効化</li>
  <li>監査ログを週次でチェック</li>
  <li>DBエクスポートは常に暗号化</li>
  <li>APIキーはGitにコミットせず、Vercel環境変数で管理</li>
  <li>ブラウザは常に最新版に更新</li>
</ol>
    `,
  },

  // ===== TROUBLESHOOTING =====
  { group: 'トラブル対応' },
  {
    id: 'faq',
    title: 'FAQ・よくある質問',
    content: `
<h1>FAQ・よくある質問</h1>

<h2>Q. ブラウザを閉じたらデータは消える？</h2>
<p>A. 通常は消えません。ブラウザのIndexedDBに永続保存されます。ただし以下の場合は消える可能性があります:</p>
<ul>
  <li>ブラウザの「全履歴を削除」「Cookieとサイトデータを削除」を実行</li>
  <li>シークレット/プライベートウィンドウで使用</li>
  <li>Mac の「Safari を終了時にサイトデータを削除」設定がON</li>
</ul>
<p>定期的に「DBエクスポート」でバックアップしてください。</p>

<h2>Q. 複数人で同じデータを共有したい</h2>
<p>A. 現バージョンは単一PCでの運用を想定しています。複数人共有には以下の運用で可能:</p>
<ul>
  <li>DBエクスポート → 共有フォルダ（Google Drive等）に保存 → 他のPCでインポート</li>
  <li>同時編集は非対応。編集権限を1人に限定してください</li>
</ul>

<h2>Q. 変更がブラウザに反映されない</h2>
<p>A. CSSがブラウザにキャッシュされている可能性があります。</p>
<ul>
  <li>Mac Chrome: <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>（スーパーリロード）</li>
  <li>DevTools (<kbd>F12</kbd>) を開いて更新ボタンを右クリック → 「キャッシュの消去とハード再読み込み」</li>
</ul>

<h2>Q. 印刷PDFのレイアウトが崩れる</h2>
<p>A. ブラウザの印刷ダイアログで以下を確認:</p>
<ul>
  <li>「余白」を「なし」または「最小」に</li>
  <li>「ヘッダーとフッター」のチェックを外す</li>
  <li>「背景のグラフィック」にチェック（罫線を印字するため）</li>
</ul>

<h2>Q. OCRが遅い・失敗する</h2>
<p>A. 以下を確認:</p>
<ul>
  <li><strong>初回は10-30秒かかる</strong>: OCRエンジンのダウンロード中。2回目以降は早い</li>
  <li><strong>画像の品質</strong>: 解像度200dpi以上、歪み・影なしが推奨</li>
  <li><strong>原本の文字サイズ</strong>: 車検証の細かい文字は誤認識しやすい。PDF原本があればPDFのほうが確実</li>
</ul>

<h2>Q. 通知が届かない</h2>
<p>A. 以下を確認:</p>
<ul>
  <li>「設定 → リマインダー → 権限ステータス」が「granted」になっている</li>
  <li>OSの「システム環境設定 → 通知」でブラウザが許可されている</li>
  <li>ブラウザを開いている間のみ動作（閉じている時は届きません）</li>
  <li>macOSの集中モード（おやすみモード）中は通知が抑制されます</li>
</ul>

<h2>Q. 自動採番が期待通りに増えない</h2>
<p>A. 以下を確認:</p>
<ul>
  <li>パターンに <code>{###}</code> のような連番プレースホルダーが含まれているか</li>
  <li>既存のCase Codeがパターンに一致しているか（パターン変更時は既存の最大番号+1から再採番）</li>
</ul>

<h2>Q. 案件を間違えて削除した</h2>
<p>A. 削除は取り消せません。最近のDBバックアップがあれば、そこから復元してください。</p>
    `,
  },
  {
    id: 'quick-access',
    title: 'コマンドパレット・タグ・お気に入り',
    content: `
<h1>コマンドパレット・タグ・お気に入り</h1>
<p>大量の案件を扱う現場向けの、検索・ナビゲーション効率化機能です。</p>

<h2>🔍 コマンドパレット（⌘K / Ctrl+K）</h2>
<p>どの画面からでも <kbd>⌘</kbd>+<kbd>K</kbd>（Windows: <kbd>Ctrl</kbd>+<kbd>K</kbd>）で呼び出せる統合検索。</p>
<ul>
  <li><strong>案件検索</strong> — 案件コード・シャシ番号・Invoice Ref No・タグで絞り込み</li>
  <li><strong>Seller/Buyer検索</strong> — 会社名・住所で絞り込み</li>
  <li><strong>タグジャンプ</strong> — タグ名で検索 → そのタグの案件のみに絞り込み</li>
  <li><strong>操作ジャンプ</strong> — 「新規案件」「ダッシュボード」「設定」などをキー入力で</li>
</ul>

<h3>操作</h3>
<table>
  <tr><th>キー</th><th>動作</th></tr>
  <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>結果を選択</td></tr>
  <tr><td><kbd>Enter</kbd></td><td>選択を実行</td></tr>
  <tr><td><kbd>Esc</kbd></td><td>閉じる</td></tr>
</table>

<h2>🏷 タグ</h2>
<p>案件に自由なラベル（緊急・サンプル・再販・クレーム対応など）を付けて分類できます。</p>
<div class="help-step">
  <div class="help-step__num">1</div>
  <div class="help-step__body"><p>案件編集 → ステータスタブ → 「タグ」欄にカンマ区切りで入力</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">2</div>
  <div class="help-step__body"><p>既存のタグが候補として表示される → クリックで追加できる</p></div>
</div>
<div class="help-step">
  <div class="help-step__num">3</div>
  <div class="help-step__body"><p>案件一覧でタグがチップ表示される。ツールバーの「タグ: すべて」ドロップダウンで絞り込み可能</p></div>
</div>

<h2>⭐ お気に入り</h2>
<p>頻繁に参照する案件を一覧上部に固定表示できます。</p>
<ul>
  <li>案件一覧の案件コード左の ☆/★ アイコンをクリックでトグル</li>
  <li>案件編集の「⭐ お気に入り」チェックボックスでも切替可能</li>
  <li>お気に入り案件は一覧の上部に自動的にピン留め（黄色背景）</li>
  <li>ツールバーの「⭐のみ」チェックで、お気に入りだけ表示</li>
</ul>

<blockquote>💡 使い分けの例: 進行中の重要案件は⭐、期間限定の分類（「2025年Q4重点」など）はタグ。</blockquote>
    `,
  },
  {
    id: 'shortcuts',
    title: 'キーボードショートカット',
    content: `
<h1>キーボードショートカット</h1>

<h2>アプリ内ショートカット</h2>
<table>
  <tr><th>操作</th><th>Mac</th><th>Windows/Linux</th></tr>
  <tr><td>コマンドパレット</td><td><kbd>⌘</kbd>+<kbd>K</kbd></td><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td></tr>
  <tr><td>新規案件</td><td><kbd>⌘</kbd>+<kbd>N</kbd></td><td><kbd>Ctrl</kbd>+<kbd>N</kbd></td></tr>
  <tr><td>案件を保存（編集画面で）</td><td><kbd>⌘</kbd>+<kbd>S</kbd></td><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td></tr>
  <tr><td>ヘルプ</td><td><kbd>⌘</kbd>+<kbd>/</kbd> or <kbd>?</kbd></td><td><kbd>Ctrl</kbd>+<kbd>/</kbd> or <kbd>?</kbd></td></tr>
  <tr><td>モーダルを閉じる</td><td><kbd>Esc</kbd></td><td><kbd>Esc</kbd></td></tr>
</table>

<h2>ブラウザ標準ショートカット</h2>
<table>
  <tr><th>操作</th><th>Mac</th><th>Windows</th></tr>
  <tr><td>スーパーリロード</td><td><kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>R</kbd></td><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd></td></tr>
  <tr><td>印刷</td><td><kbd>⌘</kbd>+<kbd>P</kbd></td><td><kbd>Ctrl</kbd>+<kbd>P</kbd></td></tr>
  <tr><td>ページ内検索</td><td><kbd>⌘</kbd>+<kbd>F</kbd></td><td><kbd>Ctrl</kbd>+<kbd>F</kbd></td></tr>
</table>

<blockquote>💡 操作の大半は <kbd>⌘</kbd>+<kbd>K</kbd> で済ませられます。「だいたいここから検索 → Enter」と覚えておくと便利です。</blockquote>
    `,
  },
];
