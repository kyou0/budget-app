// ===================================================================================
// グローバル変数 & 初期設定
// ===================================================================================
let currentUser = null;
let masterData = []; // このページでもデータを持つ

// ===================================================================================
// 初期化処理 & ログインチェック
// ===================================================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 設定ページ起動');

  // ★★★ 他のページと共通の認証ガード ★★★
  const savedUserJSON = localStorage.getItem('budgetAppUser');
  if (!savedUserJSON) {
    // ログインしていない場合は、ログインページに強制送還
    // このページではログイン機能を提供しないため、戻すだけ
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
  if (currentUser && currentUser.mode === 'google') {
    const sessionData = sessionStorage.getItem('budgetMasterData');
    if (sessionData) {
      masterData = JSON.parse(sessionData);
      console.log('📂 [Googleモード] セッションからデータを読み込みました。');
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
  if (currentUser.mode === 'google') {
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
 * 手動でGoogle Driveと同期する（main.jsの簡易版）
 */
async function manualSync() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  try {
    loadingOverlay.classList.add('show');
    showNotification('☁️ Google Driveと手動で同期しています...', 'info');

    const accessToken = sessionStorage.getItem('googleAccessToken');
    const fileId = sessionStorage.getItem('driveFileId');

    if (!accessToken || !fileId) {
      throw new Error('同期情報が見つかりません。ダッシュボードで再ログインしてください。');
    }

    // 1. 現在のデータをDriveに保存
    await saveData(masterData);
    // 2. Driveから最新データを再読み込み（他のデバイスでの変更を反映）
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('ファイルの再読み込みに失敗');

    const dataText = await response.text();
    masterData = dataText ? JSON.parse(dataText) : [];
    sessionStorage.setItem('budgetMasterData', JSON.stringify(masterData));

    showNotification('✅ 同期が完了しました！');

  } catch (error) {
    console.error("手動同期エラー:", error);
    showNotification(error.message || '同期に失敗しました。', 'error');
  } finally {
    loadingOverlay.classList.remove('show');
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

// js/settings.js の importData 関数を置き換え

/**
 * JSONファイルをインポートしてデータを復元する
 */
async function importData() {
  if (!confirm('現在のデータは上書きされます。バックアップファイルからデータを復元しますか？')) {
    return;
  }

  try {
    // 1. ファイル選択ダイアログを作成して表示
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json'; // JSONファイルのみを許可

    // 2. ファイルが選択されたときの処理を定義
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          // 簡単なデータ形式のチェック
          if (!Array.isArray(importedData)) {
            throw new Error('無効なファイル形式です。');
          }

          masterData = importedData;
          await saveData(masterData); // 賢い保存係に保存を任せる
          sessionStorage.setItem('budgetMasterData', JSON.stringify(masterData)); // セッションも更新

          showNotification('✅ データのインポートが完了しました。');
          // 必要に応じてUIを更新
          // renderAll(); のような関数があればここで呼ぶ

        } catch (err) {
          console.error('インポートエラー:', err);
          showNotification(`インポートに失敗しました: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
    };

    // 3. ダイアログをクリックして表示
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
    // 賢い保存係に任せる
    await saveData(masterData);
    sessionStorage.setItem('budgetMasterData', '[]'); // セッションもクリア
    showNotification('🔄 全データをリセットしました。', 'error');
  }
}