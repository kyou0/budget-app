/**
 * @typedef {Object} MasterItem
 * @property {string} id
 * @property {string} name
 * @property {'income'|'expense'|'bank'} type
 * @property {number} amount
 * @property {number} day - 1-31
 * @property {number} [currentBalance] - 銀行口座などの現在残高
 * @property {boolean} active
 */

/**
 * @typedef {Object} CalendarEvent
 * @property {string} id
 * @property {string} masterId
 * @property {string} name
 * @property {'income'|'expense'} type
 * @property {number} amount
 * @property {string} originalDate - YYYY-MM-DD
 * @property {string} actualDate - YYYY-MM-DD
 * @property {number} penaltyFee
 * @property {'pending'|'paid'} status
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
 * @property {string} startDate - YYYY-MM-DD
 * @property {boolean} active
 */

export const INITIAL_DATA = {
  schemaVersion: 1,
  master: {
    items: [],
    methods: [],
    loans: []
  },
  calendar: {
    generatedMonths: {}
  },
  settings: {
    googleClientId: '',
    googleApiKey: '',
    tutorialCompleted: false
  },
  transactions: []
};
