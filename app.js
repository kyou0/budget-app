// キャッシュバスティング: import.meta.url に付いた ?v= を全サブモジュールに伝播
const _v = new URL(import.meta.url).searchParams.get('v') || '';
const _q = _v ? `?v=${_v}` : '';

const { Router }          = await import(`./src/router.js${_q}`);
const { renderDashboard } = await import(`./src/ui/dashboard.js${_q}`);
const { renderAnalysis }  = await import(`./src/ui/analysis.js${_q}`);
const { renderMaster }    = await import(`./src/ui/master.js${_q}`);
const { renderSettings }  = await import(`./src/ui/settings.js${_q}`);
const { startTutorial }   = await import(`./src/ui/tutorial.js${_q}`);
const { store: appStore } = await import(`./src/store.js${_q}`);
const { googleAuth, initGoogleAuth } = await import(`./src/auth/googleAuth.js${_q}`);
const { driveSync }       = await import(`./src/sync/driveSync.js${_q}`);
const { calendarSync }    = await import(`./src/sync/calendarSync.js${_q}`);

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
// ─── 同期オーバーレイ（操作ブロック＋ステップ表示） ─────────────────

const SYNC_STEPS_DEF = [
  { id: 'drive-pull',  icon: '☁️', label: 'Drive からデータを取得' },
  { id: 'drive-push',  icon: '☁️', label: 'Drive にデータを保存' },
  { id: 'cal',         icon: '📅', label: 'Googleカレンダーを同期' },
];

function getSyncOverlay() {
  let el = document.getElementById('sync-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-overlay';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="sync-card">
        <div class="sync-card-header">
          <div class="sync-ring">
            <svg viewBox="0 0 36 36">
              <circle class="sync-ring-track" cx="18" cy="18" r="14"/>
              <circle class="sync-ring-fill" cx="18" cy="18" r="14"/>
            </svg>
          </div>
          <div class="sync-card-title">
            <div class="main" id="sync-title">同期中...</div>
            <div class="sub" id="sync-subtitle">アプリのデータを最新に更新しています</div>
          </div>
        </div>
        <div class="sync-progress-bar">
          <div class="sync-progress-fill" id="sync-pbar"></div>
        </div>
        <div class="sync-steps" id="sync-steps-list">
          ${SYNC_STEPS_DEF.map(s => `
            <div class="sync-step" id="sync-step-${s.id}">
              <div class="sync-step-icon">・</div>
              <span>${s.icon} ${s.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(el);
  }
  return el;
}

window.showSyncProgress = (stepId, percent = null) => {
  const el = getSyncOverlay();
  el.classList.remove('hidden', 'finishing');

  // プログレスバー更新
  const pbar = el.querySelector('#sync-pbar');
  if (pbar && percent !== null) pbar.style.width = `${percent}%`;

  // リング更新（88 = full circumference）
  const ringFill = el.querySelector('.sync-ring-fill');
  if (ringFill && percent !== null) {
    ringFill.style.strokeDashoffset = 88 - (88 * percent / 100);
  }

  // ステップ状態更新
  let reachedActive = false;
  SYNC_STEPS_DEF.forEach(s => {
    const stepEl = el.querySelector(`#sync-step-${s.id}`);
    const iconEl = stepEl?.querySelector('.sync-step-icon');
    if (!stepEl) return;
    if (s.id === stepId) {
      stepEl.classList.remove('done');
      stepEl.classList.add('active');
      if (iconEl) iconEl.textContent = '⟳';
      reachedActive = true;
    } else if (!reachedActive) {
      stepEl.classList.remove('active');
      stepEl.classList.add('done');
      if (iconEl) iconEl.textContent = '✓';
    } else {
      stepEl.classList.remove('active', 'done');
      if (iconEl) iconEl.textContent = '・';
    }
  });

  // タイトル更新
  const titleEl = el.querySelector('#sync-title');
  const step = SYNC_STEPS_DEF.find(s => s.id === stepId);
  if (titleEl && step) titleEl.textContent = `${step.icon} ${step.label}中...`;
};

window.hideSyncProgress = (successMessage = null) => {
  const el = document.getElementById('sync-overlay');
  if (!el) return;

  // 全ステップを完了に
  const pbar = el.querySelector('#sync-pbar');
  if (pbar) pbar.style.width = '100%';
  const ringFill = el.querySelector('.sync-ring-fill');
  if (ringFill) ringFill.style.strokeDashoffset = '0';
  SYNC_STEPS_DEF.forEach(s => {
    const stepEl = el.querySelector(`#sync-step-${s.id}`);
    const iconEl = stepEl?.querySelector('.sync-step-icon');
    if (stepEl) { stepEl.classList.remove('active'); stepEl.classList.add('done'); }
    if (iconEl) iconEl.textContent = '✓';
  });
  const titleEl = el.querySelector('#sync-title');
  if (titleEl) titleEl.textContent = '同期完了 ✓';

  setTimeout(() => {
    el.classList.add('finishing');
    setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('finishing');
      if (successMessage) window.showToast(successMessage, 'success');
    }, 380);
  }, 700);
};

