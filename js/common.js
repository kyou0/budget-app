/**
 * サンプルデータを返す共通関数
 * @returns {Array} サンプルデータの配列
 */
function getSampleData() {
  return [
    {id: 1, name: 'サンプル：給与', amount: 300000, type: 'income', paymentDay: 25, isActive: true},
    {id: 2, name: 'サンプル：家賃', amount: -80000, type: 'fixed', paymentDay: 27, isActive: true},
    {id: 3, name: 'サンプル：スマホ代', amount: -5000, type: 'fixed', paymentDay: 20, isActive: true},
    {
      id: 4,
      name: 'サンプル：奨学金返済',
      amount: -15000,
      type: 'loan',
      paymentDay: 27,
      isActive: true,
      loanDetails: {currentBalance: 1500000, interestRate: 1.5}
    }
  ];
}

/**
 * データをlocalStorageに保存する共通関数
 * @param {Array} data 保存するデータ配列
 */
function saveData(data) {
  localStorage.setItem('budgetMasterData', JSON.stringify(data));
}

/**
 * 通知を表示する共通関数
 * @param {string} message 表示するメッセージ
 * @param {string} type 'success' | 'error' | 'warning' | 'info'
 */
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