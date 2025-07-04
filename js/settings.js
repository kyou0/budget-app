 // ===================================================================================
  // グローバル変数 & 初期設定
  // ===================================================================================
  let currentUser = null;
  let loginMode = 'local';

  document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 設定ページ起動');
  // 実際のアプリでは他ページからログイン情報を引き継ぐ
  // このページ単体でも動作するように、ローカルログインを模倣
  localLogin();
});

  // ===================================================================================
  // 認証 & UI更新
  // ===================================================================================
  function tryGoogleLogin() {
  showNotification('Googleログインはダッシュボードから行ってください。', 'info');
}

  function localLogin() {
  currentUser = { name: 'ローカルユーザー', mode: 'local' };
  loginMode = 'local';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'block';
  document.getElementById('userName').textContent = currentUser.name;
  updateSyncStatus();
}

  function logout() {
  currentUser = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  showNotification('👋 ログアウトしました');
}

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
  // 機能
  // ===================================================================================
  function manualSync() {
  showNotification('☁️ Google Driveと手動で同期しています...', 'info');
  // ここに実際のGoogle Drive API同期処理を実装
  setTimeout(() => {
  showNotification('✅ 同期が完了しました！');
}, 2000);
}

  function exportData() {
  const savedData = localStorage.getItem('budgetMasterData');
  if (!savedData || JSON.parse(savedData).length === 0) {
  showNotification('エクスポートするデータがありません。', 'warning');
  return;
}
  const blob = new Blob([savedData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budget-master-data.json';
  a.click();
  URL.revokeObjectURL(url);
  showNotification('📤 データをエクスポートしました。');
}

  function importData() {
  showNotification('📥 インポート機能は現在開発中です。', 'info');
  alert('バックアップしたJSONファイルを選択して復元する機能を開発中です。');
}

  function resetAllData() {
  if (confirm('本当にすべてのデータをリセットしますか？マスターデータが空になります。この操作は元に戻せません。')) {
  localStorage.setItem('budgetMasterData', '[]');
  showNotification('🔄 全データをリセットしました。', 'error');
}
}

  // ===================================================================================
  // ヘルパー関数 & ページ遷移
  // ===================================================================================
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

  function goToDashboard() {
  window.location.href = 'index.html';
}

  function goToMasterManagement() {
  window.location.href = 'master.html';
}