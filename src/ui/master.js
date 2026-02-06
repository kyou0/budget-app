import { store as appStore } from '../store.js';
import { getIcon } from '../utils.js';
import { driveSync } from '../sync/driveSync.js';

let currentTab = 'items'; // 'items' | 'banks' | 'loans'

export function renderMaster(container) {
  const items = appStore.data.master.items;
  const loans = appStore.data.master.loans || [];

  container.innerHTML = `
    <div class="tabs">
      <button class="tab-btn ${currentTab === 'items' ? 'active' : ''}" onclick="switchMasterTab('items')">収支項目</button>
      <button class="tab-btn ${currentTab === 'banks' ? 'active' : ''}" onclick="switchMasterTab('banks')">銀行口座</button>
      <button class="tab-btn ${currentTab === 'loans' ? 'active' : ''}" onclick="switchMasterTab('loans')">借入先</button>
    </div>

    <div class="master-header">
      <h2>${currentTab === 'items' ? '収支マスター' : currentTab === 'banks' ? '銀行マスター' : '借入先マスター'}</h2>
      <button id="add-btn" class="btn primary">新規追加</button>
    </div>

    <div class="master-list">
      ${currentTab === 'items' ? renderItemsList(items.filter(i => i.type !== 'bank')) : 
        currentTab === 'banks' ? renderBanksList(items.filter(i => i.type === 'bank')) : 
        renderLoansList(loans)}
    </div>

    <!-- 項目モーダル -->
    <div id="master-modal" class="modal hidden">
      <div class="modal-content">
        <h3 id="modal-title">項目追加</h3>
        <form id="master-form">
          <input type="hidden" id="edit-id">
          <div class="form-group">
            <label>名前</label>
            <input type="text" id="master-name" required placeholder="例: 家賃、アコム">
          </div>
          
          ${currentTab === 'items' ? `
            <div class="form-group">
              <label>種類</label>
              <select id="master-type" onchange="toggleMasterFormFields()">
                <option value="expense">支出</option>
                <option value="income">収入</option>
              </select>
            </div>
            <div id="field-amount" class="form-group">
              <label>金額モード</label>
              <select id="master-amount-mode">
                <option value="fixed">固定</option>
                <option value="variable">変動</option>
              </select>
              <label style="margin-top:5px;">金額 (またはベース金額)</label>
              <input type="number" id="master-amount" required>
            </div>
            <div id="field-rule" class="form-group">
              <label>日付ルール</label>
              <select id="master-rule-type" onchange="toggleRuleFields()">
                <option value="monthly">毎月◯日</option>
                <option value="monthEnd">月末</option>
                <option value="weekly">毎週◯曜</option>
                <option value="nextMonthDay">翌月◯日</option>
                <option value="monthlyBusinessDay">第◯営業日</option>
              </select>
              <div id="rule-detail" style="margin-top:10px;">
                <input type="number" id="master-day" min="1" max="31" placeholder="日">
                <select id="master-weekday" class="hidden">
                  <option value="0">日曜日</option>
                  <option value="1">月曜日</option>
                  <option value="2">火曜日</option>
                  <option value="3">水曜日</option>
                  <option value="4">木曜日</option>
                  <option value="5">金曜日</option>
                  <option value="6">土曜日</option>
                </select>
                <input type="number" id="master-nth" min="1" max="20" placeholder="第n営業日" class="hidden">
              </div>
            </div>
            <div id="field-bank-select" class="form-group">
              <label>入出金先銀行</label>
              <select id="master-bank-id">
                <option value="">(未選択)</option>
                ${items.filter(i => i.type === 'bank').map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>土日祝の調整</label>
              <select id="master-adjustment">
                <option value="none">調整なし</option>
                <option value="prev_weekday">前営業日 (金曜など)</option>
                <option value="next_weekday">翌営業日 (月曜など)</option>
              </select>
            </div>
            <div class="form-group">
              <label>有効期間 (開始日)</label>
              <input type="date" id="master-eff-start">
              <label style="margin-top:5px;">有効期間 (終了日)</label>
              <input type="date" id="master-eff-end">
            </div>
          ` : currentTab === 'banks' ? `
            <input type="hidden" id="master-type" value="bank">
            <div id="field-balance" class="form-group">
              <label>現在残高</label>
              <input type="number" id="master-balance" required>
            </div>
          ` : `
            <div class="form-group">
              <label>種別</label>
              <select id="loan-type">
                <option value="消費者金融">消費者金融</option>
                <option value="銀行カードローン">銀行カードローン</option>
                <option value="クレジットカード">クレジットカード</option>
                <option value="親族">親族</option>
                <option value="友人">友人</option>
              </select>
            </div>
            <div class="form-group">
              <label>年利 (%)</label>
              <input type="number" id="loan-rate" step="0.1" required>
            </div>
            <div class="form-group">
              <label>現在残高</label>
              <input type="number" id="loan-balance" required>
            </div>
            <div class="form-group">
              <label>月間返済額</label>
              <input type="number" id="loan-payment" required>
            </div>
            <div class="form-group">
              <label>限度額</label>
              <input type="number" id="loan-limit" required>
            </div>
            <div class="form-group">
              <label>返済日 (1-31)</label>
              <input type="number" id="loan-day" min="1" max="31" value="27">
            </div>
            <div class="form-group">
              <label>土日祝の調整</label>
              <select id="loan-adjustment">
                <option value="none">調整なし</option>
                <option value="prev_weekday">前営業日 (金曜など)</option>
                <option value="next_weekday">翌営業日 (月曜など)</option>
              </select>
            </div>
          `}
          
          <div class="modal-actions">
            <button type="button" onclick="hideModal()" class="btn">キャンセル</button>
            <button type="submit" class="btn primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // イベントリスナー
  container.querySelector('#add-btn').onclick = () => showModal();
  container.querySelector('#master-form').onsubmit = (e) => {
    e.preventDefault();
    saveData();
  };

  window.switchMasterTab = (tab) => {
    currentTab = tab;
    renderMaster(container);
  };

  window.editMasterItem = (id) => {
    const item = appStore.data.master.items.find(i => i.id === id);
    showModal(item);
  };

  window.editLoan = (id) => {
    const loan = appStore.data.master.loans.find(l => l.id === id);
    showModal(loan);
  };

  window.toggleMasterItem = (id) => {
    const item = appStore.data.master.items.find(i => i.id === id);
    appStore.updateMasterItem(id, { active: !item.active });
    if (appStore.data.settings?.driveSyncEnabled) {
      driveSync.push().catch(err => console.error('Auto drive push failed', err));
    }
    renderMaster(container);
  };

  window.toggleLoan = (id) => {
    const loan = appStore.data.master.loans.find(l => l.id === id);
    appStore.updateLoan(id, { active: !loan.active });
    if (appStore.data.settings?.driveSyncEnabled) {
      driveSync.push().catch(err => console.error('Auto drive push failed', err));
    }
    renderMaster(container);
  };

  window.deleteMasterItem = (id) => {
    if (confirm('この項目を完全に削除しますか？')) {
      appStore.deleteMasterItem(id);
      if (appStore.data.settings?.driveSyncEnabled) {
        driveSync.push().catch(err => console.error('Auto drive push failed', err));
      }
      window.showToast('削除しました', 'success');
      renderMaster(container);
    }
  };

  window.deleteLoan = (id) => {
    if (confirm('この借入先を完全に削除しますか？')) {
      appStore.deleteLoan(id);
      if (appStore.data.settings?.driveSyncEnabled) {
        driveSync.push().catch(err => console.error('Auto drive push failed', err));
      }
      window.showToast('削除しました', 'success');
      renderMaster(container);
    }
  };

  window.toggleMasterFormFields = () => {
    const typeEl = document.getElementById('master-type');
    if (!typeEl) return;
    const type = typeEl.value;
    const amountField = document.getElementById('field-amount');
    const ruleField = document.getElementById('field-rule');
    const balanceField = document.getElementById('field-balance');
    const bankSelectField = document.getElementById('field-bank-select');

    if (amountField) amountField.classList.toggle('hidden', type === 'bank');
    if (ruleField) ruleField.classList.toggle('hidden', type === 'bank');
    if (balanceField) balanceField.classList.toggle('hidden', type !== 'bank');
    if (bankSelectField) bankSelectField.classList.toggle('hidden', type === 'bank');
    
    if (type !== 'bank') {
      window.toggleRuleFields();
    }
  };

  window.toggleRuleFields = () => {
    const ruleType = document.getElementById('master-rule-type').value;
    const dayInput = document.getElementById('master-day');
    const weekdaySelect = document.getElementById('master-weekday');
    const nthInput = document.getElementById('master-nth');

    if (!dayInput) return;

    dayInput.classList.toggle('hidden', !['monthly', 'nextMonthDay'].includes(ruleType));
    weekdaySelect.classList.toggle('hidden', ruleType !== 'weekly');
    nthInput.classList.toggle('hidden', ruleType !== 'monthlyBusinessDay');
  };
}

function renderItemsList(items) {
  const bankMap = Object.fromEntries(appStore.data.master.items.filter(i => i.type === 'bank').map(b => [b.id, b.name]));
  
  return items.map(item => `
    <div class="master-item ${item.active ? '' : 'inactive'}">
      <div class="info">
        <span class="type ${item.type}">
          ${getIcon(item.name, item.type)} ${item.type === 'income' ? '収入' : '支出'}
        </span>
        <span class="name">${item.name}</span>
        <span class="amount">
          ${item.amountMode === 'variable' ? '見積: ' : ''}¥${item.amount.toLocaleString()}
        </span>
        <span class="day">${formatRule(item.scheduleRule || {type:'monthly', day:item.day})}</span>
        <div class="bank-link" style="font-size: 0.75rem; color: #6b7280; margin-top: 4px;">
          🏦 ${bankMap[item.bankId] || '(銀行未設定)'}
        </div>
      </div>
      <div class="actions">
        <button onclick="editMasterItem('${item.id}')" class="btn small">編集</button>
        <button onclick="toggleMasterItem('${item.id}')" class="btn small ${item.active ? 'warn' : 'success'}">
          ${item.active ? '無効化' : '有効化'}
        </button>
        <button onclick="deleteMasterItem('${item.id}')" class="btn small danger" style="padding: 4px; font-size: 0.7rem;">削除</button>
      </div>
    </div>
  `).join('');
}

function formatRule(rule) {
  if (!rule) return '設定なし';
  switch (rule.type) {
    case 'monthly': return `${rule.day}日`;
    case 'monthEnd': return '月末';
    case 'weekly': return `毎週${['日','月','火','水','木','金','土'][rule.weekday]}`;
    case 'nextMonthDay': return `翌月${rule.day}日`;
    case 'monthlyBusinessDay': return `第${rule.nth}営業日`;
    default: return '不明';
  }
}

function renderBanksList(banks) {
  return banks.map(bank => `
    <div class="master-item ${bank.active ? '' : 'inactive'}">
      <div class="info">
        <span class="type bank">${getIcon(bank.name, 'bank')} 銀行</span>
        <span class="name">${bank.name}</span>
        <span class="amount">残: ¥${(bank.currentBalance || 0).toLocaleString()}</span>
      </div>
      <div class="actions">
        <button onclick="editMasterItem('${bank.id}')" class="btn small">編集</button>
        <button onclick="toggleMasterItem('${bank.id}')" class="btn small ${bank.active ? 'warn' : 'success'}">
          ${bank.active ? '無効化' : '有効化'}
        </button>
        <button onclick="deleteMasterItem('${bank.id}')" class="btn small danger" style="padding: 4px; font-size: 0.7rem;">削除</button>
      </div>
    </div>
  `).join('');
}

function renderLoansList(loans) {
  return loans.map(loan => `
    <div class="master-item ${loan.active ? '' : 'inactive'}">
      <div class="info">
        <span class="type expense">${getIcon(loan.name, 'loan')} ${loan.type}</span>
        <span class="name">${loan.name}</span>
        <span class="amount">残: ¥${loan.currentBalance.toLocaleString()}</span>
        <span class="day">月: ¥${loan.monthlyPayment.toLocaleString()}</span>
      </div>
      <div class="actions">
        <button onclick="editLoan('${loan.id}')" class="btn small">編集</button>
        <button onclick="toggleLoan('${loan.id}')" class="btn small ${loan.active ? 'warn' : 'success'}">
          ${loan.active ? '無効化' : '有効化'}
        </button>
        <button onclick="deleteLoan('${loan.id}')" class="btn small danger" style="padding: 4px; font-size: 0.7rem;">削除</button>
      </div>
    </div>
  `).join('');
}

function showModal(data = null) {
  const modal = document.getElementById('master-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('master-form');

  if (data) {
    title.textContent = '編集';
    if (form['edit-id']) form['edit-id'].value = data.id;
    if (form['master-name']) form['master-name'].value = data.name;
    
    if (currentTab === 'items' || currentTab === 'banks') {
      if (form['master-type']) form['master-type'].value = data.type;
      if (form['master-amount']) form['master-amount'].value = data.amount || 0;
      if (form['master-amount-mode']) form['master-amount-mode'].value = data.amountMode || 'fixed';
      
      if (form['master-rule-type']) {
        const rule = data.scheduleRule || { type: 'monthly', day: data.day || 1 };
        form['master-rule-type'].value = rule.type;
        if (form['master-day']) form['master-day'].value = rule.day || 1;
        if (form['master-weekday']) form['master-weekday'].value = rule.weekday || 0;
        if (form['master-nth']) form['master-nth'].value = rule.nth || 1;
      }

      if (form['master-balance']) form['master-balance'].value = data.currentBalance || 0;
      if (form['master-bank-id']) form['master-bank-id'].value = data.bankId || '';
      if (form['master-adjustment']) form['master-adjustment'].value = data.adjustment || 'none';
      
      if (form['master-eff-start']) form['master-eff-start'].value = data.effective?.start || '';
      if (form['master-eff-end']) form['master-eff-end'].value = data.effective?.end || '';

      window.toggleMasterFormFields();
    } else if (currentTab === 'loans') {
      if (form['loan-type']) form['loan-type'].value = data.type;
      if (form['loan-rate']) form['loan-rate'].value = data.interestRate;
      if (form['loan-balance']) form['loan-balance'].value = data.currentBalance;
      if (form['loan-payment']) form['loan-payment'].value = data.monthlyPayment;
      if (form['loan-limit']) form['loan-limit'].value = data.maxLimit;
      if (form['loan-day']) form['loan-day'].value = data.paymentDay || 27;
      if (form['loan-adjustment']) form['loan-adjustment'].value = data.adjustment || 'none';
    }
  } else {
    title.textContent = '新規追加';
    form.reset();
    form['edit-id'].value = '';
  }
  modal.classList.remove('hidden');
}

window.hideModal = () => {
  document.getElementById('master-modal').classList.add('hidden');
}

function saveData() {
  const form = document.getElementById('master-form');
  const id = form['edit-id'].value;
  
  if (currentTab === 'items' || currentTab === 'banks') {
    const typeEl = form['master-type'];
    const type = typeEl ? typeEl.value : (currentTab === 'banks' ? 'bank' : 'expense');
    
    const ruleType = form['master-rule-type'] ? form['master-rule-type'].value : 'monthly';
    const scheduleRule = {
      type: ruleType,
      day: Number(form['master-day']?.value || 1),
      weekday: Number(form['master-weekday']?.value || 0),
      nth: Number(form['master-nth']?.value || 1)
    };

    const data = {
      name: form['master-name'] ? form['master-name'].value : '',
      type: type,
      amount: (type === 'bank' || !form['master-amount']) ? 0 : Number(form['master-amount'].value),
      amountMode: form['master-amount-mode'] ? form['master-amount-mode'].value : 'fixed',
      scheduleRule: type === 'bank' ? null : scheduleRule,
      day: scheduleRule.day, // v1 fallback
      bankId: (type === 'bank' || !form['master-bank-id']) ? '' : form['master-bank-id'].value,
      adjustment: (type === 'bank' || !form['master-adjustment']) ? 'none' : form['master-adjustment'].value,
      effective: {
        start: form['master-eff-start']?.value || null,
        end: form['master-eff-end']?.value || null
      },
      currentBalance: (type === 'bank' && form['master-balance']) ? Number(form['master-balance'].value) : 0
    };
    if (id) appStore.updateMasterItem(id, data);
    else appStore.addMasterItem(data);
  } else if (currentTab === 'loans') {
    const data = {
      name: form['master-name'] ? form['master-name'].value : '',
      type: form['loan-type'] ? form['loan-type'].value : '消費者金融',
      interestRate: Number(form['loan-rate'] ? form['loan-rate'].value : 0),
      currentBalance: Number(form['loan-balance'] ? form['loan-balance'].value : 0),
      monthlyPayment: Number(form['loan-payment'] ? form['loan-payment'].value : 0),
      maxLimit: Number(form['loan-limit'] ? form['loan-limit'].value : 0),
      paymentDay: Number(form['loan-day'] ? form['loan-day'].value : 27),
      adjustment: form['loan-adjustment'] ? form['loan-adjustment'].value : 'none'
    };
    if (id) appStore.updateLoan(id, data);
    else appStore.addLoan(data);
  }
  
  if (appStore.data.settings?.driveSyncEnabled) {
    driveSync.push().catch(err => console.error('Auto drive push failed', err));
  }
  
  hideModal();
  renderMaster(document.getElementById('app-container'));
}
