import { store as appStore } from '../store.js';
import { generateMonthEvents } from '../generate.js';
import { calculatePenalty, calculatePayoffSummary } from '../calc.js';
import { googleAuth } from '../auth/googleAuth.js';
import { driveSync } from '../sync/driveSync.js';
import { calendarSync } from '../sync/calendarSync.js';
import { formatAgeMonths, formatMonthsToYears, getAgeMonthsFromBirthdate, getIcon } from '../utils.js';

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

export function renderDashboard(container) {
  const yearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const events = appStore.data.calendar.generatedMonths[yearMonth] || [];
  const loans = appStore.data.master.loans || [];
  const masterItems = appStore.data.master.items || [];
  const payoffSummary = calculatePayoffSummary(loans);
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

  container.innerHTML = `
    <div class="dashboard-header">
      <div class="month-nav">
        <button onclick="changeMonth(-1)" class="btn small">&lt;</button>
        <h2>${currentYear}年${currentMonth}月</h2>
        <button onclick="changeMonth(1)" class="btn small">&gt;</button>
      </div>
      <div class="actions" style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
        ${settings.driveSyncEnabled && googleAuth.isSignedIn() ? `<span class="sync-status" title="Drive同期有効">☁️</span>` : ''}
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

    ${delayedEvents.length > 0 ? `
      <div class="alert-banner blink" style="margin: 0 10px 10px 10px; padding: 10px; background: var(--danger); color: white; border-radius: 8px; font-weight: bold; text-align: center;">
        ⚠️ 延滞中の支払いが ${delayedEvents.length} 件あります！
      </div>
    ` : ''}

    ${loans.length > 0 ? `
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
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.2rem; font-weight: bold;">${Math.round((1 - payoffSummary.totalBalance / 2000000) * 100)}%</div>
            <div style="font-size: 0.7rem; color: #6b7280;">達成率(仮)</div>
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
          <input type="number" id="needed-amount" placeholder="例: 50000">
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

  window.generateEvents = async () => {
    const hasEvents = events.length > 0;
    const confirmMsg = hasEvents 
      ? `${currentYear}年${currentMonth}月のイベントが既に存在します。再生成しますか？（完了済みは保持されます）`
      : `${currentYear}年${currentMonth}月のイベントを生成しますか？`;

    if (await window.showConfirm(confirmMsg)) {
      console.log(`Generating events for ${currentYear}-${currentMonth}...`);
      const newEvents = generateMonthEvents(appStore.data.master.items, loans, currentYear, currentMonth);
      console.log(`Generated ${newEvents.length} events.`);
      
      if (newEvents.length === 0) {
        window.showToast('生成される項目がありません。マスター登録を確認してください。', 'warn');
      }

      const existingEvents = appStore.data.calendar.generatedMonths[yearMonth] || [];
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

      appStore.addMonthEvents(yearMonth, mergedEvents);
      
      // Google Calendar 同期 (自動)
      if (appStore.data.settings?.calendarSyncEnabled) {
        await window.syncCurrentMonthToCalendar(true);
      }

      // Drive 同期
      if (appStore.data.settings?.driveSyncEnabled) {
        driveSync.push({ mode: 'auto' }).catch(err => console.error('Auto drive push failed', err));
      }

      window.showToast(`${currentMonth}月の予定を${hasEvents ? '再生成' : '生成'}しました`, 'success');
      renderDashboard(container);
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
      window.showToast('カレンダー同期完了', 'success');
      if (!isAuto) renderDashboard(container); // IDが割り当てられた可能性があるので再描画
    } catch (err) {
      console.error('Calendar sync failed', err);
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

    detail.innerHTML = `
      <p>項目: ${event.name}</p>
      <p>金額: ${event.amountMode === 'variable' ? '(変動)' : ''} ¥${event.amount.toLocaleString()}</p>
      <p>予定日: ${event.originalDate}</p>
      ${event.amountMode === 'variable' ? `
        <div class="form-group">
          <label>実績金額</label>
          <input type="number" id="actual-amount" value="${event.amount}">
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
      const finalAmount = actualAmountEl ? Number(actualAmountEl.value) : event.amount;
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
      const amount = Number(amountInput.value);
      if (!amount || amount <= 0) {
        proposalDiv.innerHTML = '';
        applyBtn.classList.add('hidden');
        return;
      }

      // AI提案ロジック
      const candidates = loans
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
        const dummyLoans = JSON.parse(JSON.stringify(loans));
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
              const loan = loans.find(l => l.id === p.id);
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
            return `
              <div class="event-item ${e.type} ${e.status} ${isDelayed ? 'delayed blink' : ''}" 
                   onclick="showEventModal('${e.id}')">
                ${getIcon(e.name, e.type)} ${e.name}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  return html;
}
