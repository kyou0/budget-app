// ===================================================================================
// グローバル変数 & 初期設定
// ===================================================================================
let currentUser = null;
let masterData = [];
let loginMode = 'local';
let currentCategory = 'all';
let editingItemId = null;

// ===================================================================================
// 初期化処理
// ===================================================================================
document.addEventListener('DOMContentLoaded', function() {
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

  loadData();
  renderAll();

  // --- イベントリスナー ---
  document.getElementById('itemType')?.addEventListener('change', updateFormFields);

  // イベント委任：itemsGrid内のクリックを全てここで処理する
  document.getElementById('itemsGrid').addEventListener('click', async function(event) {
    const button = event.target.closest('button.btn-action');
    if (!button) {
      return;
    }
    const card = button.closest('.item-card');
    if (!card) {
      return;
    }
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
function loadData() {
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
    const icon = { income: '💰', loan: '💸', card: '💳', fixed: '🏠', bank: '🏦', tax: '🏛️', variable: '🛒' }[item.type] || '📄';
    const amountColor = item.amount >= 0 ? 'income' : 'expense';
    const statusClass = item.isActive ? 'active' : '';
    const statusText = item.isActive ? '✅ 有効' : '❌ 無効';
    const amountLabels = {
      income: '収入額:',
      card: '想定利用額:',
      fixed: '固定費額:',
      tax: '税金額:',
      loan: '月々返済額:',
      variable: '想定予算額:',
      bank: '現在の残高:'
    };
    const amountLabelText = amountLabels[item.type] || '金額:';
    const amountText = `¥${Math.abs(item.amount).toLocaleString()}`;

    let bankInfo = '';
    if (item.sourceBankId) {
      const bank = masterData.find(b => b.id === item.sourceBankId);
      if (bank) {
        const label = item.type === 'income' ? '振込先:' : '支払元:';
        bankInfo = `<div class="item-detail"><span class="item-label">${label}</span><span class="item-value">${bank.name}</span></div>`;
      }
    }

    let loanDetailsHtml = '';
    if (item.type === 'loan' && item.loanDetails) {
      loanDetailsHtml = `
        <hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">
        <div class="item-detail">
            <span class="item-label">現在の残高:</span>
            <span class="item-value expense">¥${item.loanDetails.currentBalance.toLocaleString()}</span>
        </div>
        <div class="item-detail">
            <span class="item-label">年利率:</span>
            <span class="item-value">${item.loanDetails.interestRate}%</span>
        </div>
      `;
    }

    // ★修正：onclick属性を完全に削除し、イベント委任に一本化
    itemCard.innerHTML = `
      <div class="item-card-header"><span class="item-icon">${icon}</span><h4 class="item-name">${item.name}</h4><span class="item-status ${statusClass}">${statusText}</span></div>
      <div class="item-card-body">
          <div class="item-detail"><span class="item-label">${amountLabelText}</span><span class="item-value ${amountColor}">${amountText}</span></div>
          <div class="item-detail"><span class="item-label">支払日:</span><span class="item-value">${item.paymentDay ? item.paymentDay + '日' : '未設定'}</span></div>
          ${bankInfo}
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

function showEditForm(itemId) {
  const itemToEdit = masterData.find(item => item.id === itemId);
  if (!itemToEdit) return;

  editingItemId = itemId;

  document.getElementById('itemName').value = itemToEdit.name;
  document.getElementById('itemType').value = itemToEdit.type;
  // ▼▼▼ String()で囲み、型を明示的に変換 ▼▼▼
  document.getElementById('itemAmount').value = String(Math.abs(itemToEdit.amount));
  document.getElementById('paymentDay').value = String(itemToEdit.paymentDay || '');
  document.getElementById('isActive').value = String(itemToEdit.isActive);
  // ▲▲▲

  updateFormFields();
  populateBankSelect();

  if (itemToEdit.sourceBankId) {
    // ▼▼▼ String()で囲み、型を明示的に変換 ▼▼▼
    document.getElementById('itemSourceBank').value = String(itemToEdit.sourceBankId);
  }

  if (itemToEdit.type === 'loan' && itemToEdit.loanDetails) {
    // ▼▼▼ String()で囲み、型を明示的に変換 ▼▼▼
    document.getElementById('initialAmount').value = String(itemToEdit.loanDetails.initialAmount || '');
    document.getElementById('loanDate').value = itemToEdit.loanDetails.loanDate || '';
    document.getElementById('interestRate').value = String(itemToEdit.loanDetails.interestRate || '');
    document.getElementById('currentBalance').value = String(itemToEdit.loanDetails.currentBalance || '');
    document.getElementById('loanType').value = itemToEdit.loanDetails.loanType || '消費者金融';
    document.getElementById('maxLimit').value = String(itemToEdit.loanDetails.maxLimit || '');
    // ▲▲▲
  }

  document.getElementById('formTitle').textContent = '✏️ 項目の編集';
  document.getElementById('addForm').style.display = 'block';
  document.getElementById('addForm').scrollIntoView({ behavior: 'smooth' });
}

function hideAddForm() {
  document.getElementById('addForm').style.display = 'none';
  editingItemId = null;
}

async function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  const type = document.getElementById('itemType').value;
  // ★修正：IDを 'amount' から 'itemAmount' に変更
  let amount = parseInt(document.getElementById('itemAmount').value, 10);
  const paymentDay = parseInt(document.getElementById('paymentDay').value, 10) || null;
  const isActive = document.getElementById('isActive').value === 'true';
  const sourceBankId = document.getElementById('itemSourceBank').value;

  if (!name || !type || isNaN(amount)) {
    showNotification('項目名、種別、金額/残高は必須です。', 'error');
    return;
  }

  if (['expense', 'fixed', 'tax', 'loan', 'card', 'variable'].includes(type)) {
    amount = -Math.abs(amount);
  } else {
    amount = Math.abs(amount);
  }

  let loanDetails = null;
  if (type === 'loan') {
    const interestRate = parseFloat(document.getElementById('interestRate').value);
    const currentBalance = parseInt(document.getElementById('currentBalance').value, 10);

    if (isNaN(interestRate) || isNaN(currentBalance)) {
      showNotification('借金の場合、年利率と現在の残高は必須です。', 'error');
      return;
    }

    loanDetails = {
      initialAmount: parseInt(document.getElementById('initialAmount').value, 10) || 0,
      loanDate: document.getElementById('loanDate').value || null,
      interestRate: interestRate,
      currentBalance: Math.abs(currentBalance),
      loanType: document.getElementById('loanType').value,
      maxLimit: parseInt(document.getElementById('maxLimit').value, 10) || 0,
    };
  }

  const itemData = {
    name, type, amount, paymentDay, isActive, loanDetails,
    ...(type !== 'bank' && sourceBankId && { sourceBankId: parseInt(sourceBankId, 10) })
  };

  if (editingItemId !== null) {
    const itemIndex = masterData.findIndex(item => item.id === editingItemId);
    if (itemIndex > -1) {
      masterData[itemIndex] = { ...masterData[itemIndex], ...itemData };
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

function updateFormFields() {
  const itemType = document.getElementById('itemType').value;
  // ★修正：セレクタを 'label[for="amount"]' から 'label[for="itemAmount"]' に変更
  const amountLabel = document.querySelector('label[for="itemAmount"]');
  // ★修正：IDを 'amount' から 'itemAmount' に変更
  const amountInput = document.getElementById('itemAmount');
  const paymentDayGroup = document.getElementById('paymentDay').parentElement;
  const sourceBankGroup = document.getElementById('itemSourceBank').parentElement;

  document.querySelectorAll('.loan-field').forEach(el => el.style.display = 'none');
  sourceBankGroup.style.display = 'none';

  const labels = {
    income: '収入額 *', card: '想定利用額 *', fixed: '固定費額 *', tax: '税金額 *',
    loan: '月々返済額 *', variable: '想定予算額 *', bank: '現在の預金残高 *'
  };
  amountLabel.textContent = labels[itemType] || '金額 *';
  amountInput.placeholder = '例: 50000 (数字のみ入力)';

  if (itemType === 'bank') {
    paymentDayGroup.style.display = 'none';
    sourceBankGroup.style.display = 'none';
  } else {
    paymentDayGroup.style.display = 'flex';
    if (itemType) {
      sourceBankGroup.style.display = 'flex';
    }
    if (itemType === 'loan') {
      document.querySelectorAll('.loan-field').forEach(el => el.style.display = 'flex');
    }
  }
}

function populateBankSelect() {
  const bankSelect = document.getElementById('itemSourceBank');
  bankSelect.innerHTML = '<option value="">-- 銀行を選択 --</option>';
  const banks = masterData.filter(item => item.type === 'bank' && item.isActive);

  banks.forEach(bank => {
    const option = document.createElement('option');
    option.value = bank.id;
    option.textContent = bank.name;
    bankSelect.appendChild(option);
  });
}

// ===================================================================================
// UI補助機能 (統計、カテゴリ、データ操作など)
// ===================================================================================
function updateStats() {
  const totalItems = masterData.length;
  const activeItems = masterData.filter(item => item.isActive).length;
  const totalDebt = masterData
    .filter(item => item.type === 'loan' && item.isActive && item.loanDetails)
    .reduce((sum, item) => sum + (item.loanDetails.currentBalance || 0), 0);
  const monthlyRepayment = masterData
    .filter(item => item.type === 'loan' && item.isActive)
    .reduce((sum, item) => sum + Math.abs(item.amount), 0);

  document.getElementById('statTotalItems').textContent = totalItems;
  document.getElementById('statActiveItems').textContent = activeItems;
  document.getElementById('statTotalDebt').textContent = `¥${totalDebt.toLocaleString()}`;
  document.getElementById('statMonthlyRepayment').textContent = `¥${monthlyRepayment.toLocaleString()}`;
}

function updateCategoryCounts() {
  const counts = {
    all: masterData.length,
    income: masterData.filter(i => i.type === 'income').length,
    loan: masterData.filter(i => i.type === 'loan').length,
    card: masterData.filter(i => i.type === 'card').length,
    fixed: masterData.filter(i => i.type === 'fixed').length,
    bank: masterData.filter(i => i.type === 'bank').length,
    tax: masterData.filter(i => i.type === 'tax').length,
    variable: masterData.filter(i => i.type === 'variable').length,
  };

  for (const key in counts) {
    const el = document.getElementById(`count${key.charAt(0).toUpperCase() + key.slice(1)}`);
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