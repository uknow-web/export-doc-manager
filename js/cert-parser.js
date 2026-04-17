// ============================================================================
// Vehicle certificate text parser.
// Takes a blob of extracted text (from PDF text layer or OCR) and returns
// candidate values for each case field. Designed for Japanese
// 輸出抹消仮登録証明書 but also handles 自動車検査証 (standard shaken).
// ============================================================================

// Japanese era → Gregorian conversion
const ERAS = {
  '令和': 2018, // 令和 N = 2018 + N
  '平成': 1988,
  '昭和': 1925,
};

function wareki(m, y, d) {
  // m = era name, y = era year, returns Gregorian year
  const base = ERAS[m];
  return base ? base + Number(y) : null;
}

function isoDate(y, m, d) {
  if (!y || !m || !d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// --- individual field extractors -----------------------------------------
// Each returns { value, confidence, raw } or null.

function extractCertNo(text) {
  // 番号 00256 / No. 00256
  let m = text.match(/(?:番\s*号|No\.?)\s*[：:：]?\s*(\d{5,6})/);
  return m ? { value: m[1], raw: m[0] } : null;
}

function extractReferenceNo(text) {
  // 整理番号 3621023291125273 (16 digits)
  let m = text.match(/整\s*理\s*番\s*号\s*[：:]?\s*(\d{16})/);
  if (!m) m = text.match(/Reference\s*No\.?\s*[：:]?\s*(\d{16})/i);
  return m ? { value: m[1], raw: m[0] } : null;
}

function extractRegistrationNo(text) {
  // 京都 329 さ 2527 — prefecture/city + 3 digits + hiragana + up to 4 digits
  const prefs = '(?:札幌|函館|旭川|室蘭|釧路|帯広|北見|青森|八戸|岩手|宮城|仙台|秋田|山形|庄内|福島|会津|いわき|水戸|土浦|つくば|宇都宮|那須|群馬|前橋|高崎|大宮|川口|所沢|川越|熊谷|越谷|千葉|習志野|袖ヶ浦|野田|柏|成田|東京|品川|世田谷|練馬|板橋|足立|葛飾|江東|多摩|八王子|川崎|横浜|湘南|相模|山梨|新潟|長岡|長野|松本|諏訪|富山|石川|金沢|福井|岐阜|飛騨|静岡|沼津|浜松|伊豆|名古屋|尾張小牧|三河|岡崎|豊田|豊橋|四日市|鈴鹿|三重|津|滋賀|京都|大阪|なにわ|和泉|堺|神戸|姫路|奈良|和歌山|鳥取|島根|岡山|倉敷|広島|福山|山口|徳島|香川|高松|愛媛|高知|福岡|北九州|久留米|筑豊|佐賀|長崎|佐世保|熊本|大分|宮崎|鹿児島|奄美|沖縄|宮古|八重山)';
  const re = new RegExp(prefs + '\\s*(\\d{1,3})\\s*([ぁ-んァ-ン])\\s*(\\d{1,4})');
  const m = text.match(re);
  return m ? {
    value: `${m[1]} ${m[2]} ${m[3]} ${m[4]}`,
    raw: m[0],
  } : null;
}

function extractChassisNo(text) {
  // Hyphenated uppercase alphanumeric, e.g. GXPA16-0008697, AGH40-0023677
  // Look for the pattern near 車台番号
  let m = text.match(/車\s*台\s*番\s*号[\s\S]{0,40}?([A-Z0-9]{3,8}-\s*\d{4,8})/);
  if (!m) m = text.match(/(?:Maker'?s?\s*serial\s*number)[\s\S]{0,40}?([A-Z0-9]{3,8}-\s*\d{4,8})/i);
  if (!m) m = text.match(/\b([A-Z]{2,6}\d{1,3}-\s*\d{5,8})\b/);
  if (m) return { value: m[1].replace(/\s+/g, ''), raw: m[0] };
  return null;
}

function extractEngineModel(text) {
  // 原動機の型式 G16E / Engine Model G16E  (alphanumeric, may contain hyphen)
  let m = text.match(/原\s*動\s*機\s*の\s*型\s*式[\s\S]{0,30}?([A-Z0-9][A-Z0-9-]{1,10})/);
  if (!m) m = text.match(/Engine\s*Model[\s\S]{0,30}?([A-Z0-9][A-Z0-9-]{1,10})/i);
  return m ? { value: m[1], raw: m[0] } : null;
}

function extractModelCode(text) {
  // 型式 4BA-GXPA16 / Model 3BA-AGH40W
  let m = text.match(/型\s*式[\s\S]{0,30}?([0-9A-Z]{3,4}-[A-Z0-9]{4,10})/);
  if (!m) m = text.match(/Model[\s\S]{0,30}?([0-9A-Z]{3,4}-[A-Z0-9]{4,10})/i);
  return m ? { value: m[1], raw: m[0] } : null;
}

function extractMaker(text) {
  // 車名 トヨタ [194] / Trademark
  let m = text.match(/車\s*名[\s\S]{0,30}?([ァ-ヶー]{2,12})/);
  if (!m) m = text.match(/Trademark[\s\S]{0,50}?([A-Z]{3,20})/i);
  if (m) {
    // Convert katakana maker to English if common
    const map = { 'トヨタ': 'TOYOTA', 'ホンダ': 'HONDA', 'ニッサン': 'NISSAN', '日産': 'NISSAN',
                  'マツダ': 'MAZDA', 'スズキ': 'SUZUKI', 'スバル': 'SUBARU',
                  'ダイハツ': 'DAIHATSU', 'ミツビシ': 'MITSUBISHI', '三菱': 'MITSUBISHI',
                  'レクサス': 'LEXUS', 'イスズ': 'ISUZU', 'いすゞ': 'ISUZU' };
    const v = map[m[1]] || m[1];
    return { value: v, raw: m[0] };
  }
  return null;
}

function extractMakerCode(text) {
  // Pattern [194] after maker name
  const m = text.match(/\[\s*(\d{3,4})\s*\]/);
  return m ? { value: m[1], raw: m[0] } : null;
}

function extractDateAfterLabel(text, ...labels) {
  // Match "令和 7  2025年 6月 19日" preferring Gregorian year
  const re = new RegExp(
    '(?:' + labels.join('|') + ')[\\s\\S]{0,40}?' +
    '(?:令和|平成|昭和)?\\s*\\d*\\s*(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日',
  );
  const m = text.match(re);
  return m ? { value: isoDate(m[1], m[2], m[3]), raw: m[0] } : null;
}

function extractDateLabeled(text, label) {
  // same, but single label that must match literally
  const re = new RegExp(
    label + '[\\s\\S]{0,40}?(?:令和|平成|昭和)?\\s*\\d*\\s*(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日',
  );
  const m = text.match(re);
  return m ? { value: isoDate(m[1], m[2], m[3]), raw: m[0] } : null;
}

function extractFirstRegDate(text) {
  // 初度登録年月 令和 3 2021年 9月  — note only year+month
  const re = /(?:初\s*度\s*登\s*録\s*年\s*月|First\s*Reg\.?\s*Date)[\s\S]{0,40}?(?:令和|平成|昭和)?\s*\d*\s*(\d{4})\s*年\s*(\d{1,2})\s*月/;
  const m = text.match(re);
  if (m) {
    // Format like "SEPTEMBER / 2021"
    const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                    'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    return { value: `${months[Number(m[2]) - 1]} / ${m[1]}`, raw: m[0] };
  }
  return null;
}

function extractExportScheduledDate(text) {
  // 輸出予定日 or Export scheduled day
  return extractDateAfterLabel(text, '輸\\s*出\\s*予\\s*定\\s*日', 'Export\\s*scheduled\\s*day');
}

function extractRegistrationDate(text) {
  // 登録年月日 — but NOT 初度登録年月. Use lookahead.
  return extractDateAfterLabel(text, '登\\s*録\\s*年\\s*月\\s*日', 'Registration\\s*Date');
}

function extractOwnerName(text) {
  // 所有者の氏名 株式会社 KMT
  let m = text.match(/所\s*有\s*者\s*の\s*氏\s*名[^\n]*?\n?([^\n]{2,40})/);
  if (m) {
    return { value: m[1].trim().replace(/\s+/g, ' ').replace(/^(?:Name\s*of\s*Owner[：:]?\s*)?/i, ''), raw: m[0] };
  }
  return null;
}

function extractOwnerAddress(text) {
  // 所有者の住所 京都府京都市... [26009 4800]
  const m = text.match(/所\s*有\s*者\s*の\s*住\s*所[^\n]*?\n?([^\n\[]{5,80})(?:\s*\[([\d\s]+)\])?/);
  if (m) {
    return {
      value: m[1].trim().replace(/^(?:Address\s*of\s*Owner[：:]?\s*)?/i, ''),
      owner_code: m[2] ? m[2].trim().replace(/\s+/g, ' ') : null,
      raw: m[0],
    };
  }
  return null;
}

function extractDimensions(text) {
  // 長さ 399cm 幅 180cm 高さ 145cm
  const re = /(\d{3,4})\s*cm\s*(\d{3,4})\s*cm\s*(\d{3,4})\s*cm/;
  const m = text.match(re);
  return m ? {
    length_cm: m[1], width_cm: m[2], height_cm: m[3],
    raw: m[0],
  } : null;
}

function extractWeights(text) {
  // 車両重量 1290kg 車両総重量 1510kg
  const result = {};
  let m = text.match(/車\s*両\s*重\s*量[\s\S]{0,30}?(\d{3,5})\s*kg/);
  if (m) result.weight_kg = m[1];
  m = text.match(/車\s*両\s*総\s*重\s*量[\s\S]{0,30}?(\d{3,5})\s*kg/);
  if (m) result.gross_weight = m[1];
  m = text.match(/前\s*前\s*軸\s*重[\s\S]{0,20}?(\d{2,5})\s*kg/);
  if (m) result.ff_weight = m[1];
  m = text.match(/後\s*後\s*軸\s*重[\s\S]{0,20}?(\d{2,5})\s*kg/);
  if (m) result.rr_weight = m[1];
  return Object.keys(result).length ? result : null;
}

function extractEngineCapacity(text) {
  // 総排気量 1.61 (kW maybe mistaken — actually L)
  // Pattern: number followed by "kW" or "L" near "排気量"/"Engine Capacity"
  const m = text.match(/(?:総\s*排\s*気\s*量|Engine\s*Capacity)[\s\S]{0,40}?(\d+\.\d{2})\s*(?:L|kW)?/i);
  if (m) {
    const val = Number(m[1]);
    return {
      value: (val * 1000).toFixed(0), // → cc
      displayL: val.toFixed(2) + 'L',
      raw: m[0],
    };
  }
  return null;
}

function extractFuel(text) {
  // 燃料の種別 ガソリン → PETROL
  let m = text.match(/燃\s*料\s*の\s*種\s*別[\s\S]{0,20}?(ガソリン|軽油|ディーゼル|LPG|CNG|電気|ハイブリッド|HV|EV)/);
  if (m) {
    const map = { 'ガソリン': 'PETROL', '軽油': 'DIESEL', 'ディーゼル': 'DIESEL',
                  'LPG': 'LPG', 'CNG': 'CNG', '電気': 'ELECTRIC', 'EV': 'ELECTRIC',
                  'ハイブリッド': 'HYBRID', 'HV': 'HYBRID' };
    return { value: map[m[1]] || m[1], raw: m[0] };
  }
  // Catch English
  m = text.match(/Classification\s*of\s*Fuel[\s\S]{0,30}?(Petrol|Diesel|Gasoline|Hybrid|Electric|LPG|CNG)/i);
  return m ? { value: m[1].toUpperCase(), raw: m[0] } : null;
}

function extractSpecNo(text) {
  const m = text.match(/(?:型\s*式\s*指\s*定\s*番\s*号|Specification\s*No\.?)[\s\S]{0,30}?(\d{5})/);
  return m ? { value: m[1], raw: m[0] } : null;
}

function extractClassificationNo(text) {
  const m = text.match(/(?:類\s*別\s*区\s*分\s*番\s*号|Classification\s*No\.?)[\s\S]{0,30}?(\d{4})/);
  return m ? { value: m[1], raw: m[0] } : null;
}

function extractBodyType(text) {
  // 車体の形状 箱型 [001] → "Station Wagon" etc.
  const m = text.match(/車\s*体\s*の\s*形\s*状[\s\S]{0,30}?([ぁ-んァ-ヶ一-龥]{2,10})\s*\[?\s*(\d{3})?\s*\]?/);
  if (m) {
    const map = { '箱型': 'Station Wagon', 'バン': 'Van', 'セダン': 'Sedan',
                  'ステーションワゴン': 'Station Wagon', 'キャブオーバー': 'Cab Over',
                  'ピックアップ': 'Pickup', '幌型': 'Convertible' };
    return {
      value: map[m[1]] || m[1],
      classification_body_no: m[2] || null,
      raw: m[0],
    };
  }
  return null;
}

function extractFixedNumber(text) {
  // 乗車定員 4人
  const m = text.match(/(?:乗\s*車\s*定\s*員|Fixed\s*Number)[\s\S]{0,20}?(\d{1,2})\s*(?:人|person)/);
  return m ? { value: m[1], raw: m[0] } : null;
}

function extractMileage(text) {
  // 走行距離計表示値 24,000km
  const m = text.match(/(?:走\s*行\s*距\s*離|Mileage)[\s\S]{0,40}?([\d,]+)\s*km/i);
  return m ? { value: m[1].replace(/,/g, '') + 'KM', raw: m[0] } : null;
}

function extractPreviousRegNo(text) {
  // 旧自動車登録番号 高松 300 そ 3638
  const m = text.match(/旧\s*自\s*動\s*車\s*登\s*録\s*番\s*号[\s\S]{0,30}?([^\n]{5,40})/);
  if (!m) return null;
  const inner = extractRegistrationNo(m[1]);
  return inner ? { value: inner.value, raw: m[0] } : { value: m[1].trim(), raw: m[0] };
}

function extractIssuer(text) {
  // 京都運輸支局長 / Director of the Kyoto Transport Bureau Office
  let m = text.match(/([ぁ-んァ-ヶ一-龥]{2,6}運輸支局長)/);
  if (m) return { value: `Director of the ${m[1].replace(/運輸支局長/, '')} Transport Bureau Office`, raw: m[0] };
  m = text.match(/Director\s+of\s+the\s+([A-Za-z]+)\s+Transport\s+Bureau\s+Office/);
  return m ? { value: m[0], raw: m[0] } : null;
}

// --- main ---------------------------------------------------------------

/**
 * Parse extracted text from a vehicle certificate and return candidate
 * values mapped onto case-editor field names.
 *
 * Returned object: { fields: { fieldName: { value, raw, confidence } }, source: 'pdf|ocr' }
 */
export function parseVehicleCertText(text, source = 'pdf') {
  // Normalize: keep Japanese + English, strip control chars, compact spaces.
  const t = text
    .replace(/[\t\r]+/g, ' ')
    .replace(/[ \u3000]+/g, ' ')
    .replace(/\n{2,}/g, '\n');

  const fields = {};
  const set = (name, res) => { if (res && res.value) fields[name] = { ...res, source }; };

  const certNo = extractCertNo(t);          if (certNo) fields.export_cert_no = { ...certNo, source };
  const refNo = extractReferenceNo(t);       if (refNo) fields.reference_no = { ...refNo, source };

  const reg = extractRegistrationNo(t);      if (reg) fields.registration_no = { ...reg, source };
  set('registration_date', extractRegistrationDate(t));
  set('first_reg_date',    extractFirstRegDate(t));
  set('export_scheduled_date', extractExportScheduledDate(t));

  set('chassis_no',  extractChassisNo(t));
  set('model_code',  extractModelCode(t));
  set('engine_model', extractEngineModel(t));
  set('maker',       extractMaker(t));
  set('maker_code',  extractMakerCode(t));

  const dims = extractDimensions(t);
  if (dims) {
    fields.length_cm = { value: dims.length_cm, raw: dims.raw, source };
    fields.width_cm  = { value: dims.width_cm,  raw: dims.raw, source };
    fields.height_cm = { value: dims.height_cm, raw: dims.raw, source };
  }
  const w = extractWeights(t);
  if (w) {
    for (const k of Object.keys(w)) {
      fields[k] = { value: w[k], raw: '', source };
    }
  }
  const cap = extractEngineCapacity(t);
  if (cap) {
    fields.displacement_cc = { value: cap.value, raw: cap.raw, source };
    fields.engine_capacity = { value: `${cap.value}CC`, raw: cap.raw, source };
    fields.fuel_classification_spec = { value: cap.displayL, raw: cap.raw, source };
  }
  set('fuel',              extractFuel(t));
  set('spec_no',           extractSpecNo(t));
  set('classification_no', extractClassificationNo(t));
  const body = extractBodyType(t);
  if (body) {
    fields.body_type = { value: body.value, raw: body.raw, source };
    if (body.classification_body_no) {
      fields.classification_body_no = { value: body.classification_body_no, raw: body.raw, source };
    }
  }
  set('fixed_number', extractFixedNumber(t));
  set('mileage',      extractMileage(t));
  set('previous_reg_no', extractPreviousRegNo(t));
  set('issuer_title', extractIssuer(t));

  const owner = extractOwnerAddress(t);
  if (owner?.owner_code) fields.owner_code = { value: owner.owner_code, raw: owner.raw, source };

  return { fields, rawText: t, source };
}

export const FIELD_LABELS = {
  export_cert_no: '証明書番号 (No.)',
  reference_no: '整理番号',
  registration_no: '自動車登録番号',
  registration_date: '登録年月日',
  first_reg_date: '初度登録年月',
  export_scheduled_date: '輸出予定日',
  chassis_no: '車台番号',
  model_code: '型式',
  engine_model: '原動機の型式',
  maker: '車名 (Maker)',
  maker_code: 'メーカーコード',
  length_cm: '長さ (cm)',
  width_cm: '幅 (cm)',
  height_cm: '高さ (cm)',
  weight_kg: '車両重量 (kg)',
  gross_weight: '車両総重量 (kg)',
  ff_weight: 'FF重量 (kg)',
  rr_weight: 'RR重量 (kg)',
  displacement_cc: '総排気量 (cc)',
  engine_capacity: 'Engine Capacity',
  fuel_classification_spec: '燃料区分表示',
  fuel: '燃料種別',
  spec_no: '型式指定番号',
  classification_no: '類別区分番号',
  body_type: '車体形状',
  classification_body_no: '車体形状コード',
  fixed_number: '乗車定員',
  mileage: '走行距離',
  previous_reg_no: '旧登録番号',
  issuer_title: '発行者',
  owner_code: '所有者コード',
};
