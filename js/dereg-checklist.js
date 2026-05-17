// ============================================================================
// 輸出抹消手続きチェックリスト テンプレート
// ----------------------------------------------------------------------------
// 中古車購入後、国土交通省で行う輸出抹消の作業手順と必要書類のチェックリスト。
//
// 構造:
//   - groups: 手続きのフェーズ
//   - items:  各フェーズに含まれるチェック項目
//   - source: 案件レコードから自動表示する値（参照のみ、編集は案件編集側で）
// ============================================================================

export const DEREG_CHECKLIST = [
  {
    group: '事前準備',
    icon: '📋',
    desc: '国土交通省（運輸支局）に出向く前に揃えておく必須項目です。書類の不備があると窓口で出戻りになるため、事前確認が重要。',
    items: [
      {
        key: 'addr_code',
        label: '住所コードの取得',
        detail: '所有者の住所コードを取得しておく。各種申請書類の「所有者欄」に記入する数字コード（例: 26009 4800 京都府京都市伏見区）。',
      },
      {
        key: 'prep_docs',
        label: '書類作成（下記の各書類を準備）',
        detail: '本ガイド下記の様式（第3号様式の2 / 第1号様式 / 第3号様式 等）を事前にダウンロード・記入しておく。',
      },
      {
        key: 'buy_stamp',
        label: '印紙購入',
        detail: '登録手数料分の印紙を購入。窓口でも買えるが事前購入が確実。',
      },
      {
        key: 'plate_return',
        label: 'ナンバープレート返還',
        detail: '輸出抹消する場合は前後2枚のプレートを返却。封印用ボルトを切る工具を持参するとスムーズ。',
      },
    ],
  },
  {
    group: '輸出手続き',
    icon: '🚢',
    desc: '輸出抹消の主要な申請業務。「輸出抹消仮登録」を済ませると Export Certificate（輸出抹消仮登録証明書）が発行される。',
    items: [
      {
        key: 'export_cancel_reg',
        label: '輸出抹消仮登録',
        detail: '本人または所有者の代理人が国土交通省で申請。承認後、輸出抹消仮登録証明書が発行される（有効期間内に輸出が必要）。',
      },
      {
        key: 'current_reg_cert',
        label: '登録識別情報等通知書（現在登録事項証明書）',
        detail: '抹消登録時の最新登録情報を証明する書類。Preserved Record として輸出書類に同梱。4つのQRコードと車両IDが印字された公式書面。',
        formRef: 'reg_id_notice',
      },
    ],
  },
  {
    group: '移転登録（名義変更）— 抹消してない場合',
    icon: '📝',
    optional: true,
    desc: '中古車購入時、まだ抹消登録されていない車両を扱う場合、まず名義変更が必要。「自分が所有者である」状態にしてから輸出抹消する。',
    note: '中古車購入時、まだ登録抹消されていない場合に必要',
    items: [
      {
        key: 'transfer_cert_21',
        label: '譲渡証明書（第21号様式）',
        warning: true,
        detail: '旧所有者から取得する譲渡証明書。車名・型式・車台番号・原動機の型式・譲渡年月日・譲渡人/譲受人の氏名住所・旧所有者の実印が必要。',
        formRef: 'transfer_cert',
      },
      {
        key: 'inkan_self',
        label: '印鑑証明書（原本必須・当人）',
        warning: true,
        detail: '購入者（自社・当人）の印鑑証明書。3ヶ月以内発行のもの。コピー不可。',
        formRef: 'inkan_cert',
      },
      {
        key: 'inkan_prev',
        label: '印鑑証明書（原本必須・旧所有者）',
        warning: true,
        detail: '前所有者（売主）の印鑑証明書。3ヶ月以内発行のもの。コピー不可。',
        formRef: 'inkan_cert',
      },
      {
        key: 'inin_jo',
        label: '委任状（旧所有者の方からもらう）',
        detail: '旧所有者の実印が押された委任状（移転登録の手続きを自社/代理人に委任する旨）。',
      },
      {
        key: 'fee_payment',
        label: '手数料納付書',
        detail: '移転登録手数料の納付書に印紙を貼付。',
        formRef: 'fee_payment_form',
      },
    ],
  },
  {
    group: 'リサイクル関連',
    icon: '♻️',
    desc: '使用済自動車のリサイクル料金が預託されていることを証明する書類。輸出抹消時にも提示が必要。',
    items: [
      {
        key: 'recycle_a',
        label: 'リサイクル券 A券（預託証明書）',
        detail: '自動車リサイクル促進センター発行。シュレッダーダスト料金/エアバッグ類料金/フロン類料金/情報管理料金の預託を証明。',
        formRef: 'recycle_ticket',
      },
      {
        key: 'recycle_deposit_check',
        label: 'リサイクル料金預託状況の確認',
        detail: '車台番号で自動車リサイクル促進センターWebシステムから預託状況を確認できる。',
      },
    ],
  },
  {
    group: '輸出抹消登録',
    icon: '📄',
    desc: '輸出抹消の核となる申請書類。第3号様式の2 がメイン。業務種別「1331」、抹消区分「3（輸出）」を記入。',
    items: [
      {
        key: 'form_3_2',
        label: '第3号様式の2',
        note: '輸出予定日を申請から30日以内で申請',
        detail: '「自動車登録 第3号様式の2」。業務種別=1331、抹消区分=3（輸出）。輸出予定日は申請日から30日以内の日付を記入。これより先の日付だと却下される。',
        formRef: 'form_3_2',
      },
      {
        key: 'form_1',
        label: '第1号様式',
        detail: '「自動車登録 第1号様式」。業務種別=1011（移転登録の場合）。同時に提出が必要な基本様式。',
        formRef: 'form_1',
      },
    ],
  },
  {
    group: '現在登録事項証明書',
    icon: '📑',
    desc: '車両の現在の登録情報を証明する書類を申請。',
    items: [
      {
        key: 'form_3',
        label: '第3号様式',
        detail: '「自動車登録 第3号様式」。現在登録事項証明書の交付申請書。',
      },
    ],
  },
  {
    group: '記載項目チェック',
    icon: '✏️',
    desc: '各様式の以下の欄に正しい値が記載されているか、提出前に最終チェック。',
    note: '各様式の以下の欄に正しい値が記載されているか確認',
    items: [
      {
        key: 'gyomu_1011',
        label: '第1号様式の業務種別: 1011',
        expectedValue: '1011',
        detail: '第1号様式（移転登録）の業務種別コードは「1011」。様式左上の業務種別欄に4桁で記入。',
      },
      {
        key: 'gyomu_1331',
        label: '第3号様式の2の業務種別: 1331',
        expectedValue: '1331',
        detail: '第3号様式の2（輸出抹消仮登録）の業務種別コードは「1331」。様式左上の業務種別欄に4桁で記入。',
      },
      {
        key: 'massyo_3',
        label: '抹消区分: 3（輸出）',
        expectedValue: '3',
        detail: '第3号様式の2の⑫抹消欄に「3」を記入（1解体/2一時使用中止/3輸出/4減失/5用途廃止/6再輸入/7再輸入見込）。',
      },
      {
        key: 'reg_no',
        label: '自動車登録番号',
        source: 'registration_no',
        detail: 'ナンバープレートの登録番号（例: 京都 329 さ 2527）。',
      },
      {
        key: 'chassis_no_chk',
        label: '車台番号',
        source: 'chassis_no',
        detail: '車検証記載の車台番号（例: GXPA16-0008697）。',
      },
      {
        key: 'export_scheduled',
        label: '輸出予定日',
        source: 'export_scheduled_date',
        detail: '第3号様式の2の⑱欄に和暦で記入（例: 令-8-6-15）。申請日から30日以内であること。',
      },
      {
        key: 'owner_section',
        label: '所有者欄',
        detail: '所有者の氏名・住所・住所コード。住所コードの取得を済ませてから記入。',
      },
      {
        key: 'applicant',
        label: '申請人',
        detail: '実際に申請する人の氏名。代理人申請の場合はその代理人の情報。',
      },
    ],
  },
];

