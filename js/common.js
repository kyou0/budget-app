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

/**
 * 現在のマスターデータを適切な場所に保存する（ローカル/Drive両対応）
 * この関数は、呼び出し元のページの `masterData` グローバル変数を参照します。
 */
async function saveData() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  // ログインモードは、localStorageのユーザー情報から取得するのが最も安全で確実
  const user = JSON.parse(localStorage.getItem('budgetAppUser'));
  const currentLoginMode = user ? user.mode : 'local';

  if (loadingOverlay) loadingOverlay.classList.add('show');

  try {
    // 1. まず短期記憶（セッションストレージ）に常に保存する
    // これにより、ページを移動してもデータが維持される
    sessionStorage.setItem('budgetMasterData', JSON.stringify(masterData));

    if (currentLoginMode === 'google') {
      // 2. Googleログインの場合、Driveにも保存する
      const accessToken = sessionStorage.getItem('googleAccessToken');
      const fileId = sessionStorage.getItem('driveFileId');

      if (!accessToken || !fileId) {
        throw new Error('Google Driveに接続されていません。再ログインしてください。');
      }

      const metadata = { mimeType: 'application/json' };
      const content = JSON.stringify(masterData, null, 2); // 整形して保存
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([content], { type: 'application/json' }));

      const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: form
      });

      if (!response.ok) {
        // トークン切れ(401)などのエラー
        throw new Error('Driveへの保存に失敗しました: ' + response.statusText);
      }
      console.log('📄 Google Driveにデータを保存しました。');
      // showNotification('✅ Google Driveに保存しました！'); // 保存成功の通知は各ページで行う場合が多いので、ここではコメントアウトしても良い

    } else {
      // 3. ローカルモードの場合、ローカルストレージに保存する
      localStorage.setItem('budgetMasterData', JSON.stringify(masterData));
      console.log('📄 ローカルストレージにデータを保存しました。');
    }
  } catch (error) {
    console.error('データの保存中にエラーが発生しました:', error);
    showNotification(error.message || 'データの保存に失敗しました。', 'error');
    // エラーが発生したことを呼び出し元に伝えるために、エラーを再スローする
    throw error;
  } finally {
    // 成功しても失敗しても、必ずローディング画面を非表示にする
    if (loadingOverlay) loadingOverlay.classList.remove('show');
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