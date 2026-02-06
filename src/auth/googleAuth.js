import { store } from '../store.js';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let clientId = null;

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

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

  clientId = configClientId;

  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: '', // 必要に応じて増分認可
      callback: (response) => {
        // デフォルトのコールバック（通常はgetAccessToken側で上書きされる）
        if (response.error) {
          console.error('Auth error:', response.error);
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (response.expires_in * 1000);
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
  // 以前の init メソッドは非推奨だが、互換性のために残すか、新しいフローに合わせる
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

    return new Promise((resolve, reject) => {
      tokenClient.callback = (response) => {
        if (response.error) {
          reject(response);
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (response.expires_in * 1000);
        resolve(accessToken);
      };

      tokenClient.requestAccessToken({ 
        scope: requiredScopes.join(' '),
        prompt: accessToken ? '' : 'select_account'
      });
    });
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
      CALENDAR: CALENDAR_SCOPE
    };
  }
};