// ============================================================================
// 様式定義 — 各書類の構造とサンプルPDFページ番号
// ----------------------------------------------------------------------------
// 「輸出抹消手続きガイド」の様式リファレンスで使用。
// 同梱のサンプルPDF: /vendor/sample-forms/mlit-export-cancel-sample.pdf
// ============================================================================

export const FORM_TEMPLATES = [
  {
    key: 'fee_payment_form',
    title: '手数料納付書',
    icon: '💴',
    samplePdfPage: 1,
    description: '登録手数料・検査手数料の納付書。印紙を貼付して提出。',
    requiredFields: [
      { label: '自動車登録番号 OR 車台番号', source: 'registration_no' },
      { label: '所有者または使用者の氏名/名称' },
      { label: '申請人または申請代理人の氏名' },
      { label: '連絡先電話番号' },
      { label: '申請種別チェックボックス（移転登録 / 一時抹消登録 / 輸出抹消仮登録 等）' },
      { label: '必要書類のチェック項目' },
      { label: '印紙貼付欄（国土交通）' },
      { label: '証紙貼付欄（NALTEC）' },
      { label: '登録手数料 / 検査手数料 / 審査手数料' },
    ],
  },
  {
    key: 'form_1',
    title: '第1号様式 申請書',
    icon: '📄',
    samplePdfPage: 2,
    description: '自動車登録の基本申請書。移転登録時に提出。業務種別=1011。',
    requiredFields: [
      { label: '①業務種別: 1011', expectedValue: '1011' },
      { label: '②手数料 / ⑦補助シート / ⑧番号指示 / ⑨有効期間 / ⑩出張 / ⑪処理' },
      { label: '⑫例外 / ⑬制限解除 / ⑲NOx・PM / ⑳証明書指示' },
      { label: '㉑自動車登録番号', source: 'registration_no' },
      { label: '㉒車台番号（下7桁）', source: 'chassis_no' },
      { label: '㉟所有者氏名/名称' },
      { label: '㊱所有者住所（住所コード形式）' },
      { label: '㊵所有者コード' },
      { label: '⑫登録識別情報通知の希望の有無' },
      { label: '使用者欄（氏名・住所）' },
      { label: '㉔自動車型式指定・類別区分番号' },
      { label: '⑫製作年月日' },
      { label: '⑲走行距離計表示値' },
      { label: '申請人 / 旧所有者 / 申請代理人 / 受検者' },
    ],
  },
  {
    key: 'form_3_2',
    title: '第3号様式の2 申請書/届出書',
    icon: '🚢',
    samplePdfPage: 3,
    description: '輸出抹消仮登録の核となる申請書類。業務種別=1331、抹消区分=3（輸出）。',
    requiredFields: [
      { label: '①業務種別: 1331', expectedValue: '1331' },
      { label: '⑫抹消区分: 3（輸出）', expectedValue: '3' },
      { label: '②手数料（7届出/9抹消）' },
      { label: '⑪処理（1訂正/2復元）' },
      { label: '⑰制限解除' },
      { label: '㉑自動車登録番号', source: 'registration_no' },
      { label: '㉒車台番号（下7桁）', source: 'chassis_no' },
      { label: '⑱輸出予定日（和暦例: 令-8-6-15）', source: 'export_scheduled_date' },
      { label: '申請人・届出人 氏名/名称/住所/印鑑' },
      { label: '譲渡証明書チェックボックス' },
      { label: '使用の本拠の位置' },
      { label: '登録または届出の原因（滅失/解体/用途廃止/一時使用中止）' },
    ],
  },
  {
    key: 'reg_id_notice',
    title: '登録識別情報等通知書',
    icon: '📑',
    samplePdfPage: 4,
    description: '車両の現在登録情報を証明する公式書面（4つのQRコード + 車両ID付き）。Preserved Recordとして輸出書類に同梱。',
    requiredFields: [
      { label: '自動車登録番号', source: 'registration_no' },
      { label: '登録年月日 / 初度登録年月', source: 'first_reg_date' },
      { label: '車台番号', source: 'chassis_no' },
      { label: '車名 / 型式 / 原動機の型式', source: 'engine_model' },
      { label: '所有者氏名/名称・住所' },
      { label: '自動車の種別 / 用途 / 自家用・事業用 / 車体形状', source: 'body_type' },
      { label: '乗車定員 / 最大積載量 / 車両重量 / 車両総重量', source: 'weight_kg' },
      { label: '総排気量 / 燃料の種別 / 型式指定番号 / 類別区分番号', source: 'displacement_cc' },
      { label: '長さ・幅・高さ / 軸重（前前・前後・後前・後後）', source: 'length_cm' },
      { label: '有効期間の満了する日' },
      { label: '備考（一時抹消登録 / OSS / 騒音規制 / 旧自動車登録番号）' },
      { label: '車両ID（PDF裏面）' },
    ],
  },
  {
    key: 'transfer_cert',
    title: '譲渡証明書（第21号様式）',
    icon: '📝',
    samplePdfPage: 5,
    description: '旧所有者から取得する譲渡証明書。中古車取得時に必須。',
    requiredFields: [
      { label: '車名', source: 'maker' },
      { label: '型式', source: 'model_code' },
      { label: '車台番号', source: 'chassis_no' },
      { label: '原動機の型式', source: 'engine_model' },
      { label: '譲渡年月日' },
      { label: '譲渡人氏名/名称・住所 + 実印（旧所有者）' },
      { label: '譲受人氏名/名称・住所（自社）' },
      { label: '備考欄' },
    ],
  },
  {
    key: 'inkan_cert',
    title: '印鑑証明書',
    icon: '🔐',
    samplePdfPage: 6,
    description: '実印の証明書。3ヶ月以内発行のもの。自社用・旧所有者用ともに必要。',
    requiredFields: [
      { label: '会社法人等番号' },
      { label: '商号' },
      { label: '本店所在地' },
      { label: '取締役氏名 / 生年月日' },
      { label: '発行地方法務局' },
      { label: '発行年月日（3ヶ月以内）' },
      { label: '整理番号 / QRコード（管理用）' },
    ],
  },
  {
    key: 'recycle_ticket',
    title: 'リサイクル券（A券 預託証明書）',
    icon: '♻️',
    samplePdfPage: 7,
    description: '自動車リサイクル促進センター発行。リサイクル料金預託の証明。',
    requiredFields: [
      { label: 'リサイクル券番号' },
      { label: '車台番号', source: 'chassis_no' },
      { label: '車名', source: 'maker' },
      { label: 'シュレッダーダスト料金' },
      { label: 'エアバッグ類料金' },
      { label: 'フロン類料金' },
      { label: '情報管理料金' },
      { label: '預託金額合計' },
    ],
  },
];

