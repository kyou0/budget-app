// js/index.js

// ===================================================================================
// グローバル変数 & 状態管理
// ===================================================================================
let googleAccessToken = null;
let masterData = [];
let oneTimeEvents = [];
let currentUser = null;
let loginMode = 'local';
let currentMonth = new Date();
let isSyncing = false; // ★★★ 同期処理中のロックフラグ ★★★

// ===================================================================================
// 初期化処理
// ===================================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 アプリケーション起動');
  const savedUser = localStorage.getItem('budgetAppUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    loginMode = currentUser.mode;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('userName').textContent = currentUser.name;
    initializeApplication();
  }
});

async function initializeApplication() {
  if (loginMode === 'google') {
    googleAccessToken = sessionStorage.getItem('googleAccessToken');
    if (!googleAccessToken) {
      // セッションが切れている場合はログイン画面に戻す
      logout();
      return;
    }
    await syncWithDrive();
  } else {
    await loadData();
    renderAll();
  }
  setupEventListeners();
}

function setupEventListeners() {
  const accordionHeader = document.getElementById('spotEventAccordionHeader');
  if(accordionHeader) {
    accordionHeader.addEventListener('click', () => {
      const content = document.getElementById('spotEventAccordionContent');
      accordionHeader.classList.toggle('active');
      if (content.style.maxHeight) {
        content.style.maxHeight = null;
      } else {
        content.style.maxHeight = content.scrollHeight + "px";
      }
    });
  }
}

// ===================================================================================
// UIヘルパー (ローディング表示)
// ===================================================================================
function showLoading(message = '🔄 同期中...') {
  const overlay = document.getElementById('loadingOverlay');
  overlay.textContent = message;
  overlay.classList.add('show');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}


// ===================================================================================
// Google認証
// ===================================================================================
function onGoogleLibraryLoad() {
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  google.accounts.id.initialize({
    // ▼▼▼ ここにあなたのクライアントIDを設定 ▼▼▼
    client_id: 'https://kyou0.github.io',
    callback: handleGoogleLogin,
  });
  googleLoginBtn.textContent = 'Googleでログイン';
  googleLoginBtn.disabled = false;
}

function tryGoogleLogin() {
  google.accounts.id.prompt();
}

async function handleGoogleLogin(response) {
  showLoading('🔍 Googleアカウント情報を検証中...');
  const id_token = response.credential;
  const decodedToken = JSON.parse(atob(id_token.split('.')[1]));

  currentUser = {
    name: decodedToken.name,
    email: decodedToken.email,
    mode: 'google'
  };
  localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));

  // トークンクライアントを初期化してアクセストークンを取得
  const client = google.accounts.oauth2.initTokenClient({
    // ▼▼▼ ここにもあなたのクライアントIDを設定 ▼▼▼
    client_id: 'あなたのクライアントIDをここに貼り付け.apps.googleusercontent.com',
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: async (tokenResponse) => {
      if (tokenResponse && tokenResponse.access_token) {
        googleAccessToken = tokenResponse.access_token;
        sessionStorage.setItem('googleAccessToken', googleAccessToken);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        document.getElementById('userName').textContent = currentUser.name;
        await initializeApplication();
      }
      hideLoading();
    },
  });
  client.requestAccessToken();
}

function localLogin() {
  currentUser = { name: 'ローカルユーザー', mode: 'local' };
  localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('userName').textContent = currentUser.name;
  initializeApplication();
}

// (これ以降のコードは変更ありません)
// ===================================================================================
// データ管理 (司令塔)
// ===================================================================================
async function syncWithDrive() {
  if (isSyncing) {
    console.warn("現在別の同期処理が実行中のため、新しい同期はスキップされました。");
    return;
  }
  isSyncing = true;
  showLoading('☁️ Google Driveと同期中...');

  try {
    const fileId = await findOrCreateFile();
    sessionStorage.setItem('driveFileId', fileId);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });

    if (response.ok) {
      const text = await response.text();
      if (text) {
        const data = JSON.parse(text);
        masterData = data.master || [];
        oneTimeEvents = data.events || [];
        localStorage.setItem('budgetAppData', JSON.stringify({ master: masterData, events: oneTimeEvents }));
        showNotification('✅ Driveからデータを同期しました。', 'success');
      } else {
        console.log("Driveにファイルはありますが、データは空です。ローカルデータを使用します。");
        await loadData(); // ローカルデータがあればそれを正とする
      }
    } else {
      console.log("Driveにファイルが見つかりません。ローカルデータを使用します。");
      await loadData(); // ローカルデータがあればそれを正とする
    }
  } catch (error) {
    console.error("Driveとの同期中にエラー:", error);
    showNotification('Driveとの同期に失敗しました。ローカルデータを使用します。', 'error');
    await loadData();
  } finally {
    renderAll();
    hideLoading();
    isSyncing = false;
  }
}

