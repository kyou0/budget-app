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

  document.getElementById('itemType')?.addEventListener('change', updateFormFields);
});

// ===================================================================================
// データ管理
// ===================================================================================
function loadData() {
  const dataKey = 'budgetMasterData';
  const storage = loginMode === 'google' ? sessionStorage : localStorage;
  const savedData = storage.getItem(dataKey);
  if (savedData) {
    try {
      masterData = JSON.parse(savedData);
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
    const amountText = item.type === 'bank' ? '---' : `¥${Math.abs(item.amount).toLocaleString()}`;
    const statusClass = item.isActive ? 'active' : '';
    const statusText = item.isActive ? '✅ 有効' : '❌ 無効';

    let bankInfo = '';
    if (item.type === 'income' && item.sourceBankId) {
      const bank = masterData.find(b => b.id === item.sourceBankId);
      if (bank) {
        bankInfo = `<div class="item-detail"><span class="item-label">振込先:</span><span class="item-value">${bank.name}</span></div>`;
      }
    }

    itemCard.innerHTML = `
            <div class="item-card-header"><span class="item-icon">${icon}</span><h4 class="item-name">${item.name}</h4><span class="item-status ${statusClass}">${statusText}</span></div>
            <div class="item-card-body">
                <div class="item-detail"><span class="item-label">金額:</span><span class="item-value ${amountColor}">${amountText}</span></div>
                <div class="item-detail"><span class="item-label">支払/入金日:</span><span class="item-value">${item.paymentDay ? item.paymentDay + '日' : '未設定'}</span></div>
                ${bankInfo}
            </div>
            <div class="item-card-actions"><button class="btn-action edit" onclick="showEditForm(${item.id})">✏️ 編集</button><button class="btn-action delete" onclick="deleteItem(${item.id})">🗑️ 削除</button></div>`;
    itemsGrid.appendChild(itemCard);
  });
}

// ===================================================================================
// フォーム関連の処理 (★今回のメイン機能★)
// ===================================================================================

function showAddForm() {
  editingItemId = null;
  const form = document.getElementById('addForm');
  form.style.display = 'block';
  form.reset();
  document.getElementById('formTitle').textContent = '➕ 新規項目追加';
  document.getElementById('isActive').value = 'true'; // デフォルトを有効に
  form.scrollIntoView({ behavior: 'smooth' });

  updateFormFields(); // フォームの表示を更新
  populateBankSelect(); // 銀行プルダウンを生成
}

