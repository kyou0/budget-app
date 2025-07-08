// ===================================================================================
// グローバル変数 & 初期設定
// ===================================================================================

const PAYMENT_DAY_RULES = {
  END_OF_MONTH_WEEKDAY: 'EOM', // 月末平日
};

const ITEM_TYPES = {
  INCOME: 'income',
  LOAN: 'loan',
  CARD: 'card',
  FIXED: 'fixed',
  BANK: 'bank',
  TAX: 'tax',
  VARIABLE: 'variable',
};

let currentUser = null;
let masterData = [];
let loginMode = 'local';
let currentCategory = 'all';
let editingItemId = null;

// ===================================================================================
// 初期化処理
// ===================================================================================
// js/master.js

document.addEventListener('DOMContentLoaded', async function() { // <-- asyncを追加
  console.log('🚀 マスター管理ページ起動');
  const appContainer = document.getElementById('appContainer');

  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (!savedUserJSON) {
    window.location.href = 'index.html';
    return;
  }

  appContainer.style.display = 'block';
  currentUser = JSON.parse(savedUserJSON);
  loginMode = currentUser.mode;

  document.getElementById('userName').textContent = currentUser.name;

  populatePaymentDaySelect();

  try {
    await loadData();
    renderAll();
  } catch (error) {
    console.error("初期化処理中にエラーが発生しました:", error);
    showNotification('データの読み込みに失敗しました。', 'error');
  }

  // --- イベントリスナー ---
  document.getElementById('itemType')?.addEventListener('change', updateFormFields);

  document.getElementById('itemsGrid').addEventListener('click', async function(event) {
    const button = event.target.closest('button.btn-action');
    if (!button) return;
    const card = button.closest('.item-card');
    if (!card) return;
    const itemId = parseInt(card.dataset.id, 10);

    if (button.classList.contains('edit')) {
      showEditForm(itemId);
    } else if (button.classList.contains('delete')) {
      await deleteItem(itemId);
    }
  });
});

// ===================================================================================
// データ管理
// ===================================================================================
async function loadData() {
  const dataKey = 'budgetAppData';
  const savedData = localStorage.getItem(dataKey);
  if (savedData) {
    try {
      const parsedData = JSON.parse(savedData);
      masterData = parsedData.master || [];
      console.log(`📂 [${loginMode}モード] ストレージからデータを読み込みました。`);
    } catch (e) {
      console.error("データの解析に失敗:", e);
      masterData = [];
    }
  } else {
    console.log('ストレージにデータがありません。');
    masterData = [];
  }
}

// ===================================================================================
// メイン描画処理
// ===================================================================================
function renderAll() {
  renderMasterList();
  updateStats();
  updateCategoryCounts();
}

// js/master.js

// js/master.js

// js/master.js

