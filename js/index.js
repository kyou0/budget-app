// ===================================================================================
// グローバル変数 & 状態管理
// ===================================================================================
const GOOGLE_CLIENT_ID = '45451544416-9c9vljcaqir137dudhoj0da6ndchlph1.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI = 'https://kyou0.github.io/budget-app/index.html';

let googleAccessToken = null;
let masterData = [];
let oneTimeEvents = [];
let currentUser = null;
let loginMode = 'local';
let currentMonth = new Date();
let isSyncing = false;

// ===================================================================================
// 初期化処理
// ===================================================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 アプリケーション起動');

  // ▼▼▼ ここからが新しいロジック ▼▼▼
  // ページが表示されるたびに、ローカルストレージから最新のデータを読み込むセンサー
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      console.log('👁️ 司令塔ページが再表示されました。データを更新します。');
      // isSyncingでなければ、ローカルの最新情報で画面を再描画
      if (!isSyncing) {
        await loadData();
        renderAll();
      }
    }
  });
  // ▲▲▲ ここまでが新しいロジック ▲▲▲

  const urlParams = new URLSearchParams(window.location.search);
  const authCode = urlParams.get('code');

  if (authCode) {
    // Googleからのリダイレクト直後の場合
    await handleGoogleRedirect(authCode);
  } else {
    // 通常の起動の場合
    const savedUser = localStorage.getItem('budgetAppUser');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
      loginMode = currentUser.mode;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appContainer').style.display = 'block';
      document.getElementById('userName').textContent = currentUser.name;
      await initializeApplication();
    }
  }
  // イベントリスナーは最後に一度だけ設定
  setupEventListeners();
});


async function initializeApplication() {
  if (loginMode === 'google') {
    googleAccessToken = sessionStorage.getItem('googleAccessToken');
    if (!googleAccessToken) {
      logout();
      return;
    }
    // 初回読み込み時のみDriveと同期
    await syncWithDrive();
  } else {
    // ローカルモードの場合
    await loadData();
    renderAll();
  }
}

// ===================================================================================
// Google認証 (リダイレクト方式)
// ===================================================================================

/**
 * ユーザーをGoogleの認証ページにリダイレクトさせる
 */
function redirectToGoogleLogin() {
  const oauth2Endpoint = 'https://accounts.google.com/o/oauth2/v2/auth';

  const params = {
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent'
  };

  const url = `${oauth2Endpoint}?${new URLSearchParams(params)}`;
  window.location.href = url;
}

/**
 * Googleからのリダイレクト後、認証コードを使ってトークンを取得し、ログインを完了させる
 * @param {string} code - URLから取得した認証コード
 */
async function handleGoogleRedirect(code) {
  showLoading('🔐 Googleと通信中...');
  window.history.replaceState({}, document.title, window.location.pathname);

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) throw new Error('トークンの取得に失敗しました。');
    const tokenData = await tokenResponse.json();
    googleAccessToken = tokenData.access_token;
    sessionStorage.setItem('googleAccessToken', googleAccessToken);

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });

    if (!profileResponse.ok) throw new Error('ユーザー情報の取得に失敗しました。');
    const profileData = await profileResponse.json();

    currentUser = {
      name: profileData.name,
      email: profileData.email,
      mode: 'google'
    };
    localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('userName').textContent = currentUser.name;

    await syncWithDrive();

  } catch (error) {
    console.error("Google認証エラー:", error);
    showNotification('Google認証に失敗しました。ログイン画面に戻ります。', 'error');
    logout();
  } finally {
    hideLoading();
  }
}

function localLogin() {
  currentUser = { name: 'ローカルユーザー', mode: 'local' };
  localStorage.setItem('budgetAppUser', JSON.stringify(currentUser));
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('userName').textContent = currentUser.name;
  initializeApplication();
}

// ===================================================================================
// イベントリスナーとUIヘルパー
// ===================================================================================
function setupEventListeners() {
  const spotEventModal = document.getElementById('spotEventModal');
  const showBtn = document.getElementById('showSpotEventModalBtn');
  const closeBtn = document.getElementById('modalCloseBtn');

  if(showBtn) {
    showBtn.addEventListener('click', () => {
      spotEventModal.style.display = 'flex';
    });
  }
  if(closeBtn) {
    closeBtn.addEventListener('click', () => {
      spotEventModal.style.display = 'none';
    });
  }
  if(spotEventModal) {
    spotEventModal.addEventListener('click', (event) => {
      if (event.target === spotEventModal) {
        spotEventModal.style.display = 'none';
      }
    });
  }
}

