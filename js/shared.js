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

// ===================================================================================
// ページ間通信 (アーキテクチャの心臓部)
// ===================================================================================
const dataChannel = new BroadcastChannel('budget_app_data_channel');