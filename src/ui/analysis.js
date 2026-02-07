import { store as appStore } from '../store.js';
import { calculateLoanPayoff, calculatePayoffSummary, simulateLoanSchedule } from '../calc.js';
import { formatAgeMonths, formatMonthsToYears, getAgeMonthsFromBirthdate } from '../utils.js';

let currentAnalysisTab = 'overview';

const TAG_LABELS = {
  fixed: '固定費',
  variable: '変動費',
  card: 'カード',
  loan: '借入返済',
  tax: '税金/保険',
  service: 'サブスク',
  vehicle: '車両',
  business: '事業',
  uncategorized: '未分類'
};

const CHART_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#22c55e',
  '#6366f1',
  '#14b8a6'
];

const EXTRA_OPTIONS = [10000, 50000, 100000];

const formatCurrency = (value) => `¥${Math.round(value).toLocaleString()}`;

const getCurrentYearMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const normalizeTag = (tag) => {
  if (!tag) return 'uncategorized';
  if (['car', 'bike', 'vehicle'].includes(tag)) return 'vehicle';
  if (TAG_LABELS[tag]) return tag;
  return 'uncategorized';
};

const buildAgeBase = (settings) => {
  const ageMonthsFromBirth = getAgeMonthsFromBirthdate(settings.userBirthdate || '');
  if (Number.isFinite(ageMonthsFromBirth)) return ageMonthsFromBirth;
  if (Number.isFinite(settings.userAge)) return settings.userAge * 12;
  return null;
};

const ageAtPayoff = (ageBaseMonths, months) => {
  if (!Number.isFinite(months) || ageBaseMonths === null) return '';
  return formatAgeMonths(ageBaseMonths + months);
};

const buildSimulatedLoans = (loans, activeLoans, extra) => {
  const perLoan = activeLoans.length > 0 ? extra / activeLoans.length : 0;
  return loans.map((loan) => (
    loan.active
      ? { ...loan, monthlyPayment: (Number(loan.monthlyPayment) || 0) + perLoan }
      : { ...loan, monthlyPayment: Number(loan.monthlyPayment) || 0 }
  ));
};