/** Path to the bundled sample PDF (relative to the app root). */
export const SAMPLE_PDF_PATH = 'vendor/sample-forms/mlit-export-cancel-sample.pdf';

/** 業務種別コード一覧（参考用）. */
export const GYOMU_CODES = [
  { code: '1011', name: '移転登録', desc: '所有権を移転する登録' },
  { code: '1331', name: '輸出抹消仮登録', desc: '輸出のための一時抹消登録' },
  { code: '1310', name: '永久抹消登録', desc: '解体等に伴う永久抹消' },
  { code: '1320', name: '一時抹消登録', desc: '一時的に使用を中止' },
];

/** 抹消区分コード一覧. */
export const MASSYO_CODES = [
  { code: '1', name: '解体',         desc: '使用済自動車として解体' },
  { code: '2', name: '一時使用中止', desc: '一時的に使用を中止' },
  { code: '3', name: '輸出',         desc: '輸出抹消' },
  { code: '4', name: '減失',         desc: '災害等による減失' },
  { code: '5', name: '用途廃止',     desc: '用途を廃止' },
  { code: '6', name: '再輸入',       desc: '再輸入による' },
  { code: '7', name: '再輸入見込',   desc: '再輸入見込の場合' },
];

/** Flatten all items for completion % calculation. */
export function allDeregItems() {
  return DEREG_CHECKLIST.flatMap(g => g.items.map(i => ({ ...i, group: g.group })));
}

