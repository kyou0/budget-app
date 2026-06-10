import { store as appStore } from '../store.js';
import { generateMonthEvents } from '../generate.js';
import { calculatePenalty, calculatePayoffSummary } from '../calc.js';
import { googleAuth } from '../auth/googleAuth.js';
import { driveSync } from '../sync/driveSync.js';
import { calendarSync } from '../sync/calendarSync.js';
import { formatAgeMonths, formatMonthsToYears, getAgeMonthsFromBirthdate, getIcon, getLogoUrl, formatNumber, parseNumber, getAdjustedDate } from '../utils.js';

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let containerEl = null;
let survivalInputRenderTimer = null;

const toYearMonth = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const toYMD = (date) => date.toISOString().split('T')[0];
const money = (value) => `¥${Math.round(Number(value) || 0).toLocaleString()}`;

const getEventAmount = (event) => Number(event.amount) || 0;

const getMonthlyPlans = (yearMonth) => (appStore.data.master.plans || [])
  .filter(plan => plan.yearMonth === yearMonth)
  .filter(plan => plan.active !== false);

if (!window.handleNumericInput) {
  window.handleNumericInput = (el) => {
    const cursor = el.selectionStart;
    const oldVal = el.value;
    const raw = oldVal.replace(/,/g, '');
    const num = Number(raw);
    if (Number.isNaN(num) || raw === '') return;
    const formatted = num.toLocaleString();
    if (oldVal === formatted) return;
    el.value = formatted;
    const diff = formatted.length - oldVal.length;
    el.setSelectionRange(cursor + diff, cursor + diff);
  };
}

