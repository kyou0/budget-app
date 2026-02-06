/**
 * @param {import('./schema').MasterItem[]} masterItems
 * @param {import('./schema').Loan[]} loans
 * @param {number} year
 * @param {number} month - 1-12
 * @returns {import('./schema').CalendarEvent[]}
 */
export function generateMonthEvents(masterItems, loans, year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  const events = [];
  const targetMonthStart = new Date(year, month - 1, 1);
  const targetMonthEnd = new Date(year, month - 1, lastDay);

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`; // ここで day が未定義だったので修正
  };
  
  // 修正版 formatDate
  const formatYMD = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getAdjustedDate = (date, adjustment) => {
    const dayOfWeek = date.getDay(); // 0: 日, 6: 土
    const adjusted = new Date(date);

    if (adjustment === 'prev_weekday') {
      if (dayOfWeek === 0) adjusted.setDate(adjusted.getDate() - 2); // 日 -> 金
      else if (dayOfWeek === 6) adjusted.setDate(adjusted.getDate() - 1); // 土 -> 金
    } else if (adjustment === 'next_weekday') {
      if (dayOfWeek === 0) adjusted.setDate(adjusted.getDate() + 1); // 日 -> 月
      else if (dayOfWeek === 6) adjusted.setDate(adjusted.getDate() + 2); // 土 -> 月
    }
    return formatYMD(adjusted);
  };

  const isEffective = (item) => {
    if (!item.effective) return true;
    const { start, end } = item.effective;
    if (start && formatYMD(targetMonthEnd) < start) return false;
    if (end && formatYMD(targetMonthStart) > end) return false;
    return true;
  };

  const resolveDatesFromRule = (rule, adjustment) => {
    if (!rule) return []; // Fallback for old schema if migration not run

    const dates = [];
    switch (rule.type) {
      case 'monthly':
        dates.push(getAdjustedDate(new Date(year, month - 1, Math.min(rule.day || 1, lastDay)), adjustment));
        break;
      case 'monthEnd':
        dates.push(getAdjustedDate(new Date(year, month - 1, lastDay), adjustment));
        break;
      case 'weekly':
        // その月の全ての該当曜日をリストアップ
        for (let d = 1; d <= lastDay; d++) {
          const dt = new Date(year, month - 1, d);
          if (dt.getDay() === rule.weekday) {
            dates.push(formatYMD(dt));
          }
        }
        break;
      case 'nextMonthDay':
        // 「翌月15日」などのルール。今月締め・来月払いの管理用。
        // ここでは、対象月(year, month)に支払日が発生するものを生成する。
        // 「前月の締めに対する今月の支払い」として扱う。
        dates.push(getAdjustedDate(new Date(year, month - 1, Math.min(rule.day || 1, lastDay)), adjustment));
        break;
      case 'monthlyBusinessDay':
        // 第n営業日 (土日を飛ばして数える)
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

  // 通常の収支項目
  masterItems
    .filter(item => item.active && item.type !== 'bank' && isEffective(item))
    .forEach(item => {
      // v2: scheduleRule, v1 fallback: day
      const rule = item.scheduleRule || { type: 'monthly', day: item.day || 1 };
      const dates = resolveDatesFromRule(rule, item.adjustment || 'none');

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
      const dates = resolveDatesFromRule(rule, loan.adjustment || 'none');

      dates.forEach((dateStr, index) => {
        events.push({
          id: `loan-${loan.id}-${year}-${month}-${index}`,
          masterId: loan.id,
          name: `返済: ${loan.name}`,
          type: 'expense',
          amount: loan.monthlyPayment,
          bankId: '', 
          originalDate: dateStr,
          actualDate: dateStr,
          penaltyFee: 0,
          status: 'pending'
        });
      });
    });

  return events;
}
