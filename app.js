import { Router } from './src/router.js';
import { renderDashboard } from './src/ui/dashboard.js';
import { renderAnalysis } from './src/ui/analysis.js';
import { renderMaster } from './src/ui/master.js';
import { renderSettings } from './src/ui/settings.js';
import { startTutorial } from './src/ui/tutorial.js';

import { store as appStore } from './src/store.js';
import { googleAuth, initGoogleAuth } from './src/auth/googleAuth.js';
import { driveSync } from './src/sync/driveSync.js';
import { calendarSync } from './src/sync/calendarSync.js';

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

/**
 * 全画面ローディング（同期中など）の表示・非表示
 */
window.toggleLoadingOverlay = (show, message = '同期中...') => {
  let overlay = document.getElementById('global-loading-overlay');
  if (show) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-loading-overlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <div class="loading-message">${message}</div>
        </div>
      `;
      document.body.appendChild(overlay);
    } else {
      overlay.querySelector('.loading-message').textContent = message;
      overlay.classList.remove('hidden');
    }
  } else if (overlay) {
    overlay.classList.add('hidden');
  }
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
        <button id="demo-btn" class="btn" style="width: 100%; padding: 12px; margin-top: 10px;">
          デモで確認する
        </button>
        <div id="login-loading" class="hidden" style="margin-top: 20px;">
          <div class="blink">認証中...</div>
        </div>
        <p id="login-error" class="hidden" style="font-size: 0.8rem; color: var(--danger); margin-top: 20px;"></p>
        <p style="font-size: 0.8rem; color: #6b7280; margin-top: 20px;">
          クラウド同期を利用するにはGoogleログインが必要です。
        </p>
      </div>
    </div>
  `;
  document.querySelector('.bottom-nav').style.display = 'none';
  
  document.getElementById('login-btn').onclick = async () => {
    const clientId = appStore.data.settings?.googleClientId;
    const loadingEl = document.getElementById('login-loading');
    const errorEl = document.getElementById('login-error');
    const loginBtn = document.getElementById('login-btn');
    const demoBtn = document.getElementById('demo-btn');

    if (clientId) {
      try {
        loginBtn.disabled = true;
        demoBtn.disabled = true;
        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');

        await initGoogleAuth(clientId);
        await googleAuth.getAccessToken(['openid', 'profile', 'email'], 'select_account'); // ログイン試行
        
        loadingEl.innerHTML = '<div class="blink">ログイン完了。データを同期しています...</div>';

        try {
          const profile = await googleAuth.fetchUserProfile();
          appStore.updateSettings({ userDisplayName: profile.name || profile.email || '' });
        } catch (err) {
          console.warn('User profile fetch failed', err);
        }
        
        localStorage.setItem('isLoggedIn', 'true');
        
        // 同期完了を待ってから遷移
        await initApp();
        
        window.location.hash = '#dashboard';
      } catch (err) {
        console.error('Login failed', err);
        loadingEl.classList.add('hidden');
        errorEl.textContent = 'ログインに失敗しました。' + (err.error || err.message || '');
        errorEl.classList.remove('hidden');
        loginBtn.disabled = false;
        demoBtn.disabled = false;
        window.showToast('ログインに失敗しました。設定を確認してください。', 'danger');
      }
    } else {
      // Client IDがない場合はローカルモードとして続行
      localStorage.setItem('isLoggedIn', 'true');
      initApp();
    }
  };

  document.getElementById('demo-btn').onclick = async () => {
    try {
      const response = await fetch('sample-data.json');
      if (!response.ok) throw new Error('Failed to load sample data');
      const sample = await response.json();
      const migrated = appStore.migrate(sample);
      migrated.settings = {
        ...migrated.settings,
        demoMode: true,
        userDisplayName: 'サンプルさん',
        userAge: 30,
        userBirthdate: '1995-04-01',
        tutorialCompleted: false,
        driveSyncEnabled: false,
        calendarSyncEnabled: false
      };
      appStore.data = migrated;
      appStore.save();
      localStorage.setItem('isLoggedIn', 'true');
      initApp();
    } catch (err) {
      console.error('Demo init failed', err);
      window.showToast('デモデータの読み込みに失敗しました', 'danger');
    }
  };
}

