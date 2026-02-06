/**
 * 延期ペナルティを計算（日割り）
 * 例: 月額の1% * 延滞日数
 * @param {number} amount
 * @param {string} originalDateStr
 * @param {string} actualDateStr
 * @returns {number}
 */
export function calculatePenalty(amount, originalDateStr, actualDateStr) {
  const original = new Date(originalDateStr);
  const actual = new Date(actualDateStr);
  
  const diffTime = actual.getTime() - original.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return 0;
  
  // 日割り計算のロジック（例：年利15%を日割りにするなど、ここではシンプルに1日0.1%とする）
  const dailyRate = 0.001; 
  return Math.floor(amount * dailyRate * diffDays);
}

/**
 * 借金の完済予定月を計算
 * @param {Array} loans 
 * @returns {Object} { totalBalance, monthlyTotal, payoffDate, totalMonths }
 */
export function calculatePayoffSummary(loans) {
  let totalBalance = 0;
  let monthlyTotal = 0;
  let maxMonths = 0;

  loans.filter(l => l.active).forEach(loan => {
    totalBalance += loan.currentBalance;
    monthlyTotal += loan.monthlyPayment;
    
    // 簡易的な完済月数計算
    const monthlyRate = (loan.interestRate / 12) / 100;
    let balance = loan.currentBalance;
    let months = 0;
    
    if (loan.monthlyPayment > balance * monthlyRate) {
      while (balance > 0 && months < 600) {
        balance = balance + (balance * monthlyRate) - loan.monthlyPayment;
        months++;
      }
    } else {
      months = Infinity;
    }
    
    if (months > maxMonths) maxMonths = months;
  });

  const payoffDate = new Date();
  const totalMonths = maxMonths;
  if (maxMonths === Infinity) {
    return { totalBalance, monthlyTotal, payoffDate: '返済不可', totalMonths };
  }
  payoffDate.setMonth(payoffDate.getMonth() + maxMonths);
  
  return {
    totalBalance,
    monthlyTotal,
    payoffDate: `${payoffDate.getFullYear()}年${payoffDate.getMonth() + 1}月`,
    totalMonths
  };
}
