import { store } from '../store.js';
import { generateMonthEvents } from '../generate.js';
import { calculatePenalty, calculatePayoffSummary } from '../calc.js';
import { googleAuth } from '../auth/googleAuth.js';
import { driveSync } from '../sync/driveSync.js';
import { calendarSync } from '../sync/calendarSync.js';

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

export function renderDashboard(container) {
  const yearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const events = store.data.calendar.generatedMonths[yearMonth] || [];
  const loans = store.data.master.loans || [];
  const masterItems = store.data.master.items || [];
  const payoffSummary = calculatePayoffSummary(loans);

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

  const settings = store.data.settings || {};
  const isSyncing = false; // 将来的にローディング状態を管理する場合用

  container.innerHTML = `
    <div class="dashboard-header">
      <div class="month-nav">
        <button onclick="changeMonth(-1)" class="btn small">&lt;</button>
        <h2>${currentYear}年${currentMonth}月</h2>
        <button onclick="changeMonth(1)" class="btn small">&gt;</button>
      </div>
      <div class="actions" style="display: flex; align-items: center; gap: 5px;">
        ${settings.driveSyncEnabled && googleAuth.isSignedIn() ? `<span class="sync-status" title="Drive同期有効">☁️</span>` : ''}
        ${events.length === 0 
          ? `<button onclick="generateEvents()" class="btn primary">当月生成</button>`
          : `<span class="badge success">生成済み</span>`
        }
      </div>
    </div>

    <div class="summary-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px;">
      <div class="summary-card" style="background: white; padding: 15px; border-radius: 8px;">
        <h4 style="margin: 0; font-size: 0.8rem; color: #6b7280;">現在の銀行残高</h4>
        <div class="value" style="font-size: 1.2rem; font-weight: bold;">¥${totalBankBalance.toLocaleString()}</div>
      </div>
      <div class="summary-card" style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);">
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
        </div>
      </div>
      <div class="motivation-card" style="margin: 0 10px 10px 10px; padding: 15px; background: white; border-radius: 8px;">
        <h4 style="margin: 0 0 10px 0; color: #6b7280; font-size: 0.8rem;">今月の進捗 🎉</h4>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 1.1rem; font-weight: bold; color: var(--success);">
              ✅ ¥${events.filter(e => e.status === 'paid' && e.name.startsWith('返済:')).reduce((sum, e) => sum + e.amount, 0).toLocaleString()} 返済済み
            </div>
            <div style="font-size: 0.8rem; color: #6b7280;">完済まであと ${payoffSummary.totalMonths} ヶ月</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.2rem; font-weight: bold;">${Math.round((1 - payoffSummary.totalBalance / 2000000) * 100)}%</div>
            <div style="font-size: 0.7rem; color: #6b7280;">達成率(仮)</div>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="calendar-grid">
      ${renderCalendar(currentYear, currentMonth, events)}
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
    if (events.length > 0) return;
    if (confirm(`${currentYear}年${currentMonth}月のイベントを生成しますか？`)) {
      const newEvents = generateMonthEvents(store.data.master.items, loans, currentYear, currentMonth);
      store.addMonthEvents(yearMonth, newEvents);
      
      // Google Calendar 同期
      if (store.data.settings?.calendarSyncEnabled) {
        try {
          await calendarSync.syncMonthEvents(yearMonth);
        } catch (err) {
          console.error('Initial calendar sync failed', err);
        }
      }

      // Drive 同期
      if (store.data.settings?.driveSyncEnabled) {
        driveSync.push().catch(err => console.error('Auto drive push failed', err));
      }

      renderDashboard(container);
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
      <p>金額: ¥${event.amount.toLocaleString()}</p>
      <p>予定日: ${event.originalDate}</p>
    `;
    dateInput.value = event.actualDate;
    
    const updatePenalty = () => {
      const penalty = calculatePenalty(event.amount, event.originalDate, dateInput.value);
      penaltyInfo.innerHTML = penalty > 0 ? `<p class="warn">延滞ペナルティ: ¥${penalty.toLocaleString()}</p>` : '';
    };

    dateInput.onchange = updatePenalty;
    updatePenalty();

    payBtn.onclick = async () => {
      const penalty = calculatePenalty(event.amount, event.originalDate, dateInput.value);
      const updates = {
        actualDate: dateInput.value,
        penaltyFee: penalty,
        status: 'paid'
      };
      store.updateEvent(yearMonth, eventId, updates);
      
      // カレンダー同期
      if (store.data.settings?.calendarSyncEnabled) {
        const updatedEvent = { ...event, ...updates };
        calendarSync.updateEvent(null, updatedEvent).catch(err => console.error('Calendar update failed', err));
      }

      // Drive 同期
      if (store.data.settings?.driveSyncEnabled) {
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
        applyBtn.onclick = () => {
          if (confirm('借入を実行して残高に反映しますか？')) {
            plan.forEach(p => {
              const loan = loans.find(l => l.id === p.id);
              store.updateLoan(p.id, { currentBalance: loan.currentBalance + p.amount });
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

function getIcon(name, type) {
  if (type === 'income') return '💰';
  if (name.includes('返済')) return '💸';
  if (name.includes('家賃') || name.includes('光熱費')) return '🏠';
  if (name.includes('カード')) return '💳';
  if (name.includes('銀行') || name.includes('口座')) return '🏦';
  if (name.includes('税') || name.includes('年金')) return '🏛️';
  return type === 'expense' ? '🛒' : '❓';
}

function renderCalendar(year, month, events) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  let html = '';
  // 曜日ヘッダー
  ['日', '月', '火', '水', '木', '金', '土'].forEach(d => {
    html += `<div class="calendar-day header">${d}</div>`;
  });

  // 空白
  for (let i = 0; i < firstDay; i++) {
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
