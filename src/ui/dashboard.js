import { store as appStore } from '../store.js';
import { generateMonthEvents } from '../generate.js';
import { calculatePenalty, calculatePayoffSummary } from '../calc.js';
import { googleAuth } from '../auth/googleAuth.js';
import { driveSync } from '../sync/driveSync.js';
import { calendarSync } from '../sync/calendarSync.js';
import { formatAgeMonths, formatMonthsToYears, getAgeMonthsFromBirthdate, getIcon, getLogoUrl, formatNumber, parseNumber } from '../utils.js';

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

const toYearMonth = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const toYMD = (date) => date.toISOString().split('T')[0];

const adjustToNextWeekday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2); // Sat -> Mon
  if (day === 0) d.setDate(d.getDate() + 1); // Sun -> Mon
  return d;
};

export function renderDashboard(container) {
  const yearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const masterLoans = appStore.data.master.loans || [];
  const creditCards = masterLoans.filter(l => l.type === 'クレジットカード' && l.active !== false);
  const masterItems = appStore.data.master.items || [];
  const payoffSummary = calculatePayoffSummary(masterLoans);
  const events = appStore.data.calendar.generatedMonths[yearMonth] || [];

  const computePayDate = (year, month, card) => {
    const offset = card.payMonthOffset || 0;
    const targetMonth = month + offset;
    const payDay = card.paymentDay || card.deadlineDay || 1;
    const date = new Date(year, targetMonth - 1, payDay);
    return adjustToNextWeekday(date);
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

  // 今月の予定収支
  const pendingIncome = events
    .filter(e => e.type === 'income' && e.status === 'pending')
    .reduce((sum, e) => sum + e.amount, 0);
  const pendingExpense = events
    .filter(e => e.type === 'expense' && e.status === 'pending')
    .reduce((sum, e) => sum + e.amount, 0);
  
  const estimatedEndBalance = totalBankBalance + pendingIncome - pendingExpense;

  // 延滞・今週の項目の抽出
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const delayedEvents = events.filter(e => e.status === 'pending' && e.originalDate < todayStr);
  const thisWeekEvents = events.filter(e => e.status === 'pending' && e.originalDate >= todayStr && e.originalDate <= nextWeekStr);
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
    .filter(e => e.status === 'pending' && e.name.startsWith('返済:'))
    .sort((a, b) => a.originalDate.localeCompare(b.originalDate))[0];

  container.innerHTML = `
    <div class="dashboard-header">
      <div class="month-nav">
        <button onclick="changeMonth(-1)" class="btn small">&lt;</button>
        <h2>${currentYear}年${currentMonth}月</h2>
        <button onclick="changeMonth(1)" class="btn small">&gt;</button>
      </div>
      <div class="actions" style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
        ${settings.driveSyncEnabled && googleAuth.isSignedIn() ? `<span class="sync-status" title="Drive同期有効">☁️</span>` : ''}
        <button onclick="generateYearEvents()" class="btn small" title="年内の全予定を一括生成します">年内一括</button>
        <button onclick="generateEvents()" class="btn ${events.length === 0 ? 'primary' : ''}">
          ${currentMonth}月の予定を${events.length === 0 ? '生成' : '再生成'}
        </button>
        ${events.length > 0 && settings.calendarSyncEnabled ? `
          <button onclick="syncCurrentMonthToCalendar()" class="btn small success" style="padding: 8px;">
            GCal同期
          </button>
        ` : ''}
      </div>
    </div>
    ${recentSyncLogs.length > 0 ? `
      <div style="margin: 0 10px 10px 10px; padding: 10px 12px; background: #f9fafb; border-radius: 8px; font-size: 0.8rem; color: #6b7280;">
        <div style="font-weight: 600; margin-bottom: 6px; color: #374151;">同期ログ（直近）</div>
        ${recentSyncLogs.map(log => `
          <div style="display: flex; justify-content: space-between; gap: 10px;">
            <div>${log.type === 'drive' ? 'Drive' : 'Calendar'} ${log.status === 'success' ? '成功' : '失敗'}${log.mode === 'auto' ? '（自動）' : '（手動）'}</div>
            <div style="white-space: nowrap;">${new Date(log.timestamp).toLocaleString()}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${welcomeLabel ? `
      <div style="margin: 0 10px 10px 10px; padding: 10px 12px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd; color: #0c4a6e;">
        <strong>${welcomeLabel}</strong>、がんばりましょう！ ${tipsMessage}
      </div>
    ` : ''}

    <div class="summary-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px;">
      <div class="summary-card" style="background: white; padding: 15px; border-radius: 8px;">
        <h4 style="margin: 0; font-size: 0.8rem; color: #6b7280;">現在の銀行残高</h4>
        <div class="value" style="font-size: 1.2rem; font-weight: bold;">¥${totalBankBalance.toLocaleString()}</div>
      </div>
      <div class="summary-card" style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary); display: flex; flex-direction: column; justify-content: center;">
        <h4 style="margin: 0; font-size: 0.8rem; color: #6b7280;">月末予想残高</h4>
        <div class="value" style="font-size: 1.2rem; font-weight: bold; color: var(--primary);">¥${estimatedEndBalance.toLocaleString()}</div>
      </div>
    </div>

    <script>
      // グローバルに関数を公開（再描画時に失われないように）
      if (!window.handleNumericInput) {
        window.handleNumericInput = (el) => {
          const cursor = el.selectionStart;
          const oldVal = el.value;
          const newVal = (val) => {
            if (val === undefined || val === null || val === '') return '';
            const num = Number(val.replace(/,/g, ''));
            if (isNaN(num)) return val;
            return num.toLocaleString();
          };
          const formatted = newVal(oldVal);
          if (oldVal === formatted) return;
          el.value = formatted;
          const diff = formatted.length - oldVal.length;
          el.setSelectionRange(cursor + diff, cursor + diff);
        };
      }
    </script>

    <div style="margin: 0 10px 10px 10px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
      <h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">💳 クレジットカードの月次請求</h4>
      <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 10px;">
        今月の請求額（カード明細などで確定した金額）を入力して確定してください。引落日に自動的に反映されます。
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px;">
        ${creditCards.length === 0 ? `
          <div style="grid-column: 1/-1; text-align: center; padding: 20px; color: #6b7280; font-size: 0.8rem; border: 1px dashed #e5e7eb; border-radius: 8px;">
            マスターでクレジットカードを登録するとここに表示されます。
          </div>
        ` : creditCards.map(card => {
          const bank = masterItems.find(b => b.id === card.bankId);
          const logoUrl = card.logo || getLogoUrl(card.name);
          return `
            <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; background: #f9fafb;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <div style="font-weight: bold; font-size: 0.95rem;">${card.name}</div>
                  <div style="font-size: 0.7rem; color: #6b7280;">${bank ? bank.name : '(未設定)'}</div>
                </div>
                ${logoUrl ? `<img src="${logoUrl}" alt="" style="height: 20px; max-width: 50px; object-fit: contain; background: white; padding: 1px; border-radius: 3px; border: 1px solid #eee;">` : `<span>💳</span>`}
              </div>
              <div style="font-size: 0.75rem; color: #6b7280; margin-top: 4px;">
                限度額: ¥${(card.maxLimit || 0).toLocaleString()} / 締日: ${card.deadlineDay ? `${card.deadlineDay}日` : '—'} / 引落: ${card.paymentDay}日${card.payMonthOffset ? ` (${card.payMonthOffset === 1 ? '翌月' : '翌々月'})` : ''}
              </div>
              <div style="display: flex; gap: 6px; margin-top: 8px; align-items: center;">
                <div style="flex: 1;">
                  <div style="font-size: 0.7rem; color: #6b7280; margin-bottom: 2px;">今月の請求額</div>
                  <input type="text" inputmode="numeric" id="expense-${card.id}" value="${formatNumber(expenseInputValues[card.id])}" placeholder="金額を入力" oninput="handleNumericInput(this); saveExpenseInput('${card.id}', this.value)" style="width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem; box-sizing: border-box;">
                </div>
                <button class="btn small primary" onclick="confirmExpense('${card.id}')" style="align-self: flex-end; height: 34px;">確定</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div style="font-size: 0.75rem; color: #6b7280; margin-top: 8px;">
        ※月が変わると入力欄は自動的にリセットされます（履歴は残ります）。
      </div>
    </div>

    ${delayedEvents.length > 0 ? `
      <div class="alert-banner blink" style="margin: 0 10px 10px 10px; padding: 10px; background: var(--danger); color: white; border-radius: 8px; font-weight: bold; text-align: center;">
        ⚠️ 延滞中の支払いが ${delayedEvents.length} 件あります！
      </div>
    ` : ''}

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

  window.changeMonth = (diff) => {
    currentMonth += diff;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    renderDashboard(container);
  };

  window.saveExpenseInput = (id, value) => {
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
    const card = creditCards.find(c => c.id === id);
    if (!card) return;
    const inputEl = document.getElementById(`expense-${id}`);
    const amount = inputEl ? parseNumber(inputEl.value) : 0;
    if (!amount || amount <= 0) {
      window.showToast('金額を入力してください', 'warn');
      return;
    }

    const payDate = computePayDate(currentYear, currentMonth, card);
    const payDateStr = toYMD(payDate);
    const payMonthKey = toYearMonth(payDate.getFullYear(), payDate.getMonth() + 1);

    const transactions = appStore.data.transactions || [];
    const txKey = `expense-confirm-${id}-${yearMonth}`;
    const existingIndex = transactions.findIndex(t => t.key === txKey);
    const tx = {
      id: existingIndex >= 0 ? transactions[existingIndex].id : crypto.randomUUID(),
      key: txKey,
      type: 'expense',
      category: card.name,
      categoryKey: id,
      date: payDateStr,
      amount: -Math.abs(amount),
      status: 'confirmed',
      yearMonth
    };
    if (existingIndex >= 0) transactions[existingIndex] = tx;
    else transactions.push(tx);
    appStore.data.transactions = transactions;
    appStore.save();

    const eventId = `confirm-${id}-${yearMonth}`;
    const monthEvents = appStore.data.calendar.generatedMonths[payMonthKey] || [];
    const eventIndex = monthEvents.findIndex(e => e.id === eventId);
    const eventData = {
      id: eventId,
      masterId: id,
      name: `確定支出: ${card.name}`,
      type: 'expense',
      amount: Math.abs(amount),
      amountMode: 'fixed',
      bankId: card.bankId || '',
      originalDate: payDateStr,
      actualDate: payDateStr,
      penaltyFee: 0,
      status: 'pending'
    };
    if (eventIndex >= 0) {
      const existing = monthEvents[eventIndex];
      monthEvents[eventIndex] = existing.status === 'paid' ? existing : { ...existing, ...eventData };
    } else {
      monthEvents.push(eventData);
    }
    appStore.data.calendar.generatedMonths[payMonthKey] = monthEvents;
    appStore.save();

    window.saveExpenseInput(id, amount);
    window.showToast(`${card.name} を確定しました`, 'success');
    renderDashboard(container);
  };

  window.generateEvents = async () => {
    const yearMonth = toYearMonth(currentYear, currentMonth);
    const events = appStore.data.calendar.generatedMonths[yearMonth] || [];
    const hasEvents = events.length > 0;
    const confirmMsg = hasEvents 
      ? `${currentYear}年${currentMonth}月のイベントが既に存在します。再生成しますか？（完了済みは保持されます）`
      : `${currentYear}年${currentMonth}月のイベントを生成しますか？`;

    if (await window.showConfirm(confirmMsg)) {
      await window.runGeneration(currentYear, currentMonth);
      window.showToast(`${currentMonth}月の予定を${hasEvents ? '再生成' : '生成'}しました`, 'success');
      renderDashboard(container);
    }
  };

  window.generateYearEvents = async () => {
    const confirmMsg = `${currentYear}年${currentMonth}月から12月までの予定を一括生成しますか？（既に完了した項目は保持されます）`;
    if (!(await window.showConfirm(confirmMsg))) return;

    window.showToast('一括生成中...', 'info');
    for (let m = currentMonth; m <= 12; m++) {
      await window.runGeneration(currentYear, m, true);
    }

    if (appStore.data.settings?.driveSyncEnabled) {
      await driveSync.push({ mode: 'auto' }).catch(err => console.error('Auto drive push failed', err));
    }

    window.showToast(`${currentYear}年分の予定を生成しました`, 'success');
    renderDashboard(container);
  };

  window.runGeneration = async (year, month, skipSync = false) => {
    const ym = toYearMonth(year, month);
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
    if (!appStore.data.settings?.calendarSyncEnabled) {
      if (!isAuto) window.showToast('カレンダー同期が無効です', 'warn');
      return;
    }
    
    window.showToast('カレンダー同期中...', 'info');
    try {
      await calendarSync.syncMonthEvents(yearMonth);
      appStore.addSyncLog({
        type: 'calendar',
        mode: isAuto ? 'auto' : 'manual',
        status: 'success',
        message: `Calendar sync: ${yearMonth}`
      });
      window.showToast('カレンダー同期完了', 'success');
      if (!isAuto) renderDashboard(container); // IDが割り当てられた可能性があるので再描画
    } catch (err) {
      console.error('Calendar sync failed', err);
      appStore.addSyncLog({
        type: 'calendar',
        mode: isAuto ? 'auto' : 'manual',
        status: 'error',
        message: `Calendar sync: ${err.message || '失敗'}`
      });
      window.showToast('カレンダー同期に失敗しました', 'danger');
    }
  };

  window.showEventModal = (eventId) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return;

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
      renderDashboard(container);
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
        renderDashboard(container);
      }
    };

    modal.classList.remove('hidden');
  };

  window.hideEventModal = () => {
    document.getElementById('event-modal').classList.add('hidden');
  };

  window.showEmergencyLoanModal = () => {
    const modal = document.getElementById('loan-modal');
    const amountInput = document.getElementById('needed-amount');
    const proposalDiv = document.getElementById('ai-proposal');
    const applyBtn = document.getElementById('apply-loan-btn');

    proposalDiv.innerHTML = '';
    applyBtn.classList.add('hidden');
    
    amountInput.oninput = () => {
      handleNumericInput(amountInput);
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
            renderDashboard(container);
          }
        };
      }
    };

    modal.classList.remove('hidden');
  };

  window.hideLoanModal = () => {
    document.getElementById('loan-modal').classList.add('hidden');
  };
}

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
    const dayEvents = events.filter(e => e.originalDate === dateStr);

    html += `
      <div class="calendar-day ${isToday ? 'today' : ''} ${isThisWeek ? 'this-week' : ''}">
        <span class="day-num">${d}</span>
        <div class="day-events">
          ${dayEvents.map(e => {
            const isDelayed = e.status === 'pending' && e.originalDate < todayStr;
            const isPaid = e.status === 'paid';
            const showActualDate = e.actualDate && e.actualDate !== e.originalDate;
            const actualDay = showActualDate ? e.actualDate.split('-')[2] : '';
            return `
              <div class="event-item ${e.type} ${e.status} ${isDelayed ? 'delayed blink' : ''}" 
                   onclick="showEventModal('${e.id}')">
                ${getIcon(e.name, e.type)} 
                ${showActualDate ? `<span style="font-size: 0.6rem; background: rgba(0,0,0,0.1); padding: 0 2px; border-radius: 2px; margin-right: 2px;">${actualDay}日</span>` : ''}
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