const buildPortfolioSchedule = (activeLoans) => {
  if (activeLoans.length === 0) return { status: 'empty', schedule: [], totalInterest: 0, totalPayment: 0 };
  const simulations = activeLoans.map((loan) => simulateLoanSchedule(loan, { scheduleLimit: 24 }));
  if (simulations.some((s) => s.status === 'unpayable')) {
    return { status: 'unpayable', schedule: [], totalInterest: 0, totalPayment: 0 };
  }
  const schedule = [];
  for (let i = 0; i < 24; i += 1) {
    let remaining = 0;
    let interest = 0;
    let payment = 0;
    simulations.forEach((s) => {
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

const renderBarChart = (rows) => {
  if (rows.length === 0) return '<div style="font-size: 0.8rem; color: #6b7280;">データがありません。</div>';
  const max = Math.max(...rows.map((r) => r.value), 1);
  return rows.map((row, index) => `
    <div class="bar-row">
      <div class="bar-label">${row.label}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${Math.round((row.value / max) * 100)}%; background: ${CHART_COLORS[index % CHART_COLORS.length]};"></div>
      </div>
      <div class="bar-value">${formatCurrency(row.value)}</div>
    </div>
  `).join('');
};

const renderPieChart = (rows) => {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) return '<div style="font-size: 0.8rem; color: #6b7280;">データがありません。</div>';
  let acc = 0;
  const segments = rows.map((row, index) => {
    const start = acc;
    const end = acc + (row.value / total) * 100;
    acc = end;
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${end}%`;
  }).join(', ');
  return `
    <div class="pie-chart" style="background: conic-gradient(${segments});"></div>
    <div class="pie-legend">
      ${rows.map((row, index) => `
        <div class="pie-legend-item">
          <span class="pie-dot" style="background: ${CHART_COLORS[index % CHART_COLORS.length]};"></span>
          <span>${row.label}</span>
          <span class="pie-legend-value">${formatCurrency(row.value)}</span>
        </div>
      `).join('')}
    </div>
  `;
};

const renderOverview = ({
  payoffSummary,
  payoffMonthsLabel,
  ageBaseMonths,
  loanPayoffs,
  milestones,
  nonPayableLoans
}) => `
  <div class="card" style="background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
    <h3 style="margin-top: 0;">📊 借金の現状</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
      <div>
        <div style="font-size: 0.8rem; color: #6b7280;">総借入額</div>
        <div style="font-size: 1.2rem; font-weight: bold;">${formatCurrency(payoffSummary.totalBalance)}</div>
      </div>
      <div>
        <div style="font-size: 0.8rem; color: #6b7280;">月間返済額</div>
        <div style="font-size: 1.2rem; font-weight: bold;">${formatCurrency(payoffSummary.monthlyTotal)}</div>
      </div>
    </div>
    <div style="border-top: 1px solid #eee; padding-top: 15px;">
      <div style="font-size: 0.8rem; color: #6b7280;">完済予定</div>
      <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary);">${payoffSummary.payoffDate}</div>
      <div style="font-size: 0.9rem; color: #6b7280;">（あと ${payoffMonthsLabel}）</div>
      ${ageBaseMonths !== null ? `<div style="font-size: 0.85rem; color: #6b7280;">完済時: ${ageAtPayoff(ageBaseMonths, payoffSummary.totalMonths)}</div>` : ''}
    </div>
  </div>

  <div class="card" style="background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
    <h3 style="margin-top: 0;">🏆 マイルストーン</h3>
    <p style="font-size: 0.8rem; color: #6b7280;">完済が近い順:</p>
    <ul style="list-style: none; padding: 0;">
      ${milestones.map((m) => `
        <li style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f9f9f9;">
          <span>${m.name}</span>
          <span style="font-weight: bold;">${m.months === Infinity ? '返済不可' : `あと ${formatMonthsToYears(m.months)}`}</span>
        </li>
      `).join('')}
      ${milestones.length === 0 ? '<li>登録された借入はありません</li>' : ''}
    </ul>
  </div>

  <div class="card" style="background: white; padding: 20px; border-radius: 12px; margin-top: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
    <h3 style="margin-top: 0;">🧾 借入ごとの完済見込み</h3>
    ${loanPayoffs.length === 0 ? `
      <div style="font-size: 0.8rem; color: #6b7280;">借入データがありません。</div>
    ` : `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${loanPayoffs.map((loan) => `
          <div style="padding: 12px; background: #f9fafb; border-radius: 10px; border-left: 4px solid ${loan.payoff.status === 'ok' ? 'var(--success)' : loan.payoff.status === 'paid' ? 'var(--primary)' : 'var(--danger)'};">
            <div style="display: flex; justify-content: space-between; gap: 10px; align-items: center;">
              <div style="font-weight: 700;">${loan.name}</div>
              <button class="link-button" onclick="jumpToLoanEdit('${loan.id}')">編集</button>
            </div>
            <div style="font-size: 0.85rem; color: #6b7280; margin-top: 4px;">
              残高: ${formatCurrency(loan.currentBalance)} /
              月返済: ${formatCurrency(loan.monthlyPayment)} /
              年利: ${Number(loan.interestRate) || 0}%
            </div>
            <div style="margin-top: 6px; font-size: 0.9rem;">
              ${loan.payoff.status === 'ok'
                ? `完済予定: ${loan.payoff.payoffDate}（あと ${formatMonthsToYears(loan.payoff.months)}）${ageBaseMonths !== null ? ` / 完済時${ageAtPayoff(ageBaseMonths, loan.payoff.months)}` : ''}`
                : loan.payoff.status === 'paid'
                  ? '完済済み'
                  : '返済不可（返済額が不足）'}
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
        ${nonPayableLoans.map((l) => `
          <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f3f4f6;">
            <button class="link-button" onclick="jumpToLoanEdit('${l.id}')">${l.name}</button>
            <span style="color: #9a3412;">${l.reason}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : ''}
`;

const renderSimulation = ({
  loans,
  activeLoans,
  loanSimulations,
  payoffSummary,
  ageBaseMonths
}) => `
  <div class="card" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
    <h3 style="margin-top: 0;">📈 返済シミュレーション</h3>
    <details class="collapsible" open>
      <summary>全体の増額シミュレーション</summary>
      <div class="collapsible-body">
        ${activeLoans.length === 0 ? `
          <div style="font-size: 0.8rem; color: #6b7280;">借入データがありません。</div>
        ` : EXTRA_OPTIONS.map((extra) => {
          const simulatedLoans = buildSimulatedLoans(loans, activeLoans, extra);
          const simSummary = calculatePayoffSummary(simulatedLoans);
          const savedMonths = payoffSummary.totalMonths === Infinity || simSummary.totalMonths === Infinity
            ? null
            : payoffSummary.totalMonths - simSummary.totalMonths;
          return `
            <div style="padding: 10px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid var(--success); margin-bottom: 8px;">
              <div style="font-weight: bold;">月 +${formatCurrency(extra)} なら</div>
              <div style="font-size: 0.9rem; color: #166534;">
                ${savedMonths && savedMonths > 0
                  ? `${formatMonthsToYears(savedMonths)}短縮（${simSummary.payoffDate}完済${ageBaseMonths !== null ? ` / 完済時${ageAtPayoff(ageBaseMonths, simSummary.totalMonths)}` : ''}）`
                  : '計算不可'}
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
            <div style="font-size: 0.8rem; color: #6b7280; margin-top: 4px;">月返済: ${formatCurrency(loan.monthlyPayment)}</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 8px;">
              ${EXTRA_OPTIONS.map((extra) => {
                const sim = simulateLoanSchedule(loan, { monthlyPaymentOverride: (Number(loan.monthlyPayment) || 0) + extra, scheduleLimit: 0 });
                const saved = base.months === Infinity || sim.months === Infinity ? null : base.months - sim.months;
                return `
                  <div style="background: white; border: 1px solid #eee; border-radius: 6px; padding: 6px 8px;">
                    <div style="font-weight: 600;">+${formatCurrency(extra)}</div>
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
  </div>
`;

const renderTimeline = ({ portfolio }) => `
  <div class="card" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
    <h3 style="margin-top: 0;">📆 返済年表（全体・24ヶ月）</h3>
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
            ${portfolio.schedule.map((row) => `
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 6px;">${row.month}</td>
                <td style="padding: 6px;">${formatCurrency(row.remaining)}</td>
                <td style="padding: 6px;">${formatCurrency(row.interest)}</td>
                <td style="padding: 6px;">${formatCurrency(row.payment)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  </div>
`;

const renderComposition = ({ items, loans, monthEvents, yearMonth }) => {
  if (!monthEvents || monthEvents.length === 0) {
    return `
      <div class="card" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">📊 収支構成</h3>
        <div style="font-size: 0.8rem; color: #6b7280;">${yearMonth} のデータがありません。先に予定を生成してください。</div>
      </div>
    `;
  }

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const loanMap = new Map(loans.map((loan) => [loan.id, loan]));
  const incomeByTag = {};
  const expenseByTag = {};

  monthEvents.forEach((event) => {
    const base = itemMap.get(event.masterId);
    const isLoan = loanMap.has(event.masterId);
    const tag = normalizeTag(base?.tag || (isLoan ? 'loan' : ''));
    if (event.type === 'income') {
      incomeByTag[tag] = (incomeByTag[tag] || 0) + (Number(event.amount) || 0);
    } else {
      expenseByTag[tag] = (expenseByTag[tag] || 0) + (Number(event.amount) || 0);
    }
  });

  const buildRows = (obj) => Object.entries(obj)
    .map(([key, value]) => ({ label: TAG_LABELS[key] || key, value }))
    .sort((a, b) => b.value - a.value);

  const expenseRows = buildRows(expenseByTag);
  const incomeRows = buildRows(incomeByTag);

  return `
    <div class="card" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 20px;">
      <h3 style="margin-top: 0;">📈 収入構成（${yearMonth}）</h3>
      <div class="chart-grid">
        <div>
          ${renderPieChart(incomeRows)}
        </div>
        <div>
          ${renderBarChart(incomeRows)}
        </div>
      </div>
    </div>
    <div class="card" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <h3 style="margin-top: 0;">📊 支出構成（${yearMonth}）</h3>
      <div class="chart-grid">
        <div>
          ${renderPieChart(expenseRows)}
        </div>
        <div>
          ${renderBarChart(expenseRows)}
        </div>
      </div>
    </div>
  `;
};

const renderLoanBreakdown = ({ activeLoans }) => {
  if (activeLoans.length === 0) {
    return `
      <div class="card" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">🏷 借入内訳</h3>
        <div style="font-size: 0.8rem; color: #6b7280;">借入データがありません。</div>
      </div>
    `;
  }

  const byType = {};
  activeLoans.forEach((loan) => {
    const key = loan.type || '未分類';
    byType[key] = (byType[key] || 0) + (Number(loan.currentBalance) || 0);
  });
  const typeRows = Object.entries(byType)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const topBalances = [...activeLoans]
    .sort((a, b) => (Number(b.currentBalance) || 0) - (Number(a.currentBalance) || 0))
    .slice(0, 6)
    .map((loan) => ({ label: loan.name, value: Number(loan.currentBalance) || 0 }));

  return `
    <div class="card" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 20px;">
      <h3 style="margin-top: 0;">🏷 借入内訳（種別）</h3>
      <div class="chart-grid">
        <div>
          ${renderPieChart(typeRows)}
        </div>
        <div>
          ${renderBarChart(typeRows)}
        </div>
      </div>
    </div>
    <div class="card" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <h3 style="margin-top: 0;">🔍 残高上位</h3>
      ${renderBarChart(topBalances)}
    </div>
  `;
};

export function renderAnalysis(container) {
  const settings = appStore.data.settings || {};
  const loans = appStore.data.master.loans || [];
  const items = appStore.data.master.items || [];
  const payoffSummary = calculatePayoffSummary(loans);
  const payoffMonthsLabel = formatMonthsToYears(payoffSummary.totalMonths);
  const ageBaseMonths = buildAgeBase(settings);
  const yearMonth = getCurrentYearMonth();
  const monthEvents = appStore.data.calendar?.generatedMonths?.[yearMonth] || [];

  window.jumpToLoanEdit = (loanId) => {
    location.hash = '#master';
    setTimeout(() => {
      if (window.switchMasterTab) window.switchMasterTab('loans');
      if (window.editLoan) window.editLoan(loanId);
    }, 50);
  };

  const milestones = loans
    .filter((loan) => loan.active && loan.currentBalance > 0)
    .map((loan) => {
      const payoff = calculateLoanPayoff(loan);
      return { name: loan.name, months: payoff.months };
    })
    .sort((a, b) => a.months - b.months);

  const activeLoans = loans.filter((loan) => loan.active);
  const loanPayoffs = activeLoans.map((loan) => ({
    ...loan,
    payoff: calculateLoanPayoff(loan)
  }));
  const loanSimulations = activeLoans.map((loan) => ({
    loan,
    base: simulateLoanSchedule(loan, { scheduleLimit: 0 })
  }));
  const portfolio = buildPortfolioSchedule(activeLoans);

  const nonPayableLoans = loans
    .filter((loan) => loan.active && Number(loan.currentBalance) > 0)
    .map((loan) => {
      const balance = Number(loan.currentBalance) || 0;
      const monthlyPayment = Number(loan.monthlyPayment) || 0;
      const interestRate = Number(loan.interestRate) || 0;
      const monthlyRate = (interestRate / 12) / 100;
      let reason = '';
      if (monthlyPayment <= 0) {
        reason = '月間返済額が未入力/0';
      } else if (monthlyRate > 0 && monthlyPayment <= balance * monthlyRate) {
        reason = '返済額が利息以下';
      }
      return reason ? { id: loan.id, name: loan.name, reason } : null;
    })
    .filter(Boolean);

  container.innerHTML = `
    <div class="analysis-header" style="padding: 15px; background: white; border-bottom: 1px solid #eee;">
      <h2>分析・モチベーション</h2>
    </div>
    <div class="analysis-tabs">
      <button class="analysis-tab ${currentAnalysisTab === 'overview' ? 'active' : ''}" onclick="switchAnalysisTab('overview')">概要</button>
      <button class="analysis-tab ${currentAnalysisTab === 'simulation' ? 'active' : ''}" onclick="switchAnalysisTab('simulation')">シミュレーション</button>
      <button class="analysis-tab ${currentAnalysisTab === 'timeline' ? 'active' : ''}" onclick="switchAnalysisTab('timeline')">年表</button>
      <button class="analysis-tab ${currentAnalysisTab === 'composition' ? 'active' : ''}" onclick="switchAnalysisTab('composition')">支出構成</button>
      <button class="analysis-tab ${currentAnalysisTab === 'breakdown' ? 'active' : ''}" onclick="switchAnalysisTab('breakdown')">借入内訳</button>
    </div>
    <div class="analysis-content" style="padding: 15px;">
      ${currentAnalysisTab === 'overview' ? renderOverview({
        payoffSummary,
        payoffMonthsLabel,
        ageBaseMonths,
        loanPayoffs,
        milestones,
        nonPayableLoans
      }) : ''}
      ${currentAnalysisTab === 'simulation' ? renderSimulation({
        loans,
        activeLoans,
        loanSimulations,
        payoffSummary,
        ageBaseMonths
      }) : ''}
      ${currentAnalysisTab === 'timeline' ? renderTimeline({ portfolio }) : ''}
      ${currentAnalysisTab === 'composition' ? renderComposition({
        items,
        loans,
        monthEvents,
        yearMonth
      }) : ''}
      ${currentAnalysisTab === 'breakdown' ? renderLoanBreakdown({ activeLoans }) : ''}
    </div>
  `;

  window.switchAnalysisTab = (tab) => {
    currentAnalysisTab = tab;
    renderAnalysis(container);
  };
}
