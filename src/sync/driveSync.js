import { store as appStore } from '../store.js';
import { googleAuth } from '../auth/googleAuth.js';

const FILE_NAME = 'budget-app-data.json';
const MIME_TYPE = 'application/json';

export const driveSync = {
  async findFile(token) {
    const apiKey = appStore.data.settings?.googleApiKey;
    const q = `name = '${FILE_NAME}' and 'appDataFolder' in parents`;
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('Drive API Error:', response.status, errText);
      throw new Error(`Failed to search Drive file: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.files.length > 0 ? data.files[0] : null;
  },

  async pull() {
    try {
      const token = await googleAuth.getAccessToken([googleAuth.getScopes().DRIVE]);
      const file = await this.findFile(token);
      if (!file) {
        console.log('No sync file found on Drive.');
        return null;
      }

      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to download file from Drive');
      
      const driveData = await response.json();
      
      // 競合チェック用：Drive側の更新時刻を保存
      appStore.updateSettings({ 
        lastDriveUpdatedAt: file.modifiedTime,
        lastSyncAt: new Date().toISOString()
      });

      return driveData;
    } catch (err) {
      console.error('Drive pull error:', err);
      throw err;
    }
  },

  async push() {
    try {
      const token = await googleAuth.getAccessToken([googleAuth.getScopes().DRIVE]);
      const file = await this.findFile(token);

      // 競合チェック: Push前にDrive上の最新更新時刻を取得
      if (file && appStore.data.settings?.lastDriveUpdatedAt) {
        if (file.modifiedTime > appStore.data.settings.lastDriveUpdatedAt) {
          if (!await window.showConfirm('クラウド上のデータがローカルより新しいです。上書きしますか？（キャンセルするとクラウドからプルします）')) {
            const remoteData = await this.pull();
            if (remoteData) {
              appStore.data = appStore.migrate(remoteData);
              appStore.save();
              location.reload();
            }
            return;
          }
        }
      }

      const metadata = {
        name: FILE_NAME,
        parents: ['appDataFolder']
      };
      const data = JSON.stringify(appStore.data);
      const blob = new Blob([data], { type: MIME_TYPE });

      let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (file) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart`;
        method = 'PATCH';
      }

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      const response = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      });

      if (!response.ok) throw new Error('Failed to upload to Drive');
      const result = await response.json();

      // アップロード成功後、Drive側の最新状態を反映
      const updatedFile = await this.findFile(token);
      appStore.updateSettings({
        lastDriveUpdatedAt: updatedFile.modifiedTime,
        lastSyncAt: new Date().toISOString()
      });
      
      console.log('Drive push success');
    } catch (err) {
      console.error('Drive push error:', err);
      throw err;
    }
  }
};
