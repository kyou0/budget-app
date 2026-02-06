import { store } from '../store.js';
import { googleAuth } from '../auth/googleAuth.js';
import { driveSync } from '../sync/driveSync.js';
import { calendarSync } from '../sync/calendarSync.js';

export function renderSettings(container) {
  const settings = store.data.settings || {};
  
  container.innerHTML = `
    <div class="settings-header">
      <h2>設定</h2>
    </div>
    <div class="settings-content" style="padding: 20px;">
      <p>バージョン: 1.2.0 (Google Sync対応)</p>
      
      <div style="margin-top: 20px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">Google 連携設定</h3>
        <div class="form-group">
          <label>Google Client ID</label>
          <input type="text" id="google-client-id" value="${settings.googleClientId || ''}" placeholder="Client IDを入力">
        </div>
        <div class="form-group" style="display: none;">
          <label>Google API Key</label>
          <input type="password" id="google-api-key" value="${settings.googleApiKey || ''}" placeholder="API Keyを入力">
        </div>
        
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <button onclick="saveGoogleSettings()" class="btn primary">API設定を保存</button>
          <button onclick="loginGoogle()" class="btn">${googleAuth.isSignedIn() ? '再ログイン' : 'Google ログイン'}</button>
        </div>

        <div style="padding: 10px; background: #f9fafb; border-radius: 6px; font-size: 0.85rem;">
          <div style="margin-bottom: 10px;">
            <strong>Drive 同期</strong><br>
            <label style="display: flex; align-items: center; gap: 5px; margin-top: 5px;">
              <input type="checkbox" id="drive-sync-enabled" ${settings.driveSyncEnabled ? 'checked' : ''} onchange="toggleDriveSync()"> 
              自動同期を有効化
            </label>
            <button onclick="manualDrivePush()" class="btn small" style="margin-top: 5px;">今すぐクラウドに保存</button>
            <button onclick="manualDrivePull()" class="btn small" style="margin-top: 5px;">クラウドから読み込み</button>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 10px;">
            <strong>Calendar 連携</strong><br>
            <label style="display: flex; align-items: center; gap: 5px; margin-top: 5px;">
              <input type="checkbox" id="calendar-sync-enabled" ${settings.calendarSyncEnabled ? 'checked' : ''} onchange="toggleCalendarSync()"> 
              カレンダー同期を有効化
            </label>

            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 10px;">
              <button onclick="loadCalendarList()" class="btn small" style="align-self: flex-start;">カレンダー一覧を読み込む</button>
              
              <div class="form-group">
                <label style="font-size: 0.75rem;">収入用カレンダー</label>
                <select id="income-calendar-id" onchange="updateCalendarSettings()" style="width: 100%; font-size: 0.8rem;">
                  <option value="primary" ${settings.incomeCalendarId === 'primary' ? 'selected' : ''}>プライマリ (標準)</option>
                  ${settings.incomeCalendarId && settings.incomeCalendarId !== 'primary' ? `<option value="${settings.incomeCalendarId}" selected>${settings.incomeCalendarId}</option>` : ''}
                </select>
              </div>

              <div class="form-group">
                <label style="font-size: 0.75rem;">支出用カレンダー</label>
                <select id="expense-calendar-id" onchange="updateCalendarSettings()" style="width: 100%; font-size: 0.8rem;">
                  <option value="primary" ${settings.expenseCalendarId === 'primary' ? 'selected' : ''}>プライマリ (標準)</option>
                  ${settings.expenseCalendarId && settings.expenseCalendarId !== 'primary' ? `<option value="${settings.expenseCalendarId}" selected>${settings.expenseCalendarId}</option>` : ''}
                </select>
              </div>
            </div>
            
            <p style="font-size: 0.7rem; color: #6b7280; margin-top: 10px;">※有効にすると、生成・完了時にGoogleカレンダーも同期されます。</p>
          </div>
          
          <div style="margin-top: 10px; font-size: 0.75rem; color: #6b7280;">
            最終同期: ${settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString() : 'なし'}
          </div>
        </div>
      </div>

      <div style="margin-top: 20px;">
        <h3>データ管理</h3>
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
          <button onclick="exportData()" class="btn primary">エクスポート (JSON)</button>
          <button onclick="document.getElementById('import-file').click()" class="btn">インポート (JSON)</button>
          <input type="file" id="import-file" style="display: none;" accept=".json">
        </div>
        <p style="font-size: 0.8rem; color: #6b7280;">機種変更やバックアップ時にご利用ください。</p>
      </div>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      
      <div style="margin-bottom: 20px;">
        <button onclick="startTutorialFromSettings()" class="btn">チュートリアルを再開</button>
      </div>

      <button onclick="clearAllData()" class="btn warn">全データ削除（リセット）</button>
    </div>
  `;

  window.exportData = () => {
    const data = JSON.stringify(store.data, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget_app_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  window.importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (confirm('データを上書きしますか？現在のデータは失われます。')) {
          store.data = store.migrate(data);
          store.save();
          location.reload();
        }
      } catch (err) {
        alert('ファイルの読み込みに失敗しました。');
      }
    };
    reader.readAsText(file);
  };

  document.getElementById('import-file').onchange = window.importData;

  window.saveGoogleSettings = () => {
    const googleClientId = document.getElementById('google-client-id').value;
    const googleApiKey = document.getElementById('google-api-key').value;
    store.updateSettings({ googleClientId, googleApiKey });
    
    // 即時初期化を試行
    if (googleClientId) {
      import('../auth/googleAuth.js').then(m => m.initGoogleAuth(googleClientId));
    }
    
    window.showToast('API設定を保存しました。', 'success');
  };

  window.loginGoogle = async () => {
    try {
      await googleAuth.init();
      await googleAuth.getAccessToken();
      window.showToast('Google ログイン成功', 'success');
      renderSettings(container);
    } catch (err) {
      window.showToast('ログイン失敗: ' + (err.error || err.message), 'danger');
    }
  };

  window.toggleDriveSync = () => {
    const enabled = document.getElementById('drive-sync-enabled').checked;
    store.updateSettings({ driveSyncEnabled: enabled });
  };

  window.toggleCalendarSync = () => {
    const enabled = document.getElementById('calendar-sync-enabled').checked;
    store.updateSettings({ calendarSyncEnabled: enabled });
  };

  window.loadCalendarList = async () => {
    try {
      const calendars = await calendarSync.listCalendars();
      const incomeSelect = document.getElementById('income-calendar-id');
      const expenseSelect = document.getElementById('expense-calendar-id');
      
      const currentIncome = store.data.settings.incomeCalendarId || 'primary';
      const currentExpense = store.data.settings.expenseCalendarId || 'primary';

      const options = calendars.map(c => `<option value="${c.id}">${c.summary}${c.primary ? ' (プライマリ)' : ''}</option>`).join('');
      
      incomeSelect.innerHTML = options;
      expenseSelect.innerHTML = options;
      
      // 値を再設定（一覧に含まれていれば）
      incomeSelect.value = currentIncome;
      expenseSelect.value = currentExpense;
      
      window.showToast('カレンダー一覧を取得しました', 'success');
    } catch (err) {
      window.showToast('カレンダー取得失敗: ' + err.message, 'danger');
    }
  };

  window.updateCalendarSettings = () => {
    const incomeCalendarId = document.getElementById('income-calendar-id').value;
    const expenseCalendarId = document.getElementById('expense-calendar-id').value;
    store.updateSettings({ incomeCalendarId, expenseCalendarId });
  };

  window.manualDrivePush = async () => {
    try {
      await driveSync.push();
      window.showToast('クラウドに保存しました', 'success');
      renderSettings(container);
    } catch (err) {
      window.showToast('保存失敗: ' + err.message, 'danger');
    }
  };

  window.manualDrivePull = async () => {
    if (confirm('クラウドからデータを読み込みます。現在のローカルデータは上書きされます。よろしいですか？')) {
      try {
        const remoteData = await driveSync.pull();
        if (remoteData) {
          store.data = store.migrate(remoteData);
          store.save();
          window.showToast('クラウドから読み込みました。', 'success');
          location.reload();
        } else {
          window.showToast('クラウド上にデータが見つかりませんでした。', 'warn');
        }
      } catch (err) {
        window.showToast('読み込み失敗: ' + err.message, 'danger');
      }
    }
  };

  window.clearAllData = () => {
    if (confirm('全てのデータを削除して初期化しますか？この操作は取り消せません。')) {
      localStorage.removeItem('budget_app_data');
      location.reload();
    }
  };

  window.startTutorialFromSettings = () => {
    import('./tutorial.js').then(m => m.startTutorial());
  };
}