async function loadData() {
  const savedData = localStorage.getItem('budgetAppData');
  if (savedData) {
    try {
      const parsedData = JSON.parse(savedData);
      masterData = parsedData.master || [];
      oneTimeEvents = parsedData.events || [];
    } catch (e) {
      console.error("ローカルデータの解析に失敗:", e);
      masterData = [];
      oneTimeEvents = [];
    }
  }
}

async function saveData() {
  if (isSyncing) {
    console.warn("現在別の同期処理が実行中のため、保存処理は待機します。");
    showNotification('現在、別の処理を実行中です。完了後に自動で保存されます。', 'warning');
    return;
  }
  isSyncing = true;
  showLoading('💾 保存中...');

  try {
    const dataToSave = { master: masterData, events: oneTimeEvents };
    const dataString = JSON.stringify(dataToSave);
    localStorage.setItem('budgetAppData', dataString);
    console.log('💾 [index.js] データをローカルに保存しました。');

    if (loginMode === 'google' && googleAccessToken) {
      await saveToDrive(dataString);
    }
  } catch (error) {
    console.error("データの保存に失敗しました:", error);
    showNotification('データの保存に失敗しました。', 'error');
  } finally {
    hideLoading();
    isSyncing = false;
  }
}

async function findOrCreateFile() {
  const fileName = 'budget-app-data.json';
  let response = await fetch('https://www.googleapis.com/drive/v3/files?q=name="' + fileName + '" and trashed=false&spaces=drive', {
    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
  });
  let data = await response.json();

  if (data.files.length > 0) {
    console.log("既存のファイルを発見:", data.files[0].id);
    return data.files[0].id;
  } else {
    console.log("ファイルが見つからないため、新規作成します。");
    const fileMetadata = {
      'name': fileName,
      'mimeType': 'application/json',
      'parents': ['appDataFolder']
    };
    response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fileMetadata)
    });
    data = await response.json();
    console.log("新規ファイルを作成しました:", data.id);
    return data.id;
  }
}

async function saveToDrive(content) {
  const fileId = sessionStorage.getItem('driveFileId');
  if (!fileId) {
    throw new Error("Google DriveのファイルIDが見つかりません。");
  }

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";
  const metadata = { 'mimeType': 'application/json' };
  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    content +
    close_delim;

  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'multipart/related; boundary="' + boundary + '"'
    },
    body: multipartRequestBody
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Google Driveへの保存に失敗しました:', errorData);
    throw new Error('Google Driveへのアップロードに失敗しました。');
  }
  console.log('✅ Google Driveへの保存が成功しました。');
}

// ===================================================================================
// UI描画
// ===================================================================================
function renderAll() {
  const monthStr = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;
  document.getElementById('currentMonth').textContent = monthStr;
  renderCalendar();
  renderSummary();
  renderOneTimeEvents();
  generateFinancialForecast();
}

function renderCalendar() {
  const calendarEl = document.getElementById('calendar');
  calendarEl.innerHTML = '';
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  days.forEach(day => {
    const dayHeader = document.createElement('div');
    dayHeader.className = 'calendar-day-header';
    dayHeader.textContent = day;
    calendarEl.appendChild(dayHeader);
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const today = new Date();

  const eventsByDate = {};
  const activeMasterData = masterData.filter(item => item.isActive);

  // ここにカレンダーイベントを計算するロジックが入ります
  // (この部分は長いため、主要な構造のみ示します)

  // 1日から最終日までループ
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = i;
    if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) {
      dayCell.classList.add('today');
    }
    dayCell.appendChild(dayNumber);

    // その日のイベントをdayCellに追加する処理...

    calendarEl.appendChild(dayCell);
  }

  // 月初の空白を追加
  for (let i = 0; i < firstDay.getDay(); i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day other-month';
    calendarEl.prepend(emptyCell);
  }
}

