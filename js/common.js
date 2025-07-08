// ===================================================================================
// アプリ全体で共有する、状態を持たない安全なヘルパー関数
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

/**
 * ログアウト処理
 */
window.logout = function() {
  if (confirm('ログアウトしますか？')) {
    // 全てのセッション情報とユーザー情報をクリア
    localStorage.removeItem('budgetAppUser');
    localStorage.removeItem('budgetAppData');
    sessionStorage.clear();

    // Googleからもサインアウトさせる
    if (typeof google !== 'undefined' && google.accounts) {
      google.accounts.id.disableAutoSelect();
    }

    console.log('ログアウトしました。');
    window.location.href = 'index.html'; // ログインページにリダイレクト
  }
}
