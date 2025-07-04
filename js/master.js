// グローバル変数
let masterData = [];
let editingItemId = null; // 編集中のアイテムIDを保持。nullの場合は新規追加モード
let currentUser = null; // ログインユーザー情報を保持
let currentFilter = 'all'; // 現在のカテゴリフィルタ

// ===================================================================================
// 初期化処理 & ログインチェック
// ===================================================================================
document.addEventListener('DOMContentLoaded', function() {
  // ★★★ ログインチェック処理 ★★★
  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (!savedUserJSON) {
    alert('ログインが必要です。ログインページに戻ります。');
    window.location.href = 'index.html';
    return;
  }

  currentUser = JSON.parse(savedUserJSON);
  const userNameEl = document.getElementById('userName');
  if (userNameEl) {
    userNameEl.textContent = currentUser.name;
  }

  loadData();
  renderAll();
});

// ===================================================================================
// データ管理
// ===================================================================================
function loadData() {
  const user = JSON.parse(localStorage.getItem('budgetAppUser'));
  if (user && user.mode === 'google') {
    // Googleログインモードの場合、sessionStorageから最新データを読み込む
    const sessionData = sessionStorage.getItem('budgetMasterData');
    if (sessionData) {
      masterData = JSON.parse(sessionData);
      console.log('📂 [Googleモード] セッションからデータを読み込みました。');
    } else {
      // セッションにもない場合（直接master.htmlを開いたなど）、フォールバック
      console.warn('セッションデータが見つかりません。ローカルデータでフォールバックします。');
      loadDataFromLocalStorage();
    }
  } else {
    // ローカルモードの場合
    loadDataFromLocalStorage();
  }
}

// ローカル専用の読み込み関数を切り出す
function loadDataFromLocalStorage() {
  try {
    const savedMaster = localStorage.getItem('budgetMasterData');
    masterData = savedMaster ? JSON.parse(savedMaster) : getSampleData();
    console.log('📂 [ローカルモード] ローカルデータを読み込みました。');
  } catch (e) {
    console.error("マスターデータの解析に失敗しました。", e);
    masterData = getSampleData();
  }
}

// ===================================================================================
// UI描画 & 更新 (統合)
// ===================================================================================
function renderAll() {
  renderMasterList();
  updateStats();
  updateCategoryList();
}

function renderMasterList() {
  const listElement = document.getElementById('itemsGrid');
  if (!listElement) return;

  const filteredData = currentFilter === 'all' ? masterData : masterData.filter(item => item.type === currentFilter);
  listElement.innerHTML = '';

  if (filteredData.length === 0) {
    listElement.innerHTML = `<div class="empty-list-message">このカテゴリの項目はありません。</div>`;
    return;
  }

  filteredData.forEach(item => {
    const itemCard = document.createElement('div');
    itemCard.className = 'item-card';
    itemCard.dataset.itemId = item.id;
    const iconMap = { income: '💰', loan: '💸', card: '💳', fixed: '🏠', bank: '🏦', tax: '🏛️', variable: '🛒' };
    const icon = iconMap[item.type] || '📄';
    const amountColor = item.amount > 0 ? 'income' : 'expense';
    const formattedAmount = `${item.amount.toLocaleString()}円`;
    itemCard.innerHTML = `
      <div class="item-card-header">
        <span class="item-icon">${icon}</span>
        <h4 class="item-name">${item.name}</h4>
        <div class="item-status ${item.isActive ? 'active' : ''}">${item.isActive ? '有効' : '無効'}</div>
      </div>
      <div class="item-card-body">
        <div class="item-detail">
          <span class="item-label">金額:</span>
          <span class="item-value ${amountColor}">${formattedAmount}</span>
        </div>
        <div class="item-detail">
          <span class="item-label">支払/入金日:</span>
          <span class="item-value">${item.paymentDay ? `${item.paymentDay}日` : '未設定'}</span>
        </div>
      </div>
      <div class="item-card-actions">
        <button class="btn-action edit" onclick="showEditForm(${item.id})">編集</button>
        <button class="btn-action delete" onclick="deleteItem(${item.id})">削除</button>
      </div>
    `;
    listElement.appendChild(itemCard);
  });
}

function updateStats() {
  const activeItems = masterData.filter(item => item.isActive);
  const loanItems = activeItems.filter(item => item.type === 'loan');
  const totalDebt = loanItems.reduce((sum, item) => sum + (item.loanDetails?.currentBalance || 0), 0);
  const monthlyRepayment = loanItems.reduce((sum, item) => sum + Math.abs(item.amount), 0);

  document.getElementById('statTotalItems').textContent = masterData.length;
  document.getElementById('statActiveItems').textContent = activeItems.length;
  document.getElementById('statTotalDebt').textContent = `¥${totalDebt.toLocaleString()}`;
  document.getElementById('statMonthlyRepayment').textContent = `¥${monthlyRepayment.toLocaleString()}`;
}

function updateCategoryList() {
  document.getElementById('countAll').textContent = masterData.length;
  const types = ['income', 'loan', 'card', 'fixed', 'bank', 'tax', 'variable'];
  types.forEach(type => {
    const count = masterData.filter(item => item.type === type).length;
    const elementId = `count${type.charAt(0).toUpperCase() + type.slice(1)}`;
    document.getElementById(elementId).textContent = count;
  });
}

