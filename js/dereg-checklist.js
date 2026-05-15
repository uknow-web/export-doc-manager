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
        label: '現在登録事項証明書',
        detail: '抹消登録時の最新登録情報を証明する書類。Preserved Record として輸出書類に同梱。',
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
        key: 'inkan_self',
        label: '印鑑証明書（原本必須・当人）',
        warning: true,
        detail: '購入者（自社・当人）の印鑑証明書。3ヶ月以内発行のもの。コピー不可。',
      },
      {
        key: 'inkan_prev',
        label: '印鑑証明書（原本必須・旧所有者）',
        warning: true,
        detail: '前所有者（売主）の印鑑証明書。3ヶ月以内発行のもの。コピー不可。',
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
      },
    ],
  },
  {
    group: '輸出抹消登録',
    icon: '📄',
    desc: '輸出抹消の核となる申請書類。第3号様式の2 がメイン。',
    items: [
      {
        key: 'form_3_2',
        label: '第3号様式の2',
        note: '輸出予定日を申請から30日以内で申請',
        detail: '「自動車登録 第3号様式の2」。輸出予定日は申請日から30日以内の日付を記入。これより先の日付だと却下される。',
      },
      {
        key: 'form_1',
        label: '第1号様式',
        detail: '「自動車登録 第1号様式」。同時に提出が必要な基本様式。',
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
        key: 'gyomu_type_9',
        label: '業務種別: 9（輸出抹消仮登録）',
        expectedValue: '9',
        detail: '輸出抹消仮登録の業務種別コードは「9」。様式の業務種別欄に記入。',
      },
      {
        key: 'massyo_3',
        label: '抹消: 3',
        expectedValue: '3',
        detail: '抹消区分は「3」（輸出抹消）。',
      },
      {
        key: 'gyomu_type_3',
        label: '業務種別: 3（移転登録）',
        expectedValue: '3',
        detail: '移転登録の業務種別コードは「3」。名義変更時の様式に記入。',
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
