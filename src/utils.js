/**
 * 名前とタイプに基づいて最適なアイコンを返す
 * @param {string} name 
 * @param {string} type 
 * @returns {string}
 */
export function getIcon(name, type) {
  const n = name.toLowerCase();
  
  // 銀行関連
  if (type === 'bank' || n.includes('銀行') || n.includes('口座')) {
    if (n.includes('楽天')) return '🔴'; // 楽天銀行
    if (n.includes('三菱') || n.includes('ufj')) return '🔴'; // 三菱UFJ
    if (n.includes('三井住友') || n.includes('smbc')) return '🟢'; // 三井住友
    if (n.includes('みずほ')) return '🔵'; // みずほ
    if (n.includes('ゆうちょ')) return '🟢'; // ゆうちょ
    if (n.includes('paypay')) return '🔴'; // PayPay銀行
    if (n.includes('住信') || n.includes('sbi')) return '🔵'; // 住信SBI
    return '🏦';
  }

  // 収入
  if (type === 'income') {
    if (n.includes('給与') || n.includes('給料')) return '🧧';
    if (n.includes('副業') || n.includes('報酬')) return '💸';
    return '💰';
  }

  // 借入・返済
  if (n.includes('返済') || n.includes('アコム') || n.includes('アイフル') || n.includes('プロミス') || n.includes('レイク')) {
    return '💸';
  }

  // 固定費・生活
  if (n.includes('家賃')) return '🏠';
  if (n.includes('電気') || n.includes('ガス') || n.includes('水道') || n.includes('光熱費')) return '⚡';
  if (n.includes('通信') || n.includes('携帯') || n.includes('スマホ') || n.includes('ネット')) return '📱';
  if (n.includes('保険')) return '🛡️';
  
  // カード
  if (n.includes('カード') || n.includes('jcb') || n.includes('visa') || n.includes('master')) {
    if (n.includes('楽天')) return '💳'; 
    return '💳';
  }

  // 税金
  if (n.includes('税') || n.includes('年金') || n.includes('国保')) return '🏛️';

  // その他
  return type === 'expense' ? '🛒' : '❓';
}

/**
 * ヶ月数を「X年Yヶ月」に変換
 * @param {number} months
 * @returns {string}
 */
export function formatMonthsToYears(months) {
  if (!Number.isFinite(months)) return '不明';
  if (months <= 0) return '0ヶ月';
  const years = Math.floor(months / 12);
  const remain = months % 12;
  if (years > 0 && remain > 0) return `${years}年${remain}ヶ月`;
  if (years > 0) return `${years}年`;
  return `${remain}ヶ月`;
}

/**
 * 生年月日から年齢(月)を計算
 * @param {string} birthdate - YYYY-MM-DD
 * @param {Date} [refDate]
 * @returns {number|null}
 */
export function getAgeMonthsFromBirthdate(birthdate, refDate = new Date()) {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  let months = (refDate.getFullYear() - birth.getFullYear()) * 12 + (refDate.getMonth() - birth.getMonth());
  if (refDate.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * 年齢(月)を「X歳Yヶ月」に変換
 * @param {number} months
 * @returns {string}
 */
export function formatAgeMonths(months) {
  if (!Number.isFinite(months)) return '';
  const years = Math.floor(months / 12);
  const remain = months % 12;
  return remain > 0 ? `${years}歳${remain}ヶ月` : `${years}歳`;
}

/**
 * 名前からブランドのロゴURLを返す
 * @param {string} name 
 * @returns {string|null}
 */
export function getLogoUrl(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  
  for (const brand of CARD_BRANDS) {
    if (n.includes(brand.key)) {
      return `https://www.google.com/s2/favicons?domain=${brand.domain}&sz=64`;
    }
  }
  return null;
}

/**
 * クレジットカードブランドのリスト
 */
export const CARD_BRANDS = [
  { name: 'JCB', key: 'jcb', domain: 'jcb.co.jp' },
  { name: 'Visa', key: 'visa', domain: 'visa.co.jp' },
  { name: 'Mastercard', key: 'master', domain: 'mastercard.co.jp' },
  { name: 'Amex', key: 'amex', domain: 'americanexpress.com' },
  { name: 'Diners', key: 'diners', domain: 'diners.co.jp' },
  { name: '楽天カード', key: '楽天', domain: 'rakuten-card.co.jp' },
  { name: 'PayPayカード', key: 'paypay', domain: 'paypay-card.co.jp' },
  { name: '三井住友カード', key: '三井住友', domain: 'smbc-card.com' },
  { name: '三菱UFJカード', key: '三菱ufj', domain: 'cr.mufg.jp' },
  { name: 'エポスカード', key: 'エポス', domain: 'eposcard.co.jp' },
  { name: 'イオンカード', key: 'イオン', domain: 'aeon.co.jp' },
  { name: 'セゾンカード', key: 'セゾン', domain: 'saisoncard.co.jp' },
  { name: 'dカード', key: 'dカード', domain: 'd-card.jp' },
  { name: 'au PAY カード', key: 'au pay', domain: 'kddi-fs.com' },
  { name: 'リクルートカード', key: 'リクルート', domain: 'recruit-card.jp' },
  { name: 'Amazonカード', key: 'amazon', domain: 'amazon.co.jp' },
  { name: 'メルカード', key: 'メル', domain: 'mercari.com' },
  { name: 'VIEWカード', key: 'view', domain: 'jreast.co.jp' },
  { name: 'ライフカード', key: 'ライフ', domain: 'lifecard.co.jp' },
  { name: 'オリコカード', key: 'オリコ', domain: 'orico.co.jp' }
];

/**
 * 数値をカンマ区切り文字列に変換
 * @param {number|string} val 
 * @returns {string}
 */
export function formatNumber(val) {
  if (val === undefined || val === null || val === '') return '';
  const num = typeof val === 'string' ? Number(val.replace(/,/g, '')) : val;
  if (isNaN(num)) return val;
  return num.toLocaleString();
}

/**
 * カンマ区切り文字列を数値に変換
 * @param {string|number} val 
 * @returns {number}
 */
export function parseNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return Number(String(val).replace(/,/g, '')) || 0;
}
