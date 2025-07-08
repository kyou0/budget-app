// ===================================================================================
// アプリ全体で共有する定数と関数
// ===================================================================================

const ITEM_TYPES = {
  INCOME: 'income',
  FIXED: 'fixed',
  VARIABLE: 'variable',
  TAX: 'tax',
  LOAN: 'loan',
  CARD: 'card',
  BANK: 'bank',
};

const PAYMENT_DAY_RULES = {
  END_OF_MONTH_WEEKDAY: 'EOM',
};

/**
 * 画面右上に通知を表示する
 * @param {string} message - 表示するメッセージ
 * @param {'info' | 'success' | 'error'} type - 通知の種類
 */
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  if (!container) return;

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  container.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      container.removeChild(notification);
    }, 500);
  }, 5000);
}

// ▼▼▼ ここからが、今回追加する最重要関数です ▼▼▼
/**
 * データをローカルストレージに保存する
 * @param {Array} masterData - マスターデータ
 * @param {Array} eventsData - スポットイベントデータ
 */
async function saveData(masterData, eventsData) {
  const dataToSave = {
    master: masterData,
    events: eventsData, // 保存するキーを 'events' に統一
  };
  localStorage.setItem('budgetAppData', JSON.stringify(dataToSave));
  console.log('💾 [localモード] データをストレージに保存しました。');
}