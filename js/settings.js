// ===================================================================================
// グローバル変数 & 初期設定
// ===================================================================================
let currentUser = null;
let masterData = []; // このページでもデータを持つ
let loginMode = 'local'; // ★★★ 修正ポイント1: loginModeを定義 ★★★

// ===================================================================================
// 初期化処理 & ログインチェック
// ===================================================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 設定ページ起動');

  // ★★★ 他のページと共通の認証ガード ★★★
  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (!savedUserJSON) {
    // ログインしていない場合は、ログインページに強制送還
    const appContainer = document.getElementById('appContainer');
    appContainer.innerHTML = `
      <div class="login-required-message">
        <h2>ログインが必要です</h2>
        <p>設定を管理するには、まずログインしてください。</p>
        <button class="btn" onclick="goToDashboard()">ダッシュボードに戻る</button>
      </div>
    `;
    return;
  }

  currentUser = JSON.parse(savedUserJSON);
  loginMode = currentUser.mode; // ★★★ 修正ポイント2: ログインモードを設定 ★★★

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('userName').textContent = currentUser.name;

  loadData();
  updateSyncStatus();
});

// ===================================================================================
// データ管理
// ===================================================================================
function loadData() {
  // master.js と全く同じロジックでデータを読み込む
  if (loginMode === 'google') {
    const sessionData = sessionStorage.getItem('budgetMasterData');
    if (sessionData) {
      try {
        masterData = JSON.parse(sessionData);
        console.log('📂 [Googleモード] セッションからデータを読み込みました。');
      } catch (e) {
        console.error("セッションデータの解析に失敗:", e);
        masterData = [];
      }
    } else {
      console.warn('セッションデータが見つかりません。');
      // Drive同期はメインページで行うため、ここでは通知に留める
      showNotification('最新のデータを取得できませんでした。ダッシュボードに戻って再同期してください。', 'warning');
    }
  } else {
    // ローカルモード
    const savedData = localStorage.getItem('budgetMasterData');
    masterData = savedData ? JSON.parse(savedData) : [];
    console.log('📂 [ローカルモード] ローカルデータを読み込みました。');
  }
}

// ===================================================================================
// UI更新
// ===================================================================================
function updateSyncStatus() {
  const statusBadge = document.getElementById('syncStatus');
  const syncButton = document.getElementById('manualSyncBtn');
  if (loginMode === 'google') {
    statusBadge.textContent = 'Google Drive';
    statusBadge.className = 'status-badge google';
    syncButton.disabled = false;
  } else {
    statusBadge.textContent = 'ローカルモード';
    statusBadge.className = 'status-badge local';
    syncButton.disabled = true;
  }
}

// ===================================================================================
// 機能（本体システムと連携）
// ===================================================================================

/**
 * 手動でGoogle Driveと同期する
 */
async function manualSync() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  try {
    loadingOverlay.classList.add('show');
    showNotification('☁️ Google Driveと手動で同期しています...', 'info');

    // ★★★ 修正ポイント3: 賢い保存係に任せる ★★★
    await saveData(); // これだけでローカル/Drive両対応

    // 保存後、念のためDriveから最新データを再読み込み（他のデバイスでの変更を反映）
    await forceSyncFromDrive(false); // 通知なしで同期

    showNotification('✅ 同期が完了しました！');

  } catch (error) {
    console.error("手動同期エラー:", error);
    showNotification(error.message || '同期に失敗しました。', 'error');
  } finally {
    loadingOverlay.classList.remove('show');
  }
}

/**
 * Driveから最新のデータを強制的に取得する
 * @param {boolean} showSuccessNotification - 成功時に通知を表示するかどうか
 */
async function forceSyncFromDrive(showSuccessNotification = true) {
  const accessToken = sessionStorage.getItem('googleAccessToken');
  const fileId = sessionStorage.getItem('driveFileId');

  if (!accessToken || !fileId) {
    showNotification('Google Driveに接続されていません。', 'error');
    return;
  }

  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.add('show');

  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('ファイルの読み込みに失敗しました');

    const dataText = await response.text();
    if (dataText) {
      masterData = JSON.parse(dataText);
      // 読み込んだデータを短期記憶(sessionStorage)に保存
      sessionStorage.setItem('budgetMasterData', JSON.stringify(masterData));
      if (showSuccessNotification) {
        showNotification('✅ Driveからデータを同期しました！');
      }
    } else {
      showNotification('Driveのファイルは空です。', 'warning');
    }
  } catch (error) {
    console.error("Driveからの同期に失敗:", error);
    showNotification('Driveからの同期に失敗しました。', 'error');
  } finally {
    if (loadingOverlay) loadingOverlay.classList.remove('show');
  }
}


/**
 * 現在のデータをJSONファイルとしてエクスポートする
 */
function exportData() {
  if (masterData.length === 0) {
    showNotification('エクスポートするデータがありません。', 'warning');
    return;
  }
  const dataStr = JSON.stringify(masterData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'budget-data.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showNotification('📤 データのエクスポートを開始しました。');
}

/**
 * JSONファイルをインポートしてデータを復元する
 */
async function importData() {
  if (!confirm('現在のデータは上書きされます。バックアップファイルからデータを復元しますか？')) {
    return;
  }

  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);

          // ▼▼▼ ここに「門番」となるバリデーション処理を追加 ▼▼▼
          const isValidData = Array.isArray(importedData) && importedData.every(item =>
            typeof item.id !== 'undefined' &&
            typeof item.name !== 'undefined' &&
            typeof item.type !== 'undefined' &&
            typeof item.amount !== 'undefined'
          );

          if (!isValidData) {
            throw new Error('無効なデータ形式です。このアプリのバックアップファイルではありません。');
          }
          // ▲▲▲ バリデーションここまで ▲▲▲

          masterData = importedData;
          await saveData(); // 賢い保存係に保存を任せる

          showNotification('✅ データのインポートが完了しました。');

        } catch (err) {
          console.error('インポートエラー:', err);
          showNotification(`インポートに失敗しました: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();

  } catch (error) {
    console.error('インポート処理の開始に失敗:', error);
    showNotification('インポート処理を開始できませんでした。', 'error');
  }
}

  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (!Array.isArray(importedData)) {
            throw new Error('無効なファイル形式です。');
          }

          masterData = importedData;
          await saveData(); // 賢い保存係に保存を任せる

          showNotification('✅ データのインポートが完了しました。');

        } catch (err) {
          console.error('インポートエラー:', err);
          showNotification(`インポートに失敗しました: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();

  } catch (error) {
    console.error('インポート処理の開始に失敗:', error);
    showNotification('インポート処理を開始できませんでした。', 'error');
  }
}

/**
 * 全てのデータをリセットする
 */
async function resetAllData() {
  if (confirm('本当にすべてのデータをリセットしますか？この操作は元に戻せません。')) {
    masterData = [];
    await saveData(); // 賢い保存係に任せる
    showNotification('🔄 全データをリセットしました。', 'error');
  }
}