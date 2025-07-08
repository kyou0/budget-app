// ===================================================================================
// グローバル変数 & 初期設定
// ===================================================================================
let currentUser = null;
let loginMode = 'local';
// このページでは、データは直接保持せず、常にlocalStorageから読み書きする

// ===================================================================================
// 初期化処理 & ログインチェック
// ===================================================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 設定ページ起動');

  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (!savedUserJSON) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('appContainer').style.display = 'block';
  currentUser = JSON.parse(savedUserJSON);
  loginMode = currentUser.mode;
  document.getElementById('userName').textContent = currentUser.name;

  updateSyncStatus();
});

// ===================================================================================
// データ管理 (司令塔への通知役)
// ===================================================================================

/**
 * [settings.js専用] 変更されたデータを司令塔(index.js)に通知する
 * @param {object} data - { master: [...], events: [...] } 形式のデータ
 */
async function notifyDataChange(data) {
  // 1. まず、他のページが最新データを読み込めるようにローカルストレージを更新する
  localStorage.setItem('budgetAppData', JSON.stringify(data));
  console.log('💾 [settings.js] データをローカルに一時保存しました。');

  // 2. 次に、司令塔(index.js)にデータの保存と同期を依頼する
  dataChannel.postMessage({
    type: 'SAVE_DATA_REQUEST',
    payload: data
  });
  console.log('📡 [settings.js] 司令塔にデータ同期をリクエストしました。');
}


// ===================================================================================
// UI更新
// ===================================================================================
function updateSyncStatus() {
  const statusBadge = document.getElementById('syncStatus');
  const syncButton = document.getElementById('manualSyncBtn');
  const forceSyncButton = document.getElementById('forceSyncBtn'); // 強制同期ボタン

  if (!statusBadge || !syncButton || !forceSyncButton) return;

  if (loginMode === 'google') {
    statusBadge.textContent = 'Google Drive';
    statusBadge.className = 'status-badge google';
    syncButton.disabled = false;
    forceSyncButton.disabled = false;
  } else {
    statusBadge.textContent = 'ローカルモード';
    statusBadge.className = 'status-badge local';
    syncButton.disabled = true;
    forceSyncButton.disabled = true;
  }
}

// ===================================================================================
// 機能（本体システムと連携）
// ===================================================================================

/**
 * 手動で司令塔にデータ同期をリクエストする
 */
async function manualSync() {
  console.log('📡 [settings.js] 司令塔に手動同期をリクエストします...');
  showNotification('メインページにデータ同期をリクエストしています...', 'info');

  const dataString = localStorage.getItem('budgetAppData');
  if (!dataString) {
    showNotification('保存するデータがありません。', 'error');
    return;
  }
  const data = JSON.parse(dataString);

  dataChannel.postMessage({
    type: 'MANUAL_SYNC_REQUEST',
    payload: data
  });
}

/**
 * Driveから最新のデータを強制的に取得するよう司令塔にリクエストする
 */
async function forceSyncFromDrive() {
  if (loginMode !== 'google') {
    showNotification('Googleログインモードではありません。', 'error');
    return;
  }
  console.log('📡 [settings.js] 司令塔に強制同期をリクエストします...');
  showNotification('メインページにDriveからの強制同期をリクエストしています...', 'info');

  dataChannel.postMessage({
    type: 'FORCE_SYNC_FROM_DRIVE_REQUEST'
    // payloadは不要。司令塔がDriveから取ってくるため。
  });
}

/**
 * 現在のデータをJSONファイルとしてエクスポートする
 */
function exportData() {
  const dataString = localStorage.getItem('budgetAppData');
  if (!dataString) {
    showNotification('エクスポートするデータがありません。', 'warning');
    return;
  }
  const data = JSON.parse(dataString);
  const dataToExport = {
    master: data.master || [],
    events: data.events || []
  };

  const dataStr = JSON.stringify(dataToExport, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'budget-app-data.json';
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
          const isValid = typeof importedData === 'object' &&
            importedData !== null &&
            Array.isArray(importedData.master) &&
            Array.isArray(importedData.events);

          if (!isValid) {
            throw new Error('無効なデータ形式です。このアプリのバックアップファイルではありません。');
          }

          // 司令塔にデータの変更を通知
          await notifyDataChange(importedData);

          showNotification('✅ データのインポートが完了しました。司令塔が同期を開始します。');

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
    const emptyData = { master: [], events: [] };
    // 司令塔にリセットを通知
    await notifyDataChange(emptyData);
    showNotification('🔄 全データをリセットしました。司令塔が同期を開始します。', 'error');
  }
}