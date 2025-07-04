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

/**
 * Googleの認証ライブラリが読み込み完了したときに呼び出される関数
 * HTMLのonloadから呼び出すため、windowオブジェクトに登録する
 */
window.onGoogleLibraryLoad = function() {
  console.log('✅ Googleライブラリの読み込み完了');
  // Googleログインの初期化
  try {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleLoginSuccess
    });
  } catch (e) {
    console.error("Google Sign-Inの初期化に失敗しました。", e);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 家計簿アプリ v2.0 起動');

  // ログイン状態を復元しようと試みる
  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (savedUserJSON) {
    try {
      const user = JSON.parse(savedUserJSON);
      if (user && typeof user === 'object' && user.name && user.mode) {
        currentUser = user;
        loginMode = user.mode;
        // チュートリアル完了済みならダッシュボードを表示
        if (localStorage.getItem('tutorialCompleted')) {
          showApp();
        } else {
          // チュートリアルが完了していないのにリロードされた場合などはマスター画面へ
          window.location.href = 'master.html';
        }
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

// この関数は内部でのみ使用するため、windowには登録しない
function showApp() {
  const loginScreenEl = document.getElementById('loginScreen');
  const appContainerEl = document.getElementById('appContainer');
  const userNameEl = document.getElementById('userName');

  if (loginScreenEl) loginScreenEl.style.display = 'none';
  if (appContainerEl) appContainerEl.style.display = 'block';
  if (userNameEl && currentUser) userNameEl.textContent = currentUser.name;

  initializeApp();
}

// この関数も内部でのみ使用
function initializeApp() {
  loadData();
  renderAll();
  if (currentUser) {
    showNotification(`✅ ${currentUser.name}としてログインしました`);
  }
}

// この関数も内部でのみ使用
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
 * HTMLのonclickから呼び出すため、windowオブジェクトに登録する
 */
window.tryGoogleLogin = function() {
  try {
    // googleオブジェクトが未定義の場合に備える
    if (typeof google === 'undefined' || !google.accounts) {
      showNotification('Googleログインの準備ができていません。少し待ってからもう一度お試しください。', 'error');
      return;
    }
    google.accounts.id.prompt();
  } catch (e) {
    console.error("Googleログインのプロンプト表示に失敗しました。", e);
    showNotification('Googleログインの準備ができていません。ページをリロードしてみてください。', 'error');
  }
}

/**
 * Googleログイン成功時に呼び出されるコールバック関数
 * この関数はgoogle.accounts.id.initializeのコールバックとして直接渡されるため、
 * windowに登録する必要はない。
 */
function handleGoogleLoginSuccess(response) {
  console.log('★★★ handleGoogleLoginSuccessが呼び出されました！ ★★★');
  console.log("Googleから認証情報を受け取りました:", response);

  const userObject = decodeJWT(response.credential);

  if (!userObject) {
    showNotification('ユーザー情報の解析に失敗しました。', 'error');
    return;
  }

  currentUser = {
    name: userObject.name,
    email: userObject.email,
    mode: 'google'
  };
  loginMode = 'google';

  localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));
  proceedToApp();
}

/**
 * JWTをデコードする自作関数 (ライブラリ不要)
 */
function decodeJWT(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("JWTのデコードに失敗しました:", e);
    return null;
  }
}

/**
 * ローカルログイン
 * HTMLのonclickから呼び出すため、windowオブジェクトに登録する
 */
window.localLogin = function() {
  currentUser = { name: 'ローカルユーザー', mode: 'local' };
  loginMode = 'local';
  localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));
  proceedToApp();
}

/**
 * ログイン後の共通処理（初回判定と画面遷移）
 */
function proceedToApp() {
  if (!localStorage.getItem('tutorialCompleted')) {
    console.log('🎉 初回ログインです。マスター管理画面に移動します。');

    // ▼▼▼ この2行を追加します ▼▼▼
    // 古いサンプルデータが残っている可能性があるので、マスターデータを完全にクリアする
    localStorage.removeItem('budgetMasterData');
    masterData = []; // メモリ上のデータもクリア
    // ▲▲▲ ▲▲▲

    localStorage.setItem('tutorialCompleted', 'true');
    window.location.href = 'master.html';
  } else {
    showApp();
  }
}

