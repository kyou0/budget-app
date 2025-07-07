// ===================================================================================
// 共通のナビゲーション関数
// HTMLのonclickから呼び出せるように、windowオブジェクトに登録します。
// ===================================================================================

/**
 * ダッシュボードページに移動する
 */
window.goToDashboard = function() {
  window.location.href = 'index.html';
}

/**
 * マスター管理ページに移動する
 */
window.goToMaster = function() {
  window.location.href = 'master.html';
}

/**
 * 設定ページに移動する
 */
window.goToSettings = function() {
  window.location.href = 'settings.html';
}

// ===================================================================================
// 共通の認証機能
// ===================================================================================

/**
 * ユーザーをログアウトさせる
 */
window.logout = function() {
  if (confirm('ログアウトしますか？')) {
    // Googleの認証情報をクリア
    sessionStorage.removeItem('googleAccessToken');
    sessionStorage.removeItem('driveFileId');
    // セッションのマスターデータをクリア
    sessionStorage.removeItem('budgetMasterData');
    // ローカルのユーザー情報をクリア
    localStorage.removeItem('budgetAppUser');

    console.log('ログアウトしました。');
    showNotification('ログアウトしました。', 'info');

    // 1秒後にログインページにリダイレクト
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  }
}

// ===================================================================================
// 共通のUI機能
// ===================================================================================

/**
 * 画面右上に通知を表示する
 * @param {string} message - 表示するメッセージ
 * @param {string} type - 'success'(緑), 'error'(赤), 'warning'(黄), 'info'(青)
 */
function showNotification(message, type = 'success') {
  // 古い通知があれば削除
  const oldNotification = document.querySelector('.sync-notification');
  if (oldNotification) {
    oldNotification.remove();
  }

  const notification = document.createElement('div');
  notification.className = `sync-notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // 4秒後に通知を消す
  setTimeout(() => {
    notification.remove();
  }, 4000);
}


// ===================================================================================
// 共通のデータ保存機能 (★最重要★)
// ===================================================================================

// js/common.js

/**
 * アプリの全データを保存する統一関数
 */
async function saveData() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  loadingOverlay.classList.add('show');
  try {
    // 保存するデータを一つのオブジェクトにまとめる
    const appData = {
      master: masterData,
      // index.jsにしか無い変数のため、存在をチェックする
      events: typeof oneTimeEvents !== 'undefined' ? oneTimeEvents : []
    };
    const dataString = JSON.stringify(appData, null, 2);

    if (loginMode === 'google') {
      // Google Drive利用時
      sessionStorage.setItem('budgetAppData', dataString);
      await saveToDrive(dataString);
    } else {
      // ローカル利用時
      localStorage.setItem('budgetAppData', dataString);
    }
    console.log('✅ データが正常に保存されました。');

  } catch (error) {
    console.error("データの保存に失敗しました:", error);
    showNotification('データの保存に失敗しました。', 'error');
  } finally {
    loadingOverlay.classList.remove('show');
  }
}

/**
 * Google Driveにデータを書き込むヘルパー関数
 */
async function saveToDrive(dataString) {
  if (!googleAccessToken) {
    showNotification('Google Driveへの保存に失敗しました。再ログインしてください。', 'error');
    return;
  }
  const fileId = sessionStorage.getItem('driveFileId');
  if (!fileId) {
    showNotification('Google Driveへの保存に失敗しました (ファイルID不明)。', 'error');
    return;
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
    dataString +
    close_delim;

  try {
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'multipart/related; boundary="' + boundary + '"'
      },
      body: multipartRequestBody
    });
    if (!response.ok) {
      throw new Error('Google Driveへの書き込みに失敗しました。');
    }
    console.log('✅ Google Driveにデータを書き込みました。');
  } catch (error) {
    console.error(error);
    showNotification(error.message, 'error');
  }
}

// ===================================================================================
// 補助機能 (サンプルデータなど)
// ===================================================================================

/**
 * テスト用のサンプルデータを返す
 */
function getSampleData() {
  const now = Date.now();
  return [
    { id: now, name: "給与", type: "income", amount: 300000, paymentDay: 25, isActive: true, sourceBankId: now + 4 },
    { id: now + 1, name: "楽天カード", type: "card", amount: -50000, paymentDay: 27, isActive: true },
    { id: now + 2, name: "家賃", type: "fixed", amount: -80000, paymentDay: 1, isActive: true },
    { id: now + 3, name: "アコム", type: "loan", amount: -10000, paymentDay: 5, isActive: true, loanDetails: { loanType: "消費者金融", interestRate: 18.0, maxLimit: 500000, currentBalance: 250000 } },
    { id: now + 4, name: "メインバンク", type: "bank", amount: 0, paymentDay: null, isActive: true },
    { id: now + 5, name: "住民税", type: "tax", amount: -15000, paymentDay: 10, isActive: true },
    { id: now + 6, name: "食費", type: "variable", amount: -40000, paymentDay: null, isActive: true }
  ];
}