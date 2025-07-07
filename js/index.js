// ===================================================================================
// グローバル変数
// ===================================================================================
const GOOGLE_CLIENT_ID = '45451544416-9c9vljcaqir137dudhoj0da6ndchlph1.apps.googleusercontent.com';

let masterData = [];
let currentUser = null;
let loginMode = 'local';
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

// Google Drive連携用の変数
let googleAccessToken = null;
let tokenClient;

// ===================================================================================
// 初期化処理
// ===================================================================================

/**
 * Googleのライブラリが読み込み完了したときに呼び出される
 * window. を付けることで、グローバルスコープで定義する
 */
window.onGoogleLibraryLoad = function() {
  console.log('✅ Googleライブラリの読み込み完了');

  // 認証クライアントを初期化
  try {
    // 1. ログイン（ID取得）用のクライアント
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleLoginSuccess // ログイン成功時の処理
    });

    // 2. Drive APIアクセス用のトークンクライアント
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      prompt: '',
      callback: handleTokenResponse,
    });

  } catch (e) {
    console.error("Googleライブラリの初期化に失敗しました。", e);
    showNotification('Googleライブラリの初期化に失敗しました。ページを再読み込みしてください。', 'error');
  }
}

/**
 * DOMの読み込みが完了したら実行
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 家計簿アプリ v2.0 起動');

  const loginScreen = document.getElementById('loginScreen');
  const appContainer = document.getElementById('appContainer');
  const savedUserJSON = localStorage.getItem('budgetAppUser');

  if (savedUserJSON) {
    try {
      const user = JSON.parse(savedUserJSON);
      if (user && user.name && user.mode) {
        currentUser = user;
        loginMode = user.mode;
        showApp();
        return;
      }
    } catch (e) {
      console.error("ユーザーデータの解析に失敗しました:", e);
      localStorage.removeItem('budgetAppUser');
    }
  }

  loginScreen.style.display = 'flex';
  appContainer.style.display = 'none';
});


// ===================================================================================
// 認証 & ユーザー管理 (HTMLから呼ばれる関数)
// ===================================================================================

/**
 * Googleログインのプロンプトを表示する
 */
window.tryGoogleLogin = function() {
  try {
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
 * ローカルモードでログインする
 */
window.localLogin = function() {
  currentUser = { name: 'ローカルユーザー', mode: 'local' };
  loginMode = 'local';
  localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));
  showApp();
}

/**
 * Googleログイン成功後の処理 (コールバック)
 */
function handleGoogleLoginSuccess(response) {
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

  showApp();
}

/**
 * JWTをデコードしてユーザー情報を取得するヘルパー関数
 */
function decodeJWT(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("JWTのデコードに失敗", e);
    return null;
  }
}


// ===================================================================================
// アプリ本体の初期化と描画
// ===================================================================================

/**
 * ログイン後のアプリ画面を表示・初期化する
 */
function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('userName').textContent = currentUser.name;

  initializeApp();
}

/**
 * アプリのデータ読み込みと描画を開始する
 */
async function initializeApp() {
  if (loginMode === 'google' && !sessionStorage.getItem('googleAccessToken')) {
    requestDriveAccess();
    return;
  }
  await loadData();
  renderAll();
  showNotification(`✅ ${currentUser.name}としてログインしました`);
}

/**
 * 全てのUIコンポーネントを再描画する
 */
function renderAll() {
  updateCurrentMonthDisplay();
  generateCalendar();
  updateSummaryCards();
}

// ===================================================================================
// データ管理
// ===================================================================================
async function loadData() {
  const dataKey = 'budgetMasterData';
  const storage = loginMode === 'google' ? sessionStorage : localStorage;
  const savedData = storage.getItem(dataKey);
  if (savedData) {
    try {
      masterData = JSON.parse(savedData);
    } catch (e) {
      masterData = [];
    }
  } else {
    masterData = [];
    if (loginMode === 'google') {
      await syncWithDrive();
    }
  }
}

// ===================================================================================
// UI描画 (カレンダー、サマリーなど)
// ===================================================================================
function updateCurrentMonthDisplay() {
  document.getElementById('currentMonth').textContent = `${currentYear}年 ${currentMonth}月`;
}

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