/**
 * ログアウト
 * HTMLのonclickから呼び出すため、windowオブジェクトに登録する
 */
window.logout = function() {
  if (loginMode === 'google' && typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.disableAutoSelect();
  }
  currentUser = null;
  localStorage.removeItem('budgetAppUser');

  // ▼▼▼ この行を削除、またはコメントアウトします ▼▼▼
  // localStorage.removeItem('tutorialCompleted');
  // ▲▲▲ ▲▲▲

  window.location.reload();
}

// ===================================================================================
// データ管理
// ===================================================================================
function loadData() {
  try {
    const savedMaster = localStorage.getItem('budgetMasterData');
    if (savedMaster) {
      masterData = JSON.parse(savedMaster);
      console.log('📂 保存されたマスターデータを読み込みました。');
    } else {
      masterData = [];
      console.log('📂 保存されたデータがありません。空の状態で開始します。');
    }
  } catch (e) {
    console.error("マスターデータの解析に失敗しました。空の状態で初期化します。", e);
    localStorage.removeItem('budgetMasterData');
    masterData = [];
  }
}

// ===================================================================================
// UI描画 & 更新
// ===================================================================================
/**
 * HTMLのonclickから呼び出すため、windowオブジェクトに登録する
 */
window.changeMonth = function(delta) {
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
  const el = document.getElementById('currentMonth');
  if (el) el.textContent = `${currentYear}年${currentMonth}月`;
}

function generateCalendar() {
  const calendar = document.getElementById('calendar');
  if (!calendar) return;

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

  // 各サマリー要素を安全に更新
  const summaryElements = {
    summaryIncome: `¥${income.toLocaleString()}`,
    summaryExpense: `¥${Math.abs(expense).toLocaleString()}`,
    summaryBalance: `¥${(income + expense).toLocaleString()}`,
    summaryWeekly: `¥${Math.abs(weeklyExpense).toLocaleString()}`,
    summaryTotalDebt: `¥${totalDebt.toLocaleString()}`,
    summaryMonthlyRepayment: `¥${monthlyRepayment.toLocaleString()}`
  };

  for (const id in summaryElements) {
    const el = document.getElementById(id);
    if (el) el.textContent = summaryElements[id];
  }

  // 完済予定日の計算と表示
  const completionDateEl = document.getElementById('summaryCompletionDate');
  const completionSubtextEl = document.getElementById('summaryCompletionSubtext');

  if (completionDateEl && completionSubtextEl) {
    const { years, months } = calculateCompletionDate(loanItems);
    if (years > 0 || months > 0) {
      let completionText = '';
      if (years > 0) completionText += `${years}年`;
      if (months > 0) completionText += `${months}ヶ月`;
      completionText += '後';

      completionDateEl.textContent = completionText;
      const completionDate = new Date();
      completionDate.setMonth(completionDate.getMonth() + (years * 12 + months));
      completionSubtextEl.textContent = `( ${completionDate.getFullYear()}年${completionDate.getMonth() + 1}月頃 )`;
    } else if (loanItems.length > 0 && monthlyRepayment > 0) {
      completionDateEl.textContent = "計算不可";
      completionSubtextEl.textContent = "返済額が利息を下回っています";
    } else {
      completionDateEl.textContent = "借入なし";
      completionSubtextEl.textContent = "";
    }
  }
}

function calculateCompletionDate(loanItems) {
  if (!loanItems || loanItems.length === 0) return { years: 0, months: 0 };
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
/**
 * HTMLのonclickから呼び出すため、windowオブジェクトに登録する
 */
window.checkOverdueRisk = function() {
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

/**
 * HTMLのonclickから呼び出すため、windowオブジェクトに登録する
 */
window.goToMasterManagement = function() {
  window.location.href = 'master.html';
}

/**
 * HTMLのonclickから呼び出すため、windowオブジェクトに登録する
 */
window.goToSettings = function() {
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