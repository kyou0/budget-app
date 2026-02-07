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
    const balance = Number(loan.currentBalance) || 0;
    const monthlyPayment = Number(loan.monthlyPayment) || 0;
    const interestRate = Number(loan.interestRate) || 0;

    totalBalance += balance;
    monthlyTotal += monthlyPayment;
    
    // 簡易的な完済月数計算
    const monthlyRate = (interestRate / 12) / 100;
    let remaining = balance;
    let months = 0;
    
    if (remaining <= 0) {
      months = 0;
    } else if (monthlyPayment <= 0) {
      months = Infinity;
    } else if (monthlyRate === 0) {
      months = Math.ceil(remaining / monthlyPayment);
    } else if (monthlyPayment > remaining * monthlyRate) {
      while (remaining > 0 && months < 600) {
        remaining = remaining + (remaining * monthlyRate) - monthlyPayment;
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

/**
 * 借入ごとの完済見込みを計算
 * @param {import('./schema').Loan} loan
 * @returns {{ months: number, payoffDate: string, status: 'ok'|'unpayable'|'paid' }}
 */
export function calculateLoanPayoff(loan) {
  const balance = Number(loan.currentBalance) || 0;
  const monthlyPayment = Number(loan.monthlyPayment) || 0;
  const interestRate = Number(loan.interestRate) || 0;
  const monthlyRate = (interestRate / 12) / 100;

  if (balance <= 0) {
    return { months: 0, payoffDate: '完了', status: 'paid' };
  }
  if (monthlyPayment <= 0) {
    return { months: Infinity, payoffDate: '返済不可', status: 'unpayable' };
  }

  let months = 0;
  if (monthlyRate === 0) {
    months = Math.ceil(balance / monthlyPayment);
  } else if (monthlyPayment > balance * monthlyRate) {
    let remaining = balance;
    while (remaining > 0 && months < 600) {
      remaining = remaining + (remaining * monthlyRate) - monthlyPayment;
      months++;
    }
  } else {
    months = Infinity;
  }

  if (months === Infinity) {
    return { months, payoffDate: '返済不可', status: 'unpayable' };
  }

  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + months);
  return {
    months,
    payoffDate: `${payoffDate.getFullYear()}年${payoffDate.getMonth() + 1}月`,
    status: 'ok'
  };
}

/**
 * 借入の返済スケジュール（概算）を計算
 * @param {import('./schema').Loan} loan
 * @param {Object} [options]
 * @param {number} [options.monthlyPaymentOverride]
 * @param {number} [options.monthsLimit]
 * @param {number} [options.scheduleLimit]
 * @returns {{status: 'ok'|'paid'|'unpayable'|'long', months: number, totalInterest: number, totalPayment: number, schedule: Array}}
 */
export function simulateLoanSchedule(loan, options = {}) {
  const balance = Number(loan.currentBalance) || 0;
  const monthlyPayment = Number(options.monthlyPaymentOverride ?? loan.monthlyPayment) || 0;
  const interestRate = Number(loan.interestRate) || 0;
  const monthlyRate = (interestRate / 12) / 100;
  const monthsLimit = options.monthsLimit ?? 600;
  const scheduleLimit = options.scheduleLimit ?? 24;

  if (balance <= 0) {
    return { status: 'paid', months: 0, totalInterest: 0, totalPayment: 0, schedule: [] };
  }
  if (monthlyPayment <= 0) {
    return { status: 'unpayable', months: Infinity, totalInterest: 0, totalPayment: 0, schedule: [] };
  }
  if (monthlyRate > 0 && monthlyPayment <= balance * monthlyRate) {
    return { status: 'unpayable', months: Infinity, totalInterest: 0, totalPayment: 0, schedule: [] };
  }

  let remaining = balance;
  let months = 0;
  let totalInterest = 0;
  let totalPayment = 0;
  const schedule = [];

  while (remaining > 0 && months < monthsLimit) {
    const interest = remaining * monthlyRate;
    const payment = Math.min(monthlyPayment, remaining + interest);
    remaining = remaining + interest - payment;
    totalInterest += interest;
    totalPayment += payment;
    months++;

    if (schedule.length < scheduleLimit) {
      schedule.push({
        month: months,
        interest,
        payment,
        remaining
      });
    }
  }

  if (remaining > 0) {
    return { status: 'long', months, totalInterest, totalPayment, schedule };
  }

  return { status: 'ok', months, totalInterest, totalPayment, schedule };
}
