import { store } from '../store.js';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let grantedScopes = '';
let clientId = null;
let authPromise = null;

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

/**
 * GISの初期化
 * @param {string} configClientId 
 */
export function initGoogleAuth(configClientId) {
  if (!configClientId) return;
  if (!window.google?.accounts?.oauth2) {
    console.warn('GIS library not loaded yet');
    return;
  }

  // すでに同じIDで初期化済みならスキップ
  if (clientId === configClientId && tokenClient) return;

  clientId = configClientId;

  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid', // 最小限のスコープ（必須）
      callback: (response) => {
        // ここは通常 getAccessToken の callback で上書きされる
      },
    });
  } catch (err) {
    console.error('GIS initTokenClient error:', err);
  }
}

export function isInitialized() {
  return !!tokenClient;
}

export const googleAuth = {
  async init() {
    const configClientId = store.data.settings?.googleClientId;
    initGoogleAuth(configClientId);
    return isInitialized();
  },

  async getAccessToken(requiredScopes = []) {
    if (!tokenClient) {
      console.warn("Google Auth not initialized");
      if (window.showToast) window.showToast("Google設定が未完了です");
      return Promise.reject(new Error('GIS not initialized'));
    }

    const scope = requiredScopes.length > 0 ? requiredScopes.join(' ') : 'openid';

    // すでに有効なトークンがあり、かつ必要なスコープをすべて含んでいる場合は再利用
    if (accessToken && Date.now() < tokenExpiresAt) {
      const hasAllScopes = requiredScopes.every(s => grantedScopes.includes(s));
      if (hasAllScopes) {
        return accessToken;
      }
    }

    // すでにリクエスト進行中の場合はそのPromiseを返す
    if (authPromise) return authPromise;

    authPromise = new Promise((resolve, reject) => {
      tokenClient.callback = (response) => {
        authPromise = null;
        if (response.error) {
          console.error('Auth callback error:', response.error);
          reject(response);
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (response.expires_in * 1000);
        grantedScopes = response.scope;
        resolve(accessToken);
      };

      try {
        tokenClient.requestAccessToken({ 
          scope: scope,
          prompt: accessToken ? '' : 'select_account'
        });
      } catch (err) {
        authPromise = null;
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
  }
};