async function initApp() {
  const isLoggedIn = localStorage.getItem('isLoggedIn');
  const demoMode = appStore.data.settings?.demoMode;
  const demoTutorialShown = localStorage.getItem('demoTutorialShown');
  if (!isLoggedIn && demoMode) {
    localStorage.setItem('isLoggedIn', 'true');
  }
  if (!isLoggedIn) {
    renderLogin();
    return;
  }

  // Google Auth 初期化
  const configClientId = appStore.data.settings?.googleClientId;
  if (configClientId) {
    try {
      await initGoogleAuth(configClientId);
      
      // 自動ログイン試行 (サインイン済みでデモモードでない場合)
      if (!demoMode && !googleAuth.isSignedIn()) {
        try {
          // サイレントにトークン取得を試みる (プロンプトなし)
          await googleAuth.getAccessToken(['openid', 'profile', 'email']);
          console.log('Auto-reauthenticated successfully');
        } catch (err) {
          console.log('Silent auto-reauth failed', err);
        }
      }
    } catch (err) {
      console.warn('GIS init failed', err);
    }
  }

  document.querySelector('.bottom-nav').style.display = 'flex';
  
  // 既に初期化済みの場合は二重実行を避ける
  if (container.querySelector('.dashboard-header') || (container.innerHTML && !container.querySelector('.login-screen'))) {
    console.log('App already initialized, handling route');
    router.handleRoute();
    return;
  }

  try {
    if (googleAuth.isSignedIn() && !appStore.data.settings?.demoMode) {
      window.toggleLoadingOverlay(true, 'データを同期しています...');
      await runAutoSync();
      window.toggleLoadingOverlay(false);
    }

    router.init();
    
    // チュートリアルが必要な場合
    if (demoMode && !demoTutorialShown) {
      localStorage.setItem('demoTutorialShown', 'true');
      setTimeout(() => startTutorial({ mode: 'demo' }), 500);
    } else if (!appStore.data.settings?.tutorialCompleted) {
      setTimeout(() => startTutorial(), 1000);
    }
  } catch (err) {
    console.error('Router init failed', err);
  }
}

async function runAutoSync() {
  const settings = appStore.data.settings || {};

  if (settings.driveSyncEnabled) {
    try {
      window.toggleLoadingOverlay(true, 'Google Driveと同期中...');
      const remoteData = await driveSync.pull({ mode: 'auto' });
      if (remoteData) {
        appStore.data = appStore.migrate(remoteData);
        appStore.save();
      }
      await driveSync.push({ mode: 'auto' });
    } catch (err) {
      console.warn('Auto drive sync failed', err);
      window.showToast('Drive同期に失敗しました', 'danger');
    }
  }

  if (settings.calendarSyncEnabled) {
    const months = Object.keys(appStore.data.calendar?.generatedMonths || {});
    if (months.length > 0) {
      try {
        window.toggleLoadingOverlay(true, 'Googleカレンダーと同期中...');
        for (const ym of months) {
          await calendarSync.syncMonthEvents(ym);
        }
        appStore.addSyncLog({
          type: 'calendar',
          mode: 'auto',
          status: 'success',
          message: `Calendar sync: ${months.length}ヶ月`
        });
      } catch (err) {
        console.warn('Auto calendar sync failed', err);
        appStore.addSyncLog({
          type: 'calendar',
          mode: 'auto',
          status: 'error',
          message: `Calendar sync: ${err.message || '失敗'}`
        });
        window.showToast('カレンダー同期に失敗しました', 'danger');
      }
    }
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