function renderMasterList() {
  const itemsGrid = document.getElementById('itemsGrid');
  itemsGrid.innerHTML = '';
  const filteredData = currentCategory === 'all' ? masterData : masterData.filter(item => item.type === currentCategory);

  if (filteredData.length === 0) {
    itemsGrid.innerHTML = `<div class="empty-list-message">表示する項目がありません。</div>`;
    return;
  }

  filteredData.sort((a, b) => a.name.localeCompare(b.name, 'ja')).forEach(item => {
    const itemCard = document.createElement('div');
    itemCard.className = 'item-card';
    itemCard.dataset.id = item.id;

    const icon = {
      [ITEM_TYPES.INCOME]: '💰', [ITEM_TYPES.LOAN]: '💸', [ITEM_TYPES.CARD]: '💳',
      [ITEM_TYPES.FIXED]: '🏠', [ITEM_TYPES.BANK]: '🏦', [ITEM_TYPES.TAX]: '🏛️',
      [ITEM_TYPES.VARIABLE]: '🛒'
    }[item.type] || '📄';

    const amountColor = item.amount >= 0 ? 'income' : 'expense';
    const statusClass = item.isActive ? 'active' : '';
    const statusText = item.isActive ? '✅ 有効' : '❌ 無効';

    const amountLabels = {
      [ITEM_TYPES.INCOME]: '収入額:', [ITEM_TYPES.CARD]: '想定利用額:', [ITEM_TYPES.FIXED]: '固定費額:',
      [ITEM_TYPES.TAX]: '税金額:', [ITEM_TYPES.LOAN]: '月々返済額:', [ITEM_TYPES.VARIABLE]: '想定予算額:',
      [ITEM_TYPES.BANK]: '現在の残高:'
    };
    const amountLabelText = amountLabels[item.type] || '金額:';
    const amountText = `¥${Math.abs(item.amount).toLocaleString()}`;

    let paymentDayText = '未設定';
    if (item.paymentDay) {
      if (item.paymentDay === PAYMENT_DAY_RULES.END_OF_MONTH_WEEKDAY) {
        paymentDayText = '月末の平日';
      } else {
        paymentDayText = `${item.paymentDay}日`;
      }
    }

    let bankInfo = '';
    if (item.sourceBankId) {
      const bank = masterData.find(b => b.id === item.sourceBankId);
      if (bank) {
        const label = item.type === ITEM_TYPES.INCOME ? '振込先:' : '支払元:';
        bankInfo = `<div class="item-detail"><span class="item-label">${label}</span><span class="item-value">${bank.name}</span></div>`;
      }
    }

    let contractInfo = '';
    if (item.type === ITEM_TYPES.INCOME && item.contractStartDate) {
      const start = new Date(item.contractStartDate).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
      const end = item.contractEndDate ? new Date(item.contractEndDate).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '継続中';
      contractInfo = `<div class="item-detail"><span class="item-label">契約期間:</span><span class="item-value">${start} 〜 ${end}</span></div>`;
    }

    let loanDetailsHtml = '';
    if (item.type === ITEM_TYPES.LOAN && item.loanDetails) {
      loanDetailsHtml = `
        <hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">
        <div class="item-detail"><span class="item-label">現在の残高:</span><span class="item-value expense">¥${item.loanDetails.currentBalance.toLocaleString()}</span></div>
        <div class="item-detail"><span class="item-label">年利率:</span><span class="item-value">${item.loanDetails.interestRate}%</span></div>
      `;
    }

    itemCard.innerHTML = `
      <div class="item-card-header"><span class="item-icon">${icon}</span><h4 class="item-name">${item.name}</h4><span class="item-status ${statusClass}">${statusText}</span></div>
      <div class="item-card-body">
          <div class="item-detail"><span class="item-label">${amountLabelText}</span><span class="item-value ${amountColor}">${amountText}</span></div>
          <div class="item-detail"><span class="item-label">支払日:</span><span class="item-value">${paymentDayText}</span></div>
          ${bankInfo}
          ${contractInfo}
          ${loanDetailsHtml}
      </div>
      <div class="item-card-actions">
          <button class="btn-action edit">✏️ 編集</button>
          <button class="btn-action delete">🗑️ 削除</button>
      </div>`;
    itemsGrid.appendChild(itemCard);
  });
}

// ===================================================================================
// フォーム関連の処理
// ===================================================================================
function showAddForm() {
  editingItemId = null;
  const form = document.getElementById('addForm');
  form.style.display = 'block';
  form.reset();
  document.getElementById('formTitle').textContent = '➕ 新規項目追加';
  document.getElementById('isActive').value = 'true';
  form.scrollIntoView({ behavior: 'smooth' });
  updateFormFields();
  populateBankSelect();
}

// js/master.js