// ===================================================================================
// 機能（フォーム、フィルタ、データ操作）
// ===================================================================================
function updateFormFields() {
  const itemType = document.getElementById('itemType').value;
  const loanFields = document.querySelectorAll('.loan-field');

  if (itemType === 'loan') {
    loanFields.forEach(field => field.style.display = 'block');
  } else {
    loanFields.forEach(field => field.style.display = 'none');
  }
}

function showAddForm() {
  editingItemId = null;
  document.getElementById('addForm').style.display = 'block';
  document.getElementById('addForm').reset();
  document.getElementById('formTitle').textContent = '➕ 新規項目追加';
  document.getElementById('addForm').scrollIntoView({ behavior: 'smooth' });
  updateFormFields();
}

function showEditForm(itemId) {
  const itemToEdit = masterData.find(item => item.id === itemId);
  if (!itemToEdit) return;

  editingItemId = itemId;

  document.getElementById('itemName').value = itemToEdit.name;
  document.getElementById('itemType').value = itemToEdit.type;
  document.getElementById('amount').value = itemToEdit.amount;
  document.getElementById('paymentDay').value = itemToEdit.paymentDay || '';
  document.getElementById('isActive').value = itemToEdit.isActive;

  if (itemToEdit.type === 'loan' && itemToEdit.loanDetails) {
    document.getElementById('loanType').value = itemToEdit.loanDetails.loanType || '消費者金融';
    document.getElementById('interestRate').value = itemToEdit.loanDetails.interestRate || '';
    document.getElementById('maxLimit').value = itemToEdit.loanDetails.maxLimit || '';
    document.getElementById('currentBalance').value = itemToEdit.loanDetails.currentBalance || '';
  }

  document.getElementById('formTitle').textContent = '✏️ 項目の編集';
  document.getElementById('addForm').style.display = 'block';
  document.getElementById('addForm').scrollIntoView({ behavior: 'smooth' });
  updateFormFields();
}

async function saveItem() {
  // 基本情報の取得
  const name = document.getElementById('itemName').value.trim();
  const type = document.getElementById('itemType').value;
  const amount = parseInt(document.getElementById('amount').value, 10);
  const paymentDay = parseInt(document.getElementById('paymentDay').value, 10) || null;
  const isActive = document.getElementById('isActive').value === 'true';

  if (!name || !type || isNaN(amount)) {
    showNotification('項目名、種別、金額は必須です。', 'error');
    return;
  }

  // 借入詳細情報を取得
  let loanDetails = null;
  if (type === 'loan') {
    loanDetails = {
      loanType: document.getElementById('loanType').value,
      interestRate: parseFloat(document.getElementById('interestRate').value) || 0,
      maxLimit: parseInt(document.getElementById('maxLimit').value, 10) || 0,
      currentBalance: parseInt(document.getElementById('currentBalance').value, 10) || 0,
    };
  }

  if (editingItemId) {
    const itemIndex = masterData.findIndex(item => item.id === editingItemId);
    if (itemIndex > -1) {
      masterData[itemIndex] = { ...masterData[itemIndex], name, type, amount, paymentDay, isActive, loanDetails };
      showNotification(`✅ 「${name}」を更新しました。`);
    }
  } else {
    const newItem = { id: Date.now(), name, type, amount, paymentDay, isActive, loanDetails };
    masterData.push(newItem);
    showNotification(`✅ 「${name}」を新しく追加しました。`);
  }

  await saveData(masterData);
  renderAll();
  hideAddForm();
}

function hideAddForm() {
  document.getElementById('addForm').style.display = 'none';
  document.getElementById('addForm').reset();
  editingItemId = null;
}

async function deleteItem(itemId) {
  const itemToDelete = masterData.find(item => item.id === itemId);
  if (!itemToDelete) return;
  if (confirm(`「${itemToDelete.name}」を本当に削除しますか？`)) {
    masterData = masterData.filter(item => item.id !== itemId);
    await saveData(masterData);
    renderAll();
    showNotification(`✅ 「${itemToDelete.name}」を削除しました。`);
  }
}

function showCategory(category, element) {
  currentFilter = category;

  document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
  element.classList.add('active');

  document.getElementById('categoryTitle').textContent = element.querySelector('.category-info span').textContent + 'の項目';

  renderMasterList();
}

async function resetAllData() {
  if (confirm('本当によろしいですか？全てのデータが削除され、元に戻すことはできません。')) {
    masterData = [];
    await saveData(masterData);
    renderAll();
    showNotification('✅ 全てのデータをリセットしました。');
  }
}

async function loadSampleData() {
  if (!confirm('現在のデータにサンプルデータを追加しますか？')) return;

  const sample = getSampleData();
  // IDの重複を避けるために、新しいIDを割り振る
  const newSample = sample.map(item => ({ ...item, id: Date.now() + Math.random() }));

  masterData.push(...newSample);

  await saveData(masterData);
  renderAll();
  showNotification('✅ サンプルデータを追加しました。');
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
  link.download = 'budget-data.json'; // ダウンロードファイル名
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showNotification('✅ データのエクスポートを開始しました。');
}