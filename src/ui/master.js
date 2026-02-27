import { store as appStore } from '../store.js';
import { getIcon, getLogoUrl, CARD_BRANDS, formatNumber, parseNumber } from '../utils.js';
import { driveSync } from '../sync/driveSync.js';
import { generateClientEvents } from '../generate.js';

let currentTab = 'items'; // 'items' | 'banks' | 'loans' | 'clients' | 'cards'
let currentItemType = 'income'; // 'income' | 'expense'

export function renderMaster(container) {
  const items = appStore.data.master.items;
  const loans = appStore.data.master.loans || [];
  const cards = loans.filter(l => l.type === 'クレジットカード');
  const otherLoans = loans.filter(l => l.type !== 'クレジットカード');
  const clients = appStore.data.master.clients || [];
  const loanTypeOptions = appStore.data.settings?.loanTypeOptions || [];
  const loanTypeOptionsHtml = loanTypeOptions
    .map(option => `<option value="${option}">${option}</option>`)
    .join('');
  const visibleItems = items.filter(i => i.type !== 'bank' && i.type === currentItemType);

  container.innerHTML = `
    <div class="tabs">
      <button class="tab-btn ${currentTab === 'items' ? 'active' : ''}" onclick="switchMasterTab('items')">📝 収支項目</button>
      <button class="tab-btn ${currentTab === 'banks' ? 'active' : ''}" onclick="switchMasterTab('banks')">🏦 銀行口座</button>
      <button class="tab-btn ${currentTab === 'cards' ? 'active' : ''}" onclick="switchMasterTab('cards')">💳 クレジット</button>
      <button class="tab-btn ${currentTab === 'loans' ? 'active' : ''}" onclick="switchMasterTab('loans')">💸 借入先</button>
      <button class="tab-btn ${currentTab === 'clients' ? 'active' : ''}" onclick="switchMasterTab('clients')">🤝 クライアント</button>
    </div>

    ${currentTab === 'cards' ? `
      <div style="margin: 0 16px 16px; padding: 12px; background: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe; font-size: 0.85rem; color: #1e40af;">
        💡 <strong>クレジットカード管理:</strong> ローンとは別に、毎月の請求額を管理するためのマスターです。名前からロゴが自動取得されますが、手動で選択も可能です。
      </div>
    ` : ''}

    <div class="master-header">
      <h2>${
        currentTab === 'items' ? '収支マスター' : 
        currentTab === 'banks' ? '銀行マスター' : 
        currentTab === 'cards' ? 'クレジットマスター' :
        currentTab === 'loans' ? '借入先マスター' : 
        'クライアントマスター'
      }</h2>
      <div style="display: flex; gap: 8px; align-items: center;">
        ${currentTab === 'clients' ? `<button id="bulk-generate-btn" class="btn">一括生成</button>` : ''}
        ${currentTab === 'cards' ? `
          <a href="credit-cards-demo.json" download style="font-size: 0.8rem; color: var(--primary); text-decoration: none; margin-right: 8px;">[テンプレート]</a>
          <button id="import-btn" class="btn">一括インポート</button>
          <input type="file" id="import-file" class="hidden" accept=".json">
        ` : ''}
        <button id="add-btn" class="btn primary">新規追加</button>
      </div>
    </div>

    <div class="master-list">
      ${currentTab === 'items' ? `
        <div class="sub-tabs">
          <button class="sub-tab ${currentItemType === 'income' ? 'active' : ''}" onclick="switchItemType('income')">収入</button>
          <button class="sub-tab ${currentItemType === 'expense' ? 'active' : ''}" onclick="switchItemType('expense')">支出</button>
        </div>
        ${renderItemsList(visibleItems)}
      ` : 
        currentTab === 'banks' ? renderBanksList(items.filter(i => i.type === 'bank')) : 
        currentTab === 'cards' ? renderCardsList(cards) :
        currentTab === 'loans' ? renderLoansList(otherLoans) :
        renderClientsList(clients)}
    </div>

    <!-- 項目モーダル -->
    <div id="master-modal" class="modal hidden">
      <div class="modal-content">
        <h3 id="modal-title">項目追加</h3>
        <form id="master-form">
          <input type="hidden" id="edit-id">
          ${currentTab === 'clients' ? '' : `
            <div class="form-group">
              <label>名前</label>
              <input type="text" id="master-name" required placeholder="例: 家賃、アコム">
            </div>
          `}
          
          ${currentTab === 'items' ? `
            <div class="form-row">
              <div class="form-group">
                <label>種類</label>
                <select id="master-type" onchange="toggleMasterFormFields()">
                  <option value="expense">支出</option>
                  <option value="income">収入</option>
                </select>
              </div>
              <div class="form-group">
                <label>タグ (分類)</label>
                <select id="master-tag">
                  <option value="">(なし)</option>
                  <option value="fixed">固定費</option>
                  <option value="variable">変動費</option>
                  <option value="card">カード払</option>
                  <option value="loan">借入返済</option>
                  <option value="tax">税金/保険</option>
                  <option value="service">サブスク</option>
                  <option value="vehicle">車両</option>
                  <option value="business">事業</option>
                </select>
              </div>
            </div>
            <div id="field-amount" class="form-group">
              <div class="form-row">
                <div>
                  <label>金額モード</label>
                  <select id="master-amount-mode">
                    <option value="fixed">固定</option>
                    <option value="variable">変動</option>
                  </select>
                </div>
                <div>
                  <label>金額 (ベース)</label>
                  <input type="text" inputmode="numeric" id="master-amount" required oninput="handleNumericInput(this)">
                </div>
              </div>
            </div>
            <div id="field-rule" class="form-group">
              <label>日付ルール</label>
              <select id="master-rule-type" onchange="toggleRuleFields()">
                <option value="monthly">毎月◯日</option>
                <option value="monthEnd">月末</option>
                <option value="weekly">毎週◯曜</option>
                <option value="nextMonthDay">翌月◯日</option>
                <option value="monthlyBusinessDay">第◯営業日</option>
              </select>
              <div id="rule-detail" style="margin-top:10px;">
                <input type="number" id="master-day" min="1" max="31" placeholder="日">
                <select id="master-weekday" class="hidden">
                  <option value="0">日曜日</option>
                  <option value="1">月曜日</option>
                  <option value="2">火曜日</option>
                  <option value="3">水曜日</option>
                  <option value="4">木曜日</option>
                  <option value="5">金曜日</option>
                  <option value="6">土曜日</option>
                </select>
                <input type="number" id="master-nth" min="1" max="20" placeholder="第n営業日" class="hidden">
              </div>
            </div>
            <div class="form-row">
              <div id="field-bank-select" class="form-group">
                <label>入出金先銀行</label>
                <select id="master-bank-id">
                  <option value="">(未選択)</option>
                  ${items.filter(i => i.type === 'bank').map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>土日祝の調整</label>
                <select id="master-adjustment">
                  <option value="none">調整なし</option>
                  <option value="prev_weekday" selected>前営業日 (金曜など)</option>
                  <option value="next_weekday">翌営業日 (月曜など)</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>有効期間</label>
              <div class="form-row">
                <input type="date" id="master-eff-start" placeholder="開始日">
                <input type="date" id="master-eff-end" placeholder="終了日">
              </div>
            </div>
          ` : currentTab === 'banks' ? `
            <input type="hidden" id="master-type" value="bank">
            <div id="field-balance" class="form-group">
              <label>現在残高</label>
              <input type="text" inputmode="numeric" id="master-balance" required oninput="handleNumericInput(this)">
            </div>
          ` : currentTab === 'clients' ? `
            <div class="form-group">
              <label>クライアント名</label>
              <input type="text" id="client-name" required placeholder="例: 株式会社〇〇">
              <div class="hint-text">請求書の宛先と同じ名前がおすすめです。</div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>金額モード</label>
                <select id="client-amount-mode">
                  <option value="fixed">固定</option>
                  <option value="variable">変動</option>
                </select>
                <div class="hint-text">変動の場合は実績入力で調整します。</div>
              </div>
              <div class="form-group">
                <label>金額（ベース）</label>
                <input type="text" inputmode="numeric" id="client-amount" required placeholder="例: 300,000" oninput="handleNumericInput(this)">
              </div>
            </div>
            <div class="form-group">
              <label>支払ルール</label>
              <select id="client-rule-type" onchange="toggleClientRuleFields()">
                <option value="monthly">毎月◯日</option>
                <option value="monthEnd">月末</option>
                <option value="weekly">毎週◯曜</option>
                <option value="nextMonthDay">翌月◯日</option>
                <option value="monthlyBusinessDay">第◯営業日</option>
              </select>
              <div id="client-rule-detail" style="margin-top:10px;">
                <input type="number" id="client-day" min="1" max="31" placeholder="日">
                <select id="client-weekday" class="hidden">
                  <option value="0">日曜日</option>
                  <option value="1">月曜日</option>
                  <option value="2">火曜日</option>
                  <option value="3">水曜日</option>
                  <option value="4">木曜日</option>
                  <option value="5">金曜日</option>
                  <option value="6">土曜日</option>
                </select>
                <input type="number" id="client-nth" min="1" max="20" placeholder="第n営業日" class="hidden">
              </div>
              <div class="hint-text">支払サイトに合わせて設定してください。</div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>入金先銀行</label>
                <select id="client-bank-id">
                  <option value="">(未選択)</option>
                  ${items.filter(i => i.type === 'bank').map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>土日祝の調整</label>
                <select id="client-adjustment">
                  <option value="none">調整なし</option>
                  <option value="prev_weekday" selected>前営業日</option>
                  <option value="next_weekday">翌営業日</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>契約期間</label>
              <div class="form-row">
                <input type="date" id="client-eff-start" placeholder="開始日">
                <input type="date" id="client-eff-end" placeholder="終了日">
              </div>
              <div class="hint-text">未入力なら期限なしで扱います。</div>
            </div>
            <div class="form-group">
              <label>メモ</label>
              <textarea id="client-notes" rows="2" placeholder="請求書番号や担当者など"></textarea>
            </div>
          ` : `
            <div class="form-row ${currentTab === 'cards' ? 'hidden' : ''}">
              <div class="form-group">
                <label>種別</label>
                <select id="loan-type" onchange="toggleLoanFields()">
                  ${loanTypeOptionsHtml}
                </select>
              </div>
              <div class="form-group">
                <label>年利 (%)</label>
                <input type="number" id="loan-rate" step="any" ${currentTab === 'cards' ? '' : 'required'}>
              </div>
            </div>
            <div class="form-row ${currentTab === 'cards' ? 'hidden' : ''}">
              <div class="form-group">
                <label>現在残高</label>
                <input type="text" inputmode="numeric" id="loan-balance" oninput="handleNumericInput(this)" ${currentTab === 'cards' ? '' : 'required'}>
              </div>
              <div class="form-group">
                <label>月間返済額</label>
                <input type="text" inputmode="numeric" id="loan-payment" oninput="handleNumericInput(this)" ${currentTab === 'cards' ? '' : 'required'}>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>${currentTab === 'cards' ? '限度額' : '限度額 (任意)'}</label>
                <input type="text" inputmode="numeric" id="loan-limit" oninput="handleNumericInput(this)" ${currentTab === 'cards' ? 'required' : ''}>
              </div>
              <div class="form-group">
                <label>${currentTab === 'cards' ? '引落日 (1-31)' : '返済日 (1-31)'}</label>
                <input type="number" id="loan-day" min="1" max="31" value="27">
              </div>
            </div>
            ${currentTab === 'cards' ? `
              <div class="form-group">
                <label>ブランドロゴ</label>
                <input type="hidden" id="loan-logo">
                <div id="logo-selection" class="logo-candidate-grid">
                  ${CARD_BRANDS.map(brand => {
                    const url = `https://www.google.com/s2/favicons?domain=${brand.domain}&sz=64`;
                    return `
                      <div class="logo-candidate" onclick="selectCardLogo('${url}', this)">
                        <img src="${url}" alt="${brand.name}">
                        <span>${brand.name}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}
            <div id="field-credit-card-detail" class="hidden">
              <details class="collapsible">
                <summary>高度な設定 (締日・支払月など)</summary>
                <div class="collapsible-body">
                  <div class="form-row">
                    <div class="form-group">
                      <label>締日 (1-31, 任意)</label>
                      <input type="number" id="loan-deadline" min="1" max="31">
                    </div>
                    <div class="form-group">
                      <label>支払月オフセット</label>
                      <select id="loan-offset">
                        <option value="0">当月</option>
                        <option value="1" selected>翌月</option>
                        <option value="2">翌々月</option>
                      </select>
                    </div>
                  </div>
                </div>
              </details>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>${currentTab === 'cards' ? '引落銀行' : '支払元銀行'}</label>
                <select id="loan-bank-id">
                  <option value="">(未選択)</option>
                  ${items.filter(i => i.type === 'bank').map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>土日祝の調整</label>
                <select id="loan-adjustment">
                  <option value="none">調整なし</option>
                  <option value="prev_weekday" selected>前営業日</option>
                  <option value="next_weekday">翌営業日</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>メモ</label>
              <textarea id="loan-notes" rows="2" placeholder="備考など"></textarea>
            </div>
            <div class="form-group">
              <label>借入種別を追加</label>
              <div class="form-row">
                <input type="text" id="loan-type-custom" placeholder="例: 車/リフォーム/家電">
                <button type="button" onclick="addLoanTypeOption()" class="btn small">追加</button>
              </div>
              <div style="font-size: 0.75rem; color: #6b7280; margin-top: 6px;">追加後、種別のプルダウンに反映されます。</div>
            </div>
          `}
          
          <div class="modal-actions">
            <button type="button" onclick="hideModal()" class="btn">キャンセル</button>
            <button type="submit" class="btn primary">保存</button>
          </div>
        </form>
      </div>
    </div>

    ${currentTab === 'clients' ? `
      <div id="client-bulk-modal" class="modal hidden">
        <div class="modal-content">
          <h3>クライアントの一括生成</h3>
          <div class="form-group">
            <label>開始月</label>
            <input type="month" id="bulk-start-month">
          </div>
          <div class="form-group">
            <label>終了月</label>
            <input type="month" id="bulk-end-month">
            <div class="hint-text">未指定なら年末までを自動設定します。</div>
          </div>
          <div class="modal-actions">
            <button type="button" onclick="closeClientBulkModal()" class="btn">キャンセル</button>
            <button type="button" onclick="runClientBulkGenerate()" class="btn primary">生成</button>
          </div>
        </div>
      </div>
    ` : ''}
  `;

  // イベントリスナー
  container.querySelector('#add-btn').onclick = () => showModal();
  const bulkBtn = container.querySelector('#bulk-generate-btn');
  if (bulkBtn) bulkBtn.onclick = () => openClientBulkModal();

  const importBtn = container.querySelector('#import-btn');
  const importFile = container.querySelector('#import-file');
  if (importBtn && importFile) {
    importBtn.onclick = () => importFile.click();
    importFile.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target.result);
          if (!Array.isArray(json)) throw new Error('JSONは配列形式である必要があります');
          
          if (await window.showConfirm(`${json.length}件のデータをインポートしますか？`)) {
            // クレジットカードとしてインポート
            const cardsToImport = json.map(c => ({
              interestRate: 0,
              maxLimit: 0,
              currentBalance: 0,
              monthlyPayment: 0,
              paymentDay: 27,
              deadlineDay: null,
              payMonthOffset: 1,
              adjustment: 'prev_weekday',
              bankId: '',
              notes: '',
              ...c,
              type: 'クレジットカード' // 種別は固定
            }));
            appStore.addLoans(cardsToImport);
            if (appStore.data.settings?.driveSyncEnabled) {
              driveSync.push().catch(err => console.error('Auto drive push failed', err));
            }
            window.showToast('インポートが完了しました', 'success');
            renderMaster(container);
          }
        } catch (err) {
          console.error(err);
          window.showToast('JSONの解析に失敗しました: ' + err.message, 'danger');
        }
        importFile.value = '';
      };
      reader.readAsText(file);
    };
  }

  container.querySelector('#master-form').onsubmit = (e) => {
    e.preventDefault();
    saveData();
  };

  window.switchMasterTab = (tab) => {
    currentTab = tab;
    renderMaster(container);
  };

  window.switchItemType = (type) => {
    currentItemType = type;
    renderMaster(container);
  };

  window.openClientBulkModal = () => {
    const modal = document.getElementById('client-bulk-modal');
    if (!modal) return;
    const start = document.getElementById('bulk-start-month');
    const end = document.getElementById('bulk-end-month');
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    if (start) start.value = `${year}-${month}`;
    if (end) end.value = `${year}-12`;
    modal.classList.remove('hidden');
  };

  window.closeClientBulkModal = () => {
    const modal = document.getElementById('client-bulk-modal');
    if (modal) modal.classList.add('hidden');
  };

  window.runClientBulkGenerate = async () => {
    const start = document.getElementById('bulk-start-month')?.value;
    const end = document.getElementById('bulk-end-month')?.value;
    if (!start) {
      window.showToast('開始月を指定してください', 'warn');
      return;
    }
    const [startY, startM] = start.split('-').map(Number);
    const [endY, endM] = (end || `${startY}-12`).split('-').map(Number);
    const months = [];
    let y = startY;
    let m = startM;
    while (y < endY || (y === endY && m <= endM)) {
      months.push([y, m]);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }

    for (const [year, month] of months) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const existing = appStore.data.calendar.generatedMonths[key] || [];
      const existingById = new Map(existing.map(e => [e.id, e]));
      const clientEvents = generateClientEvents(clients, year, month);
      const merged = [];
      const used = new Set();

      clientEvents.forEach(event => {
        const old = existingById.get(event.id);
        if (old) {
          merged.push(old.status === 'paid' ? old : { ...event, ...old, status: old.status });
        } else {
          merged.push(event);
        }
        used.add(event.id);
      });
      existing.forEach(old => {
        if (!used.has(old.id)) merged.push(old);
      });
      appStore.addMonthEvents(key, merged);
    }
    window.showToast('クライアント収入を一括生成しました', 'success');
    closeClientBulkModal();
  };

  window.editMasterItem = (id) => {
    const item = appStore.data.master.items.find(i => i.id === id);
    showModal(item);
  };

  window.editLoan = (id) => {
    const loan = appStore.data.master.loans.find(l => l.id === id);
    showModal(loan);
  };

  window.editClient = (id) => {
    const client = appStore.data.master.clients.find(c => c.id === id);
    showModal(client);
  };

  window.handleNumericInput = (el) => {
    const cursor = el.selectionStart;
    const oldVal = el.value;
    const newVal = formatNumber(oldVal);
    
    if (oldVal === newVal) return;
    
    el.value = newVal;
    
    // カンマが増減した分を考慮してカーソル位置を調整
    const diff = newVal.length - oldVal.length;
    el.setSelectionRange(cursor + diff, cursor + diff);
  };

  window.addLoanTypeOption = () => {
    const input = document.getElementById('loan-type-custom');
    const select = document.getElementById('loan-type');
    if (!input || !select) return;
    const value = input.value.trim();
    if (!value) {
      window.showToast('借入種別を入力してください', 'warn');
      return;
    }
    const existing = Array.from(select.options).some(opt => opt.value === value);
    if (!existing) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
      const nextOptions = [...(appStore.data.settings?.loanTypeOptions || []), value];
      appStore.updateSettings({ loanTypeOptions: nextOptions });
    }
    select.value = value;
    input.value = '';
    window.showToast('借入種別を追加しました', 'success');
  };

  window.selectCardLogo = (url, el) => {
    document.getElementById('loan-logo').value = url;
    document.querySelectorAll('.logo-candidate').forEach(c => c.classList.remove('selected'));
    if (el) el.classList.add('selected');
  };

  window.toggleMasterItem = (id) => {
    const item = appStore.data.master.items.find(i => i.id === id);
    appStore.updateMasterItem(id, { active: !item.active });
    if (appStore.data.settings?.driveSyncEnabled) {
      driveSync.push({ mode: 'auto' }).catch(err => console.error('Auto drive push failed', err));
    }
    renderMaster(container);
  };

  window.toggleLoan = (id) => {
    const loan = appStore.data.master.loans.find(l => l.id === id);
    appStore.updateLoan(id, { active: !loan.active });
    if (appStore.data.settings?.driveSyncEnabled) {
      driveSync.push().catch(err => console.error('Auto drive push failed', err));
    }
    renderMaster(container);
  };

  window.toggleClient = (id) => {
    const client = appStore.data.master.clients.find(c => c.id === id);
    appStore.updateClient(id, { active: !client.active });
    if (appStore.data.settings?.driveSyncEnabled) {
      driveSync.push().catch(err => console.error('Auto drive push failed', err));
    }
    renderMaster(container);
  };

  window.deleteMasterItem = async (id) => {
    if (await window.showConfirm('この項目を完全に削除しますか？')) {
      appStore.deleteMasterItem(id);
      if (appStore.data.settings?.driveSyncEnabled) {
        driveSync.push().catch(err => console.error('Auto drive push failed', err));
      }
      window.showToast('削除しました', 'success');
      renderMaster(container);
    }
  };

  window.deleteLoan = async (id) => {
    if (await window.showConfirm('この借入先を完全に削除しますか？')) {
      appStore.deleteLoan(id);
      if (appStore.data.settings?.driveSyncEnabled) {
        driveSync.push().catch(err => console.error('Auto drive push failed', err));
      }
      window.showToast('削除しました', 'success');
      renderMaster(container);
    }
  };

  window.deleteClient = async (id) => {
    if (await window.showConfirm('このクライアントを完全に削除しますか？')) {
      appStore.deleteClient(id);
      if (appStore.data.settings?.driveSyncEnabled) {
        driveSync.push().catch(err => console.error('Auto drive push failed', err));
      }
      window.showToast('削除しました', 'success');
      renderMaster(container);
    }
  };

  window.toggleMasterFormFields = () => {
    const typeEl = document.getElementById('master-type');
    if (!typeEl) return;
    const type = typeEl.value;
    const amountField = document.getElementById('field-amount');
    const ruleField = document.getElementById('field-rule');
    const balanceField = document.getElementById('field-balance');
    const bankSelectField = document.getElementById('field-bank-select');

    if (amountField) amountField.classList.toggle('hidden', type === 'bank');
    if (ruleField) ruleField.classList.toggle('hidden', type === 'bank');
    if (balanceField) balanceField.classList.toggle('hidden', type !== 'bank');
    if (bankSelectField) bankSelectField.classList.toggle('hidden', type === 'bank');
    
    if (type !== 'bank') {
      window.toggleRuleFields();
    }
  };

  window.toggleLoanFields = () => {
    const typeEl = document.getElementById('loan-type');
    if (!typeEl) return;
    const type = typeEl.value;
    const creditCardDetail = document.getElementById('field-credit-card-detail');
    if (creditCardDetail) {
      creditCardDetail.classList.toggle('hidden', type !== 'クレジットカード');
    }
    
    // カードの場合は年利・残高・返済額の行を完全に非表示にする（親のform-rowごと）
    const rateEl = document.getElementById('loan-rate');
    const balanceEl = document.getElementById('loan-balance');
    const paymentEl = document.getElementById('loan-payment');
    
    if (rateEl) rateEl.closest('.form-row').classList.toggle('hidden', type === 'クレジットカード');
    if (balanceEl) balanceEl.closest('.form-row').classList.toggle('hidden', type === 'クレジットカード');
  };

  window.toggleRuleFields = () => {
    const ruleType = document.getElementById('master-rule-type').value;
    const dayInput = document.getElementById('master-day');
    const weekdaySelect = document.getElementById('master-weekday');
    const nthInput = document.getElementById('master-nth');

    if (!dayInput) return;

    dayInput.classList.toggle('hidden', !['monthly', 'nextMonthDay'].includes(ruleType));
    weekdaySelect.classList.toggle('hidden', ruleType !== 'weekly');
    nthInput.classList.toggle('hidden', ruleType !== 'monthlyBusinessDay');
  };

  window.toggleClientRuleFields = () => {
    const ruleType = document.getElementById('client-rule-type')?.value;
    const dayInput = document.getElementById('client-day');
    const weekdaySelect = document.getElementById('client-weekday');
    const nthInput = document.getElementById('client-nth');
    if (!dayInput || !weekdaySelect || !nthInput) return;
    dayInput.classList.toggle('hidden', !['monthly', 'nextMonthDay'].includes(ruleType));
    weekdaySelect.classList.toggle('hidden', ruleType !== 'weekly');
    nthInput.classList.toggle('hidden', ruleType !== 'monthlyBusinessDay');
  };
}

function renderItemsList(items) {
  const bankMap = Object.fromEntries(appStore.data.master.items.filter(i => i.type === 'bank').map(b => [b.id, b.name]));
  const tagLabels = {
    fixed: '固定費',
    variable: '変動費',
    card: 'カード',
    loan: '借入返済',
    tax: '税金/保険',
    service: 'サブスク',
    vehicle: '車両',
    business: '事業',
    car: '車両',
    bike: '車両'
  };
  const tagGroups = [
    { key: 'card', label: 'カード' },
    { key: 'business', label: '事業' },
    { key: 'fixed', label: '固定費' },
    { key: 'variable', label: '変動費' },
    { key: 'tax', label: '税金/保険' },
    { key: 'service', label: 'サブスク' },
    { key: 'loan', label: '借入返済' },
    { key: 'vehicle', label: '車両' },
    { key: 'uncategorized', label: '未分類' }
  ];

  const normalizeTag = (tag) => {
    if (!tag) return 'uncategorized';
    if (['car', 'bike', 'vehicle'].includes(tag)) return 'vehicle';
    if (tagLabels[tag]) return tag;
    return 'uncategorized';
  };

  const grouped = {};
  items.forEach(item => {
    const groupKey = normalizeTag(item.tag);
    if (!grouped[groupKey]) grouped[groupKey] = [];
    grouped[groupKey].push(item);
  });

  if (items.length === 0) {
    return `<div style="font-size: 0.85rem; color: #6b7280; padding: 10px 0;">項目がありません。</div>`;
  }

  return tagGroups
    .filter(group => grouped[group.key] && grouped[group.key].length > 0)
    .map(group => `
      <div class="master-group">
        <div class="master-group-title">
          <span>${group.label}</span>
          <span class="master-group-count">${grouped[group.key].length}</span>
        </div>
        <div class="master-group-grid">
          ${grouped[group.key].map(item => `
            <div class="master-item master-item-card ${item.active ? '' : 'inactive'}" onclick="editMasterItem('${item.id}')">
              <div class="info">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="type ${item.type}">
                    ${item.type === 'income' ? '収入' : '支出'}
                  </span>
                  ${item.tag ? `<span class="tag-badge tag-${normalizeTag(item.tag)}">${tagLabels[item.tag] || tagLabels[normalizeTag(item.tag)] || item.tag}</span>` : ''}
                </div>
                <span class="name">${getIcon(item.name, item.type)} ${item.name}</span>
                <span class="amount">
                  ${item.amountMode === 'variable' ? '<span style="color:var(--warn)">見積</span> ' : ''}¥${item.amount.toLocaleString()}
                </span>
                <div style="font-size: 0.8rem; color: #4b5563; margin-top: 4px;">
                  📅 ${formatRule(item.scheduleRule || {type:'monthly', day:item.day})}
                  ${item.adjustment !== 'none' ? ` (${item.adjustment === 'prev_weekday' ? '前倒し' : '後倒し'})` : ''}
                </div>
                <div class="bank-link" style="font-size: 0.75rem; color: #6b7280; margin-top: 4px;">
                  🏦 ${bankMap[item.bankId] || '(銀行未設定)'}
                </div>
              </div>
              <div class="actions">
                <button onclick="event.stopPropagation(); editMasterItem('${item.id}')" class="btn small">編集</button>
                <button onclick="event.stopPropagation(); toggleMasterItem('${item.id}')" class="btn small ${item.active ? 'warn' : 'success'}">
                  ${item.active ? '無効化' : '有効化'}
                </button>
                <button onclick="event.stopPropagation(); deleteMasterItem('${item.id}')" class="btn small danger">削除</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
}

function formatRule(rule) {
  if (!rule) return '設定なし';
  switch (rule.type) {
    case 'monthly': return `${rule.day}日`;
    case 'monthEnd': return '月末';
    case 'weekly': return `毎週${['日','月','火','水','木','金','土'][rule.weekday]}`;
    case 'nextMonthDay': return `翌月${rule.day}日`;
    case 'monthlyBusinessDay': return `第${rule.nth}営業日`;
    default: return '不明';
  }
}

function renderBanksList(banks) {
  return `
    <div class="master-group">
      <div class="master-group-title">
        <span>銀行口座</span>
        <span class="master-group-count">${banks.length}</span>
      </div>
      <div class="master-group-grid">
        ${banks.map(bank => `
          <div class="master-item master-item-card ${bank.active ? '' : 'inactive'}" onclick="editMasterItem('${bank.id}')">
            <div class="info">
              <span class="type bank">${getIcon(bank.name, 'bank')} 銀行</span>
              <span class="name">${bank.name}</span>
              <span class="amount">残: ¥${(bank.currentBalance || 0).toLocaleString()}</span>
            </div>
            <div class="actions">
              <button onclick="event.stopPropagation(); editMasterItem('${bank.id}')" class="btn small">編集</button>
              <button onclick="event.stopPropagation(); toggleMasterItem('${bank.id}')" class="btn small ${bank.active ? 'warn' : 'success'}">
                ${bank.active ? '無効化' : '有効化'}
              </button>
              <button onclick="event.stopPropagation(); deleteMasterItem('${bank.id}')" class="btn small danger" style="padding: 4px; font-size: 0.7rem;">削除</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderLoansList(loans) {
  const bankMap = Object.fromEntries(appStore.data.master.items.filter(i => i.type === 'bank').map(b => [b.id, b.name]));
  const grouped = {};
  loans.forEach(loan => {
    const key = loan.type || '未分類';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(loan);
  });

  const groupKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ja'));

  if (loans.length === 0) {
    return `<div style="font-size: 0.85rem; color: #6b7280; padding: 10px 0;">借入先がありません。</div>`;
  }

  return groupKeys.map(type => `
    <div class="master-group">
      <div class="master-group-title">
        <span>${type}</span>
        <span class="master-group-count">${grouped[type].length}</span>
      </div>
      <div class="master-group-grid">
        ${grouped[type].map(loan => `
          <div class="master-item master-item-card ${loan.active ? '' : 'inactive'}" style="border-left-color: var(--danger);" onclick="editLoan('${loan.id}')">
            <div class="info">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="type expense">借入</span>
                <span style="font-size: 0.7rem; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; color: #6b7280;">${loan.type || '未分類'}</span>
              </div>
              <span class="name">${getIcon(loan.name, 'loan')} ${loan.name}</span>
              <div style="display: flex; gap: 15px; font-size: 0.9rem;">
                <span class="amount">残: ¥${(loan.currentBalance || 0).toLocaleString()}</span>
                <span class="day">返済: ¥${(loan.monthlyPayment || 0).toLocaleString()}</span>
              </div>
              <div style="font-size: 0.8rem; color: #4b5563; margin-top: 4px;">
                📅 ${formatRule(loan.scheduleRule || {type:'monthly', day:loan.paymentDay})} 
                (${bankMap[loan.bankId] || '銀行未設定'})
              </div>
              ${loan.notes ? `<div style="font-size: 0.7rem; color: #6b7280; margin-top: 4px; font-style: italic;">📝 ${loan.notes}</div>` : ''}
            </div>
            <div class="actions">
              <button onclick="event.stopPropagation(); editLoan('${loan.id}')" class="btn small">編集</button>
              <button onclick="event.stopPropagation(); toggleLoan('${loan.id}')" class="btn small ${loan.active ? 'warn' : 'success'}">
                ${loan.active ? '無効化' : '有効化'}
              </button>
              <button onclick="event.stopPropagation(); deleteLoan('${loan.id}')" class="btn small danger">削除</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderCardsList(cards) {
  const bankMap = Object.fromEntries(appStore.data.master.items.filter(i => i.type === 'bank').map(b => [b.id, b.name]));
  
  if (cards.length === 0) {
    return `<div style="font-size: 0.85rem; color: #6b7280; padding: 10px 0;">クレジットカードが登録されていません。</div>`;
  }

  return `
    <div class="master-group">
      <div class="master-group-title">
        <span>登録済みカード</span>
        <span class="master-group-count">${cards.length}</span>
      </div>
      <div class="master-group-grid">
        ${cards.map(card => {
          const logoUrl = card.logo || getLogoUrl(card.name);
          return `
            <div class="master-item master-item-card card-type ${card.active ? '' : 'inactive'}" onclick="editLoan('${card.id}')">
              <div class="info">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                  <div class="card-chip"></div>
                  ${logoUrl ? `<img src="${logoUrl}" alt="" style="height: 32px; max-width: 80px; object-fit: contain; background: white; padding: 4px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">` : `<span style="font-size: 2rem;">💳</span>`}
                </div>
                <span class="name">${card.name}</span>
                <div class="bank-link" style="font-size: 0.85rem; margin-bottom: 12px; opacity: 0.9;">
                  🏦 ${bankMap[card.bankId] || '(銀行未設定)'}
                </div>
                <div class="info-grid">
                  <div>
                    <div>LIMIT</div>
                    <div>¥${(card.maxLimit || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div>PAY DAY</div>
                    <div>${card.paymentDay}日 (${card.payMonthOffset === 0 ? '当月' : '翌月'})</div>
                  </div>
                  <div>
                    <div>DEADLINE</div>
                    <div>${card.deadlineDay ? `${card.deadlineDay}日` : '—'}</div>
                  </div>
                  <div>
                    <div>STATUS</div>
                    <div>${card.active ? 'ACTIVE' : 'INACTIVE'}</div>
                  </div>
                </div>
                ${card.notes ? `<div style="font-size: 0.7rem; color: rgba(255,255,255,0.7); margin-top: 10px; font-style: italic; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">📝 ${card.notes}</div>` : ''}
              </div>
              <div class="actions" style="margin-top: 15px;">
                <button onclick="event.stopPropagation(); editLoan('${card.id}')" class="btn small" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);">編集</button>
                <button onclick="event.stopPropagation(); toggleLoan('${card.id}')" class="btn small" style="background: ${card.active ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.4)'}; color: white; border: 1px solid rgba(255,255,255,0.2);">
                  ${card.active ? '無効化' : '有効化'}
                </button>
                <button onclick="event.stopPropagation(); deleteLoan('${card.id}')" class="btn small" style="background: rgba(239,68,68,0.4); color: white; border: 1px solid rgba(255,255,255,0.2);">削除</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderClientsList(clients) {
  const bankMap = Object.fromEntries(appStore.data.master.items.filter(i => i.type === 'bank').map(b => [b.id, b.name]));

  if (clients.length === 0) {
    return `<div style="font-size: 0.85rem; color: #6b7280; padding: 10px 0;">クライアントがありません。</div>`;
  }

  return `
    <div class="master-group">
      <div class="master-group-title">
        <span>クライアント</span>
        <span class="master-group-count">${clients.length}</span>
      </div>
      <div class="master-group-grid">
        ${clients.map(client => `
          <div class="master-item master-item-card ${client.active ? '' : 'inactive'}" onclick="editClient('${client.id}')">
            <div class="info">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="type income">収入</span>
                <span style="font-size: 0.7rem; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; color: #6b7280;">クライアント</span>
              </div>
              <span class="name">🤝 ${client.name}</span>
              <div style="display: flex; gap: 15px; font-size: 0.9rem;">
                <span class="amount">入金: ¥${(client.amount || 0).toLocaleString()}</span>
                <span class="day">${client.amountMode === 'variable' ? '変動' : '固定'}</span>
              </div>
              <div style="font-size: 0.8rem; color: #4b5563; margin-top: 4px;">
                📅 ${formatRule(client.scheduleRule || { type: 'monthly', day: client.paymentDay || 15 })}
                (${bankMap[client.bankId] || '銀行未設定'})
              </div>
              ${client.notes ? `<div style="font-size: 0.7rem; color: #6b7280; margin-top: 4px; font-style: italic;">📝 ${client.notes}</div>` : ''}
            </div>
            <div class="actions">
              <button onclick="event.stopPropagation(); editClient('${client.id}')" class="btn small">編集</button>
              <button onclick="event.stopPropagation(); toggleClient('${client.id}')" class="btn small ${client.active ? 'warn' : 'success'}">
                ${client.active ? '無効化' : '有効化'}
              </button>
              <button onclick="event.stopPropagation(); deleteClient('${client.id}')" class="btn small danger">削除</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function showModal(data = null) {
  const modal = document.getElementById('master-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('master-form');

  if (data) {
    title.textContent = '編集';
    if (form['edit-id']) form['edit-id'].value = data.id;
    if (form['master-name']) form['master-name'].value = data.name;
    
    if (currentTab === 'items' || currentTab === 'banks') {
      if (form['master-type']) form['master-type'].value = data.type;
      if (form['master-tag']) form['master-tag'].value = data.tag || '';
      if (form['master-amount']) form['master-amount'].value = formatNumber(data.amount || 0);
      if (form['master-amount-mode']) form['master-amount-mode'].value = data.amountMode || 'fixed';
      
      if (form['master-rule-type']) {
        const rule = data.scheduleRule || { type: 'monthly', day: data.day || 1 };
        form['master-rule-type'].value = rule.type;
        if (form['master-day']) form['master-day'].value = rule.day || 1;
        if (form['master-weekday']) form['master-weekday'].value = rule.weekday || 0;
        if (form['master-nth']) form['master-nth'].value = rule.nth || 1;
      }

      if (form['master-balance']) form['master-balance'].value = formatNumber(data.currentBalance || 0);
      if (form['master-bank-id']) form['master-bank-id'].value = data.bankId || '';
      if (form['master-adjustment']) form['master-adjustment'].value = data.adjustment || 'none';
      
      if (form['master-eff-start']) form['master-eff-start'].value = data.effective?.start || '';
      if (form['master-eff-end']) form['master-eff-end'].value = data.effective?.end || '';

      window.toggleMasterFormFields();
    } else if (currentTab === 'loans' || currentTab === 'cards') {
      if (form['loan-type']) {
        const options = Array.from(form['loan-type'].options).map(o => o.value);
        if (!options.includes(data.type)) {
          const option = document.createElement('option');
          option.value = data.type;
          option.textContent = data.type;
          form['loan-type'].appendChild(option);
        }
        form['loan-type'].value = data.type || (currentTab === 'cards' ? 'クレジットカード' : '消費者金融');
      }
      if (form['master-name']) form['master-name'].value = data.name || '';
      if (form['loan-rate']) form['loan-rate'].value = data.interestRate || 0;
      if (form['loan-balance']) form['loan-balance'].value = formatNumber(data.currentBalance || 0);
      if (form['loan-payment']) form['loan-payment'].value = formatNumber(data.monthlyPayment || 0);
      if (form['loan-limit']) form['loan-limit'].value = formatNumber(data.maxLimit || 0);
      if (form['loan-day']) form['loan-day'].value = data.paymentDay || (data.scheduleRule?.day) || 27;
      if (form['loan-deadline']) form['loan-deadline'].value = data.deadlineDay || '';
      if (form['loan-offset']) form['loan-offset'].value = data.payMonthOffset !== undefined ? data.payMonthOffset : 1;
      if (form['loan-logo']) {
        form['loan-logo'].value = data.logo || '';
        // 候補から選択状態を復元
        document.querySelectorAll('.logo-candidate').forEach(c => {
          const img = c.querySelector('img');
          if (img && img.src === data.logo) c.classList.add('selected');
          else c.classList.remove('selected');
        });
      }
      if (form['loan-bank-id']) form['loan-bank-id'].value = data.bankId || '';
      if (form['loan-adjustment']) form['loan-adjustment'].value = data.adjustment || 'none';
      if (form['loan-notes']) form['loan-notes'].value = data.notes || '';
      window.toggleLoanFields();
    } else if (currentTab === 'clients') {
      if (form['client-name']) form['client-name'].value = data.name;
      if (form['client-amount-mode']) form['client-amount-mode'].value = data.amountMode || 'fixed';
      if (form['client-amount']) form['client-amount'].value = formatNumber(data.amount || 0);
      if (form['client-rule-type']) {
        const rule = data.scheduleRule || { type: 'monthly', day: data.paymentDay || 15 };
        form['client-rule-type'].value = rule.type;
        if (form['client-day']) form['client-day'].value = rule.day || 15;
        if (form['client-weekday']) form['client-weekday'].value = rule.weekday || 0;
        if (form['client-nth']) form['client-nth'].value = rule.nth || 1;
      }
      if (form['client-bank-id']) form['client-bank-id'].value = data.bankId || '';
      if (form['client-adjustment']) form['client-adjustment'].value = data.adjustment || 'none';
      if (form['client-eff-start']) form['client-eff-start'].value = data.effective?.start || '';
      if (form['client-eff-end']) form['client-eff-end'].value = data.effective?.end || '';
      if (form['client-notes']) form['client-notes'].value = data.notes || '';
      window.toggleClientRuleFields();
    }
  } else {
    title.textContent = '新規追加';
    form.reset();
    form['edit-id'].value = '';
    if (currentTab === 'clients') {
      if (form['client-amount-mode']) form['client-amount-mode'].value = 'fixed';
      if (form['client-rule-type']) form['client-rule-type'].value = 'monthly';
      if (form['client-day']) form['client-day'].value = 15;
      window.toggleClientRuleFields();
    }
    if (currentTab === 'cards' || currentTab === 'loans') {
      if (form['loan-type']) {
        form['loan-type'].value = (currentTab === 'cards' ? 'クレジットカード' : '消費者金融');
        window.toggleLoanFields();
      }
    }
  }
  modal.classList.remove('hidden');
}

window.hideModal = () => {
  document.getElementById('master-modal').classList.add('hidden');
}

function clearValidation(form) {
  form.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  form.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function markError(el) {
  if (!el) return;
  const group = el.closest('.form-group');
  if (group) group.classList.add('field-error');
  el.classList.add('input-error');
}

function requireText(el) {
  if (!el || el.value.trim() === '') {
    markError(el);
    return false;
  }
  return true;
}

function requireNumber(el) {
  if (!el || el.value === '' || Number.isNaN(parseNumber(el.value))) {
    markError(el);
    return false;
  }
  return true;
}

function saveData() {
  const form = document.getElementById('master-form');
  const id = form['edit-id'].value;
  clearValidation(form);
  let firstInvalid = null;

  const requireField = (fn, el) => {
    const ok = fn(el);
    if (!ok && !firstInvalid && el) firstInvalid = el;
    return ok;
  };
  
  if (currentTab === 'items' || currentTab === 'banks') {
    const typeEl = form['master-type'];
    const type = typeEl ? typeEl.value : (currentTab === 'banks' ? 'bank' : 'expense');

    requireField(requireText, form['master-name']);
    if (type === 'bank') {
      requireField(requireNumber, form['master-balance']);
    } else {
      requireField(requireNumber, form['master-amount']);
    }
    if (firstInvalid) {
      window.showToast('必須項目を入力してください', 'warn');
      firstInvalid.focus();
      return;
    }
    
    const ruleType = form['master-rule-type'] ? form['master-rule-type'].value : 'monthly';
    const ruleDay = Number(form['master-day']?.value || 1);
    const scheduleRule = {
      type: ruleType,
      day: ruleDay,
      weekday: Number(form['master-weekday']?.value || 0),
      nth: Number(form['master-nth']?.value || 1)
    };

    const data = {
      name: form['master-name'] ? form['master-name'].value : '',
      type: type,
      tag: form['master-tag'] ? form['master-tag'].value : '',
      amount: (type === 'bank' || !form['master-amount']) ? 0 : parseNumber(form['master-amount'].value),
      amountMode: form['master-amount-mode'] ? form['master-amount-mode'].value : 'fixed',
      scheduleRule: type === 'bank' ? null : scheduleRule,
      day: ruleType === 'monthEnd' ? 31 : ruleDay, // v1 fallback
      bankId: (type === 'bank' || !form['master-bank-id']) ? '' : form['master-bank-id'].value,
      adjustment: (type === 'bank' || !form['master-adjustment']) ? 'none' : form['master-adjustment'].value,
      effective: {
        start: form['master-eff-start']?.value || null,
        end: form['master-eff-end']?.value || null
      },
      currentBalance: (type === 'bank' && form['master-balance']) ? parseNumber(form['master-balance'].value) : 0
    };

    // 重複チェック: 借入返済タグで、かつ借入先に同名がある場合
    if (data.tag === 'loan' && data.type === 'expense') {
      const loans = appStore.data.master.loans || [];
      const hasLoan = loans.some(l => 
        l.active && (l.name === data.name || data.name.includes(l.name) || l.name.includes(data.name))
      );
      if (hasLoan) {
        window.showToast('借入先に同じ名前の項目があります。二重管理を避けるため、「借入先」タブでの管理を推奨します。', 'warn');
      }
    }

    if (id) appStore.updateMasterItem(id, data);
    else appStore.addMasterItem(data);
  } else if (currentTab === 'loans' || currentTab === 'cards') {
    requireField(requireText, form['master-name']);
    if (currentTab === 'cards') {
      requireField(requireNumber, form['loan-limit']);
    } else {
      requireField(requireNumber, form['loan-balance']);
      requireField(requireNumber, form['loan-payment']);
    }
    if (firstInvalid) {
      window.showToast('必須項目を入力してください', 'warn');
      firstInvalid.focus();
      return;
    }
    const data = {
      name: form['master-name'] ? form['master-name'].value : '',
      type: form['loan-type'] ? form['loan-type'].value : (currentTab === 'cards' ? 'クレジットカード' : '消費者金融'),
      interestRate: Number(form['loan-rate'] ? form['loan-rate'].value : 0),
      currentBalance: parseNumber(form['loan-balance'] ? form['loan-balance'].value : 0),
      monthlyPayment: parseNumber(form['loan-payment'] ? form['loan-payment'].value : 0),
      maxLimit: parseNumber(form['loan-limit'] ? form['loan-limit'].value : 0),
      paymentDay: Number(form['loan-day'] ? form['loan-day'].value : 27),
      deadlineDay: form['loan-deadline']?.value ? Number(form['loan-deadline'].value) : null,
      payMonthOffset: Number(form['loan-offset']?.value || 0),
      bankId: form['loan-bank-id'] ? form['loan-bank-id'].value : '',
      logo: form['loan-logo'] ? form['loan-logo'].value : '',
      adjustment: form['loan-adjustment'] ? form['loan-adjustment'].value : 'none',
      notes: form['loan-notes'] ? form['loan-notes'].value : ''
    };

    // 重複チェック: 収支項目側に同名の借入返済タグがある場合
    const items = appStore.data.master.items || [];
    const duplicateItem = items.find(i => 
      i.tag === 'loan' && i.active && (i.name === data.name || i.name.includes(data.name) || data.name.includes(i.name))
    );
    if (duplicateItem) {
      window.showToast(`収支項目に「${duplicateItem.name}」が登録されています。二重生成を避けるため、収支項目側を削除または無効化することをお勧めします。`, 'warn');
    }

    // クレジットカードの場合は負債項目をゼロクリア
    if (data.type === 'クレジットカード') {
      data.interestRate = 0;
      data.currentBalance = 0;
      data.monthlyPayment = 0;
    }
    if (id) appStore.updateLoan(id, data);
    else appStore.addLoan(data);
  } else if (currentTab === 'clients') {
    requireField(requireText, form['client-name']);
    requireField(requireNumber, form['client-amount']);
    if (firstInvalid) {
      window.showToast('必須項目を入力してください', 'warn');
      firstInvalid.focus();
      return;
    }

    const ruleType = form['client-rule-type'] ? form['client-rule-type'].value : 'monthly';
    const scheduleRule = {
      type: ruleType,
      day: Number(form['client-day']?.value || 15),
      weekday: Number(form['client-weekday']?.value || 0),
      nth: Number(form['client-nth']?.value || 1)
    };

    const data = {
      name: form['client-name'] ? form['client-name'].value : '',
      amount: parseNumber(form['client-amount']?.value || 0),
      amountMode: form['client-amount-mode'] ? form['client-amount-mode'].value : 'fixed',
      scheduleRule,
      paymentDay: scheduleRule.day,
      bankId: form['client-bank-id'] ? form['client-bank-id'].value : '',
      adjustment: form['client-adjustment'] ? form['client-adjustment'].value : 'none',
      effective: {
        start: form['client-eff-start']?.value || null,
        end: form['client-eff-end']?.value || null
      },
      notes: form['client-notes'] ? form['client-notes'].value : ''
    };
    if (id) appStore.updateClient(id, data);
    else appStore.addClient(data);
  }
  
  if (appStore.data.settings?.driveSyncEnabled) {
    driveSync.push().catch(err => console.error('Auto drive push failed', err));
  }
  
  hideModal();
  renderMaster(document.getElementById('app-container'));
}
