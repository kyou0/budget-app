/**
 * @typedef {Object} ScheduleRule
 * @property {'monthly'|'monthEnd'|'weekly'|'monthlyBusinessDay'|'nextMonthDay'} type
 * @property {number} [day] - monthly, nextMonthDay 用 (1-31)
 * @property {number} [weekday] - weekly 用 (0:日, 1:月...)
 * @property {number} [nth] - monthlyBusinessDay 用 (第n営業日)
 */

/**
 * @typedef {Object} MasterItem
 * @property {string} id
 * @property {string} name
 * @property {'income'|'expense'|'bank'} type
 * @property {number} amount
 * @property {'fixed'|'variable'} [amountMode] - 金額モード
 * @property {Object} [estimate] - 変動時の見積もり
 * @property {number} [estimate.min]
 * @property {number} [estimate.base]
 * @property {number} [estimate.max]
 * @property {ScheduleRule} [scheduleRule] - v2 日付ルール
 * @property {number} [day] - v1 互換用 (1-31)
 * @property {string} [bankId] - 紐づく銀行口座のID
 * @property {number} [currentBalance] - 銀行口座などの現在残高
 * @property {'none'|'prev_weekday'|'next_weekday'} [adjustment] - 土日祝の調整
 * @property {Object} [effective] - 有効期間
 * @property {string|null} [effective.start] - YYYY-MM-DD
 * @property {string|null} [effective.end] - YYYY-MM-DD
 * @property {string} [tag] - 分類タグ (card, loan, fixed, tax, etc.)
 * @property {boolean} active
 */

/**
 * @typedef {Object} CalendarEvent
 * @property {string} id
 * @property {string} masterId
 * @property {string} name
 * @property {'income'|'expense'} type
 * @property {number} amount
 * @property {'fixed'|'variable'} [amountMode]
 * @property {string} [bankId] - 紐づく銀行口座のID
 * @property {string} originalDate - YYYY-MM-DD
 * @property {string} actualDate - YYYY-MM-DD
 * @property {number} penaltyFee
 * @property {'pending'|'paid'} status
 * @property {string} [gcalEventId]
 * @property {string} [gcalCalendarId]
 */

/**
 * @typedef {Object} Loan
 * @property {string} id
 * @property {string} name
 * @property {string} type - 消費者金融|銀行カードローン|親族|友人|クレジットカード
 * @property {number} interestRate - 年利(%)
 * @property {number} maxLimit - 限度額
 * @property {number} currentBalance - 現在残高
 * @property {number} monthlyPayment - 月間返済額
 * @property {ScheduleRule} [scheduleRule] - v2 日付ルール
 * @property {number} [paymentDay] - v1 互換用 (1-31)
 * @property {'none'|'prev_weekday'|'next_weekday'} [adjustment] - 土日祝の調整
 * @property {string} [bankId] - 支払元銀行
 * @property {string} [repaymentMethod] - 返済方式 (fixed_payment, revolving_minimum, etc.)
 * @property {number} [originalPrincipal] - 元金合計
 * @property {number} [remainingPayments] - 残り回数
 * @property {string} [notes] - メモ
 * @property {boolean} active
 */

export const INITIAL_DATA = {
  schemaVersion: 2,
  master: {
    items: [],
    loans: []
  },
  calendar: {
    generatedMonths: {}
  },
  settings: {
    googleClientId: '45451544416-8nlqo6bhl56arpjuuh4kekfa24ed9np5.apps.googleusercontent.com',
    googleApiKey: '',
    tutorialCompleted: false,
    driveSyncEnabled: false,
    calendarSyncEnabled: false,
    incomeCalendarId: 'primary',
    expenseCalendarId: 'primary',
    syncHistory: [],
    demoMode: false,
    userDisplayName: '',
    userAge: null,
    userBirthdate: '',
    loanTypeOptions: [
      '消費者金融',
      '銀行カードローン',
      '分割払い',
      '奨学金',
      'デバイス',
      'Mac',
      'iPad',
      'iPhone',
      '親族',
      '友人'
    ]
  },
  transactions: []
};
