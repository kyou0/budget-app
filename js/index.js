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
let oneTimeEvents = [];

// ===================================================================================
// 初期化処理
// ===================================================================================

/**
 * Googleのライブラリが読み込み完了したときに呼び出される
 */
window.onGoogleLibraryLoad = function() {
  console.log('✅ Googleライブラリの読み込み完了');
  const googleLoginBtn = document.getElementById('googleLoginBtn');

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

    // Googleの初期化が完了したので、ログインボタンを有効化する
    if (googleLoginBtn) {
      googleLoginBtn.disabled = false;
      googleLoginBtn.innerHTML = `
            <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" style="width: 20px; vertical-align: middle; margin-right: 10px;">
            Googleでログイン
        `;
    }

  } catch (e) {
    console.error("Googleライブラリの初期化に失敗しました。", e);
    showNotification('Googleライブラリの初期化に失敗しました。ページを再読み込みしてください。', 'error');
    if (googleLoginBtn) {
      googleLoginBtn.textContent = 'Googleログインでエラー';
    }
  }
}

/**
 * DOMの読み込みが完了したら実行
 */
document.addEventListener('DOMContentLoaded',  async function() {
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
        await showApp();
        return;
      }
    } catch (e) {
      console.error("ユーザーデータの解析に失敗しました:", e);
      localStorage.removeItem('budgetAppUser');
    }
  }

  loginScreen.style.display = 'flex';
  appContainer.style.display = 'none';

  // スポットイベント入力のアコーディオン機能
  const accordionHeader = document.getElementById('spotEventAccordionHeader');
  if (accordionHeader) {
    const accordionContent = document.getElementById('spotEventAccordionContent');
    accordionHeader.addEventListener('click', () => {
      accordionHeader.classList.toggle('active');
      if (accordionContent.style.maxHeight) {
        // 閉じる
        accordionContent.style.maxHeight = null;
        accordionContent.style.paddingTop = null;
        accordionContent.style.paddingBottom = null;
      } else {
        // 開く
        accordionContent.style.paddingTop = '20px';
        accordionContent.style.paddingBottom = '5px';
        accordionContent.style.maxHeight = accordionContent.scrollHeight + 40 + "px";
      }
    });
  }
}); // ★修正：余分な閉じ括弧を削除


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
window.localLogin = async function() {
  await finalizeLogin({name: 'ローカルユーザー', mode: 'local'});
}

/**
 * Googleログイン成功後の処理 (コールバック)
 */
async function handleGoogleLoginSuccess(response) {
  console.log("Googleから認証情報を受け取りました:", response);
  const userObject = decodeJWT(response.credential);
  if (!userObject) {
    showNotification('ユーザー情報の解析に失敗しました。', 'error');
    return;
  }
  await finalizeLogin({
    name: userObject.name,
    email: userObject.email,
    mode: 'google'
  });
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
/**
 * ログイン処理の最終段階を担当するヘルパー関数
 * @param {{name: string, email?: string, mode: 'local' | 'google'}} user - ユーザー情報
 */
async function finalizeLogin(user) {
  currentUser = user;
  loginMode = user.mode;
  localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));
  sessionStorage.setItem('justLoggedIn', 'true');
  // この関数は async 関数から呼び出されるので、await は不要
  await showApp();
}


// ===================================================================================
// アプリ本体の初期化と描画
// ===================================================================================

/**
 * ログイン後のアプリ画面を表示・初期化する
 */
// ▼▼▼ async を追加 ▼▼▼
async function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('userName').textContent = currentUser.name;

  // ▼▼▼ await を追加して、初期化が完了するのを待つ ▼▼▼
  await initializeApp();
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
  if (sessionStorage.getItem('justLoggedIn')) {
    showNotification(`✅ ${currentUser.name}としてログインしました`);
    sessionStorage.removeItem('justLoggedIn');
  }
}

