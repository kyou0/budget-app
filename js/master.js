// ===================================================================================
// グローバル変数 & 初期設定
// ===================================================================================
let masterData = [];
let oneTimeEvents = [];
let currentUser = null;
let loginMode = 'local';
let currentCategory = 'all';
let editingItemId = null;

// ===================================================================================
// 初期化処理 & ログインチェック
// ===================================================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 マスター管理ページ起動');

  // ★★★ ページが表示されるたびにデータを再読み込みするセンサーを設置 ★★★
  document.addEventListener('visibilitychange', () => {
    // ページが非表示から表示に切り替わった時だけ実行
    if (document.visibilityState === 'visible') {
      console.log('👁️ マスターページが再表示されました。データを更新します。');
      reloadDataAndRender();
    }
  });

  // 初回読み込み
  reloadDataAndRender();
  setupEventListeners();
});

/**
 * localStorageから最新のデータを読み込み、画面全体を再描画する
 */
function reloadDataAndRender() {
  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (!savedUserJSON) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('appContainer').style.display = 'block';
  currentUser = JSON.parse(savedUserJSON);
  loginMode = currentUser.mode;
  document.getElementById('userName').textContent = currentUser.name;

  const savedData = localStorage.getItem('budgetAppData');
  if (savedData) {
    const parsedData = JSON.parse(savedData);
    masterData = parsedData.master || [];
    oneTimeEvents = parsedData.events || [];
  } else {
    masterData = [];
    oneTimeEvents = [];
  }

  // 画面の再描画
  updateStats();
  renderItems(currentCategory);
  updateCategoryCounts();
}

// ===================================================================================
// イベントリスナー設定
// ===================================================================================
function setupEventListeners() {
  // カテゴリ選択
  document.getElementById('categoryList').addEventListener('click', (e) => {
    const target = e.target.closest('.category-item');
    if (target) {
      currentCategory = target.dataset.category;
      showCategory(currentCategory, target);
    }
  });

  // フォームの種別変更
  document.getElementById('itemType').addEventListener('change', updateFormFields);

  // フォームの保存・キャンセル
  document.querySelector('.form-actions .btn-primary').addEventListener('click', saveItem);
  document.querySelector('.form-actions .btn-secondary').addEventListener('click', hideAddForm);

  // データ管理ボタン
  document.querySelector('.data-management-actions .btn-primary').addEventListener('click', showAddForm);
  document.querySelector('.data-management-actions .btn-secondary').addEventListener('click', loadSampleData);
  document.querySelector('.data-management-actions .btn-info').addEventListener('click', exportData);
  document.querySelector('.data-management-actions .btn-danger').addEventListener('click', resetAllData);

  // 項目リストの編集・削除（イベント委任）
  document.getElementById('itemsGrid').addEventListener('click', async (e) => {
    const button = e.target.closest('button.btn-small');
    if (!button) return;

    const card = button.closest('.item-card');
    const itemId = parseInt(card.dataset.id, 10);

    if (button.classList.contains('edit')) {
      showEditForm(itemId);
    } else if (button.classList.contains('delete')) {
      await deleteItem(itemId);
    }
  });
}

// ===================================================================================
// データ管理 (司令塔への通知役)
// ===================================================================================
/**
 * [master.js専用] 変更されたデータを司令塔(index.js)に通知する
 */
async function notifyDataChange() {
  const dataToSave = { master: masterData, events: oneTimeEvents };
  // 1. まず、他のページが最新データを読み込めるようにローカルストレージを更新する
  localStorage.setItem('budgetAppData', JSON.stringify(dataToSave));
  console.log('💾 [master.js] データをローカルに一時保存しました。');

  // 2. 次に、司令塔(index.js)にデータの保存と同期を依頼する
  dataChannel.postMessage({
    type: 'SAVE_DATA_REQUEST',
    payload: dataToSave
  });
  console.log('📡 [master.js] 司令塔にデータ同期をリクエストしました。');
}

/**
 * [master.js専用] 変更されたデータをlocalStorageに一時保存し、司令塔に通知する
 */
