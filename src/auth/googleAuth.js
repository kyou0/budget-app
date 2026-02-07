import { store as appStore } from '../store.js';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let grantedScopes = '';
let clientId = null;
let authPromise = null;

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

let initPromise = null;

/**
 * GISの初期化
 * @param {string} configClientId 
 */
export async function initGoogleAuth(configClientId) {
  if (!configClientId) return false;

  // すでに同じIDで初期化済みなら成功を返す
  if (clientId === configClientId && tokenClient) return true;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // GISライブラリがロードされるのを待つ (最大10秒)
      if (!window.google?.accounts?.oauth2) {
        await new Promise((resolve) => {
          const start = Date.now();
          const check = setInterval(() => {
            if (window.google?.accounts?.oauth2 || Date.now() - start > 10000) {
              clearInterval(check);
              resolve();
            }
          }, 100);
        });
      }

      if (!window.google?.accounts?.oauth2) {
        console.warn('GIS library not loaded yet');
        return false;
      }

      clientId = configClientId;

      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid',
        callback: (response) => {},
        error_callback: (err) => {
          console.error('GIS error_callback:', err);
          if (window.showToast) window.showToast("Google認証エラーが発生しました", "danger");
        }
      });
      return true;
    } catch (err) {
      console.error('GIS init error:', err);
      return false;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function isInitialized() {
  return !!tokenClient;
}

export const googleAuth = {
  async init() {
    const configClientId = appStore.data.settings?.googleClientId;
    return await initGoogleAuth(configClientId);
  },

  async getAccessToken(requiredScopes = [], prompt = '') {
    // 未初期化の場合は初期化を試みる
    if (!tokenClient) {
      const success = await this.init();
      if (!success) {
        console.warn("Google Auth failed to initialize");
        return Promise.reject(new Error('GIS not initialized'));
      }
    }

    // スコープのチェックを厳密に
    const scopeList = requiredScopes.length > 0 ? requiredScopes : ['openid'];
    const scopeString = scopeList.join(' ');

    // すでに有効なトークンがあり、かつ必要なスコープをすべて含んでいる場合は再利用
    // ただし prompt が指定されている場合は強制的に再取得
    if (!prompt && accessToken && Date.now() < tokenExpiresAt) {
      const granted = grantedScopes.split(' ');
      const hasAllScopes = scopeList.every(s => granted.includes(s));
      if (hasAllScopes) {
        return accessToken;
      }
    }

    // すでにリクエスト進行中の場合はそのPromiseを返す
    if (authPromise) {
      console.log('Auth request already in progress, returning existing promise');
      return authPromise;
    }

    authPromise = new Promise((resolve, reject) => {
      // タイムアウト設定 (30秒)
      const timeoutId = setTimeout(() => {
        if (authPromise) {
          authPromise = null;
          reject(new Error('Auth request timed out'));
        }
      }, 30000);

      tokenClient.callback = (response) => {
        clearTimeout(timeoutId);
        authPromise = null;
        if (response.error) {
          console.error('Auth callback error:', response.error);
          reject(response);
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (Number(response.expires_in) * 1000);
        grantedScopes = response.scope || '';
        console.log('Access token obtained successfully');
        resolve(accessToken);
      };

      try {
        console.log('Requesting access token for scopes:', scopeString, 'with prompt:', prompt);
        tokenClient.requestAccessToken({ 
          scope: scopeString,
          prompt: prompt 
        });
      } catch (err) {
        clearTimeout(timeoutId);
        authPromise = null;
        console.error('RequestAccessToken failed immediately:', err);
        reject(err);
      }
    });

    return authPromise;
  },

  isSignedIn() {
    return !!accessToken && Date.now() < tokenExpiresAt;
  },

  revoke() {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken, () => {
        accessToken = null;
        tokenExpiresAt = 0;
      });
    }
  },

  getScopes() {
    return {
      DRIVE: DRIVE_SCOPE,
      CALENDAR: CALENDAR_SCOPE,
      CALENDAR_LIST: CALENDAR_LIST_SCOPE
    };
  },

  async fetchUserProfile() {
    const token = await this.getAccessToken(['openid', 'profile', 'email']);
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }
    return await response.json();
  }
};
