// js/common.js

/**
 * 状況に応じて適切な保存処理を呼び出す、賢い保存係。
 * @param {Array} data 保存するデータ配列
 */
async function saveData(data) {
  const user = JSON.parse(localStorage.getItem('budgetAppUser'));
  if (user && user.mode === 'google') {
    // Googleログインモードの場合
    await saveDataToDrive(data);
    // 念のため、セッションストレージにも保存してページ間の整合性を保つ
    sessionStorage.setItem('budgetMasterData', JSON.stringify(data));
  } else {
    // ローカルモードの場合
    saveDataToLocalStorage(data);
  }
}

/**
 * データをGoogle Driveに保存する
 * @param {Array} data 保存するデータ配列
 */
async function saveDataToDrive(data) {
  // セッションストレージからトークンとファイルIDを取得
  const accessToken = sessionStorage.getItem('googleAccessToken');
  const fileId = sessionStorage.getItem('driveFileId');

  if (!accessToken || !fileId) {
    console.error('Driveへの保存に必要な情報がありません。');
    showNotification('Google Driveに保存できませんでした。', 'error');
    return;
  }

  console.log(`🔄 Google Drive (ID: ${fileId}) にデータを保存しています...`);

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  const metadata = {
    mimeType: 'application/json'
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(data, null, 2) + // データをJSON文字列に
    close_delim;

  try {
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!response.ok) {
      throw new Error('ファイルのアップロードに失敗しました: ' + response.statusText);
    }

    console.log('✅ Google Driveへの保存が成功しました。');
    // 保存成功の通知は呼び出し元で行うため、ここでは不要
  } catch (error) {
    console.error('Google Driveへの保存中にエラー:', error);
    showNotification('Google Driveへの保存に失敗しました。', 'error');
  }
}

/**
 * データをlocalStorageに保存する
 * @param {Array} data 保存するデータ配列
 */
function saveDataToLocalStorage(data) {
  localStorage.setItem('budgetMasterData', JSON.stringify(data));
}


// (以降の getSampleData, showNotification は変更なし)
function getSampleData() {
  return [
    { id: 1, name: 'サンプル：給与', amount: 300000, type: 'income', paymentDay: 25, isActive: true },
    { id: 2, name: 'サンプル：家賃', amount: -80000, type: 'fixed', paymentDay: 27, isActive: true },
    { id: 3, name: 'サンプル：スマホ代', amount: -5000, type: 'fixed', paymentDay: 20, isActive: true },
    { id: 4, name: 'サンプル：奨学金返済', amount: -15000, type: 'loan', paymentDay: 27, isActive: true, loanDetails: { currentBalance: 1500000, interestRate: 1.5 } }
  ];
}

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


// ===================================================================================
// 共通ナビゲーション & ログアウト
// ===================================================================================
function goToDashboard() {
  window.location.href = 'index.html';
}

function goToMasterManagement() {
  window.location.href = 'master.html';
}

function goToSettings() {
  window.location.href = 'settings.html';
}

function logout() {
  const user = JSON.parse(localStorage.getItem('budgetAppUser'));
  if (user && user.mode === 'google') {
    const accessToken = sessionStorage.getItem('googleAccessToken');
    if (accessToken && typeof google !== 'undefined' && google.accounts) {
      google.accounts.oauth2.revoke(accessToken, () => {
        console.log('🔑 Googleアクセストークンを無効化しました。');
      });
    }
  }
  localStorage.removeItem('budgetAppUser');
  sessionStorage.clear();
  window.location.href = 'index.html';
}