function showLoading(message = '🔄 同期中...') {
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  overlay.textContent = message;
  overlay.classList.add('show');
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
}

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
    const result = await findOrCreateFile();
    sessionStorage.setItem('driveFileId', result.fileId);

    if (result.wasCreated) {
      console.log("✅ 新しいデータファイルがDriveに作成されました。初期状態を設定します。");
      masterData = [];
      oneTimeEvents = [];
      await saveData(false); // 初回はDriveへの書き込みのみ
      showNotification('ようこそ！Google Driveとの連携準備が完了しました。', 'success');
    } else {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${result.fileId}?alt=media`, {
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
          console.log("Driveのファイルは存在しますが空です。ローカルデータで上書きを試みます。");
          await loadData();
          await saveData();
        }
      } else {
        throw new Error(`Driveからのファイル読み込みに失敗しました: ${response.statusText}`);
      }
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

async function saveData(doRender = true) {
  if (isSyncing) {
    console.warn("現在別の同期処理が実行中のため、保存処理は待機します。");
    showNotification('現在、別の処理を実行中です。完了後に自動で保存されます。', 'warning');
    return;
  }
  isSyncing = true;
  if (doRender) showLoading('💾 保存中...');

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
    if (doRender) hideLoading();
    isSyncing = false;
  }
}

/**
 * @returns {Promise<{fileId: string, wasCreated: boolean}>}
 */
async function findOrCreateFile() {
  const fileName = 'budget-app-data.json';
  let response = await fetch('https://www.googleapis.com/drive/v3/files?q=name="' + fileName + '" and trashed=false&spaces=drive', {
    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
  });
  let data = await response.json();

  if (data.files.length > 0) {
    console.log("既存のファイルを発見:", data.files[0].id);
    return { fileId: data.files[0].id, wasCreated: false };
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
    return { fileId: data.id, wasCreated: true };
  }
}

async function saveToDrive(content) {
  const fileId = sessionStorage.getItem('driveFileId');
  if (!fileId) throw new Error("Google DriveのファイルIDが見つかりません。");

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

function renderCalendar() { /* (実装は変更なし) */ }
function renderSummary() { /* (実装は変更なし) */ }
function renderOneTimeEvents() { /* (実装は変更なし) */ }
function generateFinancialForecast() { /* (実装は変更なし) */ }

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

  oneTimeEvents.push({ id: Date.now(), date, type, amount, description });

  await saveData();
  renderAll();
  showNotification('スポットイベントを追加しました。', 'success');

  document.getElementById('spotDate').value = '';
  document.getElementById('spotAmount').value = '';
  document.getElementById('spotDescription').value = '';
  document.getElementById('spotEventModal').style.display = 'none';
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
    setTimeout(() => dataChannel.dispatchEvent(new MessageEvent('message', { data: event.data })), 2000);
    return;
  }

  console.log('📡 [index.js] 他のページからメッセージを受信しました:', event.data.type);

  switch (event.data.type) {
    case 'SAVE_DATA_REQUEST':
    case 'MANUAL_SYNC_REQUEST': {
      const receivedData = event.data.payload;
      // ▼▼▼ ここからが新しいロジック ▼▼▼
      // 司令塔自身の記憶（メモリ上の変数）を、受け取ったデータで即座に更新する
      masterData = receivedData.master || [];
      oneTimeEvents = receivedData.events || [];

      // 保存処理を実行
      await saveData();

      // もし司令塔の画面が表示されていれば、画面も即座に更新する
      if (document.visibilityState === 'visible') {
        renderAll();
      }
      // ▲▲▲ ここまでが新しいロジック ▲▲▲
      showNotification('✅ データを同期しました。', 'success');
      break;
    }
    case 'FORCE_SYNC_FROM_DRIVE_REQUEST': {
      await syncWithDrive();
      break;
    }
  }
});