import { store as appStore } from '../store.js';
import { INITIAL_DATA } from '../schema.js';
import { googleAuth } from '../auth/googleAuth.js';

console.log('settings.js module loaded (appStore version)');
import { driveSync } from '../sync/driveSync.js';
import { calendarSync } from '../sync/calendarSync.js';

// グローバル関数として定義（インポート/エクスポート等）
window.exportData = () => {
  console.log('Exporting data...');
  const data = JSON.stringify(appStore.data, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `budget_app_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

window.triggerImport = () => {
  const fileInput = document.getElementById('import-file');
  if (fileInput) {
    console.log('Triggering file input click');
    fileInput.click();
  } else {
    console.error('Import file input not found');
  }
};

window.importData = (e) => {
  console.log('importData event fired', e);
  const file = e.target.files[0];
  if (!file) {
    console.warn('No file selected');
    return;
  }
  
  console.log('File selected:', file.name, file.size);
  const reader = new FileReader();
  
  reader.onload = async (event) => {
    console.log('File read successfully');
    try {
      const data = JSON.parse(event.target.result);
      console.log('Parsed JSON data:', data);
      
      // スキーマ検証 (簡易)
      if (!data.schemaVersion || !data.master) {
        throw new Error('無効な家計簿データ形式です。');
      }

      // 保留データとして保存
      window.pendingImportData = data;
      
      // 確認モーダルを表示
      const modal = document.getElementById('import-confirm-modal');
      if (modal) {
        modal.classList.remove('hidden');
      } else {
        // フォールバック (万が一モーダルがない場合)
        if (await window.showConfirm('データを上書きしますか？')) {
          window.executeImport(false);
        }
      }
    } catch (err) {
      console.error('Import failed during processing:', err);
      alert('ファイルの読み込み、またはマイグレーションに失敗しました。詳細: ' + err.message);
    }
  };
  
  reader.onerror = (err) => {
    console.error('FileReader error:', err);
    alert('ファイルの読み取り中にエラーが発生しました。');
  };
  
  reader.readAsText(file);
  // Reset file input
  e.target.value = '';
};

window.executeImport = async (backupFirst = false) => {
  const data = window.pendingImportData;
  if (!data) return;

  try {
    if (backupFirst) {
      const currentRaw = localStorage.getItem('budget_app_data');
      if (currentRaw) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const backupKey = `backup_${timestamp}`;
        localStorage.setItem(backupKey, currentRaw);
        console.log('Local backup created:', backupKey);
      }
    }

    console.log('Executing import...');
    // Migrate schema if necessary
    const migratedData = appStore.migrate(data);
    
    // Force apply data to store
    appStore.data = migratedData;
    appStore.save();
    
    window.showToast('インポートが完了しました。', 'success');
    
    // Hide modal
  window.closeImportModal();

  // Push to drive if enabled
  if (appStore.data.settings?.driveSyncEnabled) {
    window.showToast('クラウド同期中...', 'info');
    await driveSync.push().catch(err => console.error('Drive push failed:', err));
  }
  
  setTimeout(() => location.reload(), 1000);
} catch (err) {
  console.error('Import execution failed:', err);
  alert('インポートの実行に失敗しました: ' + err.message);
}
};

window.closeImportModal = () => {
const modal = document.getElementById('import-confirm-modal');
if (modal) modal.classList.add('hidden');
window.pendingImportData = null;
};

window.saveGoogleSettings = () => {
const googleClientId = document.getElementById('google-client-id').value;
const googleApiKey = document.getElementById('google-api-key').value;
appStore.updateSettings({ googleClientId, googleApiKey });

// 即時初期化を試行
if (googleClientId) {
  import('../auth/googleAuth.js').then(m => m.initGoogleAuth(googleClientId));
}

window.showToast('API設定を保存しました。', 'success');
};

window.loginGoogle = async () => {
try {
  await googleAuth.init();
  await googleAuth.getAccessToken(['openid', 'profile', 'email'], 'select_account');
  try {
    const profile = await googleAuth.fetchUserProfile();
    appStore.updateSettings({ userDisplayName: profile.name || profile.email || '' });
  } catch (err) {
    console.warn('User profile fetch failed', err);
  }
  window.showToast('Google ログイン成功', 'success');
  // 画面更新が必要な場合は reload または 再描画
  location.reload();
} catch (err) {
  window.showToast('ログイン失敗: ' + (err.error || err.message), 'danger');
}
};

window.toggleDriveSync = () => {
const el = document.getElementById('drive-sync-enabled');
if (el) {
  const enabled = el.checked;
  appStore.updateSettings({ driveSyncEnabled: enabled });
}
};

window.toggleCalendarSync = () => {
const el = document.getElementById('calendar-sync-enabled');
if (el) {
  const enabled = el.checked;
  appStore.updateSettings({ calendarSyncEnabled: enabled });
}
};

window.loadCalendarList = async () => {
try {
  const calendars = await calendarSync.listCalendars();
  const incomeSelect = document.getElementById('income-calendar-id');
  const expenseSelect = document.getElementById('expense-calendar-id');
  
  if (!incomeSelect || !expenseSelect) return;

  const currentIncome = appStore.data.settings.incomeCalendarId || 'primary';
  const currentExpense = appStore.data.settings.expenseCalendarId || 'primary';

  if (calendars.length === 0) {
    window.showToast('カレンダーが見つかりませんでした。Googleカレンダー側でカレンダーを作成しているか確認してください。', 'warn');
    return;
  }

  // 取得したリストをオプションとして生成
  let optionsHtml = calendars.map(c => `<option value="${c.id}">${c.summary}${c.primary ? ' (プライマリ)' : ''}</option>`).join('');
  
  // 現在設定されているIDがリストにない場合でも選択肢として維持するための処理
  if (currentIncome !== 'primary' && !calendars.find(c => c.id === currentIncome)) {
    optionsHtml += `<option value="${currentIncome}" selected>${currentIncome} (現在の設定)</option>`;
  }
  if (currentExpense !== 'primary' && currentExpense !== currentIncome && !calendars.find(c => c.id === currentExpense)) {
    optionsHtml += `<option value="${currentExpense}" selected>${currentExpense} (現在の設定)</option>`;
  }

  incomeSelect.innerHTML = optionsHtml;
  expenseSelect.innerHTML = optionsHtml;
  
  // 明示的に値をセット
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
appStore.updateSettings({ incomeCalendarId, expenseCalendarId });
};

window.syncAllCalendars = async (btn) => {
  if (!appStore.data.settings?.calendarSyncEnabled) {
    window.showToast('カレンダー同期を有効にして下さい', 'warn');
    return;
  }
  const months = Object.keys(appStore.data.calendar.generatedMonths);
  if (months.length === 0) {
    window.showToast('同期するデータがありません', 'info');
    return;
  }
  
  if (await window.showConfirm(`${months.length} ヶ月分のデータを同期しますか？`)) {
    const originalText = btn.textContent;
    btn.disabled = true;
  btn.textContent = '同期中...';
  
  window.showToast('一括同期中...', 'info');
  try {
    const token = await googleAuth.getAccessToken([googleAuth.getScopes().CALENDAR]);
    for (const ym of months) {
      await calendarSync.syncMonthEvents(ym, token);
    }
    appStore.addSyncLog({
      type: 'calendar',
      mode: 'manual',
      status: 'success',
      message: `Calendar sync: ${months.length}ヶ月`
    });
    window.showToast('一括同期完了', 'success');
  } catch (err) {
    console.error('Batch sync error:', err);
    appStore.addSyncLog({
      type: 'calendar',
      mode: 'manual',
      status: 'error',
      message: `Calendar sync: ${err.message || '失敗'}`
    });
    window.showToast('同期中にエラーが発生しました', 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
};

window.manualDrivePush = async () => {
try {
  await driveSync.push({ mode: 'manual' });
  window.showToast('クラウドに保存しました', 'success');
  location.reload();
} catch (err) {
  window.showToast('保存失敗: ' + err.message, 'danger');
}
};

window.manualDrivePull = async () => {
  if (await window.showConfirm('クラウドからデータを読み込みます。現在のローカルデータは上書きされます。よろしいですか？')) {
    try {
      const remoteData = await driveSync.pull({ mode: 'manual' });
    if (remoteData) {
      appStore.data = appStore.migrate(remoteData);
      appStore.save();
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

window.clearAllData = async () => {
  if (await window.showConfirm('全てのデータを削除して初期化しますか？この操作は取り消せません。')) {
    localStorage.removeItem('budget_app_data');
    location.reload();
  }
};

window.clearCorruptedBackup = async () => {
  if (await window.showConfirm('退避された壊れたデータを完全に削除しますか？')) {
    localStorage.removeItem('budget_app_data_corrupted_backup');
    location.reload();
  }
};

window.startTutorialFromSettings = () => {
import('./tutorial.js').then(m => m.startTutorial());
};

window.addLoanTypeOptionFromSettings = () => {
  const input = document.getElementById('loan-type-new');
  if (!input) return;
  const value = input.value.trim();
  if (!value) {
    window.showToast('借入種別を入力してください', 'warn');
    return;
  }
  const options = appStore.data.settings?.loanTypeOptions || [];
  if (options.includes(value)) {
    window.showToast('同じ種別が既にあります', 'warn');
    return;
  }
  appStore.updateSettings({ loanTypeOptions: [...options, value] });
  window.showToast('借入種別を追加しました', 'success');
  renderSettings(document.getElementById('app-container'));
};

window.removeLoanTypeOption = (value) => {
  const options = appStore.data.settings?.loanTypeOptions || [];
  const next = options.filter(o => o !== value);
  appStore.updateSettings({ loanTypeOptions: next });
  window.showToast('借入種別を削除しました', 'success');
  renderSettings(document.getElementById('app-container'));
};

window.updateUserAge = () => {
  const input = document.getElementById('user-age');
  if (!input) return;
  const value = input.value.trim();
  if (value === '') {
    appStore.updateSettings({ userAge: null });
    return;
  }
  const age = Number(value);
  if (Number.isNaN(age) || age < 0) {
    window.showToast('年齢は0以上の数値で入力してください', 'warn');
    return;
  }
  appStore.updateSettings({ userAge: age });
};

window.updateUserBirthdate = () => {
  const input = document.getElementById('user-birthdate');
  if (!input) return;
  const value = input.value.trim();
  appStore.updateSettings({ userBirthdate: value });
};

window.getAgeFromBirthdate = (birthdate) => {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const beforeBirthday = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) years -= 1;
  return Math.max(0, years);
};

window.exitDemoToLogin = async () => {
  const ok = await window.showConfirm('デモデータを終了してログイン画面に戻ります。よろしいですか？');
  if (!ok) return;
  const fresh = appStore.migrate(JSON.parse(JSON.stringify(INITIAL_DATA)));
  appStore.data = fresh;
  appStore.save();
  sessionStorage.removeItem('isLoggedIn');
  sessionStorage.removeItem('demoTutorialShown');
  location.reload();
};

export function renderSettings(container) {
const settings = appStore.data.settings || {};
const syncHistory = settings.syncHistory || [];
const loanTypeOptions = settings.loanTypeOptions || [];
const rawName = settings.userDisplayName || (settings.demoMode ? 'サンプルさん' : '');
const welcomeName = rawName ? (rawName.endsWith('さん') ? rawName : `${rawName}さん`) : '';
const birthdateValue = settings.userBirthdate || '';
const ageFromBirth = birthdateValue ? (window.getAgeFromBirthdate ? window.getAgeFromBirthdate(birthdateValue) : null) : null;

container.innerHTML = `
    <div class="settings-header">
      <h2>設定</h2>
      ${welcomeName ? `<div style="margin-top: 4px; font-size: 0.85rem; color: #6b7280;">ようこそ、${welcomeName}。がんばりましょう！</div>` : ''}
      ${settings.demoMode ? `<div style="margin-top: 6px; font-size: 0.8rem; color: #b45309;">デモモード（同期・ログインは無効）</div>` : ''}
    </div>
    <div class="settings-content" style="padding: 20px;">
      <p>バージョン: 1.2.3 (Modal Import)</p>

      ${settings.demoMode ? `
        <div style="margin-top: 10px; background: #fff7ed; padding: 12px; border-radius: 8px; border: 1px solid #fdba74;">
          <div style="font-weight: 700; margin-bottom: 8px;">デモを気に入ったら</div>
          <button onclick="exitDemoToLogin()" class="btn primary">Googleで使う</button>
        </div>
      ` : ''}
      
      ${settings.demoMode ? '' : `
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
                <button onclick="syncAllCalendars(this)" class="btn small success" style="align-self: flex-start;">全月間データを同期 (手動)</button>
                
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
      `}

      <div style="margin-top: 20px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">プロフィール</h3>
        <div class="form-group">
          <label>生年月日</label>
          <input type="date" id="user-birthdate" value="${birthdateValue}" onchange="updateUserBirthdate()">
        </div>
        <div class="form-group">
          <label>年齢</label>
          <input type="number" id="user-age" value="${Number.isFinite(settings.userAge) ? settings.userAge : ''}" placeholder="例: 30" min="0" max="120" onchange="updateUserAge()">
          <div style="font-size: 0.75rem; color: #6b7280; margin-top: 6px;">
            生年月日が入力されている場合は自動計算が優先されます。
          </div>
        </div>
      </div>

      <div style="margin-top: 20px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">同期履歴</h3>
        ${syncHistory.length === 0 ? `
          <div style="font-size: 0.8rem; color: #6b7280;">履歴はまだありません。</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${syncHistory.slice(0, 10).map(log => `
              <div style="display: flex; justify-content: space-between; gap: 10px; font-size: 0.8rem; background: #f9fafb; padding: 8px 10px; border-radius: 6px;">
                <div>
                  <strong>${log.type === 'drive' ? 'Drive' : 'Calendar'}</strong>
                  <span style="margin-left: 6px; color: ${log.status === 'success' ? 'var(--success)' : 'var(--danger)'};">
                    ${log.status === 'success' ? '成功' : '失敗'}
                  </span>
                  <span style="margin-left: 6px; color: #6b7280;">(${log.mode === 'manual' ? '手動' : '自動'})</span>
                  <div style="color: #6b7280; margin-top: 2px;">${log.message || ''}</div>
                </div>
                <div style="color: #6b7280; white-space: nowrap;">
                  ${new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div style="margin-top: 20px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0;">借入種別の管理</h3>
        ${loanTypeOptions.length === 0 ? `
          <div style="font-size: 0.8rem; color: #6b7280;">種別がありません。追加してください。</div>
        ` : `
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${loanTypeOptions.map(type => `
              <div style="display: inline-flex; align-items: center; gap: 6px; background: #f3f4f6; border-radius: 999px; padding: 4px 10px; font-size: 0.8rem;">
                <span>${type}</span>
                <button class="btn small danger" style="padding: 2px 6px;" onclick="removeLoanTypeOption('${type}')">削除</button>
              </div>
            `).join('')}
          </div>
        `}
        <div class="form-group" style="margin-top: 12px;">
          <label>新しい借入種別</label>
          <div class="form-row">
            <input type="text" id="loan-type-new" placeholder="例: 車 / リフォーム">
            <button type="button" onclick="addLoanTypeOptionFromSettings()" class="btn small">追加</button>
          </div>
        </div>
      </div>

      <div style="margin-top: 20px;">
        <h3>データ管理</h3>
        <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
          <button onclick="exportData()" class="btn primary">エクスポート (JSON)</button>
          <button onclick="triggerImport()" class="btn">インポート (JSON)</button>
          <a href="sample-data.json" download class="btn" style="text-decoration: none; color: inherit; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem;">テンプレートをダウンロード</a>
          <input type="file" id="import-file" style="position:absolute; opacity:0; pointer-events:none; width:1px; height:1px;" accept=".json" onchange="importData(event)">
        </div>
        <p style="font-size: 0.8rem; color: #6b7280;">機種変更やバックアップ時にご利用ください。</p>
      </div>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      
      <div style="margin-bottom: 20px;">
        <button onclick="startTutorialFromSettings()" class="btn">チュートリアルを再開</button>
      </div>

      <button id="clear-all-btn" class="btn warn">全データ削除（リセット）</button>
      
      ${localStorage.getItem('budget_app_data_corrupted_backup') ? `
        <div style="margin-top: 20px; padding: 15px; background: #fee2e2; border-radius: 8px; border: 1px solid var(--danger);">
          <h4 style="margin: 0; color: #991b1b;">⚠️ 壊れたデータのバックアップがあります</h4>
          <p style="font-size: 0.8rem; margin: 10px 0;">起動時に破損が検知されたため、データを退避しました。</p>
          <button id="clear-corrupted-btn" class="btn danger small">バックアップを完全に削除</button>
        </div>
      ` : ''}
    </div>
  `;

  // イベントリスナーの動的紐付け
  const clearAllBtn = container.querySelector('#clear-all-btn');
  if (clearAllBtn) {
    clearAllBtn.onclick = () => window.clearAllData();
  }

  const clearCorruptedBtn = container.querySelector('#clear-corrupted-btn');
  if (clearCorruptedBtn) {
    clearCorruptedBtn.onclick = () => window.clearCorruptedBackup();
  }
}
