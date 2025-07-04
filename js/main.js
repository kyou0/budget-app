// ===================================================================================
// グローバル変数
// ===================================================================================
const GOOGLE_CLIENT_ID = '138150284146-07ul0ennhq22tm0ih3hngv8pnjsgo1u3.apps.googleusercontent.com';
let masterData = [];
let currentUser = null;
let loginMode = 'local';
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

// ===================================================================================
// 初期化処理
// ===================================================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 家計簿アプリ v2.0 起動');

  // Googleログインの初期化
  try {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleLoginSuccess // ログイン成功時に呼ばれる関数
    });
  } catch (e) {
    console.error("Google Sign-Inの初期化に失敗しました。ライブラリが読み込まれていないか、クライアントIDが不正です。", e);
  }

  // ログイン状態を復元しようと試みる
  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (savedUserJSON && savedUserJSON !== 'undefined' && savedUserJSON !== 'null') {
    try {
      const user = JSON.parse(savedUserJSON);
      if (user && typeof user === 'object' && user.name && user.mode) {
        currentUser = user;
        loginMode = user.mode;
        showApp();
        return;
      } else {
        console.warn('保存されていたユーザーデータが不正な形式です。');
        localStorage.removeItem('budgetAppUser');
      }
    } catch (e) {
      console.error("ユーザーデータの解析に失敗しました:", e);
      localStorage.removeItem('budgetAppUser');
    }
  }
});

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('userName').textContent = currentUser.name;
  initializeApp();
}

function initializeApp() {
  loadData();
  renderAll();
  showNotification(`✅ ${currentUser.name}としてログインしました`);
}

function renderAll() {
  updateCurrentMonthDisplay();
  generateCalendar();
  updateSummaryCards();
}

// ===================================================================================
// 認証 & ユーザー管理
// ===================================================================================
/**
 * Googleログインのプロンプトを表示する
 */
function tryGoogleLogin() {
  try {
    // Googleのログインプロンプトを表示
    google.accounts.id.prompt();
  } catch (e) {
    console.error("Googleログインのプロンプト表示に失敗しました。", e);
    showNotification('Googleログインの準備ができていません。ページをリロードしてみてください。', 'error');
  }
}

/**
 * Googleログイン成功時に呼び出されるコールバック関数
 * @param {object} response - Googleからの認証情報
 */
function handleGoogleLoginSuccess(response) {
  console.log("Googleから認証情報を受け取りました:", response);
  // jwt-decodeライブラリを使って、認証情報(JWT)からユーザー情報を抜き出す
  const userObject = jwt_decode(response.credential);

  currentUser = {
    name: userObject.name,
    email: userObject.email,
    mode: 'google'
  };
  loginMode = 'google';

  localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));
  showApp();
}

function localLogin() {
  currentUser = { name: 'ローカルユーザー', mode: 'local' };
  loginMode = 'local';
  localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));
  showApp();
}

function logout() {
  // Googleからもサインアウトする
  if (loginMode === 'google' && typeof google !== 'undefined') {
    google.accounts.id.disableAutoSelect();
  }
  currentUser = null;
  localStorage.removeItem('budgetAppUser');
  // 画面をリロードしてログイン画面に戻すのが一番確実
  window.location.reload();
}

// ===================================================================================
// データ管理
// ===================================================================================
function loadData() {
  try {
    const savedMaster = localStorage.getItem('budgetMasterData');
    if (savedMaster && savedMaster !== 'undefined' && JSON.parse(savedMaster).length > 0) {
      masterData = JSON.parse(savedMaster);
      console.log('📂 保存されたマスターデータを読み込みました。');
    } else {
      loadSampleData();
      localStorage.setItem('budgetMasterData', JSON.stringify(masterData));
    }
  } catch (e) {
    console.error("マスターデータの解析に失敗しました。サンプルデータで初期化します。", e);
    localStorage.removeItem('budgetMasterData'); // 不正なデータを削除
    loadSampleData();
    localStorage.setItem('budgetMasterData', JSON.stringify(masterData));
  }
}