async function saveData() {
  // 1. まず、他のページが最新データを読み込めるようにローカルストレージを更新する
  const existingData = JSON.parse(localStorage.getItem('budgetAppData') || '{}');
  const dataToSave = {
    master: masterData,
    events: existingData.events || [] // 既存のイベントデータを保持
  };
  localStorage.setItem('budgetAppData', JSON.stringify(dataToSave));
  console.log('💾 [master.js] データをローカルに一時保存しました。');

  // 2. 次に、司令塔(index.js)にデータの保存と同期を依頼する
  dataChannel.postMessage({
    type: 'SAVE_DATA_REQUEST',
    payload: dataToSave
  });
  console.log('📡 [master.js] 司令塔にデータ同期をリクエストしました。');
}

// ===================================================================================
// UI描画
// ===================================================================================
function renderAll() {
  renderMasterList();
  updateStats();
  updateCategoryCounts();
  populatePaymentDaySelect();
}

function renderMasterList() {
  const itemsGrid = document.getElementById('itemsGrid');
  itemsGrid.innerHTML = '';

  const filteredData = masterData.filter(item =>
    currentCategory === 'all' || item.type === currentCategory
  );

  if (filteredData.length === 0) {
    itemsGrid.innerHTML = '<p class="no-data-message">このカテゴリには項目がありません。</p>';
    return;
  }

  filteredData.forEach(item => {
    const card = document.createElement('div');
    card.className = `item-card ${item.type} ${item.isActive ? '' : 'inactive'}`;
    card.dataset.id = item.id;

    let amountDisplay = '';
    if (item.amount) {
      amountDisplay = `<div class="item-amount">¥${Math.abs(item.amount).toLocaleString()}</div>`;
    }

    card.innerHTML = `
            <div class="item-card-header">
                <span class="item-name">${item.name}</span>
                <span class="item-status ${item.isActive ? 'active' : ''}">${item.isActive ? '✅ 有効' : '❌ 無効'}</span>
            </div>
            ${amountDisplay}
            <div class="item-actions">
                <button class="btn-small btn-action edit">編集</button>
                <button class="btn-small btn-action delete">削除</button>
            </div>
        `;
    itemsGrid.appendChild(card);
  });
}

function updateStats() {
  const activeItems = masterData.filter(item => item.isActive);
  const loans = activeItems.filter(item => item.type === 'loan' && item.loanDetails);
  const totalDebt = loans.reduce((sum, item) => sum + item.loanDetails.currentBalance, 0);
  const monthlyRepayment = loans.reduce((sum, item) => sum + Math.abs(item.amount), 0);

  document.getElementById('statTotalItems').textContent = masterData.length;
  document.getElementById('statActiveItems').textContent = activeItems.length;
  document.getElementById('statTotalDebt').textContent = `¥${totalDebt.toLocaleString()}`;
  document.getElementById('statMonthlyRepayment').textContent = `¥${monthlyRepayment.toLocaleString()}`;
}

