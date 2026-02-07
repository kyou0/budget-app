import { Router } from './src/router.js';
import { renderDashboard } from './src/ui/dashboard.js';
import { renderAnalysis } from './src/ui/analysis.js';
import { renderMaster } from './src/ui/master.js';
import { renderSettings } from './src/ui/settings.js';
import { startTutorial } from './src/ui/tutorial.js';

import { store as appStore } from './src/store.js';
import { googleAuth, initGoogleAuth } from './src/auth/googleAuth.js';
import { driveSync } from './src/sync/driveSync.js';

const container = document.getElementById('app-container');

/**
 * トースト通知の表示
 */
window.showToast = (message, type = 'info') => {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }, 100);
};

/**
 * カスタム確認ダイアログの表示
 */
window.showConfirm = (message, title = '確認') => {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '3000'; // チュートリアルなどより前面に出す
    modal.innerHTML = `
      <div class="modal-content">
        <h3 style="margin-top:0;">${title}</h3>
        <p style="margin-bottom: 20px; line-height: 1.6; white-space: pre-wrap;">${message}</p>
        <div class="modal-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="confirm-cancel" class="btn" style="min-width: 80px;">キャンセル</button>
          <button id="confirm-ok" class="btn primary" style="min-width: 80px;">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const okBtn = modal.querySelector('#confirm-ok');
    const cancelBtn = modal.querySelector('#confirm-cancel');

    okBtn.onclick = () => {
      modal.remove();
      resolve(true);
    };
    cancelBtn.onclick = () => {
      modal.remove();
      resolve(false);
    };
    
    // 背景クリックでもキャンセル
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(false);
      }
    };
  });
};

const routes = {
  '#dashboard': () => {
    console.log('Routing to #dashboard');
    return renderDashboard ? renderDashboard(container) : console.error('renderDashboard is missing');
  },
  '#analysis': () => {
    console.log('Routing to #analysis');
    return renderAnalysis ? renderAnalysis(container) : console.error('renderAnalysis is missing');
  },
  '#master': () => {
    console.log('Routing to #master');
    return renderMaster ? renderMaster(container) : console.error('renderMaster is missing');
  },
  '#settings': () => {
    console.log('Routing to #settings');
    if (typeof renderSettings === 'function') {
      return renderSettings(container);
    } else {
      console.error('renderSettings is not a function or missing. Type:', typeof renderSettings);
      window.showToast('設定画面の読み込みに失敗しました。リロードしてください。', 'danger');
    }
  }
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
          クラウド同期を利用するにはGoogleログインが必要です。
        </p>
      </div>
    </div>
  `;
  document.querySelector('.bottom-nav').style.display = 'none';
  
  document.getElementById('login-btn').onclick = async () => {
    const clientId = appStore.data.settings?.googleClientId;
    if (clientId) {
      try {
        // initGoogleAuth は DOMContentLoaded で呼ばれているはずだが念のため
        initGoogleAuth(clientId);
        await googleAuth.getAccessToken([], 'select_account'); // ログイン試行
        sessionStorage.setItem('isLoggedIn', 'true');
        initApp();
      } catch (err) {
        console.error('Login failed', err);
        window.showToast('ログインに失敗しました。設定を確認してください。', 'danger');
      }
    } else {
      // Client IDがない場合はローカルモードとして続行
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
  const configClientId = appStore.data.settings?.googleClientId;
  if (configClientId) {
    try {
      // 非同期で初期化
      await initGoogleAuth(configClientId);
    } catch (err) {
      console.warn('GIS init failed', err);
    }
    
    // ログイン済みならバックグラウンドでDriveからPullを試行
    if (googleAuth.isSignedIn() && appStore.data.settings.driveSyncEnabled) {
      try {
        const remoteData = await driveSync.pull();
        if (remoteData) {
          if (await window.showConfirm('Google Driveから新しいデータが見つかりました。読み込みますか？')) {
            appStore.data = appStore.migrate(remoteData);
            appStore.save();
            location.reload();
          }
        }
      } catch (err) {
        console.warn('Initial drive sync failed', err);
      }
    }
  }

  document.querySelector('.bottom-nav').style.display = 'flex';
  try {
    router.init();
    
    // チュートリアルが必要な場合
    if (!appStore.data.settings?.tutorialCompleted) {
      setTimeout(() => startTutorial(), 1000);
    }
  } catch (err) {
    console.error('Router init failed', err);
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  // 起動時に設定からClient IDを読み込んで初期化
  const DEFAULT_CLIENT_ID = '45451544416-8nlqo6bhl56arpjuuh4kekfa24ed9np5.apps.googleusercontent.com';
  let configClientId = appStore.data.settings?.googleClientId;
  
  // Client IDが未設定の場合はデフォルトを設定（利便性のため）
  if (!configClientId) {
    configClientId = DEFAULT_CLIENT_ID;
    appStore.updateSettings({ googleClientId: DEFAULT_CLIENT_ID });
  }

  initApp();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Service Worker Registered'))
      .catch(err => console.log('Service Worker Failed', err));
  }
});