function showEditForm(itemId) {
  const itemToEdit = masterData.find(item => item.id === itemId);
  if (!itemToEdit) return;
  editingItemId = itemId;

  document.getElementById('itemName').value = itemToEdit.name;
  document.getElementById('itemType').value = itemToEdit.type;
  document.getElementById('itemAmount').value = String(Math.abs(itemToEdit.amount));
  document.getElementById('paymentDay').value = itemToEdit.paymentDay ? String(itemToEdit.paymentDay) : '';
  document.getElementById('isActive').value = String(itemToEdit.isActive);

  // ▼▼▼ 契約期間の表示処理を追加 ▼▼▼
  document.getElementById('contractStartDate').value = itemToEdit.contractStartDate || '';
  document.getElementById('contractEndDate').value = itemToEdit.contractEndDate || '';
  // ▲▲▲

  updateFormFields();
  populateBankSelect();

  if (itemToEdit.sourceBankId) {
    document.getElementById('itemSourceBank').value = String(itemToEdit.sourceBankId);
  }

  if (itemToEdit.type === ITEM_TYPES.LOAN && itemToEdit.loanDetails) {
    document.getElementById('initialAmount').value = String(itemToEdit.loanDetails.initialAmount || '');
    document.getElementById('loanDate').value = itemToEdit.loanDetails.loanDate || '';
    document.getElementById('interestRate').value = String(itemToEdit.loanDetails.interestRate || '');
    document.getElementById('currentBalance').value = String(itemToEdit.loanDetails.currentBalance || '');
    document.getElementById('loanType').value = itemToEdit.loanDetails.loanType || '消費者金融';
    document.getElementById('maxLimit').value = String(itemToEdit.loanDetails.maxLimit || '');
  }

  document.getElementById('formTitle').textContent = '✏️ 項目の編集';
  document.getElementById('addForm').style.display = 'block';
  document.getElementById('addForm').scrollIntoView({ behavior: 'smooth' });
}

function hideAddForm() {
  document.getElementById('addForm').style.display = 'none';
  editingItemId = null;
}

// js/master.js

async function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  const type = document.getElementById('itemType').value;
  let amount = parseInt(document.getElementById('itemAmount').value, 10);
  const isActive = document.getElementById('isActive').value === 'true';
  const sourceBankId = document.getElementById('itemSourceBank').value;

  if (!name || !type || isNaN(amount)) {
    showNotification('項目名、種別、基準額は必須です。', 'error');
    return;
  }

  // ▼▼▼ 収入モデルに応じたデータ保存 ▼▼▼
  let itemData = { name, type, amount, isActive };

  if (type === ITEM_TYPES.INCOME) {
    const incomeModel = document.getElementById('incomeType').value;
    itemData.incomeModel = incomeModel; // 'fixed' or 'dynamic'

    if (incomeModel === 'fixed') {
      const paymentDayValue = document.getElementById('paymentDay').value;
      itemData.paymentDay = paymentDayValue === PAYMENT_DAY_RULES.END_OF_MONTH_WEEKDAY
        ? PAYMENT_DAY_RULES.END_OF_MONTH_WEEKDAY
        : (parseInt(paymentDayValue, 10) || null);
      itemData.contractStartDate = document.getElementById('contractStartDate').value || null;
      itemData.contractEndDate = document.getElementById('contractEndDate').value || null;
    } else if (incomeModel === 'dynamic') {
      itemData.hourlyRate = parseInt(document.getElementById('hourlyRate').value, 10) || 0;
      itemData.workingHoursPerDay = parseInt(document.getElementById('workingHoursPerDay').value, 10) || 0;
      itemData.closingDay = document.getElementById('closingDay').value;
      itemData.paymentMonthOffset = parseInt(document.getElementById('paymentMonthOffset').value, 10);
      itemData.paymentDayRule = parseInt(document.getElementById('paymentDayRule').value, 10);
      itemData.workingDays = Array.from(document.querySelectorAll('#workingDays input:checked')).map(cb => parseInt(cb.value, 10));
      // 動的収入ではamountは基準単価として扱う
      itemData.amount = itemData.hourlyRate;
    }
  } else {
    // 収入以外の項目の処理
    const paymentDayValue = document.getElementById('paymentDay').value;
    itemData.paymentDay = paymentDayValue === PAYMENT_DAY_RULES.END_OF_MONTH_WEEKDAY
      ? PAYMENT_DAY_RULES.END_OF_MONTH_WEEKDAY
      : (parseInt(paymentDayValue, 10) || null);

    if ([ITEM_TYPES.FIXED, ITEM_TYPES.TAX, ITEM_TYPES.LOAN, ITEM_TYPES.CARD, ITEM_TYPES.VARIABLE].includes(type)) {
      itemData.amount = -Math.abs(amount);
    } else {
      itemData.amount = Math.abs(amount);
    }
  }

  if (sourceBankId) {
    itemData.sourceBankId = parseInt(sourceBankId, 10);
  }
  // ▲▲▲

  // ... (借金関連の処理は変更なし) ...

  if (editingItemId !== null) {
    const itemIndex = masterData.findIndex(item => item.id === editingItemId);
    if (itemIndex > -1) {
      // 既存のIDとloanDetailsは維持しつつ、新しいデータで上書き
      const existingItem = masterData[itemIndex];
      masterData[itemIndex] = { ...existingItem, ...itemData };
      showNotification(`✅ 「${name}」を更新しました。`);
    }
  } else {
    const newItem = { id: Date.now(), ...itemData };
    masterData.push(newItem);
    showNotification(`✅ 「${name}」を新しく追加しました。`);
  }

  await saveData();
  renderAll();
  hideAddForm();
}

