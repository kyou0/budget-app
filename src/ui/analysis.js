import { store as appStore } from '../store.js';
import { calculateLoanPayoff, calculatePayoffSummary, simulateLoanSchedule } from '../calc.js';
import { formatAgeMonths, formatMonthsToYears, getAgeMonthsFromBirthdate } from '../utils.js';

export function renderAnalysis(container) {
  const settings = appStore.data.settings || {};
  const loans = appStore.data.master.loans || [];
  const payoffSummary = calculatePayoffSummary(loans);
  const payoffMonthsLabel = formatMonthsToYears(payoffSummary.totalMonths);
  const ageMonthsFromBirth = getAgeMonthsFromBirthdate(settings.userBirthdate);
  const ageMonthsBase = Number.isFinite(ageMonthsFromBirth)
    ? ageMonthsFromBirth
    : (Number.isFinite(settings.userAge) ? settings.userAge * 12 : null);
  const ageAtPayoff = (months) => {
    if (!Number.isFinite(months) || ageMonthsBase === null) return '';
    return formatAgeMonths(ageMonthsBase + months);
  };

  window.jumpToLoanEdit = (loanId) => {
    location.hash = '#master';
    setTimeout(() => {
      if (window.switchMasterTab) window.switchMasterTab('loans');
      if (window.editLoan) window.editLoan(loanId);
    }, 50);
  };
  
  // マイルストーンの計算
  const milestones = loans
    .filter(l => l.active && l.currentBalance > 0)
    .map(l => {
        const balance = Number(l.currentBalance) || 0;
        const monthlyPayment = Number(l.monthlyPayment) || 0;
        const interestRate = Number(l.interestRate) || 0;
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
        return { name: l.name, months };
    })
    .sort((a, b) => a.months - b.months);
  
  const activeLoans = loans.filter(l => l.active);
  const loanPayoffs = activeLoans.map(loan => ({
    ...loan,
    payoff: calculateLoanPayoff(loan)
  }));
  const extraOptions = [5000, 10000, 20000];
  const loanSimulations = activeLoans.map(loan => ({
    loan,
    base: simulateLoanSchedule(loan, { scheduleLimit: 0 })
  }));

  const portfolioSchedule = () => {
    if (activeLoans.length === 0) return { status: 'empty', schedule: [], totalInterest: 0, totalPayment: 0 };
    const simulations = activeLoans.map(loan => simulateLoanSchedule(loan, { scheduleLimit: 24 }));
    if (simulations.some(s => s.status === 'unpayable')) {
      return { status: 'unpayable', schedule: [], totalInterest: 0, totalPayment: 0 };
    }
    const schedule = [];
    for (let i = 0; i < 24; i++) {
      let remaining = 0;
      let interest = 0;
      let payment = 0;
      simulations.forEach(s => {
        const row = s.schedule[i];
        if (row) {
          remaining += row.remaining;
          interest += row.interest;
          payment += row.payment;
        }
      });
      if (i === 0 && remaining === 0) break;
      schedule.push({ month: i + 1, remaining, interest, payment });
    }
    const totalInterest = simulations.reduce((sum, s) => sum + s.totalInterest, 0);
    const totalPayment = simulations.reduce((sum, s) => sum + s.totalPayment, 0);
    return { status: 'ok', schedule, totalInterest, totalPayment };
  };

  const portfolio = portfolioSchedule();
  const nonPayableLoans = loans
    .filter(l => l.active && Number(l.currentBalance) > 0)
    .map(l => {
      const balance = Number(l.currentBalance) || 0;
      const monthlyPayment = Number(l.monthlyPayment) || 0;
      const interestRate = Number(l.interestRate) || 0;
      const monthlyRate = (interestRate / 12) / 100;
      let reason = '';
      if (monthlyPayment <= 0) {
        reason = '月間返済額が未入力/0';
      } else if (monthlyRate > 0 && monthlyPayment <= balance * monthlyRate) {
        reason = '返済額が利息以下';
      }
      return reason ? { id: l.id, name: l.name, reason } : null;
    })
    .filter(Boolean);

  container.innerHTML = `
    <div class="analysis-header" style="padding: 15px; background: white; border-bottom: 1px solid #eee;">
      <h2>分析・モチベーション</h2>
    </div>
    
    <div class="analysis-content" style="padding: 15px;">
      <div class="card" style="background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">📊 借金の現状</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div>
            <div style="font-size: 0.8rem; color: #6b7280;">総借入額</div>
            <div style="font-size: 1.2rem; font-weight: bold;">¥${payoffSummary.totalBalance.toLocaleString()}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: #6b7280;">月間返済額</div>
            <div style="font-size: 1.2rem; font-weight: bold;">¥${payoffSummary.monthlyTotal.toLocaleString()}</div>
          </div>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 15px;">
          <div style="font-size: 0.8rem; color: #6b7280;">完済予定</div>
          <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary);">${payoffSummary.payoffDate}</div>
          <div style="font-size: 0.9rem; color: #6b7280;">（あと ${payoffMonthsLabel}）</div>
          ${ageMonthsBase !== null ? `<div style="font-size: 0.85rem; color: #6b7280;">完済時: ${ageAtPayoff(payoffSummary.totalMonths)}</div>` : ''}
        </div>
      </div>

      <div class="card" style="background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">🏆 マイルストーン</h3>
        <p style="font-size: 0.8rem; color: #6b7280;">完済が近い順:</p>
        <ul style="list-style: none; padding: 0;">
          ${milestones.map(m => `
            <li style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f9f9f9;">
              <span>${m.name}</span>
              <span style="font-weight: bold;">${m.months === Infinity ? '返済不可' : `あと ${formatMonthsToYears(m.months)}`}</span>
            </li>
          `).join('')}
          ${milestones.length === 0 ? '<li>登録された借入はありません</li>' : ''}
        </ul>
      </div>

      <div class="card" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">📈 返済シミュレーション</h3>
        <p style="font-size: 0.8rem; color: #6b7280;">月々の返済額を増やした場合の短縮効果:</p>
        <details class="collapsible" open>
          <summary>全体の増額シミュレーション</summary>
          <div class="collapsible-body">
            ${activeLoans.length === 0 ? `
              <div style="font-size: 0.8rem; color: #6b7280;">借入データがありません。</div>
            ` : extraOptions.map(extra => {
              const perLoan = extra / activeLoans.length;
              const simulatedLoans = loans.map(l => (
                l.active
                  ? { ...l, monthlyPayment: (Number(l.monthlyPayment) || 0) + perLoan }
                  : { ...l, monthlyPayment: Number(l.monthlyPayment) || 0 }
              ));
              const simSummary = calculatePayoffSummary(simulatedLoans);
              const savedMonths = payoffSummary.totalMonths === Infinity || simSummary.totalMonths === Infinity
                ? null
                : payoffSummary.totalMonths - simSummary.totalMonths;
              return `
                <div style="padding: 10px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid var(--success); margin-bottom: 8px;">
                  <div style="font-weight: bold;">月 +${extra.toLocaleString()}円 なら</div>
                  <div style="font-size: 0.9rem; color: #166534;">
                  ${savedMonths && savedMonths > 0 ? `${formatMonthsToYears(savedMonths)}短縮（${simSummary.payoffDate}完済${ageMonthsBase !== null ? ` / 完済時${ageAtPayoff(simSummary.totalMonths)}` : ''}）` : '計算不可'}
                </div>
              </div>
              `;
            }).join('')}
          </div>
        </details>

        <details class="collapsible">
          <summary>借入ごとの増額シミュレーション</summary>
          <div class="collapsible-body">
            ${loanSimulations.length === 0 ? `
              <div style="font-size: 0.8rem; color: #6b7280;">借入データがありません。</div>
            ` : loanSimulations.map(({ loan, base }) => `
              <div style="padding: 10px; background: #f9fafb; border-radius: 8px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; gap: 10px; align-items: center;">
                  <strong>${loan.name}</strong>
                  <button class="link-button" onclick="jumpToLoanEdit('${loan.id}')">編集</button>
                </div>
                <div style="font-size: 0.8rem; color: #6b7280; margin-top: 4px;">月返済: ¥${(Number(loan.monthlyPayment) || 0).toLocaleString()}</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 8px;">
                  ${extraOptions.map(extra => {
                    const sim = simulateLoanSchedule(loan, { monthlyPaymentOverride: (Number(loan.monthlyPayment) || 0) + extra, scheduleLimit: 0 });
                    const saved = base.months === Infinity || sim.months === Infinity ? null : base.months - sim.months;
                    return `
                      <div style="background: white; border: 1px solid #eee; border-radius: 6px; padding: 6px 8px;">
                        <div style="font-weight: 600;">+${extra.toLocaleString()}円</div>
                        <div style="font-size: 0.75rem; color: #6b7280;">
                          ${saved && saved > 0 ? `${formatMonthsToYears(saved)}短縮` : '計算不可'}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </details>

        <details class="collapsible">
          <summary>返済年表（全体・24ヶ月）</summary>
          <div class="collapsible-body">
            ${portfolio.status === 'unpayable' ? `
              <div style="font-size: 0.8rem; color: #9a3412;">返済不可の借入があるため、年表を表示できません。</div>
            ` : portfolio.schedule.length === 0 ? `
              <div style="font-size: 0.8rem; color: #6b7280;">表示できるデータがありません。</div>
            ` : `
              <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 6px;">※月末時点の概算</div>
              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                  <thead>
                    <tr style="text-align: left; border-bottom: 1px solid #eee;">
                      <th style="padding: 6px;">月</th>
                      <th style="padding: 6px;">残高</th>
                      <th style="padding: 6px;">利息</th>
                      <th style="padding: 6px;">返済</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${portfolio.schedule.map(row => `
                      <tr style="border-bottom: 1px solid #f3f4f6;">
                        <td style="padding: 6px;">${row.month}</td>
                        <td style="padding: 6px;">¥${row.remaining.toLocaleString()}</td>
                        <td style="padding: 6px;">¥${Math.round(row.interest).toLocaleString()}</td>
                        <td style="padding: 6px;">¥${Math.round(row.payment).toLocaleString()}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </details>

        <details class="collapsible">
          <summary>利息の合計（全体）</summary>
          <div class="collapsible-body">
            ${portfolio.status === 'unpayable' ? `
              <div style="font-size: 0.8rem; color: #9a3412;">返済不可の借入があるため、利息合計は計算できません。</div>
            ` : `
              <div style="font-size: 0.9rem;">総利息: ¥${Math.round(portfolio.totalInterest).toLocaleString()}</div>
              <div style="font-size: 0.85rem; color: #6b7280;">総返済額: ¥${Math.round(portfolio.totalPayment).toLocaleString()}</div>
            `}
          </div>
        </details>
      </div>

      <div class="card" style="background: white; padding: 20px; border-radius: 12px; margin-top: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">🧾 借入ごとの完済見込み</h3>
        ${loanPayoffs.length === 0 ? `
          <div style="font-size: 0.8rem; color: #6b7280;">借入データがありません。</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${loanPayoffs.map(loan => `
              <div style="padding: 12px; background: #f9fafb; border-radius: 10px; border-left: 4px solid ${loan.payoff.status === 'ok' ? 'var(--success)' : loan.payoff.status === 'paid' ? 'var(--primary)' : 'var(--danger)'};">
                <div style="display: flex; justify-content: space-between; gap: 10px; align-items: center;">
                  <div style="font-weight: 700;">${loan.name}</div>
                  <button class="link-button" onclick="jumpToLoanEdit('${loan.id}')">編集</button>
                </div>
                <div style="font-size: 0.85rem; color: #6b7280; margin-top: 4px;">
                  残高: ¥${(Number(loan.currentBalance) || 0).toLocaleString()} /
                  月返済: ¥${(Number(loan.monthlyPayment) || 0).toLocaleString()} /
                  年利: ${Number(loan.interestRate) || 0}%
                </div>
                <div style="margin-top: 6px; font-size: 0.9rem;">
                  ${loan.payoff.status === 'ok' ? `完済予定: ${loan.payoff.payoffDate}（あと ${formatMonthsToYears(loan.payoff.months)}）${ageMonthsBase !== null ? ` / 完済時${ageAtPayoff(loan.payoff.months)}` : ''}` :
                    loan.payoff.status === 'paid' ? '完済済み' : '返済不可（返済額が不足）'}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      ${nonPayableLoans.length > 0 ? `
        <div class="card" style="background: #fff7ed; padding: 16px; border-radius: 12px; margin-top: 20px; border-left: 4px solid var(--warn);">
          <h4 style="margin: 0 0 10px 0;">⚠️ 返済不可の原因候補</h4>
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem;">
            ${nonPayableLoans.map(l => `
              <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f3f4f6;">
                <button class="link-button" onclick="jumpToLoanEdit('${l.id}')">${l.name}</button>
                <span style="color: #9a3412;">${l.reason}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}
