// ===================================================================================
// グローバル変数
// ===================================================================================
const GOOGLE_CLIENT_ID = '45451544416-9c9vljcaqir137dudhoj0da6ndchlph1.apps.googleusercontent.com';
let masterData = [];
let currentUser = null;
let loginMode = 'local';
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

// Google Drive連携用の変数を追加
let googleAccessToken = null;
let tokenClient;

// ===================================================================================
// 初期化処理
// ===================================================================================

/**
 * Googleのライブラリが読み込み完了したときに呼び出される
 */

window.onGoogleLibraryLoad = function() {
  console.log('✅ Googleライブラリの読み込み完了');

  // 認証クライアントを初期化
  try {
    // 1. ログイン（ID取得）用のクライアント
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleLoginSuccess
    });

    // 2. Drive APIアクセス用のトークンクライアント
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      prompt: 'consent',

      // ▼▼▼ ここから診断コード入りのcallbackに置き換えます ▼▼▼
      callback: async (tokenResponse) => { // async を追加
        if (tokenResponse && tokenResponse.access_token) {
          googleAccessToken = tokenResponse.access_token;
          console.log('🔑 Google Driveのアクセストークンを取得しました！');

          // --- ここから診断コード ---
          console.log('🕵️‍♀️ 受け取ったアクセストークンを検証します...');
          try {
            const validationResponse = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${googleAccessToken}`);
            const tokenInfo = await validationResponse.json();

            console.log('✅ トークンの鑑定結果:', tokenInfo);

            if (tokenInfo.scope && tokenInfo.scope.includes('https://www.googleapis.com/auth/drive.appdata')) {
              console.log('🟢 成功: トークンには正しいDriveスコープが含まれています。同期処理を続行します。');
              // 権限が正しいことを確認できたので、同期処理を開始
              syncWithDrive();
            } else {
              console.error('🔴 致命的なエラー: トークンにDriveの権限が含まれていません！');
              console.error('🔴 原因: OAuth同意画面の「スコープ」設定が、何らかの理由で反映されていません。');
              showNotification('認証エラー: Driveの権限がありません。設定を確認してください。', 'error');
              // ローダーが表示されている可能性があるので隠す
              document.getElementById('loadingOverlay')?.classList.remove('show');
            }
          } catch (e) {
            console.error('トークンの検証中にエラーが発生しました:', e);
            showNotification('認証トークンの検証に失敗しました。', 'error');
            document.getElementById('loadingOverlay')?.classList.remove('show');
          }
          // --- 診断コードここまで ---

        } else {
          // トークンが取得できなかった場合
          console.error('アクセストークンの取得に失敗しました。', tokenResponse);
          showNotification('Google Driveへのアクセス許可が得られませんでした。', 'error');
        }
      },
      // ▲▲▲ ここまで ▲▲▲
    });

  } catch (e) {
    console.error("Googleライブラリの初期化に失敗しました。", e);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 家計簿アプリ v2.0 起動');

  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (savedUserJSON) {
    try {
      const user = JSON.parse(savedUserJSON);
      if (user && user.name && user.mode) {
        currentUser = user;
        loginMode = user.mode;
        if (localStorage.getItem('tutorialCompleted')) {
          showApp();
        } else {
          window.location.href = 'master.html';
        }
        return;
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

async function initializeApp() {
  // Googleログインの場合は、Driveへのアクセス許可も確認する
  if (loginMode === 'google' && !googleAccessToken) {
    requestDriveAccess();
  }

  await loadData();

  // renderAllはsyncWithDriveのfinallyで呼ばれるので、ここでは不要な場合がある
  // ただし、ローカルモードの場合はここで呼ぶ必要がある
  if (loginMode !== 'google') {
    renderAll();
  }

  if (currentUser) {
    showNotification(`✅ ${currentUser.name}としてログインしました`);
  }
}

function renderAll() {
  updateCurrentMonthDisplay();
  generateCalendar();
  updateSummaryCards();
}


// ===================================================================================
// 認証 & ユーザー管理
// ===================================================================================

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

  proceedToApp();
}

function requestDriveAccess() {
  if (googleAccessToken) {
    console.log('すでにアクセストークンを持っています。');
    return;
  }
  if (tokenClient) {
    tokenClient.requestAccessToken();
  }
}

function decodeJWT(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("JWTのデコードに失敗しました:", e);
    return null;
  }
}

window.localLogin = function() {
  currentUser = { name: 'ローカルユーザー', mode: 'local' };
  loginMode = 'local';
  localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));
  proceedToApp();
}

function proceedToApp() {
  if (!localStorage.getItem('tutorialCompleted')) {
    console.log('🎉 初回ログインです。マスター管理画面に移動します。');
    localStorage.setItem('tutorialCompleted', 'true');
    window.location.href = 'master.html';
  } else {
    showApp();
  }
}

// ===================================================================================
// データ管理
// ===================================================================================
async function loadData() {
  if (loginMode === 'google') {
    if (masterData.length === 0) {
      console.log("Driveからのデータロードを待っています...");
    }
  } else {
    loadDataFromLocalStorage();
  }
}


// ===================================================================================
// UI描画 & 更新
// ===================================================================================
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

// ===================================================================================
// Google Drive API 連携
// ===================================================================================
const DRIVE_DATA_FILENAME = 'budgetMasterData.json';
let driveFileId = null;

// js/main.js の syncWithDrive 関数を置き換え

async function syncWithDrive() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  try {
    loadingOverlay.classList.add('show');

    if (!googleAccessToken) {
      showNotification('Google Driveへのアクセス許可が必要です。', 'error');
      requestDriveAccess();
      return;
    }

    // ▼▼▼ ここからリトマス試験コード ▼▼▼
    console.log('🔬 APIの生死確認テストを開始します...');
    try {
      const aboutResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { 'Authorization': `Bearer ${googleAccessToken}` }
      });

      if (!aboutResponse.ok) {
        // ここで403エラーが出た場合、APIが無効であることが確定する
        const errorBody = await aboutResponse.json();
        console.error('🔴 API生死確認テスト失敗:', errorBody);
        throw new Error('API is not enabled');
      }

      const aboutData = await aboutResponse.json();
      console.log(`🟢 APIは生きています！ ユーザー: ${aboutData.user.displayName}`);

    } catch (e) {
      if (e.message === 'API is not enabled') {
        console.error('🔴 やはりAPIが無効です！Google Cloud Consoleで「Google Drive API」を一度無効にしてから、再度有効にしてみてください。');
        showNotification('致命的なエラー: Drive APIが無効です。', 'error');
      } else {
        console.error('🔴 API生死確認テスト中に予期せぬエラー:', e);
        showNotification('APIの生死確認に失敗しました。', 'error');
      }
      // テストが失敗したので、ここで処理を中断
      return;
    }
    // ▲▲▲ リトマス試験コードここまで ▲▲▲


    // APIが生きていることが確認できたので、本来の処理を続ける
    driveFileId = await findOrCreateDataFile();
    if (driveFileId) {
      sessionStorage.setItem('googleAccessToken', googleAccessToken);
      sessionStorage.setItem('driveFileId', driveFileId);
      await loadDataFromDrive();
      showNotification('✅ Google Driveとの同期が完了しました。');
    }
  } catch (error) {
    console.error('Google Driveとの同期中にエラーが発生しました:', error);
    showNotification('Google Driveとの同期に失敗しました。', 'error');
    loadDataFromLocalStorage();
  } finally {
    loadingOverlay.classList.remove('show');
    renderAll();
  }
}

async function findOrCreateDataFile() {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_DATA_FILENAME}' and 'appDataFolder' in parents&spaces=appDataFolder&fields=files(id,name)`, {
    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
  });
  if (!response.ok) throw new Error('ファイル検索に失敗しました: ' + response.statusText);

  const data = await response.json();
  if (data.files.length > 0) {
    console.log(`📄 データファイルが見つかりました。ID: ${data.files[0].id}`);
    return data.files[0].id;
  }

  console.log('データファイルが見つからないため、新規作成します。');
  const metadata = {
    name: DRIVE_DATA_FILENAME,
    parents: ['appDataFolder']
  };
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });
  if (!createResponse.ok) throw new Error('ファイルの作成に失敗しました: ' + createResponse.statusText);

  const newFile = await createResponse.json();
  console.log(`📄 新しいデータファイルを作成しました。ID: ${newFile.id}`);
  return newFile.id;
}