// ===================================================================================
// 全てのUIコンポーネントを再描画する
// ===================================================================================
function renderAll() {
  updateCurrentMonthDisplay();
  renderSpotEvents(); // ★修正：関数名をより分かりやすく変更
  generateCalendar();
  updateSummaryCards();
  generateFinancialForecast();
}


// ===================================================================================
// データ管理
// ===================================================================================
async function loadData() {
  const dataKey = 'budgetAppData';
  const savedData = localStorage.getItem(dataKey);
  if (savedData) {
    try {
      const parsedData = JSON.parse(savedData);
      masterData = parsedData.master || [];
      oneTimeEvents = parsedData.events || [];
    } catch (e) {
      console.error("ローカルデータの解析に失敗", e);
      masterData = [];
      oneTimeEvents = [];
    }
  } else {
    masterData = [];
    oneTimeEvents = [];
    if (loginMode === 'google') {
      await syncWithDrive();
    }
  }
}

// ===================================================================================
// UI描画 (カレンダー、サマリーなど)
// ===================================================================================

function getSpotEventsThisMonth() {
  return oneTimeEvents.filter(event => {
    const eventDate = new Date(event.date);
    return eventDate.getFullYear() === currentYear && eventDate.getMonth() + 1 === currentMonth;
  });
}

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
  const spotEventsThisMonth = getSpotEventsThisMonth();

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
    // ▼▼▼ 修正: 数値を文字列に明示的に変換して、型の警告を解決 ▼▼▼
    dayNumber.textContent = String(day);
    dayEl.appendChild(dayNumber);

    const recurringItems = masterData.filter(item => item.paymentDay === day && item.isActive);
    recurringItems.forEach(item => {
      const itemEl = document.createElement('div');
      const typeClass = item.amount >= 0 ? 'income' : (item.type === 'loan' ? 'loan' : 'expense');
      itemEl.className = `calendar-item ${typeClass}`;
      itemEl.textContent = `${item.name}: ${Math.abs(item.amount).toLocaleString()}円`;
      dayEl.appendChild(itemEl);
    });

    const spotItems = spotEventsThisMonth.filter(e => new Date(e.date).getDate() === day);
    spotItems.forEach(item => {
      const itemEl = document.createElement('div');
      const typeClass = item.amount >= 0 ? 'income' : 'expense';
      itemEl.className = `calendar-item ${typeClass}`;
      const icon = item.amount < 0 ? '🛒' : '⚡️'; // 支出と収入でアイコンを分ける
      itemEl.textContent = `${icon} ${item.description}`;
      dayEl.appendChild(itemEl);
    });

    calendarEl.appendChild(dayEl);
  }
}

