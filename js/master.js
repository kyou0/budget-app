// js/master.js

// グローバル変数（master.htmlで必要なもの）
let masterData = [];
let editingItemId = null; // 編集中のアイテムIDを保持

// ===================================================================================
// 初期化処理
// ===================================================================================
document.addEventListener('DOMContentLoaded', function() {
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
// データ管理
// ===================================================================================
function loadData() {
  try {
    const savedMaster = localStorage.getItem('budgetMasterData');
    if (savedMaster) {
      masterData = JSON.parse(savedMaster);
    } else {
      // 保存データがない場合は、main.jsで読み込まれたサンプルデータが引き継がれる想定
      // もしmaster.htmlを直接開いた場合のためにサンプルデータを読み込む
      masterData = getSampleData();
    }
  } catch (e) {
    console.error("マスターデータの解析に失敗しました。", e);
    masterData = getSampleData();
  }
}

function saveData() {
  localStorage.setItem('budgetMasterData', JSON.stringify(masterData));
}

// サンプルデータを返す関数（main.jsと同じもの）
function getSampleData() {
  return [
    { id: 1, name: 'サンプル：給与', amount: 300000, type: 'income', paymentDay: 25, isActive: true },
    { id: 2, name: 'サンプル：家賃', amount: -80000, type: 'fixed', paymentDay: 27, isActive: true },
    { id: 3, name: 'サンプル：スマホ代', amount: -5000, type: 'fixed', paymentDay: 20, isActive: true },
    { id: 4, name: 'サンプル：奨学金返済', amount: -15000, type: 'loan', paymentDay: 27, isActive: true, loanDetails: { currentBalance: 1500000, interestRate: 1.5 } }
  ];
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
    // localStorageからデータを削除
    localStorage.removeItem('budgetMasterData');
    // メモリ上のデータも空にする
    masterData = [];
    // 画面を再描画して、リストが空になったことを表示
    renderMasterList();

    // 削除ボタン自体も非表示にする
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
  const listElement = document.getElementById('itemsGrid'); // master.htmlのIDと合わせる
  if (!listElement) return;

  listElement.innerHTML = ''; // 既存のリストをクリア

  if (masterData.length === 0) {
    listElement.innerHTML = `<div class="empty-list-message">データがありません。「＋ 新規追加」ボタンから収入や支出項目を登録してください。</div>`;
    return;
  }

  masterData.forEach(item => {
    const itemCard = document.createElement('div');
    itemCard.className = 'item-card';
    itemCard.dataset.itemId = item.id; // データ識別のためにIDをセット

    // アイコンを決定
    const iconMap = {
      income: '💰', loan: '💸', card: '💳', fixed: '🏠',
      bank: '🏦', tax: '🏛️', variable: '🛒'
    };
    const icon = iconMap[item.type] || '📄';

    // 金額のフォーマット
    const amountColor = item.amount > 0 ? 'income' : 'expense';
    const formattedAmount = `${item.amount.toLocaleString()}円`;

    // カードのHTMLを生成
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
        <button class="btn-action edit" onclick="editItem(${item.id})">編集</button>
        <button class="btn-action delete" onclick="deleteItem(${item.id})">削除</button>
      </div>
    `;
    listElement.appendChild(itemCard);
  });
}

// ===================================================================================
// 機能（モーダル、保存、削除など）
// ===================================================================================

/**
 * 編集ボタンが押されたときの処理（プレースホルダー）
 * @param {number} itemId 編集するアイテムのID
 */
function editItem(itemId) {
  // 今はアラートを出すだけ。後でフォーム表示処理を実装します。
  alert(`ID: ${itemId} のアイテムを編集します。`);
  // TODO: openModal(itemId) を呼び出すように変更する
}

/**
 * 削除ボタンが押されたときの処理（プレースホルダー）
 * @param {number} itemId 削除するアイテムのID
 */
function deleteItem(itemId) {
  // 今はアラートを出すだけ。後で実際の削除処理を実装します。
  if (confirm(`ID: ${itemId} のアイテムを本当に削除しますか？`)) {
    alert(`ID: ${itemId} のアイテムを削除します。`);
    // TODO: データを削除し、saveData()とrenderMasterList()を呼び出す処理を実装
  }
}

// openModal, saveMasterItem は既存のままでOK
function openModal(itemId = null) {
  // ... モーダルを開く処理 ...
}

function saveMasterItem() {
  // ... モーダルからデータを保存する処理 ...
  saveData();
  renderMasterList();
}

// ===================================================================================
// 機能（モーダル、保存、削除など）
// ===================================================================================
function openModal(itemId = null) {
  // ... モーダルを開く処理 ...
}

function saveMasterItem() {
  // ... モーダルからデータを保存する処理 ...
  saveData();
  renderMasterList();
}

function deleteMasterItem(itemId) {
  // ... 特定のアイテムを削除する処理 ...
  saveData();
  renderMasterList();
}


// ===================================================================================
// ヘルパー関数
// ===================================================================================
function showNotification(message, type = 'success') {
  const existing = document.querySelector('.sync-notification');
  if (existing) existing.remove();
  const notification = document.createElement('div');
  notification.className = `sync-notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}