// js/master.js

function updateFormFields() {
  const itemType = document.getElementById('itemType').value;
  const amountLabel = document.querySelector('label[for="itemAmount"]');
  const amountInput = document.getElementById('itemAmount');
  const paymentDayGroup = document.getElementById('paymentDay').parentElement;
  const sourceBankGroup = document.getElementById('itemSourceBank').parentElement;

  // ▼▼▼ 新しいUI要素を取得 ▼▼▼
  const incomeTypeSelector = document.querySelector('.income-type-selector');
  const allIncomeFields = document.querySelectorAll('.income-field');
  const fixedIncomeFields = document.querySelectorAll('.fixed-income-fields');
  const dynamicIncomeFields = document.querySelectorAll('.dynamic-income-fields');
  const incomeModel = document.getElementById('incomeType').value;
  // ▲▲▲

  // 全ての専用フィールドを一旦非表示にする
  document.querySelectorAll('.loan-field').forEach(el => el.style.display = 'none');
  sourceBankGroup.style.display = 'none';
  incomeTypeSelector.style.display = 'none';
  allIncomeFields.forEach(el => el.style.display = 'none');


  const labels = {
    [ITEM_TYPES.INCOME]: '基準額 *', // ラベルを汎用的に変更
    [ITEM_TYPES.CARD]: '想定利用額 *',
    [ITEM_TYPES.FIXED]: '固定費額 *',
    [ITEM_TYPES.TAX]: '税金額 *',
    [ITEM_TYPES.LOAN]: '月々返済額 *',
    [ITEM_TYPES.VARIABLE]: '想定予算額 *',
    [ITEM_TYPES.BANK]: '現在の預金残高 *'
  };
  amountLabel.textContent = labels[itemType] || '金額 *';
  amountInput.placeholder = '例: 50000 (数字のみ入力)';

  if (itemType === ITEM_TYPES.BANK) {
    paymentDayGroup.style.display = 'none';
  } else {
    if (itemType) {
      sourceBankGroup.style.display = 'flex';
    }
    if (itemType === ITEM_TYPES.LOAN) {
      document.querySelectorAll('.loan-field').forEach(el => el.style.display = 'flex');
    }

    // ▼▼▼ 収入モデルに応じたUI制御 ▼▼▼
    if (itemType === ITEM_TYPES.INCOME) {
      incomeTypeSelector.style.display = 'flex';
      paymentDayGroup.style.display = 'none'; // 収入モデルでは使わないので非表示

      if (incomeModel === 'fixed') {
        fixedIncomeFields.forEach(el => el.style.display = 'flex');
        paymentDayGroup.style.display = 'flex'; // 固定収入では従来の支払日を使う
        amountLabel.textContent = '固定月収額 *';
      } else if (incomeModel === 'dynamic') {
        dynamicIncomeFields.forEach(el => el.style.display = 'flex');
        amountLabel.textContent = '時給 / 単価 *';
      }
    } else {
      paymentDayGroup.style.display = 'flex'; // 収入以外では表示
    }
    // ▲▲▲
  }
}

function populateBankSelect() {
  const bankSelect = document.getElementById('itemSourceBank');
  bankSelect.innerHTML = '<option value="">-- 銀行を選択 --</option>';
  // ▼▼▼ 定数を使用 ▼▼▼
  const banks = masterData.filter(item => item.type === ITEM_TYPES.BANK && item.isActive);
  banks.forEach(bank => {
    const option = document.createElement('option');
    option.value = bank.id;
    option.textContent = bank.name;
    bankSelect.appendChild(option);
  });
}

/**
 * 支払日のセレクトボックスに選択肢を生成する
 */