function updateCategoryCounts() {
  const counts = { all: masterData.length };
  Object.values(ITEM_TYPES).forEach(type => {
    counts[type] = masterData.filter(item => item.type === type).length;
    const countEl = document.getElementById(`count${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (countEl) {
      countEl.textContent = counts[type];
    }
  });
  document.getElementById('countAll').textContent = counts.all;
}

function populatePaymentDaySelect() {
  const paymentDaySelect = document.getElementById('paymentDay');
  const specificDaysGroup = paymentDaySelect.querySelector('optgroup[label="特定の日付"]');
  specificDaysGroup.innerHTML = ''; // Clear existing options
  for (let i = 1; i <= 31; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `${i}日`;
    specificDaysGroup.appendChild(option);
  }
}

// ===================================================================================
// フォームと項目管理
// ===================================================================================
function showCategory(category, element) {
  currentCategory = category;
  document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
  element.classList.add('active');
  const categoryName = element.querySelector('.category-info span').textContent;
  document.getElementById('categoryTitle').textContent = `${categoryName}の項目`;
  renderMasterList();
}

function showAddForm() {
  editingItemId = null;
  document.getElementById('addForm').reset();
  document.getElementById('formTitle').textContent = '➕ 新規項目追加';
  document.getElementById('addForm').style.display = 'block';
  updateFormFields();
  populateBankSelect();
}

function showEditForm(itemId) {
  const item = masterData.find(i => i.id === itemId);
  if (!item) return;

  editingItemId = itemId;
  document.getElementById('addForm').reset();
  document.getElementById('formTitle').textContent = `✏️ 「${item.name}」を編集`;

  document.getElementById('itemName').value = item.name;
  document.getElementById('itemType').value = item.type;
  document.getElementById('isActive').value = String(item.isActive);

  populateBankSelect(); // 先に銀行リストを生成
  document.getElementById('itemSourceBank').value = item.sourceBankId || '';

  if (item.type === ITEM_TYPES.INCOME && item.incomeDetails) {
    const details = item.incomeDetails;
    document.getElementById('itemAmount').value = details.baseAmount;
    document.getElementById('baseAmount').value = details.baseAmount;
    document.getElementById('workingDaysPerMonth').value = details.workingDaysPerMonth || '';
    document.getElementById('contractStartDate').value = details.contractStartDate || '';
    document.getElementById('contractEndDate').value = details.contractEndDate || '';
    document.getElementById('closingDay').value = details.closingDay || 'EOM';
    document.getElementById('paymentMonthOffset').value = details.paymentMonthOffset;
    document.getElementById('paymentDate').value = details.paymentDate || '';
  } else {
    document.getElementById('itemAmount').value = Math.abs(item.amount) || '';
    document.getElementById('paymentDay').value = item.paymentDay || '';
  }

  if (item.type === ITEM_TYPES.LOAN && item.loanDetails) {
    const details = item.loanDetails;
    document.getElementById('initialAmount').value = details.initialAmount || '';
    document.getElementById('loanDate').value = details.loanDate || '';
    document.getElementById('interestRate').value = details.interestRate || '';
    document.getElementById('currentBalance').value = details.currentBalance || '';
    document.getElementById('loanType').value = details.loanType || '消費者金融';
    document.getElementById('maxLimit').value = details.maxLimit || '';
  }

  updateFormFields();
  document.getElementById('addForm').style.display = 'block';
  window.scrollTo(0, document.getElementById('addForm').offsetTop);
}

function hideAddForm() {
  document.getElementById('addForm').style.display = 'none';
}

function updateFormFields() {
  const type = document.getElementById('itemType').value;
  document.querySelectorAll('.income-field, .loan-field').forEach(el => el.style.display = 'none');
  document.getElementById('itemAmount').parentElement.style.display = 'flex';
  document.getElementById('paymentDay').parentElement.style.display = 'flex';
  document.getElementById('itemSourceBank').parentElement.style.display = 'flex';

  if (type === 'income') {
    document.querySelectorAll('.income-field').forEach(el => el.style.display = 'flex');
    document.getElementById('itemAmount').parentElement.style.display = 'none';
    document.getElementById('paymentDay').parentElement.style.display = 'none';
  } else if (type === 'loan') {
    document.querySelectorAll('.loan-field').forEach(el => el.style.display = 'flex');
  } else if (type === 'bank') {
    document.getElementById('paymentDay').parentElement.style.display = 'none';
    document.getElementById('itemSourceBank').parentElement.style.display = 'none';
  }
}

function populateBankSelect() {
  const bankSelect = document.getElementById('itemSourceBank');
  bankSelect.innerHTML = '<option value="">-- 銀行を選択 --</option>';
  const banks = masterData.filter(item => item.type === 'bank');
  banks.forEach(bank => {
    const option = document.createElement('option');
    option.value = bank.id;
    option.textContent = bank.name;
    bankSelect.appendChild(option);
  });
}

async function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  const type = document.getElementById('itemType').value;
  const isActive = document.getElementById('isActive').value === 'true';
  const sourceBankId = document.getElementById('itemSourceBank').value;

  let itemData = { name, type, isActive };
  if (sourceBankId) {
    itemData.sourceBankId = parseInt(sourceBankId, 10);
  }

  if (type === ITEM_TYPES.INCOME) {
    const baseAmount = parseInt(document.getElementById('baseAmount').value, 10);
    if (isNaN(baseAmount)) {
      showNotification('収入の場合、基準月収は必須です。', 'error');
      return;
    }
    itemData.amount = baseAmount;
    itemData.incomeDetails = {
      baseAmount: baseAmount,
      workingDaysPerMonth: parseInt(document.getElementById('workingDaysPerMonth').value, 10) || 20,
      contractStartDate: document.getElementById('contractStartDate').value || null,
      contractEndDate: document.getElementById('contractEndDate').value || null,
      closingDay: document.getElementById('closingDay').value,
      paymentMonthOffset: parseInt(document.getElementById('paymentMonthOffset').value, 10),
      paymentDate: parseInt(document.getElementById('paymentDate').value, 10) || null,
    };
  } else {
    let amount = parseInt(document.getElementById('itemAmount').value, 10);
    if (!name || !type || isNaN(amount)) {
      showNotification('項目名、種別、金額は必須です。', 'error');
      return;
    }
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

  if (type === ITEM_TYPES.LOAN) {
    const interestRate = parseFloat(document.getElementById('interestRate').value);
    const currentBalance = parseInt(document.getElementById('currentBalance').value, 10);
    if (isNaN(interestRate) || isNaN(currentBalance)) {
      showNotification('借金の場合、年利率と現在の残高は必須です。', 'error');
      return;
    }
    itemData.loanDetails = {
      initialAmount: parseInt(document.getElementById('initialAmount').value, 10) || 0,
      loanDate: document.getElementById('loanDate').value || null,
      interestRate: interestRate,
      currentBalance: Math.abs(currentBalance),
      loanType: document.getElementById('loanType').value,
      maxLimit: parseInt(document.getElementById('maxLimit').value, 10) || 0,
    };
  }

  if (editingItemId !== null) {
    const itemIndex = masterData.findIndex(item => item.id === editingItemId);
    if (itemIndex > -1) {
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

// ===================================================================================
// データ管理機能 (インポート/エクスポートなど)
// ===================================================================================
function getSampleData() {
  return [
    { id: 1, name: "A社業務委託", type: "income", isActive: true, amount: 300000, incomeDetails: { baseAmount: 300000, workingDaysPerMonth: 20, contractStartDate: "2023-04-01", contractEndDate: null, closingDay: "EOM", paymentMonthOffset: 1, paymentDate: 15 } },
    { id: 2, name: "家賃", type: "fixed", isActive: true, amount: -85000, paymentDay: 27 },
    { id: 3, name: "楽天カード", type: "card", isActive: true, amount: -50000, paymentDay: 27 },
    { id: 4, name: "消費者金融X", type: "loan", isActive: true, amount: -20000, paymentDay: 5, loanDetails: { initialAmount: 500000, loanDate: "2023-01-10", interestRate: 18.0, currentBalance: 450000, loanType: "消費者金融" } },
    { id: 5, name: "メインバンク", type: "bank", isActive: true, amount: 100000 },
  ];
}

async function loadSampleData() {
  if (confirm('現在のデータは上書きされます。サンプルデータを読み込みますか？')) {
    masterData = getSampleData();
    showNotification('📋 サンプルデータを読み込みました。');
    await saveData();
    renderAll();
  }
}

async function resetAllData() {
  if (confirm('本当にすべてのデータをリセットしますか？この操作は元に戻せません。')) {
    masterData = [];
    await saveData();
    showNotification('🔄 全データをリセットしました。', 'error');
    renderAll();
  }
}

function exportData() {
  const dataToExport = {
    master: masterData,
    events: JSON.parse(localStorage.getItem('budgetAppData') || '{}').events || []
  };
  const dataStr = JSON.stringify(dataToExport, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'budget-app-data.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showNotification('📤 データのエクスポートを開始しました。');
}