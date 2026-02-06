import { store as appStore } from '../store.js';
import { calculatePayoffSummary } from '../calc.js';

export function renderAnalysis(container) {
  const loans = appStore.data.master.loans || [];
  const payoffSummary = calculatePayoffSummary(loans);
  
  // マイルストーンの計算
  const milestones = loans
    .filter(l => l.active && l.currentBalance > 0)
    .map(l => {
        const monthlyRate = (l.interestRate / 12) / 100;
        let balance = l.currentBalance;
        let months = 0;
        if (l.monthlyPayment > balance * monthlyRate) {
            while (balance > 0 && months < 600) {
                balance = balance + (balance * monthlyRate) - l.monthlyPayment;
                months++;
            }
        } else {
            months = Infinity;
        }
        return { name: l.name, months };
    })
    .sort((a, b) => a.months - b.months);

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
          <div style="font-size: 0.9rem; color: #6b7280;">（あと ${payoffSummary.totalMonths} ヶ月）</div>
        </div>
      </div>

      <div class="card" style="background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">🏆 マイルストーン</h3>
        <p style="font-size: 0.8rem; color: #6b7280;">完済が近い順:</p>
        <ul style="list-style: none; padding: 0;">
          ${milestones.map(m => `
            <li style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f9f9f9;">
              <span>${m.name}</span>
              <span style="font-weight: bold;">${m.months === Infinity ? '返済不可' : `あと ${m.months} ヶ月`}</span>
            </li>
          `).join('')}
          ${milestones.length === 0 ? '<li>登録された借入はありません</li>' : ''}
        </ul>
      </div>

      <div class="card" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">📈 返済シミュレーション</h3>
        <p style="font-size: 0.8rem; color: #6b7280;">月々の返済額を増やした場合の短縮効果:</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${[5000, 10000, 20000].map(extra => {
            const simulatedLoans = loans.map(l => ({ ...l, monthlyPayment: l.monthlyPayment + (extra / loans.filter(lo => lo.active).length) }));
            const simSummary = calculatePayoffSummary(simulatedLoans);
            const savedMonths = payoffSummary.totalMonths - simSummary.totalMonths;
            return `
              <div style="padding: 10px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid var(--success);">
                <div style="font-weight: bold;">月 +${extra.toLocaleString()}円 なら</div>
                <div style="font-size: 0.9rem; color: #166534;">
                  ${savedMonths > 0 ? `${savedMonths} ヶ月短縮（${simSummary.payoffDate}完済）` : '計算中...'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}