function populatePaymentDaySelect() {
  const select = document.getElementById('paymentDay');
  if (!select) return;
  const specificDaysGroup = select.querySelector('optgroup[label="特定の日付"]');
  if (!specificDaysGroup) return;

  let options = '';
  for (let i = 1; i <= 31; i++) {
    options += `<option value="${i}">${i}日</option>`;
  }
  specificDaysGroup.innerHTML = options;
}


// ===================================================================================
// UI補助機能 (統計、カテゴリ、データ操作など)
// ===================================================================================
function updateStats() {
  const totalItems = masterData.length;
  const activeItems = masterData.filter(item => item.isActive).length;
  const totalDebt = masterData
    .filter(item => item.type === ITEM_TYPES.LOAN && item.isActive && item.loanDetails)
    .reduce((sum, item) => sum + (item.loanDetails.currentBalance || 0), 0);
  const monthlyRepayment = masterData
    .filter(item => item.type === ITEM_TYPES.LOAN && item.isActive)
    .reduce((sum, item) => sum + Math.abs(item.amount), 0);

  document.getElementById('statTotalItems').textContent = totalItems;
  document.getElementById('statActiveItems').textContent = activeItems;
  document.getElementById('statTotalDebt').textContent = `¥${totalDebt.toLocaleString()}`;
  document.getElementById('statMonthlyRepayment').textContent = `¥${monthlyRepayment.toLocaleString()}`;
}

// js/master.js

function updateCategoryCounts() {
  const counts = {
    all: masterData.length,
    [ITEM_TYPES.INCOME]: masterData.filter(i => i.type === ITEM_TYPES.INCOME).length,
    [ITEM_TYPES.LOAN]: masterData.filter(i => i.type === ITEM_TYPES.LOAN).length,
    [ITEM_TYPES.CARD]: masterData.filter(i => i.type === ITEM_TYPES.CARD).length,
    [ITEM_TYPES.FIXED]: masterData.filter(i => i.type === ITEM_TYPES.FIXED).length,
    [ITEM_TYPES.BANK]: masterData.filter(i => i.type === ITEM_TYPES.BANK).length,
    [ITEM_TYPES.TAX]: masterData.filter(i => i.type === ITEM_TYPES.TAX).length,
    [ITEM_TYPES.VARIABLE]: masterData.filter(i => i.type === ITEM_TYPES.VARIABLE).length,
  };

  // HTMLのIDと合わせるため、キーをキャピタライズするロジックはそのまま
  for (const key in counts) {
    const idSuffix = key === 'all' ? 'All' : key.charAt(0).toUpperCase() + key.slice(1);
    const el = document.getElementById(`count${idSuffix}`);
    if (el) {
      el.textContent = counts[key];
    }
  }
}

function showCategory(category, element) {
  currentCategory = category;
  document.getElementById('categoryTitle').innerHTML = `${element.querySelector('.category-info').innerHTML} の項目`;
  document.querySelectorAll('.category-item').forEach(item => item.classList.remove('active'));
  element.classList.add('active');
  hideAddForm();
  renderMasterList();
}

async function deleteItem(itemId) {
  const item = masterData.find(i => i.id === itemId);
  if (!item) return;
  if (confirm(`「${item.name}」を本当に削除しますか？この操作は元に戻せません。`)) {
    masterData = masterData.filter(i => i.id !== itemId);
    showNotification(`🗑️ 「${item.name}」を削除しました。`);
    await saveData();
    renderAll();
  }
}

async function loadSampleData() {
  if (confirm('現在のデータは上書きされます。サンプルデータを読み込みますか？')) {
    masterData = getSampleData();
    showNotification('📋 サンプルデータを読み込みました。');
    await saveData();
    renderAll();
  }
}

function exportData() {
  if (masterData.length === 0) {
    showNotification('エクスポートするデータがありません。', 'warning');
    return;
  }
  const dataStr = JSON.stringify(masterData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'budget-data.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showNotification('📤 データのエクスポートを開始しました。');
}

async function resetAllData() {
  if (confirm('本当にすべてのデータをリセットしますか？この操作は元に戻せません。')) {
    masterData = [];
    await saveData();
    showNotification('🔄 全データをリセットしました。', 'error');
    renderAll();
  }
}