/** Total possible items (excluding optional group if not enabled). */
export function totalItems(transferNeeded = true) {
  let count = 0;
  for (const g of DEREG_CHECKLIST) {
    if (g.optional && !transferNeeded) continue;
    count += g.items.length;
  }
  return count;
}

/** Required document list — flattened from groups with the necessary
 *  context for the "Required Documents" overview pane. */
export function requiredDocumentsList() {
  return DEREG_CHECKLIST
    .filter(g => g.group !== '記載項目チェック')
    .flatMap(g => g.items.map(i => ({
      group: g.group,
      groupIcon: g.icon,
      ...i,
    })));
}

/** External reference links / official information. */
export const DEREG_REFERENCES = [
  {
    title: '国土交通省 自動車検査・登録ガイド',
    url: 'https://www.mlit.go.jp/jidosha/jidosha_fr1_000007.html',
    desc: '国交省公式の登録手続き案内',
  },
  {
    title: '運輸支局 連絡先一覧',
    url: 'https://www.mlit.go.jp/about/file000004.html',
    desc: '管轄の運輸支局の住所・電話番号',
  },
  {
    title: '申請書様式ダウンロード',
    url: 'https://wwwtb.mlit.go.jp/kanto/jidou_gian/registration/yoshiki.html',
    desc: '第1号様式 / 第3号様式の2 などの公式PDFテンプレート',
  },
];
