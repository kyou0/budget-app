import { store } from '../store.js';

let currentTab = 'items'; // 'items' | 'banks' | 'loans'

export function renderMaster(container) {
  const items = store.data.master.items;
  const loans = store.data.master.loans || [];

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
              <label>金額</label>
              <input type="number" id="master-amount" required>
            </div>
            <div id="field-day" class="form-group">
              <label>日</label>
              <input type="number" id="master-day" min="1" max="31" required>
            </div>
            <div id="field-bank-select" class="form-group">
              <label>入出金先銀行</label>
              <select id="master-bank-id">
                <option value="">(未選択)</option>
                ${items.filter(i => i.type === 'bank').map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
              </select>
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
    const item = store.data.master.items.find(i => i.id === id);
    showModal(item);
  };

  window.editLoan = (id) => {
    const loan = store.data.master.loans.find(l => l.id === id);
    showModal(loan);
  };

  window.toggleMasterItem = (id) => {
    const item = store.data.master.items.find(i => i.id === id);
    store.updateMasterItem(id, { active: !item.active });
    renderMaster(container);
  };

  window.toggleLoan = (id) => {
    const loan = store.data.master.loans.find(l => l.id === id);
    store.updateLoan(id, { active: !loan.active });
    renderMaster(container);
  };

  window.toggleMasterFormFields = () => {
    const type = document.getElementById('master-type').value;
    const amountField = document.getElementById('field-amount');
    const dayField = document.getElementById('field-day');
    const balanceField = document.getElementById('field-balance');

    if (type === 'bank') {
      amountField.classList.add('hidden');
      dayField.classList.add('hidden');
      balanceField.classList.remove('hidden');
      document.getElementById('field-bank-select').classList.add('hidden');
    } else {
      amountField.classList.remove('hidden');
      dayField.classList.remove('hidden');
      balanceField.classList.add('hidden');
      document.getElementById('field-bank-select').classList.remove('hidden');
    }
  };
}

function renderItemsList(items) {
  const bankMap = Object.fromEntries(store.data.master.items.filter(i => i.type === 'bank').map(b => [b.id, b.name]));
  
  return items.map(item => `
    <div class="master-item ${item.active ? '' : 'inactive'}">
      <div class="info">
        <span class="type ${item.type}">
          ${item.type === 'income' ? '収入' : '支出'}
        </span>
        <span class="name">${item.name}</span>
        <span class="amount">
          ¥${item.amount.toLocaleString()}
        </span>
        <span class="day">${item.day}日</span>
        <div class="bank-link" style="font-size: 0.75rem; color: #6b7280; margin-top: 4px;">
          🏦 ${bankMap[item.bankId] || '(銀行未設定)'}
        </div>
      </div>
      <div class="actions">
        <button onclick="editMasterItem('${item.id}')" class="btn small">編集</button>
        <button onclick="toggleMasterItem('${item.id}')" class="btn small ${item.active ? 'warn' : 'success'}">
          ${item.active ? '無効化' : '有効化'}
        </button>
      </div>
    </div>
  `).join('');
}

function renderBanksList(banks) {
  return banks.map(bank => `
    <div class="master-item ${bank.active ? '' : 'inactive'}">
      <div class="info">
        <span class="type bank">銀行</span>
        <span class="name">${bank.name}</span>
        <span class="amount">残: ¥${(bank.currentBalance || 0).toLocaleString()}</span>
      </div>
      <div class="actions">
        <button onclick="editMasterItem('${bank.id}')" class="btn small">編集</button>
        <button onclick="toggleMasterItem('${bank.id}')" class="btn small ${bank.active ? 'warn' : 'success'}">
          ${bank.active ? '無効化' : '有効化'}
        </button>
      </div>
    </div>
  `).join('');
}

function renderLoansList(loans) {
  return loans.map(loan => `
    <div class="master-item ${loan.active ? '' : 'inactive'}">
      <div class="info">
        <span class="type expense">${loan.type}</span>
        <span class="name">${loan.name}</span>
        <span class="amount">残: ¥${loan.currentBalance.toLocaleString()}</span>
        <span class="day">月: ¥${loan.monthlyPayment.toLocaleString()}</span>
      </div>
      <div class="actions">
        <button onclick="editLoan('${loan.id}')" class="btn small">編集</button>
        <button onclick="toggleLoan('${loan.id}')" class="btn small ${loan.active ? 'warn' : 'success'}">
          ${loan.active ? '無効化' : '有効化'}
        </button>
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
    form['edit-id'].value = data.id;
    form['master-name'].value = data.name;
    if (currentTab === 'items') {
      form['master-type'].value = data.type;
      form['master-amount'].value = data.amount || 0;
      form['master-day'].value = data.day || 1;
      form['master-balance'].value = data.currentBalance || 0;
      form['master-bank-id'].value = data.bankId || '';
      window.toggleMasterFormFields();
    } else {
      form['loan-type'].value = data.type;
      form['loan-rate'].value = data.interestRate;
      form['loan-balance'].value = data.currentBalance;
      form['loan-payment'].value = data.monthlyPayment;
      form['loan-limit'].value = data.maxLimit;
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
  
  if (currentTab === 'items') {
    const type = form['master-type'].value;
    const data = {
      name: form['master-name'].value,
      type: type,
      amount: type === 'bank' ? 0 : Number(form['master-amount'].value),
      day: type === 'bank' ? 1 : Number(form['master-day'].value),
      bankId: type === 'bank' ? '' : form['master-bank-id'].value,
      currentBalance: type === 'bank' ? Number(form['master-balance'].value) : 0
    };
    if (id) store.updateMasterItem(id, data);
    else store.addMasterItem(data);
  } else {
    const data = {
      name: form['master-name'].value,
      type: form['loan-type'].value,
      interestRate: Number(form['loan-rate'].value),
      currentBalance: Number(form['loan-balance'].value),
      monthlyPayment: Number(form['loan-payment'].value),
      maxLimit: Number(form['loan-limit'].value)
    };
    if (id) store.updateLoan(id, data);
    else store.addLoan(data);
  }
  
  hideModal();
  renderMaster(document.getElementById('app-container'));
}