function loadSampleData() {
  masterData = [
    { id: 'item_1', name: "クライアントA", type: "income", paymentDay: 10, amount: 200000, paymentMethod: "銀行振込", isActive: true },
    { id: 'item_3', name: "家賃", type: "fixed", paymentDay: 27, amount: -80000, paymentMethod: "銀行振込", isActive: true },
    { id: 'item_5', name: "メインカード", type: "card", paymentDay: 4, amount: -50000, paymentMethod: "メイン銀行", isActive: true },
    { id: 'item_8', name: "アコム", type: "loan", paymentDay: 27, amount: -15000, paymentMethod: "メイン銀行", isActive: true, loanDetails: { loanType: "消費者金融", interestRate: 18.0, maxLimit: 500000, currentBalance: 234567 } },
    { id: 'item_9', name: "楽天カードローン", type: "loan", paymentDay: 12, amount: -12000, paymentMethod: "楽天銀行", isActive: true, loanDetails: { loanType: "クレジットカード", interestRate: 15.0, maxLimit: 1000000, currentBalance: 450000 } }
  ];
  showNotification('📋 サンプルデータを読み込みました。', 'info');
}

// ===================================================================================
// UI描画 & 更新
// ===================================================================================
function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) {
    currentMonth = 1;
    currentYear++;
  } else if (currentMonth < 1) {
    currentMonth = 12;
    currentYear--;
  }
  renderAll();
}

function updateCurrentMonthDisplay() {
  document.getElementById('currentMonth').textContent = `${currentYear}年${currentMonth}月`;
}

function generateCalendar() {
  const calendar = document.getElementById('calendar');
  calendar.innerHTML = '';
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  weekdays.forEach(day => {
    const header = document.createElement('div');
    header.className = 'calendar-day-header';
    header.textContent = day;
    calendar.appendChild(header);
  });

  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1);
  const startingDay = firstDayOfMonth.getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  for (let i = 0; i < startingDay; i++) {
    calendar.insertAdjacentHTML('beforeend', '<div class="calendar-day other-month"></div>');
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    const today = new Date();
    if (currentYear === today.getFullYear() && currentMonth === today.getMonth() + 1 && day === today.getDate()) {
      dayElement.classList.add('today');
    }
    dayElement.innerHTML = `<div class="day-number">${day}</div>`;

    const itemsForDay = masterData.filter(item => item.isActive && item.paymentDay === day);
    itemsForDay.forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.className = 'calendar-item';
      const icon = { income: '💰', expense: '💸', loan: '🏦', card: '💳', fixed: '🏠', tax: '🏛️', bank: '🏦', variable: '🛒' }[item.type] || '📄';
      itemElement.innerHTML = `${icon} ${item.name}`;
      itemElement.title = `${item.name}: ${item.amount.toLocaleString()}円`;
      if (item.amount > 0) itemElement.classList.add('income');
      else if (item.type === 'loan') itemElement.classList.add('loan');
      else itemElement.classList.add('expense');
      dayElement.appendChild(itemElement);
    });
    calendar.appendChild(dayElement);
  }
}