async function loadDataFromDrive() {
  if (!driveFileId) return;

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
  });
  if (!response.ok) throw new Error('ファイルの読み込みに失敗しました: ' + response.statusText);

  try {
    const dataText = await response.text();
    if (dataText) {
      masterData = JSON.parse(dataText);
      console.log('📂 Google Driveからデータを読み込みました。');
    } else {
      console.log('📂 Driveのファイルは空です。サンプルデータで初期化します。');
      masterData = getSampleData();
    }
    sessionStorage.setItem('budgetMasterData', JSON.stringify(masterData));
  } catch (e) {
    console.error('Driveデータの解析に失敗しました。', e);
    masterData = getSampleData();
    sessionStorage.setItem('budgetMasterData', JSON.stringify(masterData));
  }
}

function loadDataFromLocalStorage() {
  try {
    const savedMaster = localStorage.getItem('budgetMasterData');
    if (savedMaster) {
      masterData = JSON.parse(savedMaster);
      console.log('📂 [フォールバック] ローカルデータを読み込みました。');
    } else {
      masterData = getSampleData();
      console.log('📂 [フォールバック] サンプルデータを読み込みました。');
    }
  } catch (e) {
    console.error("ローカルデータの解析に失敗しました。", e);
    masterData = getSampleData();
  }
}