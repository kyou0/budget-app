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

const toYearMonth = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const toYMD = (date) => date.toISOString().split('T')[0];

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
  const pendingIncome = events
    .filter(e => e.type === 'income' && e.status === 'pending' && e.actualDate.startsWith(yearMonth))
    .reduce((sum, e) => sum + e.amount, 0);
  const pendingExpense = events
    .filter(e => e.type === 'expense' && e.status === 'pending' && e.actualDate.startsWith(yearMonth))
    .reduce((sum, e) => sum + e.amount, 0);
  
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

window.confirmExpense = (id) => {
  const yearMonth = toYearMonth(currentYear, currentMonth);
  const masterLoans = appStore.data.master.loans || [];
  const creditCards = masterLoans.filter(l => l.type === 'クレジットカード' && l.active !== false);
  const card = creditCards.find(c => c.id === id);
  if (!card) return;
  const inputEl = document.getElementById(`expense-${id}`);
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