function updateSummaryCards() {
  const summaryCardsEl = document.getElementById('summaryCards');
  summaryCardsEl.innerHTML = '';

  const activeItems = masterData.filter(item => item.isActive);
  const recurringIncome = activeItems.filter(i => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
  const recurringExpense = activeItems.filter(i => i.amount < 0).reduce((sum, i) => sum + i.amount, 0);

  const spotEventsThisMonth = getSpotEventsThisMonth();
  const spotIncome = spotEventsThisMonth.filter(e => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const spotExpense = spotEventsThisMonth.filter(e => e.amount < 0).reduce((sum, e) => sum + e.amount, 0);

  const totalIncome = recurringIncome + spotIncome;
  const totalExpense = recurringExpense + spotExpense;
  const balance = totalIncome + totalExpense;
  const fixedCost = activeItems.filter(i => ['fixed', 'tax', 'loan'].includes(i.type)).reduce((sum, i) => sum + i.amount, 0);

  const cards = [
    { title: '総収入', amount: totalIncome, class: 'income' },
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

// js/index.js
async function handleTokenResponse(response) {
  if (response.error) {
    console.error("アクセストークンの取得に失敗", response);
    showNotification('Google Driveへのアクセス許可に失敗しました。', 'error');
    return;
  }
  googleAccessToken = response.access_token;
  sessionStorage.setItem('googleAccessToken', googleAccessToken);
  console.log('✅ Drive用アクセストークンを取得しました。');

  // ▼▼▼ await を追加して、同期が完了するのを待つ ▼▼▼
  await syncWithDrive();
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
        const parsedData = JSON.parse(dataText);
        masterData = parsedData.master || [];
        oneTimeEvents = parsedData.events || [];
        localStorage.setItem('budgetAppData', dataText);
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

// ===================================================================================
// 統合版：未来予測＆借金分析エンジン
// ===================================================================================
// js/index.js

function generateFinancialForecast() {
  const container = document.getElementById('financialForecast');
  if (!container) return;

  const banks = masterData.filter(item => item.type === 'bank' && item.isActive);
  const recurringTransactions = masterData.filter(item => item.type !== 'bank' && item.isActive && item.paymentDay);
  const loans = masterData.filter(item => item.type === 'loan' && item.isActive && item.loanDetails);
  const spotEvents = getSpotEventsThisMonth();

  if (banks.length === 0 && loans.length === 0) {
    container.style.display = 'none';
    return;
  }

  let forecastHtml = '<h3>📈 財務健全性の見通し</h3>';

  if (banks.length > 0) {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    let dailyEvents = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const recurringOnDay = recurringTransactions.filter(t => t.paymentDay === day);
      const spotOnDay = spotEvents.filter(e => new Date(e.date).getDate() === day);
      const allEventsOnDay = [];
      recurringOnDay.forEach(t => {
        allEventsOnDay.push({ amount: t.amount, sourceBankId: t.sourceBankId });
      });
      spotOnDay.forEach(e => {
        // スポットイベントには現在bankIdがないため、sourceBankIdはnullにする
        allEventsOnDay.push({ amount: e.amount, sourceBankId: null });
      });

      if (allEventsOnDay.length > 0) {
        dailyEvents.push({ day, events: allEventsOnDay });
      }
    }

    let bankBalances = {};
    banks.forEach(b => { bankBalances[b.id] = b.amount; });

    let alerts = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const todayEvents = dailyEvents.find(e => e.day === day);
      if (todayEvents) {
        todayEvents.events.forEach(event => {
          // sourceBankIdが存在し、かつ追跡対象の銀行である場合のみ残高を更新
          if (event.sourceBankId && bankBalances.hasOwnProperty(event.sourceBankId)) {
            bankBalances[event.sourceBankId] += event.amount;
          }
        });
      }

      for (const bankId in bankBalances) {
        if (bankBalances[bankId] < 0) {
          if (!alerts.some(a => a.bankId === Number(bankId))) {
            const bank = banks.find(b => b.id === Number(bankId));
            if (bank) {
              alerts.push({
                day,
                bankId: Number(bankId), // 型を明確化
                bankName: bank.name,
                shortfall: Math.abs(bankBalances[bankId])
              });
            }
          }
        }
      }
    }

    if (alerts.length > 0) {
      forecastHtml += '<div class="forecast-section">';
      forecastHtml += '<h4>🚨 残高不足警告</h4>';
      alerts.forEach(alert => {
        forecastHtml += `
                    <div class="alert-item problematic">
                        <p><strong>${alert.day}日</strong>、<strong>${alert.bankName}</strong>の残高が不足する可能性があります。</p>
                        <p class="recommendation">少なくとも<strong>${alert.shortfall.toLocaleString()}円</strong>の入金が必要です。</p>
                    </div>`;
      });
      forecastHtml += '</div>';
    } else {
      forecastHtml += '<div class="forecast-section"><p class="forecast-ok">✅ 今月のキャッシュフローは正常です。</p></div>';
    }
  }

  if (loans.length > 0) {
    forecastHtml += '<div class="forecast-section">';
    forecastHtml += '<h4>💸 借金返済の見通し</h4>';
    loans.forEach(loan => {
      const months = calculateRepaymentPeriod(loan.loanDetails.currentBalance, Math.abs(loan.amount), loan.loanDetails.interestRate);
      if (months === Infinity) {
        forecastHtml += `
                    <div class="analysis-item problematic">
                        <p><strong>${loan.name}:</strong> このままでは返済が終わりません。返済額の見直しを強く推奨します。</p>
                    </div>`;
      } else {
        const years = Math.floor(months / 12);
        const remainingMonths = months % 12;
        forecastHtml += `
                    <div class="analysis-item">
                        <p><strong>${loan.name}:</strong> 完済まで 約 <strong>${years}</strong> 年 <strong>${remainingMonths}</strong> ヶ月</p>
                    </div>`;
      }
    });
    forecastHtml += '</div>';
  }

  container.innerHTML = forecastHtml;
  container.style.display = 'block';
}
function calculateRepaymentPeriod(balance, monthlyPayment, interestRate) {
  const MAX_REPAYMENT_MONTHS = 12 * 100;
  const monthlyInterestRate = interestRate / 100 / 12;

  if (balance * monthlyInterestRate >= monthlyPayment) {
    return Infinity;
  }

  let months = 0;
  let currentBalance = balance;
  while (currentBalance > 0) {
    const interest = currentBalance * monthlyInterestRate;
    const principalPaid = monthlyPayment - interest;
    currentBalance -= principalPaid;
    months++;
    if (months > MAX_REPAYMENT_MONTHS) return Infinity;
  }
  return months;
}

// ===================================================================================
// スポットイベント管理
// ===================================================================================

/**
 * スポットイベントを追加する
 * HTMLの onclick="addSpotEvent()" から呼び出される
 */
window.addSpotEvent = async function() {
  const date = document.getElementById('spotDate').value;
  const type = document.getElementById('spotType').value;
  const description = document.getElementById('spotDescription').value.trim();
  let amount = parseInt(document.getElementById('spotAmount').value, 10);

  if (!date || !description || isNaN(amount)) {
    showNotification('日付、内容、金額は全て必須です。', 'error');
    return;
  }

  // ユーザーは常にプラスで入力。支出の場合は、ここで負の数に変換する。
  if (type === 'expense') {
    amount = -Math.abs(amount);
  } else {
    amount = Math.abs(amount);
  }

  const newEvent = {
    id: Date.now(),
    date,
    description,
    amount,
    // bankIdは、将来的な拡張（どの銀行からの支出か）のために残しておくことも可能
  };

  oneTimeEvents.push(newEvent);
  await saveData(); // データを保存
  renderAll(); // 全てを再描画
  showNotification(`✅ イベント「${description}」を追加しました。`);

  // フォームをクリア
  document.getElementById('spotDate').value = '';
  document.getElementById('spotDescription').value = '';
  document.getElementById('spotAmount').value = '';
}

/**
 * スポットイベントを削除する
 */
window.deleteSpotEvent = async function(eventId) {
  oneTimeEvents = oneTimeEvents.filter(event => event.id !== eventId);
  await saveData(); // データを保存
  renderAll(); // 全てを再描画
  showNotification('🗑️ イベントを削除しました。');
}

/**
 * スポットイベントのリストを描画する
 * この関数は renderAll() から呼び出される
 */
function renderSpotEvents() {
  const listEl = document.getElementById('oneTimeEventsList');
  if (!listEl) return;

  const eventsThisMonth = getSpotEventsThisMonth();

  if (eventsThisMonth.length > 0) {
    const eventItemsHtml = eventsThisMonth
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(event => {
        const amountClass = event.amount >= 0 ? 'income' : 'expense';
        const icon = event.amount < 0 ? '🛒' : '⚡️';
        return `
          <div class="event-item">
              <span>${icon} ${event.date.slice(5)}: ${event.description}</span>
              <span class="amount ${amountClass}">¥${event.amount.toLocaleString()}</span>
              <button class="btn-delete-small" onclick="deleteSpotEvent(${event.id})">×</button>
          </div>
        `;
      }).join('');

    listEl.innerHTML = '<h4>今月のスポットイベント</h4>' + eventItemsHtml;
  } else {
    listEl.innerHTML = '';
  }
}