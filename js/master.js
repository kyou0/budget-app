// グローバル変数
let masterData = [];
let editingItemId = null; // 編集中のアイテムIDを保持。nullの場合は新規追加モード
let currentUser = null; // ログインユーザー情報を保持

// ===================================================================================
// 初期化処理 & ログインチェック
// ===================================================================================
document.addEventListener('DOMContentLoaded', function() {
  // ★★★ ログインチェック処理 ★★★
  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (!savedUserJSON) {
    // ログインしていない場合は、ログインページに強制送還
    alert('ログインが必要です。ログインページに戻ります。');
    window.location.href = 'index.html';
    return; // これ以降の処理を中断
  }

  // ログイン情報をグローバル変数にセット
  currentUser = JSON.parse(savedUserJSON);

  // ユーザー名を表示
  const userNameEl = document.getElementById('userName');
  if (userNameEl) {
    userNameEl.textContent = currentUser.name;
  }

  // データとUIの初期化
  loadData();
  renderMasterList();

  // サンプルデータが存在する場合のみ、削除ボタンを表示する
  if (isSampleDataPresent()) {
    const controls = document.getElementById('sample-data-controls');
    if (controls) {
      controls.style.display = 'block';
    }
  }
});

// ===================================================================================
// ページ遷移 & ログアウト
// ===================================================================================
window.logout = function() {
  // Googleログインの場合の処理も考慮
  if (currentUser.mode === 'google' && typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.disableAutoSelect();
  }
  localStorage.removeItem('budgetAppUser');
  // tutorialCompletedは消さない
  window.location.href = 'index.html'; // ログアウト後は必ずindexへ
}

window.goToDashboard = function() {
  window.location.href = 'index.html';
}

window.openSettings = function() {
  window.location.href = 'settings.html';
}

// ===================================================================================
// データ管理
// ===================================================================================
function loadData() {
  try {
    const savedMaster = localStorage.getItem('budgetMasterData');
    if (savedMaster) {
      masterData = JSON.parse(savedMaster);
    } else {
      // 保存データがない場合はサンプルデータを読み込む
      masterData = getSampleData();
    }
  } catch (e) {
    console.error("マスターデータの解析に失敗しました。", e);
    masterData = getSampleData();
  }
}

/**
 * 現在のデータがサンプルデータかどうかを判定するヘルパー関数
 * @returns {boolean} サンプルデータならtrue
 */
function isSampleDataPresent() {
  if (!masterData || masterData.length === 0) return false;
  // サンプルデータに特有の項目があるかどうかで判定する
  return masterData.some(item => item.name && item.name.includes('サンプル：'));
}

/**
 * サンプルデータを削除する関数
 * HTMLのonclickから呼び出される
 */
function clearSampleData() {
  if (confirm('本当によろしいですか？全てのサンプルデータが削除され、元に戻すことはできません。')) {
    masterData = [];
    saveData(masterData); // 共通関数を使って保存
    renderMasterList();

    const controls = document.getElementById('sample-data-controls');
    if (controls) {
      controls.style.display = 'none';
    }
    showNotification('✅ サンプルデータを削除しました。');
  }
}

// ===================================================================================
// UI描画 & 更新
// ===================================================================================
/**
 * masterDataの内容を元に、アイテムリスト全体を再描画する
 */
