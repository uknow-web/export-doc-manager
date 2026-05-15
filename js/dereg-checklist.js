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
    items: [
      { key: 'addr_code',    label: '住所コードの取得' },
      { key: 'prep_docs',    label: '書類作成（下記の各書類を準備）' },
      { key: 'buy_stamp',    label: '印紙購入' },
      { key: 'plate_return', label: 'ナンバープレート返還' },
    ],
  },
  {
    group: '輸出手続き',
    icon: '🚢',
    items: [
      { key: 'export_cancel_reg', label: '輸出抹消仮登録' },
      { key: 'current_reg_cert',  label: '現在登録事項証明書' },
    ],
  },
  {
    group: '移転登録（名義変更）— 抹消してない場合',
    icon: '📝',
    optional: true,
    note: '中古車購入時、まだ登録抹消されていない場合に必要',
    items: [
      { key: 'inkan_self',   label: '印鑑証明書（原本必須・当人）',     warning: true },
      { key: 'inkan_prev',   label: '印鑑証明書（原本必須・旧所有者）', warning: true },
      { key: 'inin_jo',      label: '委任状（旧所有者の方からもらう）' },
      { key: 'fee_payment',  label: '手数料納付書' },
    ],
  },
  {
    group: '輸出抹消登録',
    icon: '📄',
    items: [
      {
        key: 'form_3_2',
        label: '第3号様式の2',
        note: '輸出予定日を申請から30日以内で申請',
      },
      { key: 'form_1', label: '第1号様式' },
    ],
  },
  {
    group: '現在登録事項証明書',
    icon: '📑',
    items: [
      { key: 'form_3', label: '第3号様式' },
    ],
  },
  {
    group: '記載項目チェック',
    icon: '✏️',
    note: '各様式の以下の欄に正しい値が記載されているか確認',
    items: [
      { key: 'gyomu_type_9', label: '業務種別: 9（輸出抹消仮登録）',  expectedValue: '9' },
      { key: 'massyo_3',     label: '抹消: 3',                       expectedValue: '3' },
      { key: 'gyomu_type_3', label: '業務種別: 3（移転登録）',       expectedValue: '3' },
      { key: 'reg_no',          label: '自動車登録番号',  source: 'registration_no' },
      { key: 'chassis_no_chk',  label: '車台番号',        source: 'chassis_no' },
      { key: 'owner_section',   label: '所有者欄' },
      { key: 'applicant',       label: '申請人' },
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