function showEditForm(itemId) {
  const itemToEdit = masterData.find(item => item.id === itemId);
  if (!itemToEdit) return;

  editingItemId = itemId;

  document.getElementById('itemName').value = itemToEdit.name;
  document.getElementById('itemType').value = itemToEdit.type;
  document.getElementById('amount').value = itemToEdit.amount;
  document.getElementById('paymentDay').value = itemToEdit.paymentDay || '';
  document.getElementById('isActive').value = itemToEdit.isActive.toString();

  // フォームの表示を更新
  updateFormFields();
  // 銀行プルダウンを生成
  populateBankSelect();

  // 編集対象の銀行を選択状態にする
  if (itemToEdit.type === 'income' && itemToEdit.sourceBankId) {
    document.getElementById('itemSourceBank').value = itemToEdit.sourceBankId;
  }

  // 借入詳細の値を設定
  if (itemToEdit.type === 'loan' && itemToEdit.loanDetails) {
    document.getElementById('loanType').value = itemToEdit.loanDetails.loanType || '消費者金融';
    document.getElementById('interestRate').value = itemToEdit.loanDetails.interestRate || '';
    document.getElementById('maxLimit').value = itemToEdit.loanDetails.maxLimit || '';
    document.getElementById('currentBalance').value = itemToEdit.loanDetails.currentBalance || '';
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
  // 基本情報の取得
  const name = document.getElementById('itemName').value.trim();
  const type = document.getElementById('itemType').value;
  const amount = parseInt(document.getElementById('amount').value, 10);
  const paymentDay = parseInt(document.getElementById('paymentDay').value, 10) || null;
  const isActive = document.getElementById('isActive').value === 'true';

  // ★★★ 銀行IDを取得 ★★★
  const sourceBankId = document.getElementById('itemSourceBank').value;

  if (!name || !type || isNaN(amount)) {
    showNotification('項目名、種別、金額は必須です。', 'error');
    return;
  }

// 銀行の場合は、金額を常に正の数として扱う
  if (type === 'bank') {
    amount = Math.abs(amount);
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

  const itemData = { name, type, amount, paymentDay, isActive, loanDetails };

  // 「銀行」以外の全ての項目で、選択されていればsourceBankIdを保存する
  if (type !== 'bank' && sourceBankId) {
    itemData.sourceBankId = parseInt(sourceBankId, 10);
  } else {
    delete itemData.sourceBankId; // 不要ならプロパティごと削除
  }

  if (editingItemId !== null) {
    const itemIndex = masterData.findIndex(item => item.id === editingItemId);
    if (itemIndex > -1) {
      // IDは維持しつつ、他のプロパティを更新
      masterData[itemIndex] = { ...masterData[itemIndex], ...itemData };
      showNotification(`✅ 「${name}」を更新しました。`);
    }
  } else {
    // IDは数値のタイムスタンプにする
    const newItem = { id: Date.now(), ...itemData };
    masterData.push(newItem);
    showNotification(`✅ 「${name}」を新しく追加しました。`);
  }

  // saveDataはcommon.jsにある想定
  await saveData();
  renderAll();
  hideAddForm();
}

// js/master.js

/**
 * フォームの種別に応じて、表示するフィールドを切り替える
 */
function updateFormFields() {
  const itemType = document.getElementById('itemType').value;
  const amountLabel = document.querySelector('label[for="amount"]');
  const amountInput = document.getElementById('amount');
  const paymentDayGroup = document.getElementById('paymentDay').parentElement;
  const sourceBankGroup = document.getElementById('itemSourceBank').parentElement;

  // まず全ての特別フィールドを非表示にする
  document.querySelectorAll('.loan-field, .income-field').forEach(el => el.style.display = 'none');
  sourceBankGroup.style.display = 'none'; // 銀行プルダウンも一旦隠す

  // ★★★ ここからが修正箇所 ★★★

  // 表示するラベルを定義
  const labels = {
    income: '収入額 *',
    card: '想定利用額 *',
    fixed: '固定費額 *',
    tax: '税金額 *',
    loan: '月々返済額 *',
    variable: '想定予算額 *',
    bank: '現在の預金残高 *'
  };
  amountLabel.textContent = labels[itemType] || '金額 *';

  if (itemType === 'bank') {
    // 「銀行」が選択された場合
    amountInput.placeholder = '例: 1234567';
    amountInput.value = Math.abs(Number(amountInput.value)); // 常に正の数
    paymentDayGroup.style.display = 'none'; // 支払日を隠す
  } else {
    // 「銀行」以外が選択された場合
    amountInput.placeholder = '収入は正数、支出は負数';
    paymentDayGroup.style.display = 'flex'; // 支払日を表示

    // 「ひも付く銀行」プルダウンを表示する
    sourceBankGroup.style.display = 'flex';

    // 借入の場合のみ「借入詳細」を表示
    if (itemType === 'loan') {
      document.querySelectorAll('.loan-field').forEach(el => el.style.display = 'flex');
    }
  }
}

/**
 * 銀行選択プルダウンに選択肢を設定する
 */
function populateBankSelect() {
  const bankSelect = document.getElementById('itemSourceBank');
  bankSelect.innerHTML = '<option value="">-- 銀行を選択 --</option>'; // デフォルト
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

/**
 * 統計カードの数値を更新する
 */
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

/**
 * サイドバーのカテゴリ別項目数を更新する
 */
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

/**
 * 表示するカテゴリを切り替える
 * @param {string} category - 表示するカテゴリ名
 * @param {HTMLElement} element - クリックされたカテゴリ要素
 */
function showCategory(category, element) {
  currentCategory = category;

  // タイトル更新
  document.getElementById('categoryTitle').innerHTML = `${element.querySelector('.category-info').innerHTML} の項目`;

  // アクティブなカテゴリのスタイルを更新
  document.querySelectorAll('.category-item').forEach(item => item.classList.remove('active'));
  element.classList.add('active');

  // フォームが開いていれば閉じる
  hideAddForm();
  renderMasterList();
}

/**
 * 指定されたIDの項目を削除する
 * @param {number} itemId - 削除するアイテムのID
 */
async function deleteItem(itemId) {
  const item = masterData.find(i => i.id === itemId);
  if (!item) return;

  if (confirm(`「${item.name}」を本当に削除しますか？この操作は元に戻せません。`)) {
    masterData = masterData.filter(i => i.id !== itemId);
    showNotification(`🗑️ 「${item.name}」を削除しました。`);
    await saveData(); // 変更を保存
    renderAll(); // 画面を再描画
  }
}

/**
 * サンプルデータを読み込む
 */
async function loadSampleData() {
  if (confirm('現在のデータは上書きされます。サンプルデータを読み込みますか？')) {
    masterData = getSampleData(); // common.jsにある想定
    showNotification('📋 サンプルデータを読み込みました。');
    await saveData();
    renderAll();
  }
}

/**
 * 現在のデータをJSONファイルとしてエクスポートする
 */
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

/**
 * 全てのデータをリセットする
 */
async function resetAllData() {
  if (confirm('本当にすべてのデータをリセットしますか？この操作は元に戻せません。')) {
    masterData = [];
    await saveData();
    showNotification('🔄 全データをリセットしました。', 'error');
    renderAll();
  }
}