// ─── フルスクリーンローディング（手動操作など短い処理用に残す） ────
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
      if (!demoMode) {
        if (googleAuth.isSignedIn()) {
          console.log('Token restored from localStorage — skipping GIS call');
        } else {
          try {
            // サイレントにトークン取得を試みる (プロンプトなし)
            await googleAuth.getAccessToken(['openid', 'profile', 'email']);
            console.log('Auto-reauthenticated successfully');
          } catch (err) {
            console.log('Silent auto-reauth failed', err);
          }
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
    // ─── まず画面を先に表示してから同期をバックグラウンドで実行 ───
    router.init();

    // チュートリアルが必要な場合
    if (demoMode && !demoTutorialShown) {
      localStorage.setItem('demoTutorialShown', 'true');
      setTimeout(() => startTutorial({ mode: 'demo' }), 500);
    } else if (!appStore.data.settings?.tutorialCompleted) {
      setTimeout(() => startTutorial(), 1000);
    }

    // 同期はバックグラウンドで非同期実行（UIをブロックしない）
    if (googleAuth.isSignedIn() && !appStore.data.settings?.demoMode) {
      runAutoSync().catch(err => console.warn('Background sync error', err));
    }
  } catch (err) {
    console.error('Router init failed', err);
  }
}

async function runAutoSync() {
  const settings = appStore.data.settings || {};
  let anySync = false;

  if (settings.driveSyncEnabled) {
    anySync = true;
    try {
      window.showSyncProgress('drive-pull', 10);
      const remoteData = await driveSync.pull({ mode: 'auto' });
      if (remoteData) {
        appStore.data = appStore.migrate(remoteData);
        appStore.save();
        // データ更新後に現在の画面を再描画
        const hash = window.location.hash || '#dashboard';
        const route = { '#dashboard': () => import('./src/ui/dashboard.js').then(m => m.renderDashboard(container)),
                        '#master':    () => import('./src/ui/master.js').then(m => m.renderMaster(container)),
                        '#settings':  () => import('./src/ui/settings.js').then(m => m.renderSettings(container)) };
        if (route[hash]) route[hash]().catch(() => {});
      }
      window.showSyncProgress('drive-push', 40);
      await driveSync.push({ mode: 'auto' });
    } catch (err) {
      console.warn('Auto drive sync failed', err);
      window.showToast('Drive同期に失敗しました', 'danger');
    }
  }

  if (settings.calendarSyncEnabled) {
    const months = Object.keys(appStore.data.calendar?.generatedMonths || {});
    if (months.length > 0) {
      anySync = true;
      try {
        for (let i = 0; i < months.length; i++) {
          const percent = 55 + Math.round((i / months.length) * 43);
          window.showSyncProgress('cal', percent);
          await calendarSync.syncMonthEvents(months[i]);
        }
        appStore.addSyncLog({
          type: 'calendar', mode: 'auto', status: 'success',
          message: `Calendar sync: ${months.length}ヶ月`
        });
      } catch (err) {
        console.warn('Auto calendar sync failed', err);
        appStore.addSyncLog({
          type: 'calendar', mode: 'auto', status: 'error',
          message: `Calendar sync: ${err.message || '失敗'}`
        });
        window.showToast('カレンダー同期に失敗しました', 'danger');
      }
    }
  }

  if (anySync) {
    window.hideSyncProgress();
  }
}

// ─── 初期化 ────────────────────────────────────────────────────
// app.js は <script type="module"> の dynamic import() で読み込まれるため、
// 実行時点ではすでに DOM は構築済み・DOMContentLoaded 発火済み。
// addEventListener('DOMContentLoaded', ...) は発火しないので直接呼び出す。

const DEFAULT_CLIENT_ID = '45451544416-8nlqo6bhl56arpjuuh4kekfa24ed9np5.apps.googleusercontent.com';
{
  let configClientId = appStore.data.settings?.googleClientId;
  if (!configClientId) {
    appStore.updateSettings({ googleClientId: DEFAULT_CLIENT_ID });
  }
}

initApp();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log('Service Worker Registered'))
    .catch(err => console.log('Service Worker Failed', err));
}