function updateSummaryCards() {
  const activeItems = masterData.filter(item => item.isActive);
  const income = activeItems.filter(i => i.amount > 0).reduce((sum, i) => sum + i.amount, 0);
  const expense = activeItems.filter(i => i.amount < 0).reduce((sum, i) => sum + i.amount, 0);

  const today = new Date();
  const weekEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const weeklyExpense = activeItems.filter(i => {
    if (i.amount >= 0 || !i.paymentDay) return false;
    const paymentDateThisMonth = new Date(currentYear, currentMonth - 1, i.paymentDay);
    return paymentDateThisMonth >= today && paymentDateThisMonth < weekEnd;
  }).reduce((sum, i) => sum + i.amount, 0);

  const loanItems = activeItems.filter(i => i.type === 'loan');
  const totalDebt = loanItems.reduce((sum, i) => sum + (i.loanDetails?.currentBalance || 0), 0);
  const monthlyRepayment = loanItems.reduce((sum, i) => sum + Math.abs(i.amount), 0);

  document.getElementById('summaryIncome').textContent = `¥${income.toLocaleString()}`;
  document.getElementById('summaryExpense').textContent = `¥${Math.abs(expense).toLocaleString()}`;
  document.getElementById('summaryBalance').textContent = `¥${(income + expense).toLocaleString()}`;
  document.getElementById('summaryWeekly').textContent = `¥${Math.abs(weeklyExpense).toLocaleString()}`;
  document.getElementById('summaryTotalDebt').textContent = `¥${totalDebt.toLocaleString()}`;
  document.getElementById('summaryMonthlyRepayment').textContent = `¥${monthlyRepayment.toLocaleString()}`;

  // 完済予定日の計算
  const { years, months } = calculateCompletionDate(loanItems);
  if (years > 0 || months > 0) {
    let completionText = '';
    if (years > 0) completionText += `${years}年`;
    if (months > 0) completionText += `${months}ヶ月`;
    completionText += '後';

    document.getElementById('summaryCompletionDate').textContent = completionText;
    const completionDate = new Date();
    completionDate.setMonth(completionDate.getMonth() + (years * 12 + months));
    document.getElementById('summaryCompletionSubtext').textContent = `( ${completionDate.getFullYear()}年${completionDate.getMonth() + 1}月頃 )`;
  } else if (loanItems.length > 0 && monthlyRepayment > 0) {
    document.getElementById('summaryCompletionDate').textContent = "計算不可";
    document.getElementById('summaryCompletionSubtext').textContent = "返済額が利息を下回っています";
  } else {
    document.getElementById('summaryCompletionDate').textContent = "借入なし";
    document.getElementById('summaryCompletionSubtext').textContent = "";
  }
}

function calculateCompletionDate(loanItems) {
  if (loanItems.length === 0) return { years: 0, months: 0 };
  let maxMonths = 0;
  loanItems.forEach(loan => {
    const balance = loan.loanDetails?.currentBalance || 0;
    const monthlyPayment = Math.abs(loan.amount) || 0;
    const annualRate = loan.loanDetails?.interestRate || 0;
    if (balance <= 0 || monthlyPayment <= 0) return;
    if (annualRate === 0) {
      const months = Math.ceil(balance / monthlyPayment);
      if (months > maxMonths) maxMonths = months;
      return;
    }
    const monthlyRate = annualRate / 100 / 12;
    const minPayment = balance * monthlyRate;
    if (monthlyPayment <= minPayment) {
      maxMonths = Infinity;
      return;
    }
    const num = -Math.log(1 - (balance * monthlyRate) / monthlyPayment);
    const den = Math.log(1 + monthlyRate);
    const months = Math.ceil(num / den);
    if (months > maxMonths) maxMonths = months;
  });
  if (maxMonths === Infinity || !isFinite(maxMonths)) return { years: 0, months: 0 };
  const years = Math.floor(maxMonths / 12);
  const months = maxMonths % 12;
  return { years, months };
}

// ===================================================================================
// 機能 & ページ遷移
// ===================================================================================
function checkOverdueRisk() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueItems = masterData.filter(item => {
    if (!item.isActive || item.amount >= 0 || !item.paymentDay) return false;
    const paymentDate = new Date(currentYear, currentMonth - 1, item.paymentDay);
    return paymentDate < today && paymentDate.getMonth() === currentMonth - 1;
  });
  if (overdueItems.length > 0) {
    let message = '⚠️ 以下の項目が支払期日を過ぎています！\n\n';
    overdueItems.forEach(item => {
      message += `• ${item.paymentDay}日: ${item.name} (${Math.abs(item.amount).toLocaleString()}円)\n`;
    });
    alert(message);
    showNotification('⚠️ 滞納リスクが発見されました', 'warning');
  } else {
    showNotification('✅ 現時点で滞納している項目はありません。');
  }
}

function goToMasterManagement() {
  window.location.href = 'master.html';
}

function goToSettings() {
  window.location.href = 'settings.html';
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