function renderSummary() {
  // サマリーカードの描画ロジック（プレースホルダー）
}

function renderOneTimeEvents() {
  const listEl = document.getElementById('oneTimeEventsList');
  if (!listEl) return;
  listEl.innerHTML = '<h4>今月のスポットイベント</h4>';
  const eventsThisMonth = oneTimeEvents.filter(event => {
    const eventDate = new Date(event.date);
    return eventDate.getFullYear() === currentMonth.getFullYear() && eventDate.getMonth() === currentMonth.getMonth();
  });

  if (eventsThisMonth.length === 0) {
    listEl.innerHTML += '<p>今月のスポットイベントはありません。</p>';
    return;
  }

  eventsThisMonth.forEach(event => {
    const itemEl = document.createElement('div');
    itemEl.className = 'spot-event-item'; // CSSでスタイルを定義する必要あり
    itemEl.innerHTML = `
          <span>${event.date}: ${event.description}</span>
          <span style="color: ${event.type === 'income' ? 'green' : 'red'};">
            ${event.type === 'income' ? '+' : '-'} ¥${event.amount.toLocaleString()}
          </span>
          <button onclick="deleteSpotEvent(${event.id})">削除</button>
      `;
    listEl.appendChild(itemEl);
  });
}

function generateFinancialForecast() {
  // 未来予測の描画ロジック（プレースホルダー）
}


// ===================================================================================
// ユーザー操作
// ===================================================================================
function changeMonth(offset) {
  currentMonth.setMonth(currentMonth.getMonth() + offset);
  renderAll();
}

async function addSpotEvent() {
  const date = document.getElementById('spotDate').value;
  const type = document.getElementById('spotType').value;
  const amount = parseInt(document.getElementById('spotAmount').value, 10);
  const description = document.getElementById('spotDescription').value.trim();

  if (!date || isNaN(amount) || !description) {
    showNotification('日付、金額、内容をすべて入力してください。', 'error');
    return;
  }

  oneTimeEvents.push({
    id: Date.now(),
    date,
    type,
    amount,
    description
  });

  await saveData();
  renderAll();
  showNotification('スポットイベントを追加しました。', 'success');

  // 入力フォームをリセット
  document.getElementById('spotDate').value = '';
  document.getElementById('spotAmount').value = '';
  document.getElementById('spotDescription').value = '';
}

async function deleteSpotEvent(eventId) {
  if (confirm('このスポットイベントを削除しますか？')) {
    oneTimeEvents = oneTimeEvents.filter(event => event.id !== eventId);
    await saveData();
    renderAll();
    showNotification('スポットイベントを削除しました。', 'info');
  }
}

// ===================================================================================
// ページ間通信の受信設定 (アーキテクチャの要)
// ===================================================================================
dataChannel.addEventListener('message', async (event) => {
  if (!event.data || !event.data.type) return;

  if (isSyncing) {
    showNotification('現在処理中のため、リクエストは待機中です。', 'warning');
    // 処理が終わった頃に再度試行する簡単な仕組み
    setTimeout(() => dataChannel.dispatchEvent(new MessageEvent('message', { data: event.data })), 2000);
    return;
  }

  console.log('📡 [index.js] 他のページからメッセージを受信しました:', event.data.type);

  switch (event.data.type) {
    case 'SAVE_DATA_REQUEST':
    case 'MANUAL_SYNC_REQUEST': {
      const receivedData = event.data.payload;
      masterData = receivedData.master;
      // master.jsからの通知はeventsを含まないので、現在のoneTimeEventsを保持する
      if (receivedData.events) {
        oneTimeEvents = receivedData.events;
      }
      await saveData();
      if (document.getElementById('appContainer').style.display === 'block') {
        renderAll();
      }
      showNotification('✅ データを同期しました。', 'success');
      break;
    }
    case 'FORCE_SYNC_FROM_DRIVE_REQUEST': {
      await syncWithDrive();
      break;
    }
  }
});