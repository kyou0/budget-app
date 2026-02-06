import { store } from '../store.js';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export const googleAuth = {
  init() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        const clientId = store.data.settings?.googleClientId;
        if (!clientId) {
          console.warn('Google Client ID not set');
          resolve(false);
          return;
        }

        try {
          tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: '', // 初期スコープは空、必要に応じて追加
            callback: (response) => {
              if (response.error) {
                reject(response);
                return;
              }
              accessToken = response.access_token;
              tokenExpiresAt = Date.now() + (response.expires_in * 1000);
              resolve(accessToken);
            },
          });
          resolve(true);
        } catch (err) {
          console.error('GIS init error:', err);
          resolve(false);
        }
      };
      script.onerror = () => reject(new Error('Failed to load GIS script'));
      document.head.appendChild(script);
    });
  },

  async getAccessToken(requiredScopes = []) {
    const clientId = store.data.settings?.googleClientId;
    if (!clientId) throw new Error('Google Client ID not set');
    
    // トークンが有効（期限まで1分以上の猶予あり）かつ要求スコープを満たしているかチェック
    // GISのToken Clientでは現在のスコープ保持状況を直接知るのが難しいため、
    // 基本的には都度requestAccessTokenを呼ぶ（ただし期限内ならそのまま返すロジックも検討）
    if (accessToken && Date.now() < tokenExpiresAt - 60000) {
      // 実際には要求されたスコープが含まれているかのチェックが必要
      // 面倒を避けるため、増分認可時は常にリクエストする方針
      // ただし、何もスコープが変わらない場合は再利用したい
      // ここではシンプルに、トークンがなければリクエスト、あれば返す
      // 増分認可（Incremental Auth）は引数のスコープを含めてリクエストすることで実現
    }

    return new Promise((resolve, reject) => {
      if (!tokenClient) {
        reject(new Error('GIS not initialized'));
        return;
      }

      tokenClient.callback = (response) => {
        if (response.error) {
          reject(response);
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (response.expires_in * 1000);
        resolve(accessToken);
      };

      // 増分認可のために既知のスコープを結合（または要求されたものだけ）
      // Google推奨のベストプラクティス：その場で必要な最小限を要求
      tokenClient.requestAccessToken({ 
        scope: requiredScopes.join(' '),
        prompt: accessToken ? '' : 'select_account' // 既にトークンがあればプロンプトなしを試行
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
