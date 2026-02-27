import { getAdjustedDate as utilsGetAdjustedDate } from './utils.js';

const formatYMD = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getAdjustedDate = (date, adjustment) => {
  return formatYMD(utilsGetAdjustedDate(date, adjustment));
};

const resolveDatesFromRule = (rule, adjustment, year, month, lastDay) => {
  if (!rule) return [];

  const dates = [];
  const addDate = (d) => {
    const original = formatYMD(d);
    const actual = getAdjustedDate(d, adjustment);
    dates.push({ original, actual });
  };

  switch (rule.type) {
    case 'monthly':
      addDate(new Date(year, month - 1, Math.min(rule.day || 1, lastDay)));
      break;
    case 'monthEnd':
      addDate(new Date(year, month - 1, lastDay));
      break;
    case 'weekly':
      for (let d = 1; d <= lastDay; d++) {
        const dt = new Date(year, month - 1, d);
        if (dt.getDay() === rule.weekday) {
          addDate(dt);
        }
      }
      break;
    case 'nextMonthDay':
      // 今月のカレンダーに表示される「前月締め翌月払い」の項目
      // 実質的には monthly と同じ（その月の◯日）だが、文脈として区別
      addDate(new Date(year, month - 1, Math.min(rule.day || 1, lastDay)));
      break;
    case 'monthlyBusinessDay':
      let businessDayCount = 0;
      for (let d = 1; d <= lastDay; d++) {
        const dt = new Date(year, month - 1, d);
        const dow = dt.getDay();
        if (dow !== 0 && dow !== 6) {
          businessDayCount++;
          if (businessDayCount === rule.nth) {
            addDate(dt);
            break;
          }
        }
      }
      break;
    default:
      break;
  }
  return dates;
};

const isEffective = (item, targetMonthStart, targetMonthEnd) => {
  if (!item.effective) return true;
  const { start, end } = item.effective;
  if (start && formatYMD(targetMonthEnd) < start) return false;
  if (end && formatYMD(targetMonthStart) > end) return false;
  return true;
};

const isDateWithinRange = (dateStr, effective) => {
  if (!effective) return true;
  const { start, end } = effective;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
};

/**
 * @param {import('./schema').MasterItem[]} masterItems
 * @param {import('./schema').Loan[]} loans
 * @param {import('./schema').Client[]} clients
 * @param {number} year
 * @param {number} month - 1-12
 * @returns {import('./schema').CalendarEvent[]}
 */
export function generateMonthEvents(masterItems, loans, clients, year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  const events = [];
  const targetMonthStart = new Date(year, month - 1, 1);
  const targetMonthEnd = new Date(year, month - 1, lastDay);

  // 通常の収支項目
  masterItems
    .filter(item => item.active && item.type !== 'bank' && isEffective(item, targetMonthStart, targetMonthEnd))
    .filter(item => {
      // 借入(loan)タグがついている場合、借入先(loans)に同名のものがあれば二重生成を避けるためスキップ
      if (item.tag === 'loan') {
        const hasLoan = loans.some(l => 
          l.active && (l.name === item.name || item.name.includes(l.name) || l.name.includes(item.name))
        );
        if (hasLoan) return false;
      }
      return true;
    })
    .forEach(item => {
      // v2: scheduleRule, v1 fallback: day
      const rule = item.scheduleRule || { type: 'monthly', day: item.day || 1 };
      const dates = resolveDatesFromRule(rule, item.adjustment || 'none', year, month, lastDay);

      dates.forEach((datePair, index) => {
        if (!isDateWithinRange(datePair.original, item.effective)) return;
        events.push({
          id: `${item.id}-${year}-${month}-${index}`,
          masterId: item.id,
          name: item.name,
          type: item.type,
          amount: item.amount,
          amountMode: item.amountMode || 'fixed',
          bankId: item.bankId || '',
          originalDate: datePair.original,
          actualDate: datePair.actual,
          penaltyFee: 0,
          status: 'pending'
        });
      });
    });

  // 借入の返済
  loans
    .filter(loan => loan.active && loan.currentBalance > 0 && loan.type !== 'クレジットカード')
    .forEach(loan => {
      const rule = loan.scheduleRule || { type: 'monthly', day: loan.paymentDay || 27 };
      const dates = resolveDatesFromRule(rule, loan.adjustment || 'none', year, month, lastDay);

      dates.forEach((datePair, index) => {
        events.push({
          id: `loan-${loan.id}-${year}-${month}-${index}`,
          masterId: loan.id,
          name: `返済: ${loan.name}`,
          type: 'expense',
          amount: loan.monthlyPayment,
          bankId: loan.bankId || '', 
          originalDate: datePair.original,
          actualDate: datePair.actual,
          penaltyFee: 0,
          status: 'pending'
        });
      });
    });

  // クライアント収入
  (clients || [])
    .filter(client => client.active && isEffective(client, targetMonthStart, targetMonthEnd))
    .forEach(client => {
      const rule = client.scheduleRule || { type: 'monthly', day: client.paymentDay || 15 };
      const dates = resolveDatesFromRule(rule, client.adjustment || 'none', year, month, lastDay);
      dates.forEach((datePair, index) => {
        if (!isDateWithinRange(datePair.original, client.effective)) return;
        events.push({
          id: `client-${client.id}-${year}-${month}-${index}`,
          masterId: client.id,
          name: client.name,
          type: 'income',
          amount: client.amount,
          amountMode: client.amountMode || 'fixed',
          bankId: client.bankId || '',
          originalDate: datePair.original,
          actualDate: datePair.actual,
          penaltyFee: 0,
          status: 'pending'
        });
      });
    });

  return events;
}

/**
 * クライアント収入のみ生成
 * @param {import('./schema').Client[]} clients
 * @param {number} year
 * @param {number} month
 * @returns {import('./schema').CalendarEvent[]}
 */
export function generateClientEvents(clients, year, month) {
  return generateMonthEvents([], [], clients, year, month);
}