function generateCalendar() {
  const calendarEl = document.getElementById('calendar');
  calendarEl.innerHTML = '';
  const headers = ['日', '月', '火', '水', '木', '金', '土'];
  headers.forEach(header => {
    const headerEl = document.createElement('div');
    headerEl.className = 'calendar-day-header';
    headerEl.textContent = header;
    calendarEl.appendChild(headerEl);
  });

  const firstDay = new Date(currentYear, currentMonth - 1, 1);
  const lastDay = new Date(currentYear, currentMonth, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  for (let i = 0; i < startDayOfWeek; i++) {
    const emptyDay = document.createElement('div');
    emptyDay.className = 'calendar-day other-month';
    calendarEl.appendChild(emptyDay);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    if (day === new Date().getDate() && currentMonth === new Date().getMonth() + 1 && currentYear === new Date().getFullYear()) {
      dayEl.classList.add('today');
    }
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    dayEl.appendChild(dayNumber);

    const itemsForDay = masterData.filter(item => item.paymentDay === day && item.isActive);
    itemsForDay.forEach(item => {
      const itemEl = document.createElement('div');
      const typeClass = item.amount >= 0 ? 'income' : (item.type === 'loan' ? 'loan' : 'expense');
      itemEl.className = `calendar-item ${typeClass}`;
      itemEl.textContent = `${item.name}: ${Math.abs(item.amount).toLocaleString()}円`;
      dayEl.appendChild(itemEl);
    });
    calendarEl.appendChild(dayEl);
  }
}

function updateSummaryCards() {
  const summaryCardsEl = document.getElementById('summaryCards');
  summaryCardsEl.innerHTML = '';

  const activeItems = masterData.filter(item => item.isActive);
  const income = activeItems.filter(i => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
  const fixedCost = activeItems.filter(i => ['fixed', 'tax', 'loan'].includes(i.type)).reduce((sum, i) => sum + i.amount, 0);
  const totalExpense = activeItems.filter(i => i.amount < 0).reduce((sum, i) => sum + i.amount, 0);
  const balance = income + totalExpense;

  const cards = [
    { title: '総収入', amount: income, class: 'income' },
    { title: '総支出', amount: totalExpense, class: 'expense' },
    { title: '収支', amount: balance, class: balance >= 0 ? 'income' : 'expense' },
    { title: '固定費', amount: fixedCost, class: 'expense' }
  ];

  cards.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'summary-card';
    cardEl.innerHTML = `
            <h3>${card.title}</h3>
            <div class="amount ${card.class}">¥${card.amount.toLocaleString()}</div>
        `;
    summaryCardsEl.appendChild(cardEl);
  });
}

// ===================================================================================
// Google Drive 連携
// ===================================================================================
function requestDriveAccess() {
  if (tokenClient) {
    tokenClient.requestAccessToken();
  }
}

function handleTokenResponse(response) {
  if (response.error) {
    console.error("アクセストークンの取得に失敗", response);
    showNotification('Google Driveへのアクセス許可に失敗しました。', 'error');
    return;
  }
  googleAccessToken = response.access_token;
  sessionStorage.setItem('googleAccessToken', googleAccessToken);
  console.log('✅ Drive用アクセストークンを取得しました。');
  syncWithDrive();
}

async function syncWithDrive() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  loadingOverlay.classList.add('show');
  try {
    const fileId = await findOrCreateFile();
    sessionStorage.setItem('driveFileId', fileId);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });
    if (response.ok) {
      const dataText = await response.text();
      if (dataText) {
        masterData = JSON.parse(dataText);
        sessionStorage.setItem('budgetMasterData', dataText);
      }
    }
    renderAll();
  } catch (error) {
    console.error("Driveとの同期に失敗:", error);
    showNotification('Google Driveとの同期に失敗しました。', 'error');
  } finally {
    loadingOverlay.classList.remove('show');
  }
}

async function findOrCreateFile() {
  const fileName = 'budget-app-data.json';
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and 'appDataFolder' in parents&spaces=appDataFolder`, {
    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
  });
  const data = await response.json();
  if (data.files.length > 0) {
    return data.files[0].id;
  } else {
    const fileMetadata = {
      'name': fileName,
      'parents': ['appDataFolder']
    };
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fileMetadata)
    });
    const newFile = await createResponse.json();
    return newFile.id;
  }
}