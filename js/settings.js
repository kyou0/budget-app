// ===================================================================================
// グローバル変数 & 初期設定
// ===================================================================================
let currentUser = null;
let masterData = []; // このページでもデータを持つ
let loginMode = 'local';

// ===================================================================================
// 初期化処理 & ログインチェック
// ===================================================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 設定ページ起動');

  // ログイン状態を確認
  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (!savedUserJSON) {
    // ログインしていない場合は、ダッシュボード（ログイン画面）に強制送還
    // これが最も安全で確実な方法です
    window.location.href = 'index.html';
    return;
  }

  // ログイン済みの場合の処理
  const appContainer = document.getElementById('appContainer');
  if (appContainer) {
    appContainer.style.display = 'block';
  }

  currentUser = JSON.parse(savedUserJSON);
  loginMode = currentUser.mode;
  document.getElementById('userName').textContent = currentUser.name;

  loadData();
  updateSyncStatus();
});

// ===================================================================================
// データ管理
// ===================================================================================
function loadData() {
  // master.js と同じロジックでデータを読み込む
  const dataKey = 'budgetMasterData';
  const storage = loginMode === 'google' ? sessionStorage : localStorage;

  const savedData = storage.getItem(dataKey);
  if (savedData) {
    try {
      masterData = JSON.parse(savedData);
      console.log(`📂 [${loginMode}モード] ストレージからデータを読み込みました。`);
    } catch (e) {
      console.error("データの解析に失敗:", e);
      masterData = [];
    }
  } else {
    console.warn('ストレージにデータが見つかりません。');
    if (loginMode === 'google') {
      showNotification('最新のデータを取得できませんでした。ダッシュボードに戻って再同期してください。', 'warning');
    }
  }
}

// ===================================================================================
// UI更新
// ===================================================================================
function updateSyncStatus() {
  const statusBadge = document.getElementById('syncStatus');
  const syncButton = document.getElementById('manualSyncBtn');

  if (!statusBadge || !syncButton) return;

  if (loginMode === 'google') {
    statusBadge.textContent = 'Google Drive';
    statusBadge.className = 'status-badge google';
    syncButton.disabled = false;
    syncButton.style.display = 'block';
  } else {
    statusBadge.textContent = 'ローカルモード';
    statusBadge.className = 'status-badge local';
    syncButton.disabled = true;
    syncButton.style.display = 'none'; // ローカルモードでは非表示
  }
}

// ===================================================================================
// 機能（本体システムと連携）
// ===================================================================================

/**
 * 手動でメインアプリにデータ同期をリクエストする
 */
async function manualSync() {
  console.log('📡 [settings.js] メインアプリに手動同期をリクエストします...');
  showNotification('メインページにデータ同期をリクエストしています...', 'info');

  // 現在のデータをlocalStorageから読み込む
  const dataString = localStorage.getItem('budgetAppData');
  if (!dataString) {
    showNotification('保存するデータがありません。', 'error');
    return;
  }
  const data = JSON.parse(dataString);

  // メインアプリ(index.js)にデータの保存と同期を依頼する
  dataChannel.postMessage({
    type: 'MANUAL_SYNC_REQUEST', // 新しい命令タイプ
    payload: {
      master: data.master || [],
      events: data.events || []
    }
  });
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
      // 読み込んだデータを短期記憶(sessionStorage)に保存
      sessionStorage.setItem('budgetMasterData', dataText);
      // このページのデータも更新
      masterData = JSON.parse(dataText);
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

          // ★★★ 安全性を高める「門番」チェック ★★★
          const isValidData = Array.isArray(importedData) && importedData.every(item =>
            typeof item.id !== 'undefined' &&
            typeof item.name !== 'undefined' &&
            typeof item.type !== 'undefined' &&
            typeof item.amount !== 'undefined'
          );

          if (!isValidData) {
            throw new Error('無効なデータ形式です。このアプリのバックアップファイルではありません。');
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
    await saveData(); // 変更を保存
    showNotification('🔄 全データをリセットしました。', 'error');
  }
}