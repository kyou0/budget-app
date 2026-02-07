const formatYMD = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getAdjustedDate = (date, adjustment) => {
  const dayOfWeek = date.getDay();
  const adjusted = new Date(date);

  if (adjustment === 'prev_weekday') {
    if (dayOfWeek === 0) adjusted.setDate(adjusted.getDate() - 2);
    else if (dayOfWeek === 6) adjusted.setDate(adjusted.getDate() - 1);
  } else if (adjustment === 'next_weekday') {
    if (dayOfWeek === 0) adjusted.setDate(adjusted.getDate() + 1);
    else if (dayOfWeek === 6) adjusted.setDate(adjusted.getDate() + 2);
  }
  return formatYMD(adjusted);
};

const resolveDatesFromRule = (rule, adjustment, year, month, lastDay) => {
  if (!rule) return [];

  const dates = [];
  switch (rule.type) {
    case 'monthly':
      dates.push(getAdjustedDate(new Date(year, month - 1, Math.min(rule.day || 1, lastDay)), adjustment));
      break;
    case 'monthEnd':
      dates.push(getAdjustedDate(new Date(year, month - 1, lastDay), adjustment));
      break;
    case 'weekly':
      for (let d = 1; d <= lastDay; d++) {
        const dt = new Date(year, month - 1, d);
        if (dt.getDay() === rule.weekday) {
          dates.push(formatYMD(dt));
        }
      }
      break;
    case 'nextMonthDay':
      dates.push(getAdjustedDate(new Date(year, month - 1, Math.min(rule.day || 1, lastDay)), adjustment));
      break;
    case 'monthlyBusinessDay':
      let businessDayCount = 0;
      for (let d = 1; d <= lastDay; d++) {
        const dt = new Date(year, month - 1, d);
        const dow = dt.getDay();
        if (dow !== 0 && dow !== 6) {
          businessDayCount++;
          if (businessDayCount === rule.nth) {
            dates.push(formatYMD(dt));
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
    .forEach(item => {
      // v2: scheduleRule, v1 fallback: day
      const rule = item.scheduleRule || { type: 'monthly', day: item.day || 1 };
      const dates = resolveDatesFromRule(rule, item.adjustment || 'none', year, month, lastDay);

      dates.forEach((dateStr, index) => {
        events.push({
          id: `${item.id}-${year}-${month}-${index}`,
          masterId: item.id,
          name: item.name,
          type: item.type,
          amount: item.amount,
          amountMode: item.amountMode || 'fixed',
          bankId: item.bankId || '',
          originalDate: dateStr,
          actualDate: dateStr,
          penaltyFee: 0,
          status: 'pending'
        });
      });
    });

  // 借入の返済
  loans
    .filter(loan => loan.active && loan.currentBalance > 0)
    .forEach(loan => {
      const rule = loan.scheduleRule || { type: 'monthly', day: loan.paymentDay || 27 };
      const dates = resolveDatesFromRule(rule, loan.adjustment || 'none', year, month, lastDay);

      dates.forEach((dateStr, index) => {
        events.push({
          id: `loan-${loan.id}-${year}-${month}-${index}`,
          masterId: loan.id,
          name: `返済: ${loan.name}`,
          type: 'expense',
          amount: loan.monthlyPayment,
          bankId: loan.bankId || '', 
          originalDate: dateStr,
          actualDate: dateStr,
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
      dates.forEach((dateStr, index) => {
        events.push({
          id: `client-${client.id}-${year}-${month}-${index}`,
          masterId: client.id,
          name: client.name,
          type: 'income',
          amount: client.amount,
          amountMode: client.amountMode || 'fixed',
          bankId: client.bankId || '',
          originalDate: dateStr,
          actualDate: dateStr,
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
