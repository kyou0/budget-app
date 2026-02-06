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

  // 通常の収支項目
  masterItems
    .filter(item => item.active)
    .forEach(item => {
      const day = Math.min(item.day, lastDay);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      events.push({
        id: `${item.id}-${year}-${month}`,
        masterId: item.id,
        name: item.name,
        type: item.type,
        amount: item.amount,
        originalDate: dateStr,
        actualDate: dateStr,
        penaltyFee: 0,
        status: 'pending'
      });
    });

  // 借入の返済（27日固定とするか、個別に持たせるか。ここでは27日とする）
  loans
    .filter(loan => loan.active && loan.currentBalance > 0)
    .forEach(loan => {
      const day = Math.min(27, lastDay); // 返済日は一旦27日固定
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      events.push({
        id: `loan-${loan.id}-${year}-${month}`,
        masterId: loan.id,
        name: `返済: ${loan.name}`,
        type: 'expense',
        amount: loan.monthlyPayment,
        originalDate: dateStr,
        actualDate: dateStr,
        penaltyFee: 0,
        status: 'pending'
      });
    });

  return events;
}
