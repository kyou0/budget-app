import { Router } from './src/router.js';
import { renderDashboard } from './src/ui/dashboard.js';
import { renderAnalysis } from './src/ui/analysis.js';
import { renderMaster } from './src/ui/master.js';
import { renderSettings } from './src/ui/settings.js';

import { store } from './src/store.js';
import { googleAuth } from './src/auth/googleAuth.js';
import { driveSync } from './src/sync/driveSync.js';

const container = document.getElementById('app-container');

const routes = {
  '#dashboard': () => renderDashboard(container),
  '#analysis': () => renderAnalysis(container),
  '#master': () => renderMaster(container),
  '#settings': () => renderSettings(container)
};

const router = new Router(routes);

function renderLogin() {
  container.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <h1>💰 Budget App</h1>
        <p>滞納防止・借金管理システム</p>
        <button id="login-btn" class="btn primary" style="width: 100%; padding: 15px; margin-top: 20px;">
          Googleアカウントでログイン
        </button>
        <p style="font-size: 0.8rem; color: #6b7280; margin-top: 20px;">
          ※現在はデモモードです。ボタンを押すと開始します。
        </p>
      </div>
    </div>
  `;
  document.querySelector('.bottom-nav').style.display = 'none';
  
  document.getElementById('login-btn').onclick = async () => {
    const clientId = store.data.settings?.googleClientId;
    if (clientId) {
      try {
        await googleAuth.init();
        await googleAuth.getAccessToken(); // ログイン試行
        sessionStorage.setItem('isLoggedIn', 'true');
        initApp();
      } catch (err) {
        console.error('Login failed', err);
        alert('ログインに失敗しました。設定画面でClient IDが正しく入力されているか確認してください。');
      }
    } else {
      // Client IDがない場合はデモモード
      sessionStorage.setItem('isLoggedIn', 'true');
      initApp();
    }
  };
}

async function initApp() {
  const isLoggedIn = sessionStorage.getItem('isLoggedIn');
  if (!isLoggedIn) {
    renderLogin();
    return;
  }

  // Google Auth 初期化 (Client IDがあれば)
  if (store.data.settings?.googleClientId) {
    try {
      await googleAuth.init();
    } catch (err) {
      console.error('GIS init failed', err);
    }
    
    // ログイン済みならバックグラウンドでDriveからPullを試行
    if (googleAuth.isSignedIn() && store.data.settings.driveSyncEnabled) {
      try {
        const remoteData = await driveSync.pull();
        if (remoteData) {
          // 簡易的なマージまたは上書き
          if (confirm('Google Driveから新しいデータが見つかりました。読み込みますか？')) {
            store.data = store.migrate(remoteData);
            store.save();
          }
        }
      } catch (err) {
        console.error('Initial drive sync failed', err);
      }
    }
  }

  document.querySelector('.bottom-nav').style.display = 'flex';
  router.init();
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  initApp();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Service Worker Registered'))
      .catch(err => console.log('Service Worker Failed', err));
  }
});