function renderMasterList() {
  const listElement = document.getElementById('itemsGrid');
  if (!listElement) return;

  listElement.innerHTML = '';

  if (masterData.length === 0) {
    listElement.innerHTML = `<div class="empty-list-message">データがありません。「＋ 新規追加」ボタンから収入や支出項目を登録してください。</div>`;
    return;
  }

  masterData.forEach(item => {
    const itemCard = document.createElement('div');
    itemCard.className = 'item-card';
    itemCard.dataset.itemId = item.id;

    const iconMap = {
      income: '💰', loan: '💸', card: '💳', fixed: '🏠',
      bank: '🏦', tax: '🏛️', variable: '🛒'
    };
    const icon = iconMap[item.type] || '📄';
    const amountColor = item.amount > 0 ? 'income' : 'expense';
    const formattedAmount = `${item.amount.toLocaleString()}円`;

    itemCard.innerHTML = `
      <div class="item-card-header">
        <span class="item-icon">${icon}</span>
        <h4 class="item-name">${item.name}</h4>
        <div class="item-status ${item.isActive ? 'active' : ''}">
          ${item.isActive ? '有効' : '無効'}
        </div>
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

// ===================================================================================
// 機能（フォーム表示、保存、削除）
// ===================================================================================

/**
 * 「新規項目追加」ボタンでフォームを表示する
 */
function showAddForm() {
  editingItemId = null; // 新規追加モードに設定
  document.getElementById('itemForm').reset(); // フォームをリセット
  document.getElementById('formTitle').textContent = '➕ 新規項目追加';
  document.getElementById('addForm').style.display = 'block';
  document.getElementById('addForm').scrollIntoView({ behavior: 'smooth' });
}

/**
 * 「編集」ボタンでフォームを表示し、既存のデータをセットする
 * @param {number} itemId 編集するアイテムのID
 */
function showEditForm(itemId) {
  const itemToEdit = masterData.find(item => item.id === itemId);
  if (!itemToEdit) {
    showNotification('編集対象のアイテムが見つかりません。', 'error');
    return;
  }

  editingItemId = itemId; // 編集モードに設定

  // フォームに既存の値をセット
  document.getElementById('itemName').value = itemToEdit.name;
  document.getElementById('itemType').value = itemToEdit.type;
  document.getElementById('amount').value = itemToEdit.amount;
  document.getElementById('paymentDay').value = itemToEdit.paymentDay || '';
  document.getElementById('isActive').value = itemToEdit.isActive;
  // TODO: 借入詳細などの追加フィールドも同様にセットする

  // フォームを表示
  document.getElementById('formTitle').textContent = '✏️ 項目の編集';
  document.getElementById('addForm').style.display = 'block';
  document.getElementById('addForm').scrollIntoView({ behavior: 'smooth' });
}

/**
 * フォームを非表示にする
 */
function hideAddForm() {
  document.getElementById('addForm').style.display = 'none';
  document.getElementById('itemForm').reset();
  editingItemId = null; // モードをリセット
}

/**
 * フォームの入力内容を元にアイテムを保存（新規・編集）する
 */
function saveItem() {
  // フォームから値を取得
  const name = document.getElementById('itemName').value.trim();
  const type = document.getElementById('itemType').value;
  const amount = parseInt(document.getElementById('amount').value, 10);
  const paymentDay = parseInt(document.getElementById('paymentDay').value, 10) || null;
  const isActive = document.getElementById('isActive').value === 'true';

  // バリデーション
  if (!name || !type || isNaN(amount)) {
    showNotification('項目名、種別、金額は必須です。', 'error');
    return;
  }

  if (editingItemId) {
    // --- 編集モードの処理 ---
    const itemIndex = masterData.findIndex(item => item.id === editingItemId);
    if (itemIndex > -1) {
      masterData[itemIndex] = { ...masterData[itemIndex], name, type, amount, paymentDay, isActive };
      showNotification(`✅ 「${name}」を更新しました。`);
    }
  } else {
    // --- 新規追加モードの処理 ---
    const newItem = {
      id: Date.now(), // ユニークなIDを生成
      name, type, amount, paymentDay, isActive
    };
    masterData.push(newItem);
    showNotification(`✅ 「${name}」を新しく追加しました。`);
  }

  saveData(masterData);
  renderMasterList();
  hideAddForm();
}

/**
 * 削除ボタンが押されたときの処理
 * @param {number} itemId 削除するアイテムのID
 */
function deleteItem(itemId) {
  const itemToDelete = masterData.find(item => item.id === itemId);
  if (!itemToDelete) {
    console.error('削除対象のアイテムが見つかりません:', itemId);
    return;
  }

  if (confirm(`「${itemToDelete.name}」を本当に削除しますか？この操作は元に戻せません。`)) {
    masterData = masterData.filter(item => item.id !== itemId);
    saveData(masterData);
    renderMasterList();
    showNotification(`✅ 「${itemToDelete.name}」を削除しました。`);
  }
}