export function renderDashboard(container) {
  containerEl = container;
  const yearMonth = toYearMonth(currentYear, currentMonth);
  const masterLoans = appStore.data.master.loans || [];
  const creditCards = masterLoans.filter(l => l.type === 'クレジットカード' && l.active !== false);
  const masterItems = appStore.data.master.items || [];
  const payoffSummary = calculatePayoffSummary(masterLoans);
  
  // 前後1ヶ月分のイベントも収集（土日調整による月跨ぎ表示バグへの対応）
  const allGenerated = appStore.data.calendar?.generatedMonths || {};
  const prevMonthDate = new Date(currentYear, currentMonth - 2, 1);
  const nextMonthDate = new Date(currentYear, currentMonth, 1);
  const ymPrev = toYearMonth(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1);
  const ymNext = toYearMonth(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1);

  const rawEvents = [
    ...(allGenerated[ymPrev] || []),
    ...(allGenerated[yearMonth] || []),
    ...(allGenerated[ymNext] || [])
  ];
  
  // IDで重複排除し、実施日が今月、または生成月が今月のものを対象とする
  const events = Array.from(new Map(rawEvents.map(e => [e.id, e])).values());

  window.computePayDate = (year, month, card) => {
    const offset = card.payMonthOffset || 0;
    const targetMonth = month + offset;
    const payDay = card.paymentDay || card.deadlineDay || 1;
    const date = new Date(year, targetMonth - 1, payDay);
    return getAdjustedDate(date, card.adjustment || 'none');
  };
  const expenseInputs = appStore.data.settings?.expenseConfirmInputs || { yearMonth: '', values: {} };
  const expenseInputValues = expenseInputs.yearMonth === yearMonth ? (expenseInputs.values || {}) : {};
  const payoffMonthsLabel = formatMonthsToYears(payoffSummary.totalMonths);
  const ageMonthsFromBirth = getAgeMonthsFromBirthdate(appStore.data.settings?.userBirthdate || '');
  const ageMonthsBase = Number.isFinite(ageMonthsFromBirth)
    ? ageMonthsFromBirth
    : (Number.isFinite(appStore.data.settings?.userAge) ? appStore.data.settings.userAge * 12 : null);
  const ageAtPayoffLabel = ageMonthsBase === null || !Number.isFinite(payoffSummary.totalMonths)
    ? ''
    : formatAgeMonths(ageMonthsBase + payoffSummary.totalMonths);

  // 銀行残高の合計
  const totalBankBalance = masterItems
    .filter(i => i.type === 'bank' && i.active)
    .reduce((sum, i) => sum + (i.currentBalance || 0), 0);

  // 今月の予定収支 (実施日が今月のもの)
  const generatedPreviewEvents = generateMonthEvents(
    appStore.data.master.items || [],
    masterLoans,
    appStore.data.master.clients || [],
    currentYear,
    currentMonth
  );
  const monthBaseEvents = events.length > 0 ? events : generatedPreviewEvents;
  const plansThisMonth = getMonthlyPlans(yearMonth);
  const planEvents = plansThisMonth.map(plan => ({
    id: `plan-preview-${plan.id}`,
    masterId: plan.id,
    name: `計画: ${plan.name}`,
    type: plan.type,
    amount: Number(plan.amount) || 0,
    actualDate: `${plan.yearMonth}-15`,
    originalDate: `${plan.yearMonth}-15`,
    status: 'pending',
    isPlan: true
  }));
  const survivalEvents = [...monthBaseEvents, ...planEvents];

  const pendingIncome = survivalEvents
    .filter(e => e.type === 'income' && e.status === 'pending' && e.actualDate.startsWith(yearMonth))
    .reduce((sum, e) => sum + getEventAmount(e), 0);
  const pendingExpense = survivalEvents
    .filter(e => e.type === 'expense' && e.status === 'pending' && e.actualDate.startsWith(yearMonth))
    .reduce((sum, e) => sum + getEventAmount(e), 0);
  
  const estimatedEndBalance = totalBankBalance + pendingIncome - pendingExpense;

  // 延滞・今週の項目の抽出
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const delayedEvents = events.filter(e => e.status === 'pending' && e.actualDate < todayStr && e.actualDate.startsWith(yearMonth));
  const thisWeekEvents = events.filter(e => e.status === 'pending' && e.actualDate >= todayStr && e.actualDate <= nextWeekStr && e.actualDate.startsWith(yearMonth));
  const welcomeName = (appStore.data.settings?.userDisplayName || '').trim();
  const welcomeLabel = welcomeName ? (welcomeName.endsWith('さん') ? welcomeName : `${welcomeName}さん`) : '';
  const tipsMessage = delayedEvents.length > 0
    ? `延滞が ${delayedEvents.length} 件あります。優先して確認しましょう。`
    : thisWeekEvents.length > 0
      ? `今週の支払いが ${thisWeekEvents.length} 件あります。早めに確認しましょう。`
      : '今月も良いペースです。この調子でいきましょう。';

  const settings = appStore.data.settings || {};
  const survivalInput = settings.survivalInputs?.yearMonth === yearMonth
    ? settings.survivalInputs
    : { yearMonth, startingCash: 0, extraIncome: 0, extraExpense: 0, extraRepayment: 0 };
  const roughStartingCash = Number(survivalInput.startingCash) || 0;
  const roughExtraIncome = Number(survivalInput.extraIncome) || 0;
  const roughExtraExpense = Number(survivalInput.extraExpense) || 0;
  const plannedExtraRepayment = Number(survivalInput.extraRepayment) || 0;
  const fixedIncome = survivalEvents
    .filter(e => e.type === 'income' && !e.isPlan && e.actualDate.startsWith(yearMonth))
    .reduce((sum, e) => sum + getEventAmount(e), 0);
  const planIncome = planEvents
    .filter(e => e.type === 'income')
    .reduce((sum, e) => sum + getEventAmount(e), 0);
  const planExpense = planEvents
    .filter(e => e.type === 'expense')
    .reduce((sum, e) => sum + getEventAmount(e), 0);
  const cardExpense = survivalEvents
    .filter(e => e.type === 'expense' && e.actualDate.startsWith(yearMonth) && (e.tag === 'card' || e.id?.startsWith('card-billing-') || e.name?.includes('カード')))
    .reduce((sum, e) => sum + getEventAmount(e), 0);
  const debtExpense = survivalEvents
    .filter(e => e.type === 'expense' && e.actualDate.startsWith(yearMonth) && (e.name?.startsWith('返済:') || e.tag === 'loan'))
    .reduce((sum, e) => sum + getEventAmount(e), 0);
  const fixedExpense = Math.max(0, pendingExpense - cardExpense - debtExpense - planExpense);
  const survivalIncome = fixedIncome + roughExtraIncome + planIncome;
  const survivalExpense = pendingExpense + roughExtraExpense + plannedExtraRepayment;
  const survivalBalance = roughStartingCash + survivalIncome - survivalExpense;
  const shortage = Math.max(0, -survivalBalance);
  const survivalStatus = delayedEvents.length > 0
    ? 'overdue'
    : shortage > 0
      ? 'danger'
      : survivalBalance < 30000
        ? 'tight'
        : 'safe';
  const nextRiskEvents = survivalEvents
    .filter(e => e.type === 'expense' && e.status === 'pending' && e.actualDate.startsWith(yearMonth))
    .sort((a, b) => a.actualDate.localeCompare(b.actualDate))
    .slice(0, 5);

  // ─── アドバイスカード用データ計算 ───────────────────────────
  const banks = masterItems.filter(i => i.type === 'bank' && i.active !== false);
  const activeLoans = masterLoans.filter(l => l.type !== 'クレジットカード' && l.active !== false);
  const prepayTargetLoan = activeLoans
    .filter(l => (Number(l.currentBalance) || 0) > 0)
    .sort((a, b) => {
      const rateDiff = (Number(b.interestRate) || 0) - (Number(a.interestRate) || 0);
      if (rateDiff !== 0) return rateDiff;
      return (Number(b.currentBalance) || 0) - (Number(a.currentBalance) || 0);
    })[0];
  const loansAfterPrepay = plannedExtraRepayment > 0 && prepayTargetLoan
    ? masterLoans.map(loan => loan.id === prepayTargetLoan.id
      ? { ...loan, currentBalance: Math.max(0, (Number(loan.currentBalance) || 0) - plannedExtraRepayment) }
      : loan)
    : masterLoans;
  const payoffAfterPrepay = calculatePayoffSummary(loansAfterPrepay);
  const prepayMonthsSaved = Number.isFinite(payoffSummary.totalMonths) && Number.isFinite(payoffAfterPrepay.totalMonths)
    ? Math.max(0, payoffSummary.totalMonths - payoffAfterPrepay.totalMonths)
    : 0;
  const incomeItems = masterItems.filter(i => i.type === 'income' && i.active !== false);
  const pendingCardInputs = creditCards.filter(c => {
    const ev = (appStore.data.calendar?.generatedMonths?.[yearMonth] || []).find(e => e.id === `card-billing-${c.id}-${yearMonth}`);
    return !ev || ev.amount <= 0;
  });
  const monthlyQuestions = [
    ...(pendingCardInputs.length > 0 ? [`カード請求が未確定: ${pendingCardInputs.length}枚`] : []),
    ...(roughStartingCash <= 0 ? ['今月使える手元資金をざっくり入力'] : []),
    ...(plansThisMonth.length > 0 ? [`今月の予定支出/収入: ${plansThisMonth.length}件`] : []),
    ...(delayedEvents.length > 0 ? [`延滞中: ${delayedEvents.length}件`] : [])
  ];

  // セットアップチェックリスト
  const setupChecks = [
    { done: banks.length > 0, label: '銀行口座を登録する', action: `location.hash='#master'; setTimeout(()=>{ if(window.switchMasterTab) window.switchMasterTab('banks'); }, 100)`, tip: '残高の推移を正確に把握できます' },
    { done: incomeItems.length > 0, label: '収入を登録する', action: `location.hash='#master'; setTimeout(()=>{ if(window.switchMasterTab) window.switchMasterTab('income'); }, 100)`, tip: '毎月の余剰がわかります' },
    { done: activeLoans.length > 0, label: '借金・ローンを登録する', action: `location.hash='#master'; setTimeout(()=>{ if(window.switchMasterTab) window.switchMasterTab('loans'); }, 100)`, tip: '完済予定日を自動計算します' },
    { done: events.length > 0, label: `${currentMonth}月のカレンダーを生成する`, action: `generateEvents()`, tip: '支払い予定がカレンダーに展開されます' },
    ...(pendingCardInputs.length > 0 ? pendingCardInputs.map(c => ({
      done: false,
      label: `💳 ${c.name} の今月の請求額を入力する`,
      action: `document.getElementById('expense-${c.id}')?.focus()`,
      tip: '明細が届いたら金額を入力して確定してください'
    })) : [])
  ];
  const pendingSetup = setupChecks.filter(c => !c.done);
  const doneCount = setupChecks.filter(c => c.done).length;
  const setupComplete = pendingSetup.length === 0;

  // 繰り上げ返済アドバイス
  const adviseLoan = activeLoans
    .filter(l => l.currentBalance > 0)
    .sort((a, b) => ((b.interestRate || 0) - (a.interestRate || 0)))[0];
  const safeBuffer = banks.length > 0 ? 30000 : 0; // 生活費バッファー3万
  const surplusForPrepay = Math.max(0, survivalBalance - safeBuffer);
  let prepayAdvice = null;
  if (adviseLoan && surplusForPrepay >= 1000) {
    const r = (adviseLoan.interestRate || 0) / 100 / 12;
    const M = adviseLoan.monthlyPayment || adviseLoan.amount || 0;
    const P = adviseLoan.currentBalance || 0;
    let monthsSaved = 0;
    if (r > 0 && M > r * P) {
      const normalMonths = Math.ceil(-Math.log(1 - r * P / M) / Math.log(1 + r));
      const newP = Math.max(0, P - surplusForPrepay);
      const newMonths = newP <= 0 ? 0 : Math.ceil(-Math.log(1 - r * newP / M) / Math.log(1 + r));
      monthsSaved = Math.max(0, normalMonths - newMonths);
    }
    prepayAdvice = { loan: adviseLoan, amount: surplusForPrepay, monthsSaved };
  }

  const isSyncing = false; // 将来的にローディング状態を管理する場合用
  const syncHistory = settings.syncHistory || [];
  const recentSyncLogs = syncHistory
    .filter(log => log.type === 'calendar' || log.type === 'drive')
    .slice(0, 3);
  const analysisHistory = settings.analysisHistory || [];
  const baselineTotal = analysisHistory[0]?.baselineTotalBalance || analysisHistory[0]?.totalBalance || payoffSummary.totalBalance || 0;
  const progressPercent = baselineTotal > 0 ? Math.max(0, Math.round((1 - payoffSummary.totalBalance / baselineTotal) * 100)) : 0;
  const nextRepayment = events
    .filter(e => e.status === 'pending' && e.name.startsWith('返済:') && e.actualDate.startsWith(yearMonth))
    .sort((a, b) => a.actualDate.localeCompare(b.actualDate))[0];
  const statusCopy = {
    safe: {
      label: '今月は耐えられそう',
      tone: 'safe',
      message: `月末見込みは ${money(survivalBalance)}。このままなら滞納リスクは低めです。`
    },
    tight: {
      label: 'ギリギリ運用',
      tone: 'tight',
      message: `月末見込みは ${money(survivalBalance)}。カード確定額や臨時支出が増えると危ないラインです。`
    },
    danger: {
      label: 'このままだと不足',
      tone: 'danger',
      message: `${money(shortage)} 足りません。支払い延期・臨時収入・借入候補を確認してください。`
    },
    overdue: {
      label: '延滞を先に処理',
      tone: 'danger',
      message: `期限切れの支払いが ${delayedEvents.length} 件あります。いつ払えるかを先に決めましょう。`
    }
  }[survivalStatus];
  const primaryAction = shortage > 0
    ? '緊急借入・延期を検討'
    : pendingCardInputs.length > 0
      ? 'カード請求額を確定'
      : plansThisMonth.length === 0
        ? '先の予定を追加'
        : '支払い一覧を確認';
  const primaryActionHandler = shortage > 0
    ? 'showEmergencyLoanModal()'
    : pendingCardInputs.length > 0
      ? `document.getElementById('expense-${pendingCardInputs[0].id}')?.focus()`
      : plansThisMonth.length === 0
        ? `location.hash='#analysis'; setTimeout(()=>{ if(window.switchAnalysisTab) window.switchAnalysisTab('planning'); }, 100)`
        : `document.getElementById('payments-detail')?.scrollIntoView({behavior:'smooth'})`;

  container.innerHTML = `
    <!-- ヘッダー -->
    <div class="dashboard-header">
      <div class="month-nav">
        <button onclick="changeMonth(-1)" class="btn small">&lt;</button>
        <h2>${currentYear}年${currentMonth}月</h2>
        <button onclick="changeMonth(1)" class="btn small">&gt;</button>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
        ${settings.driveSyncEnabled && googleAuth.isSignedIn() ? `<span title="Drive同期有効" style="font-size:1.1rem;">☁️</span>` : ''}
        ${events.length > 0 && settings.calendarSyncEnabled ? `
          <button onclick="syncCurrentMonthToCalendar()" class="btn small success">GCal</button>
        ` : ''}
        <button onclick="generateYearEvents()" class="btn small" title="年内一括生成">年内一括</button>
      </div>
    </div>

    <section class="survival-hero survival-${statusCopy.tone}">
      <div class="survival-main">
        <div class="eyebrow">今月の生存判定</div>
        <h1>${statusCopy.label}</h1>
        <p>${statusCopy.message}</p>
        <div class="survival-actions">
          <button class="btn primary" onclick="${primaryActionHandler}">${primaryAction}</button>
          <button class="btn" onclick="location.hash='#analysis'; setTimeout(()=>{ if(window.switchAnalysisTab) window.switchAnalysisTab('planning'); }, 100)">将来の予定を試す</button>
        </div>
      </div>
      <div class="survival-number">
        <span>月末見込み</span>
        <strong class="${survivalBalance < 0 ? 'negative' : 'positive'}">${money(survivalBalance)}</strong>
        <small>ざっくり手元資金 + 今月収入 - 今月支出</small>
      </div>
    </section>

    <section class="generation-strip ${events.length > 0 ? 'done' : ''}">
      <div>
        <strong>${events.length > 0 ? '今月の予定データは作成済み' : '今月の予定データはまだ未作成'}</strong>
        <span>${events.length > 0 ? `${events.length}件の予定をもとに判定しています` : '固定収入・固定費・返済予定を保存して、支払い処理できる状態にします'}</span>
      </div>
      <button onclick="generateEvents()" class="btn ${events.length > 0 ? 'small' : 'primary'}">${events.length > 0 ? '再生成' : '予定を作成'}</button>
    </section>

    <section class="control-board">
      <div class="control-card primary-task">
        <div class="control-head">
          <div>
            <span class="task-kicker">毎月やること 1</span>
            <h3>カード請求額を確定する</h3>
          </div>
          <strong>${creditCards.length > 0 ? `${creditCards.length - pendingCardInputs.length}/${creditCards.length}` : '未登録'}</strong>
        </div>
        <p>カードごとに明細が確定したら金額だけ入れます。引落日に支出予定として反映します。</p>
        ${creditCards.length === 0 ? `
          <button class="btn primary" onclick="location.hash='#master'; setTimeout(()=>{ if(window.switchMasterTab) window.switchMasterTab('cards'); }, 100)">カードを登録する</button>
        ` : `
          <div class="card-billing-list">
            ${creditCards.map(card => {
              const payDate = window.computePayDate(currentYear, currentMonth, card);
              const payMonthKey = toYearMonth(payDate.getFullYear(), payDate.getMonth() + 1);
              const billingEvent = (appStore.data.calendar?.generatedMonths?.[payMonthKey] || []).find(e => e.id === `card-billing-${card.id}-${payMonthKey}`);
              const currentAmount = billingEvent?.amount || 0;
              return `
                <div class="card-billing-row ${currentAmount > 0 ? 'done' : ''}">
                  <div>
                    <strong>${card.name}</strong>
                    <span>引落 ${payDate.getMonth() + 1}/${payDate.getDate()}</span>
                  </div>
                  <input type="text" inputmode="numeric"
                    id="ops-expense-${card.id}"
                    value="${currentAmount > 0 ? formatNumber(currentAmount) : ''}"
                    placeholder="請求額"
                    oninput="handleNumericInput(this); saveExpenseInput('${card.id}', this.value)">
                  <button class="btn small ${currentAmount > 0 ? '' : 'primary'}" onclick="confirmExpense('${card.id}')">${currentAmount > 0 ? '更新' : '確定'}</button>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <div class="control-card">
        <div class="control-head">
          <div>
            <span class="task-kicker">毎月やること 2</span>
            <h3>収支を調整する</h3>
          </div>
        </div>
        <p>固定収入以外の案件、旅行・買い物などの一時支出をざっくり入れて、今月足りるかを見ます。</p>
        <div class="mini-input-grid">
          <label>
            <span>臨時収入</span>
            <input type="text" inputmode="numeric" value="${roughExtraIncome ? formatNumber(roughExtraIncome) : ''}" placeholder="例: 80,000" oninput="handleNumericInput(this); updateSurvivalInput('extraIncome', this.value)">
          </label>
          <label>
            <span>追加支出</span>
            <input type="text" inputmode="numeric" value="${roughExtraExpense ? formatNumber(roughExtraExpense) : ''}" placeholder="例: 50,000" oninput="handleNumericInput(this); updateSurvivalInput('extraExpense', this.value)">
          </label>
        </div>
        <button class="btn small" onclick="location.hash='#analysis'; setTimeout(()=>{ if(window.switchAnalysisTab) window.switchAnalysisTab('planning'); }, 100)">旅行・指輪など先の予定を入れる</button>
      </div>

      <div class="control-card loan-task">
        <div class="control-head">
          <div>
            <span class="task-kicker">毎月やること 3</span>
            <h3>返済ペースを決める</h3>
          </div>
        </div>
        <div class="loan-summary-mini">
          <div><span>借金残高</span><strong>${activeLoans.length > 0 ? money(payoffSummary.totalBalance) : '未登録'}</strong></div>
          <div><span>毎月返済</span><strong>${activeLoans.length > 0 ? money(payoffSummary.monthlyTotal) : '未登録'}</strong></div>
          <div><span>完済予定</span><strong>${activeLoans.length > 0 ? payoffSummary.payoffDate : '借入を登録すると表示'}</strong></div>
        </div>
        ${activeLoans.length > 0 ? `
          <label class="prepay-input">
            <span>今月の繰上げ返済予定</span>
            <input type="text" inputmode="numeric" value="${plannedExtraRepayment ? formatNumber(plannedExtraRepayment) : ''}" placeholder="例: 30,000" oninput="handleNumericInput(this); updateSurvivalInput('extraRepayment', this.value)">
          </label>
          ${plannedExtraRepayment > 0 ? `
            <div class="prepay-result ${survivalBalance < 0 ? 'bad' : 'good'}">
              ${prepayTargetLoan ? `${prepayTargetLoan.name} に充当すると完済予定は ${payoffAfterPrepay.payoffDate}${prepayMonthsSaved > 0 ? `（${prepayMonthsSaved}ヶ月短縮）` : ''}。` : '返済対象の借入がありません。'}
              ${survivalBalance < 0 ? `ただし今月は ${money(shortage)} 不足します。` : `今月末見込みは ${money(survivalBalance)} です。`}
            </div>
          ` : `
            <div class="prepay-result">余裕が出た月だけ入れればOK。今月足りるかと完済予定を同時に見ます。</div>
          `}
        ` : `
          <button class="btn primary" onclick="location.hash='#master'; setTimeout(()=>{ if(window.switchMasterTab) window.switchMasterTab('loans'); }, 100)">借入を登録する</button>
        `}
      </div>
    </section>

    <section class="survival-grid">
      <div class="survival-panel quick-inputs">
        <div class="panel-title">
          <span>今月の前提</span>
          <small>正確な口座残高じゃなくてOK</small>
        </div>
        <label>
          <span>今月使える手元資金</span>
          <input type="text" inputmode="numeric" value="${roughStartingCash ? formatNumber(roughStartingCash) : ''}" placeholder="例: 120,000" oninput="handleNumericInput(this); updateSurvivalInput('startingCash', this.value)">
        </label>
        <label>
          <span>臨時収入・追加案件</span>
          <input type="text" inputmode="numeric" value="${roughExtraIncome ? formatNumber(roughExtraIncome) : ''}" placeholder="例: 80,000" oninput="handleNumericInput(this); updateSurvivalInput('extraIncome', this.value)">
        </label>
        <label>
          <span>臨時支出・調整額</span>
          <input type="text" inputmode="numeric" value="${roughExtraExpense ? formatNumber(roughExtraExpense) : ''}" placeholder="例: 50,000" oninput="handleNumericInput(this); updateSurvivalInput('extraExpense', this.value)">
        </label>
      </div>

      <div class="survival-panel totals">
        <div class="panel-title"><span>今月の内訳</span></div>
        <div class="money-row income"><span>固定/予定収入</span><strong>${money(fixedIncome)}</strong></div>
        <div class="money-row income"><span>臨時・計画収入</span><strong>${money(roughExtraIncome + planIncome)}</strong></div>
        <div class="money-row expense"><span>カード引落</span><strong>${money(cardExpense)}</strong></div>
        <div class="money-row expense"><span>借金返済</span><strong>${money(debtExpense)}</strong></div>
        <div class="money-row expense"><span>繰上げ返済予定</span><strong>${money(plannedExtraRepayment)}</strong></div>
        <div class="money-row expense"><span>固定費・予定支出</span><strong>${money(fixedExpense + planExpense + roughExtraExpense)}</strong></div>
      </div>

      <div class="survival-panel questions">
        <div class="panel-title">
          <span>未確認ポイント</span>
          <small>ここがズレると予測もズレます</small>
        </div>
        ${monthlyQuestions.length > 0 ? monthlyQuestions.map(q => `
          <div class="question-pill">${q}</div>
        `).join('') : `
          <div class="question-pill done">今月の主要チェックは完了しています</div>
        `}
      </div>
    </section>

    <section class="survival-panel next-payments" id="payments-detail">
      <div class="panel-title">
        <span>次に落ちる支払い</span>
        <small>カレンダーより先に、ここだけ見ればOK</small>
      </div>
      ${nextRiskEvents.length > 0 ? `
        <div class="payment-list">
          ${nextRiskEvents.map(e => {
            const isLate = e.actualDate < todayStr;
            return `
              <button class="payment-row ${isLate ? 'late' : ''}" onclick="${e.isPlan ? `location.hash='#analysis'; setTimeout(()=>{ if(window.switchAnalysisTab) window.switchAnalysisTab('planning'); }, 100)` : `showEventModal('${e.id}')`}">
                <span class="payment-date">${e.actualDate.slice(5).replace('-', '/')}</span>
                <span class="payment-name">${e.name}</span>
                <strong>${money(e.amount)}</strong>
                <em>${isLate ? '延滞中' : e.isPlan ? '計画' : '予定'}</em>
              </button>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state">今月の支払い予定はまだありません。予定を生成するか、将来計画を追加してください。</div>
      `}
    </section>

    <!-- ========================================
         毎月の操作フロー（ここが唯一の操作ハブ）
         ======================================== -->
    <div class="monthly-flow" style="margin: 0 12px 14px; border-radius: 16px; overflow: hidden; border: 1px solid var(--card-border);">

      <!-- フローヘッダー -->
      <div style="background: var(--grad-primary); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
        <div style="font-weight: 800; font-size: 0.95rem; color: #fff;">${currentMonth}月のやること</div>
        <div style="font-size: 0.75rem; color: rgba(255,255,255,0.8);">ここだけ触ればOK</div>
      </div>

      <!-- STEP 1: カレンダー生成 -->
      <div class="flow-step" style="padding: 12px 16px; background: var(--card); border-bottom: 1px solid var(--card-border); display: flex; align-items: center; gap: 12px;">
        <div class="step-badge" style="width: 28px; height: 28px; border-radius: 50%; background: ${events.length > 0 ? 'var(--success-bg)' : 'var(--primary-glow)'}; border: 2px solid ${events.length > 0 ? 'var(--success)' : 'var(--primary)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.8rem; font-weight: 700; color: ${events.length > 0 ? 'var(--success)' : 'var(--primary)'};">
          ${events.length > 0 ? '✓' : '1'}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 700; font-size: 0.88rem; color: var(--text);">${currentMonth}月の予定を生成する</div>
          <div style="font-size: 0.75rem; color: var(--text-3); margin-top: 2px;">固定費・収入・返済などをカレンダーに展開します</div>
        </div>
        <button onclick="generateEvents()" class="btn ${events.length === 0 ? 'primary' : 'small'}" style="flex-shrink: 0;">
          ${events.length === 0 ? '生成する' : '再生成'}
        </button>
      </div>

      <!-- STEP 2: クレジット請求入力 -->
      <div class="flow-step" style="padding: 12px 16px; background: var(--card); border-bottom: 1px solid var(--card-border);">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: ${creditCards.length > 0 ? '12px' : '0'};">
          <div class="step-badge" style="width: 28px; height: 28px; border-radius: 50%; background: ${creditCards.every(c => { const ym2 = toYearMonth(currentYear,currentMonth); const ev = (appStore.data.calendar?.generatedMonths?.[ym2]||[]).find(e=>e.id===`card-billing-${c.id}-${ym2}`); return ev && ev.amount > 0; }) && creditCards.length > 0 ? 'var(--success-bg)' : 'rgba(251,191,36,0.15)'}; border: 2px solid ${creditCards.every(c => { const ym2 = toYearMonth(currentYear,currentMonth); const ev = (appStore.data.calendar?.generatedMonths?.[ym2]||[]).find(e=>e.id===`card-billing-${c.id}-${ym2}`); return ev && ev.amount > 0; }) && creditCards.length > 0 ? 'var(--success)' : 'var(--warn)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.8rem; font-weight: 700; color: ${creditCards.every(c => { const ym2 = toYearMonth(currentYear,currentMonth); const ev = (appStore.data.calendar?.generatedMonths?.[ym2]||[]).find(e=>e.id===`card-billing-${c.id}-${ym2}`); return ev && ev.amount > 0; }) && creditCards.length > 0 ? 'var(--success)' : 'var(--warn)'};">
            ${creditCards.every(c => { const ym2 = toYearMonth(currentYear,currentMonth); const ev = (appStore.data.calendar?.generatedMonths?.[ym2]||[]).find(e=>e.id===`card-billing-${c.id}-${ym2}`); return ev && ev.amount > 0; }) && creditCards.length > 0 ? '✓' : '2'}
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 0.88rem; color: var(--text);">💳 クレジットカードの請求額を入力</div>
            <div style="font-size: 0.75rem; color: var(--text-3); margin-top: 2px;">明細が届いたら各カードの金額を入力して「確定」。引落日に自動反映されます</div>
          </div>
        </div>
        ${creditCards.length === 0 ? `
          <div style="text-align: center; padding: 16px; border: 1px dashed var(--card-border); border-radius: 10px; font-size: 0.82rem; color: var(--text-3);">
            カードがまだ登録されていません。
            <button onclick="location.hash='#master'; setTimeout(()=>{ if(window.switchMasterTab) window.switchMasterTab('cards'); }, 100)" class="btn small" style="margin-left: 8px;">⚙️ カードを登録する</button>
          </div>
        ` : `
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px;">
            ${creditCards.map(card => {
              const ym2 = toYearMonth(currentYear, currentMonth);
              const billingEvent = (appStore.data.calendar?.generatedMonths?.[ym2] || []).find(e => e.id === `card-billing-${card.id}-${ym2}`);
              const currentAmount = billingEvent?.amount || 0;
              const bank = masterItems.find(b => b.id === card.bankId);
              const logoUrl = card.logo || getLogoUrl(card.name);
              const isDone = currentAmount > 0;
              return `
                <div style="border-radius: 10px; border: 1px solid ${isDone ? 'rgba(52,211,153,0.3)' : 'var(--card-border)'}; background: ${isDone ? 'rgba(52,211,153,0.05)' : 'var(--surface)'}; padding: 10px 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div>
                      <div style="font-weight: 700; font-size: 0.85rem; color: var(--text);">${card.name}</div>
                      <div style="font-size: 0.7rem; color: var(--text-3);">引落: ${card.paymentDay}日 / ${bank ? bank.name : '銀行未設定'}</div>
                    </div>
                    ${logoUrl ? `<img src="${logoUrl}" alt="" style="height: 18px; max-width: 44px; object-fit: contain; background: white; border-radius: 3px; padding: 2px;">` : `<span style="font-size: 1.2rem;">💳</span>`}
                  </div>
                  <div style="display: flex; gap: 6px; align-items: center;">
                    <input type="text" inputmode="numeric"
                      id="expense-${card.id}"
                      value="${currentAmount > 0 ? formatNumber(currentAmount) : ''}"
                      placeholder="請求額を入力"
                      oninput="handleNumericInput(this); saveExpenseInput('${card.id}', this.value)"
                      style="flex:1; padding: 7px 10px; border-radius: 8px; font-size: 0.9rem; font-weight: 700; text-align: right;">
                    <button class="btn small ${isDone ? '' : 'primary'}" onclick="confirmExpense('${card.id}')" style="flex-shrink:0; height: 34px; min-width: 48px;">
                      ${isDone ? '更新' : '確定'}
                    </button>
                  </div>
                  ${isDone ? `<div style="font-size: 0.72rem; color: var(--success); margin-top: 4px; text-align: right;">✓ ¥${currentAmount.toLocaleString()} 登録済み</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- STEP 3: 支払い確認 -->
      <div class="flow-step" style="padding: 12px 16px; background: var(--card); display: flex; align-items: center; gap: 12px;">
        <div class="step-badge" style="width: 28px; height: 28px; border-radius: 50%; background: ${delayedEvents.length > 0 ? 'var(--danger-bg)' : thisWeekEvents.length > 0 ? 'rgba(251,191,36,0.12)' : 'var(--surface)'}; border: 2px solid ${delayedEvents.length > 0 ? 'var(--danger)' : thisWeekEvents.length > 0 ? 'var(--warn)' : 'var(--card-border)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.8rem; font-weight: 700; color: ${delayedEvents.length > 0 ? 'var(--danger)' : thisWeekEvents.length > 0 ? 'var(--warn)' : 'var(--text-3)'};">
          ${delayedEvents.length > 0 ? '!' : '3'}
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 0.88rem; color: var(--text);">支払いを確認・完了マークする</div>
          <div style="font-size: 0.75rem; color: var(--text-3); margin-top: 2px;">
            ${delayedEvents.length > 0
              ? `<span style="color:var(--danger); font-weight:700;">⚠️ 期限切れ ${delayedEvents.length}件あり</span> — 下のカレンダーから確認`
              : thisWeekEvents.length > 0
              ? `今週の支払いが ${thisWeekEvents.length}件あります — 下のカレンダーを確認`
              : '問題なし。下のカレンダーで支払い完了を押してください'}
          </div>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-3); flex-shrink: 0; text-align: right;">
          <div>収入予定</div>
          <div style="font-weight: 700; color: var(--success);">¥${pendingIncome.toLocaleString()}</div>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-3); flex-shrink: 0; text-align: right;">
          <div>支出予定</div>
          <div style="font-weight: 700; color: var(--danger);">¥${pendingExpense.toLocaleString()}</div>
        </div>
      </div>
    </div>

    <!-- ========================================
         💡 アドバイスカード
         ======================================== -->
    ${(pendingSetup.length > 0 || prepayAdvice) ? `
    <div class="advisor-card" style="margin: 0 12px 14px; border-radius: 16px; border: 1px solid var(--card-border); overflow: hidden;">
      <!-- アドバイスヘッダー -->
      <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
        <div style="font-weight: 800; font-size: 0.95rem; color: #fff;">💡 あなたへのアドバイス</div>
        <div style="font-size: 0.72rem; color: rgba(255,255,255,0.8);">セットアップ ${doneCount}/${setupChecks.length} 完了</div>
      </div>

      ${pendingSetup.length > 0 ? `
      <!-- 未完了タスク -->
      <div style="padding: 10px 14px; background: var(--card); border-bottom: 1px solid var(--card-border);">
        <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-3); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">📝 次にやること</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${pendingSetup.slice(0, 3).map((c, idx) => `
            <div style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--surface); border: 1px solid rgba(99,102,241,0.2);">
              <div style="width: 22px; height: 22px; border-radius: 50%; border: 2px solid #6366f1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.72rem; font-weight: 700; color: #6366f1; margin-top: 1px;">${idx + 1}</div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; font-size: 0.85rem; color: var(--text);">${c.label}</div>
                <div style="font-size: 0.72rem; color: var(--text-3); margin-top: 2px;">${c.tip}</div>
              </div>
              <button onclick="${c.action}" class="btn small" style="flex-shrink: 0; border-color: rgba(99,102,241,0.4); color: #6366f1;">→ 設定</button>
            </div>
          `).join('')}
          ${pendingSetup.length > 3 ? `<div style="text-align: center; font-size: 0.75rem; color: var(--text-3);">他 ${pendingSetup.length - 3} 件</div>` : ''}
        </div>
      </div>
      ` : ''}

      ${prepayAdvice ? `
      <!-- 繰り上げ返済アドバイス -->
      <div style="padding: 12px 14px; background: var(--card);">
        <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-3); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">🚀 繰り上げ返済チャンス</div>
        <div style="padding: 12px; border-radius: 10px; background: linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(16,185,129,0.12) 100%); border: 1px solid rgba(52,211,153,0.25);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div style="flex: 1;">
              <div style="font-size: 0.85rem; font-weight: 700; color: var(--text);">
                今月の余剰 <span style="color: var(--success);">¥${surplusForPrepay.toLocaleString()}</span> を
                <strong>${prepayAdvice.loan.name}</strong> に繰り上げ返済
              </div>
              ${prepayAdvice.monthsSaved > 0 ? `
                <div style="font-size: 0.82rem; color: var(--success); margin-top: 4px; font-weight: 700;">
                  → 完済が <strong>${prepayAdvice.monthsSaved}ヶ月</strong> 短縮されます！
                </div>
              ` : `
                <div style="font-size: 0.78rem; color: var(--text-3); margin-top: 4px;">元金が減り、利息の節約になります</div>
              `}
              ${prepayAdvice.loan.interestRate ? `
                <div style="font-size: 0.72rem; color: var(--text-3); margin-top: 2px;">金利: ${prepayAdvice.loan.interestRate}% / 残高: ¥${(prepayAdvice.loan.balance||0).toLocaleString()}</div>
              ` : ''}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-3); text-align: right; flex-shrink: 0;">
              <div>月末残高予測</div>
              <div style="font-size: 1rem; font-weight: 700; color: ${estimatedEndBalance >= 0 ? 'var(--success)' : 'var(--danger)'};">¥${estimatedEndBalance.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
      ` : ''}

    </div>
    ` : setupComplete ? `
    <div style="margin: 0 12px 14px; padding: 12px 16px; border-radius: 12px; background: var(--success-bg); border: 1px solid rgba(52,211,153,0.3); display: flex; align-items: center; gap: 10px;">
      <span style="font-size: 1.4rem;">🎉</span>
      <div>
        <div style="font-weight: 700; font-size: 0.88rem; color: var(--success);">完璧です！全ての設定が完了しています</div>
        <div style="font-size: 0.75rem; color: var(--text-3); margin-top: 2px;">このまま毎月の支払いを管理しましょう</div>
      </div>
    </div>
    ` : ''}

    <script>
      if (!window.handleNumericInput) {
        window.handleNumericInput = (el) => {
          const cursor = el.selectionStart;
          const oldVal = el.value;
          const raw = oldVal.replace(/,/g, '');
          const num = Number(raw);
          if (isNaN(num) || raw === '') return;
          const formatted = num.toLocaleString();
          if (oldVal === formatted) return;
          el.value = formatted;
          const diff = formatted.length - oldVal.length;
          el.setSelectionRange(cursor + diff, cursor + diff);
        };
      }
    </script>

    ${masterLoans.length > 0 ? `
      <div class="debt-summary-container">
        <div class="summary-card">
          <h4>総借入残高</h4>
          <div class="value">¥${payoffSummary.totalBalance.toLocaleString()}</div>
        </div>
        <div class="summary-card">
          <h4>完済予定</h4>
          <div class="value">${payoffSummary.payoffDate}</div>
          ${ageAtPayoffLabel ? `<div style="font-size: 0.75rem; color: #6b7280; margin-top: 4px;">完済時: ${ageAtPayoffLabel}</div>` : ''}
        </div>
      </div>
      <div class="motivation-card" style="margin: 0 10px 10px 10px; padding: 15px; background: white; border-radius: 8px;">
        <h4 style="margin: 0 0 10px 0; color: #6b7280; font-size: 0.8rem;">今月の進捗 🎉</h4>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 1.1rem; font-weight: bold; color: var(--success);">
              ✅ ¥${events.filter(e => e.status === 'paid' && e.name.startsWith('返済:')).reduce((sum, e) => sum + e.amount, 0).toLocaleString()} 返済済み
            </div>
            <div style="font-size: 0.8rem; color: #6b7280;">完済まであと ${payoffMonthsLabel}</div>
            ${progressPercent === 0 ? `
              <div style="font-size: 0.8rem; color: #6b7280;">これからがんばりましょう！${nextRepayment ? ` 次の返済: ${nextRepayment.originalDate}` : ''}</div>
            ` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.2rem; font-weight: bold;">${progressPercent}%</div>
            <div style="font-size: 0.7rem; color: #6b7280;">達成率</div>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="calendar-grid-wrapper">
      <div class="calendar-grid">
        ${renderCalendar(currentYear, currentMonth, events)}
      </div>
    </div>

    <div class="actions-panel" style="padding: 10px; display: flex; gap: 10px;">
      <button onclick="showEmergencyLoanModal()" class="btn warn">💸 緊急借入</button>
      <button onclick="clearCurrentMonthEvents()" class="btn danger" style="margin-left: auto;">🗑 今月をリセット</button>
    </div>

    <!-- 借入モーダル -->
    <div id="loan-modal" class="modal hidden">
      <div class="modal-content">
        <h3>緊急借入シミュレーション</h3>
        <p>不足金額を入力してください</p>
        <div class="form-group">
          <label>必要金額</label>
          <input type="text" inputmode="numeric" id="needed-amount" placeholder="例: 50,000" oninput="handleNumericInput(this)">
        </div>
        <div id="ai-proposal" style="margin-top: 10px; font-size: 0.9rem;"></div>
        <div class="modal-actions">
          <button onclick="hideLoanModal()" class="btn">閉じる</button>
          <button id="apply-loan-btn" class="btn primary hidden">借入実行</button>
        </div>
      </div>
    </div>

    <div id="event-modal" class="modal hidden">
      <div class="modal-content">
        <h3>支払処理</h3>
        <div id="event-detail"></div>
        <div class="form-group">
          <label>支払日</label>
          <input type="date" id="actual-date">
        </div>
        <div id="penalty-info"></div>
        <div class="modal-actions">
          <button onclick="hideEventModal()" class="btn">キャンセル</button>
          <button id="delete-btn" class="btn danger">削除</button>
          <button id="pay-btn" class="btn primary">完了にする</button>
        </div>
      </div>
    </div>
  `;
}

window.changeMonth = (diff) => {
  currentMonth += diff;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  renderDashboard(containerEl);
};

window.saveExpenseInput = (id, value) => {
  const yearMonth = toYearMonth(currentYear, currentMonth);
  const amount = parseNumber(value);
  const nextValues = {
    ...(appStore.data.settings?.expenseConfirmInputs?.values || {}),
    [id]: (Number.isFinite(amount) || value === '') ? amount : 0
  };
  appStore.updateSettings({
    expenseConfirmInputs: {
      yearMonth,
      values: nextValues
    }
  });
};

window.updateSurvivalInput = (field, value) => {
  const yearMonth = toYearMonth(currentYear, currentMonth);
  const amount = parseNumber(value);
  const current = appStore.data.settings?.survivalInputs?.yearMonth === yearMonth
    ? appStore.data.settings.survivalInputs
    : { yearMonth, startingCash: 0, extraIncome: 0 };
  appStore.updateSettings({
    survivalInputs: {
      ...current,
      yearMonth,
      [field]: Number.isFinite(amount) ? amount : 0
    }
  });
  window.clearTimeout(survivalInputRenderTimer);
  survivalInputRenderTimer = window.setTimeout(() => {
    if (containerEl) renderDashboard(containerEl);
  }, 300);
};

window.confirmExpense = (id) => {
  const yearMonth = toYearMonth(currentYear, currentMonth);
  const masterLoans = appStore.data.master.loans || [];
  const creditCards = masterLoans.filter(l => l.type === 'クレジットカード' && l.active !== false);
  const card = creditCards.find(c => c.id === id);
  if (!card) return;
  const inputEl = document.getElementById(`ops-expense-${id}`) || document.getElementById(`expense-${id}`);
  const amount = inputEl ? parseNumber(inputEl.value) : 0;
  if (!amount || amount <= 0) {
    window.showToast('金額を入力してください', 'warn');
    return;
  }

  // 引落日を算出
  const payDate = window.computePayDate(currentYear, currentMonth, card);
  const payDateStr = toYMD(payDate);
  const payMonthKey = toYearMonth(payDate.getFullYear(), payDate.getMonth() + 1);

  // upsertCardBillingEvent で一元管理
  appStore.upsertCardBillingEvent(id, payMonthKey, amount, payDateStr, card);

  // expenseConfirmInputs にも保存（月変わりリセット用）
  window.saveExpenseInput(id, amount);

  if (appStore.data.settings?.driveSyncEnabled) {
    driveSync.push({ mode: 'auto' }).catch(err => console.error('Auto drive push failed', err));
  }

  window.showToast(`${card.name} ¥${amount.toLocaleString()} を確定しました`, 'success');
  renderDashboard(containerEl);
};

window.generateEvents = async () => {
  const yearMonth = toYearMonth(currentYear, currentMonth);
  const events = (appStore.data.calendar && appStore.data.calendar.generatedMonths) ? (appStore.data.calendar.generatedMonths[yearMonth] || []) : [];
  const hasEvents = events.length > 0;
  const confirmMsg = hasEvents 
    ? `${currentYear}年${currentMonth}月のイベントが既に存在します。再生成しますか？（完了済みは保持されます）`
    : `${currentYear}年${currentMonth}月のイベントを生成しますか？`;

  if (await window.showConfirm(confirmMsg)) {
    window.toggleLoadingOverlay(true, '予定を生成中...');
    try {
      await window.runGeneration(currentYear, currentMonth);
      window.showToast(`${currentMonth}月の予定を${hasEvents ? '再生成' : '生成'}しました`, 'success');
      renderDashboard(containerEl);
    } finally {
      window.toggleLoadingOverlay(false);
    }
  }
};

window.generateYearEvents = async () => {
  const confirmMsg = `${currentYear}年${currentMonth}月から12月までの予定を一括生成しますか？（既に完了した項目は保持されます）`;
  if (!(await window.showConfirm(confirmMsg))) return;

  window.toggleLoadingOverlay(true, '年内の予定を一括生成中...');
  try {
    for (let m = currentMonth; m <= 12; m++) {
      await window.runGeneration(currentYear, m, true);
    }

    if (appStore.data.settings?.driveSyncEnabled) {
      await driveSync.push({ mode: 'auto' }).catch(err => console.error('Auto drive push failed', err));
    }

    window.showToast(`${currentYear}年分の予定を生成しました`, 'success');
    renderDashboard(containerEl);
  } finally {
    window.toggleLoadingOverlay(false);
  }
};

window.runGeneration = async (year, month, skipSync = false) => {
  const ym = toYearMonth(year, month);
  const masterLoans = appStore.data.master.loans || [];
  const newEvents = generateMonthEvents(appStore.data.master.items, masterLoans, appStore.data.master.clients || [], year, month);
  const existingEvents = appStore.data.calendar.generatedMonths[ym] || [];
  const existingById = new Map(existingEvents.map(e => [e.id, e]));
  const mergedEvents = [];
  const usedIds = new Set();

  const mergeEvent = (existing, fresh) => {
    if (existing.status === 'paid') return existing;
    const merged = { ...fresh };
    if (existing.actualDate && existing.actualDate !== fresh.actualDate) merged.actualDate = existing.actualDate;
    if (Number.isFinite(existing.amount) && existing.amount !== fresh.amount) merged.amount = existing.amount;
    if (existing.amountMode) merged.amountMode = existing.amountMode;
    if (existing.bankId) merged.bankId = existing.bankId;
    if (existing.penaltyFee) merged.penaltyFee = existing.penaltyFee;
    if (existing.status === 'pending') merged.status = 'pending';
    return merged;
  };

  for (const event of newEvents) {
    const existing = existingById.get(event.id);
    if (existing) {
      mergedEvents.push(mergeEvent(existing, event));
      usedIds.add(event.id);
    } else {
      mergedEvents.push(event);
    }
  }
  for (const existing of existingEvents) {
    if (!usedIds.has(existing.id) && existing.status === 'paid') {
      mergedEvents.push(existing);
    }
  }

  appStore.addMonthEvents(ym, mergedEvents);

  if (!skipSync) {
    if (appStore.data.settings?.calendarSyncEnabled) {
      await window.syncCurrentMonthToCalendar(true);
    }
    if (appStore.data.settings?.driveSyncEnabled) {
      await driveSync.push({ mode: 'auto' }).catch(err => console.error('Auto drive push failed', err));
    }
  }
};

window.syncCurrentMonthToCalendar = async (isAuto = false) => {
  const yearMonth = toYearMonth(currentYear, currentMonth);
  if (!appStore.data.settings?.calendarSyncEnabled) {
    if (!isAuto) window.showToast('カレンダー同期が無効です', 'warn');
    return;
  }
  
  if (!isAuto) window.toggleLoadingOverlay(true, 'カレンダー同期中...');
  try {
    await calendarSync.syncMonthEvents(yearMonth);
    appStore.addSyncLog({
      type: 'calendar',
      mode: isAuto ? 'auto' : 'manual',
      status: 'success',
      message: `Calendar sync: ${yearMonth}`
    });
    window.showToast('カレンダー同期完了', 'success');
    if (!isAuto) renderDashboard(containerEl); // IDが割り当てられた可能性があるので再描画
  } catch (err) {
    console.error('Calendar sync failed', err);
    appStore.addSyncLog({
      type: 'calendar',
      mode: isAuto ? 'auto' : 'manual',
      status: 'error',
      message: `Calendar sync: ${err.message || '失敗'}`
    });
    window.showToast('カレンダー同期に失敗しました', 'danger');
  } finally {
    if (!isAuto) window.toggleLoadingOverlay(false);
  }
};

window.showEventModal = (eventId) => {
  const yearMonth = toYearMonth(currentYear, currentMonth);
  const events = (appStore.data.calendar && appStore.data.calendar.generatedMonths) ? (appStore.data.calendar.generatedMonths[yearMonth] || []) : [];
  const event = events.find(e => e.id === eventId);
  if (!event) return;

  const masterItems = appStore.data.master.items || [];
  const modal = document.getElementById('event-modal');
  const detail = document.getElementById('event-detail');
  const dateInput = document.getElementById('actual-date');
  const penaltyInfo = document.getElementById('penalty-info');
  const payBtn = document.getElementById('pay-btn');
  const deleteBtn = document.getElementById('delete-btn');

  detail.innerHTML = `
    <p>項目: ${event.name}</p>
    <p>金額: ${event.amountMode === 'variable' ? '(変動)' : ''} ¥${event.amount.toLocaleString()}</p>
    <p>予定日: ${event.originalDate}</p>
    ${event.amountMode === 'variable' ? `
      <div class="form-group">
        <label>実績金額</label>
        <input type="text" inputmode="numeric" id="actual-amount" value="${formatNumber(event.amount)}" oninput="handleNumericInput(this)">
      </div>
    ` : ''}
    <div class="form-group">
      <label>入出金先銀行</label>
      <select id="event-bank-id">
        <option value="">(未選択)</option>
        ${masterItems.filter(i => i.type === 'bank').map(b => `
          <option value="${b.id}" ${event.bankId === b.id ? 'selected' : ''}>${b.name}</option>
        `).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="inline-check">
        <input type="checkbox" id="mark-paid" ${event.status === 'paid' ? 'checked' : ''}>
        <span>完了にする</span>
      </label>
    </div>
  `;
  dateInput.value = event.actualDate;
  
  const updatePenalty = () => {
    const penalty = calculatePenalty(event.amount, event.originalDate, dateInput.value);
    penaltyInfo.innerHTML = penalty > 0 ? `<p class="warn">延滞ペナルティ: ¥${penalty.toLocaleString()}</p>` : '';
  };

  dateInput.onchange = updatePenalty;
  updatePenalty();

  const markPaidEl = document.getElementById('mark-paid');
  payBtn.textContent = '保存する';
  if (markPaidEl) {
    markPaidEl.onchange = () => {
      payBtn.textContent = markPaidEl.checked ? '完了にする' : '保存する';
    };
    payBtn.textContent = markPaidEl.checked ? '完了にする' : '保存する';
  }

  payBtn.onclick = async () => {
    const actualAmountEl = document.getElementById('actual-amount');
    const finalAmount = actualAmountEl ? parseNumber(actualAmountEl.value) : event.amount;
    const penalty = calculatePenalty(finalAmount, event.originalDate, dateInput.value);
    const selectedBankId = document.getElementById('event-bank-id').value;
    const markPaid = markPaidEl ? markPaidEl.checked : false;
    const updates = {
      amount: finalAmount,
      actualDate: dateInput.value,
      penaltyFee: markPaid ? penalty : 0,
      status: markPaid ? 'paid' : 'pending',
      bankId: selectedBankId
    };
    appStore.updateEvent(yearMonth, eventId, updates);
    
    // 銀行残高の更新
    if (selectedBankId && markPaid) {
      const bank = masterItems.find(i => i.id === selectedBankId);
      if (bank) {
        const delta = event.type === 'income' ? (finalAmount - penalty) : -(finalAmount + penalty);
        appStore.updateMasterItem(selectedBankId, { currentBalance: (bank.currentBalance || 0) + delta });
      }
    }
    
    // カレンダー同期
    if (appStore.data.settings?.calendarSyncEnabled) {
      const updatedEvent = { ...event, ...updates };
      calendarSync.updateEvent(null, updatedEvent).catch(err => console.error('Calendar update failed', err));
    }

    // Drive 同期
    if (appStore.data.settings?.driveSyncEnabled) {
      driveSync.push().catch(err => console.error('Auto drive push failed', err));
    }

    hideEventModal();
    renderDashboard(containerEl);
  };

  deleteBtn.onclick = async () => {
    if (await window.showConfirm('この予定をカレンダーから削除しますか？\n（マスターデータは削除されません）')) {
      // カレンダー同期
      if (appStore.data.settings?.calendarSyncEnabled && event.gcalEventId) {
        calendarSync.deleteEvent(null, event).catch(err => console.error('Calendar deletion failed', err));
      }
      
      appStore.deleteEvent(yearMonth, eventId);
      
      // Drive 同期
      if (appStore.data.settings?.driveSyncEnabled) {
        driveSync.push().catch(err => console.error('Auto drive push failed', err));
      }

      hideEventModal();
      renderDashboard(containerEl);
    }
  };

  modal.classList.remove('hidden');
};

window.hideEventModal = () => {
  document.getElementById('event-modal').classList.add('hidden');
};

window.showEmergencyLoanModal = () => {
  const masterLoans = appStore.data.master.loans || [];
  const payoffSummary = calculatePayoffSummary(masterLoans);
  const modal = document.getElementById('loan-modal');
  const amountInput = document.getElementById('needed-amount');
  const proposalDiv = document.getElementById('ai-proposal');
  const applyBtn = document.getElementById('apply-loan-btn');

  proposalDiv.innerHTML = '';
  applyBtn.classList.add('hidden');
  
  amountInput.oninput = () => {
    window.handleNumericInput(amountInput);
    const amount = parseNumber(amountInput.value);
    if (!amount || amount <= 0) {
      proposalDiv.innerHTML = '';
      applyBtn.classList.add('hidden');
      return;
    }

    // AI提案ロジック
    const candidates = masterLoans
      .filter(l => l.active && (l.maxLimit - l.currentBalance) > 0)
      .sort((a, b) => a.interestRate - b.interestRate);

    if (candidates.length === 0) {
      proposalDiv.innerHTML = '<p class="warn">借入可能な枠がありません。</p>';
      applyBtn.classList.add('hidden');
      return;
    }

    let remaining = amount;
    let plan = [];
    for (const c of candidates) {
      const space = c.maxLimit - c.currentBalance;
      const take = Math.min(remaining, space);
      if (take > 0) {
        plan.push({ name: c.name, amount: take, id: c.id });
        remaining -= take;
      }
      if (remaining <= 0) break;
    }

    if (remaining > 0) {
      proposalDiv.innerHTML = `<p class="warn">不足分 ¥${remaining.toLocaleString()} の枠が足りません。</p>`;
      applyBtn.classList.add('hidden');
    } else {
      // 完済予定への影響を計算
      const dummyLoans = JSON.parse(JSON.stringify(masterLoans));
      plan.forEach(p => {
        const l = dummyLoans.find(dl => dl.id === p.id);
        l.currentBalance += p.amount;
      });
      const newSummary = calculatePayoffSummary(dummyLoans);
      const monthDiff = newSummary.totalMonths - payoffSummary.totalMonths;

      proposalDiv.innerHTML = `
        <p>💡 AI推奨の借入計画:</p>
        <ul>
          ${plan.map(p => `<li>${p.name}: ¥${p.amount.toLocaleString()}</li>`).join('')}
        </ul>
        <p class="warn">⚠️ 完済予定が ${monthDiff} ヶ月延びて ${newSummary.payoffDate} になります。</p>
      `;
      applyBtn.classList.remove('hidden');
      applyBtn.onclick = async () => {
        if (await window.showConfirm('借入を実行して残高に反映しますか？')) {
          plan.forEach(p => {
            const loan = masterLoans.find(l => l.id === p.id);
            appStore.updateLoan(p.id, { currentBalance: loan.currentBalance + p.amount });
          });
          hideLoanModal();
          renderDashboard(containerEl);
        }
      };
    }
  };

  modal.classList.remove('hidden');
};

window.hideLoanModal = () => {
  document.getElementById('loan-modal').classList.add('hidden');
};

window.clearCurrentMonthEvents = async () => {
  const yearMonth = toYearMonth(currentYear, currentMonth);
  const events = appStore.data.calendar?.generatedMonths?.[yearMonth] || [];

  if (events.length === 0) {
    window.showToast('今月の予定はまだありません', 'info');
    return;
  }

  const gcalCount = events.filter(e => e.gcalEventId).length;
  const msg = [
    `${currentYear}年${currentMonth}月の予定を全て削除します。`,
    `　・アプリ内の予定: ${events.length}件`,
    gcalCount > 0 ? `　・Googleカレンダーの予定: ${gcalCount}件も削除されます` : '',
    '',
    'この操作は元に戻せません。続けますか？'
  ].filter(Boolean).join('\n');

  if (!(await window.showConfirm(msg, '今月をリセット'))) return;

  window.toggleLoadingOverlay(true, '今月の予定を削除中...');
  try {
    // GCal上のイベントを削除
    if (appStore.data.settings?.calendarSyncEnabled && gcalCount > 0) {
      for (const event of events) {
        if (event.gcalEventId) {
          await calendarSync.deleteEvent(null, event).catch(e => console.warn('GCal delete failed', e));
        }
      }
    }

    // ローカルデータを削除（clearMonthEventsがない旧バージョン対策のフォールバック付き）
    if (typeof appStore.clearMonthEvents === 'function') {
      appStore.clearMonthEvents(yearMonth);
    } else {
      // フォールバック: 直接データを操作して保存
      if (appStore.data?.calendar?.generatedMonths) {
        delete appStore.data.calendar.generatedMonths[yearMonth];
        appStore.save();
      }
    }

    // Drive同期
    if (appStore.data.settings?.driveSyncEnabled) {
      await driveSync.push({ mode: 'auto' }).catch(e => console.warn('Drive push failed', e));
    }

    window.showToast(`${currentMonth}月の予定を削除しました`, 'success');
    renderDashboard(containerEl);
  } finally {
    window.toggleLoadingOverlay(false);
  }
};

function renderCalendar(year, month, events) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  let html = '';
  // 曜日ヘッダー (月曜始まり)
  ['月', '火', '水', '木', '金', '土', '日'].forEach(d => {
    html += `<div class="calendar-day header">${d}</div>`;
  });

  // 空白 (月曜始まりに調整: 日0, 月1, 火2, 水3, 木4, 金5, 土6 -> 月0, 火1, 水2, 木3, 金4, 土5, 日6)
  const adjustedFirstDay = (firstDay + 6) % 7;
  for (let i = 0; i < adjustedFirstDay; i++) {
    html += `<div class="calendar-day empty"></div>`;
  }

  // 日付
  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isThisWeek = dateStr > todayStr && dateStr <= nextWeekStr;
    const dayEvents = events.filter(e => e.actualDate === dateStr);

    html += `
      <div class="calendar-day ${isToday ? 'today' : ''} ${isThisWeek ? 'this-week' : ''}">
        <span class="day-num">${d}</span>
        <div class="day-events">
          ${dayEvents.map(e => {
            const isDelayed = e.status === 'pending' && e.actualDate < todayStr;
            const isPaid = e.status === 'paid';
            const hasAdjustment = e.actualDate && e.actualDate !== e.originalDate;
            const originalDay = hasAdjustment ? e.originalDate.split('-')[2] : '';
            return `
              <div class="event-item ${e.type} ${e.status} ${isDelayed ? 'delayed blink' : ''}" 
                   onclick="showEventModal('${e.id}')">
                ${getIcon(e.name, e.type)} 
                ${hasAdjustment ? `<span style="font-size: 0.6rem; background: rgba(0,0,0,0.1); padding: 0 2px; border-radius: 2px; margin-right: 2px;" title="本来の予定日: ${originalDay}日">${originalDay}日→</span>` : ''}
                <span style="font-weight: 700;">${e.type === 'income' ? '+' : '-'}${formatNumber(e.amount)}円</span>
                ${e.name}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  return html;
}
