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

    // ★最重要：新しいデータ保管場所をクリアする
    localStorage.removeItem('budgetAppData');

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
/**
 * アプリの全データを保存する統一関数
 * @returns {Promise<void>}
 */
async function saveData() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  // master.htmlなどにはloadingOverlayがない可能性を考慮
  if (loadingOverlay) loadingOverlay.classList.add('show');

  try {
    // ★重要：他のページでイベントが消えないように、現在のストレージからイベントデータを読み込む
    let currentEvents = [];
    if (typeof oneTimeEvents !== 'undefined') {
      // index.jsにいる場合は、メモリ上の最新のイベントデータを使用
      currentEvents = oneTimeEvents;
    } else {
      // master.jsなど、oneTimeEvents変数が無いページの場合
      const existingData = localStorage.getItem('budgetAppData');
      if (existingData) {
        currentEvents = (JSON.parse(existingData).events || []);
      }
    }

    const appData = {
      master: masterData, // masterDataはどのページでもグローバルに更新されている前提
      events: currentEvents
    };
    const dataString = JSON.stringify(appData, null, 2);

    // ★最重要：常にローカルストレージに保存する
    localStorage.setItem('budgetAppData', dataString);

    if (loginMode === 'google') {
      // GoogleモードではDriveにもアップロード
      await saveToDrive(dataString);
    }

    console.log('✅ データが正常に保存されました。');
    showNotification('✅ データが保存されました。');

  } catch (error) {
    console.error("データの保存に失敗しました:", error);
    showNotification('データの保存に失敗しました。', 'error');
  } finally {
    if (loadingOverlay) loadingOverlay.classList.remove('show');
  }
}

/**
 * Google Driveにデータを書き込むヘルパー関数
 */
// common.js

/**
 * Google Driveにデータを保存する
 * @param {string} dataToSave 保存するJSON文字列
 */
async function saveToDrive(dataToSave) {
  // グローバル変数に頼るのではなく、共通の保管庫(sessionStorage)から直接トークンを取得する
  const accessToken = sessionStorage.getItem('googleAccessToken');
  const fileId = sessionStorage.getItem('driveFileId');

  // トークンやファイルIDがない場合は、処理を中断してエラーを通知
  if (!accessToken || !fileId) {
    console.error('Driveへの保存に必要な情報（トークンまたはファイルID）がありません。');
    showNotification('Google Driveに保存できませんでした。再ログインしてください。', 'error');
    // ここでエラーを投げることで、呼び出し元のcatchブロックで補足できるようにする
    throw new Error('アクセストークンまたはファイルIDがありません。');
  }
  // ★★★ここまで★★★

  // Google Drive APIのエンドポイント
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      // 保管庫から取り出したaccessToken変数を使用する
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: dataToSave
  });

  if (!response.ok) {
    // エラーレスポンスの内容を詳しくログに出力すると、デバッグがしやすくなります
    const errorBody = await response.text();
    console.error('Google Drive API Error:', response.status, response.statusText, errorBody);
    throw new Error(`Google Driveへの保存に失敗しました: ${response.statusText}`);
  }

  console.log('📄 Google Driveへのデータ保存が成功しました。');
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