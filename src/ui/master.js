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
  const incomeItemNames = new Set(
    items
      .filter(item => item.type === 'income')
      .map(item => (item.name || '').trim())
      .filter(Boolean)
  );
  const incomeClientItems = clients.filter(client => !incomeItemNames.has((client.name || '').trim())).map(client => ({
    ...client,
    id: `client-${client.id}`,
    clientId: client.id,
    type: 'income',
    tag: client.tag || 'business',
    name: client.name,
    scheduleRule: client.scheduleRule || { type: 'monthly', day: client.paymentDay || 15 },
    __source: 'client'
  }));
  const visibleItems = currentItemType === 'income'
    ? [...items.filter(i => i.type !== 'bank' && i.type === 'income'), ...incomeClientItems]
    : items.filter(i => i.type !== 'bank' && i.type === 'expense');

  // 月次サマリー計算（収支項目タブ用）
  const activeIncomeItems = [
    ...items.filter(i => i.type === 'income' && i.active),
    ...clients.filter(c => c.active && !incomeItemNames.has((c.name || '').trim()))
  ];
  const activeExpenseItems = items.filter(i => i.type === 'expense' && i.active);
  const monthlyIncome = activeIncomeItems.reduce((s, i) => s + (i.amount || 0), 0);
  const monthlyExpense = activeExpenseItems.reduce((s, i) => s + (i.amount || 0), 0);
  const monthlyBalance = monthlyIncome - monthlyExpense;

  const tabMeta = {
    items:   { icon: '📝', label: '固定収支',        desc: '毎月だいたい決まっている収入・固定支出を登録します。時給案件など月ごとに変わる収入は、ここでは見込み額だけ登録して今月額はダッシュボードで更新します。' },
    banks:   { icon: '🏦', label: '銀行口座',        desc: '口座は入出金の紐付け先です。残高管理を厳密にするより、今月使える手元資金はダッシュボードでざっくり入力します。' },
    cards:   { icon: '💳', label: 'クレカ',          desc: 'カード名・限度額・引落日・銀行だけを登録します。今月のカード支払い額はダッシュボードで毎月確定します。' },
    loans:   { icon: '💸', label: '借入先',          desc: 'ローン・借金の残高・返済額・金利を登録。返済シミュレーションに使われます。' },
  };

  container.innerHTML = `
    <!-- ページヘッダー -->
    <div style="padding: 16px 16px 0; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h1 style="font-size: 1.15rem; font-weight: 800; margin: 0; color: var(--text);">マスター設定</h1>
        <p style="font-size: 0.75rem; color: var(--text-3); margin: 2px 0 0;">毎月変わらない前提だけを登録</p>
      </div>
      <button onclick="location.hash='#dashboard'" class="btn small" style="display:flex;align-items:center;gap:4px;">🛟 ダッシュボードへ</button>
    </div>

    <!-- タブナビ -->
    <div style="display: flex; gap: 6px; padding: 12px 16px 0; overflow-x: auto; scrollbar-width: none;">
      ${Object.entries(tabMeta).map(([key, m]) => `
        <button
          onclick="switchMasterTab('${key}')"
          style="flex-shrink:0; padding: 6px 14px; border-radius: 20px; border: 1.5px solid ${currentTab === key ? 'var(--primary)' : 'var(--card-border)'}; background: ${currentTab === key ? 'var(--primary)' : 'var(--card)'}; color: ${currentTab === key ? '#fff' : 'var(--text-2)'}; font-size: 0.82rem; font-weight: ${currentTab === key ? '700' : '500'}; cursor: pointer; white-space: nowrap;">
          ${m.icon} ${m.label}
        </button>
      `).join('')}
    </div>

    <!-- タブ説明 -->
    <div style="margin: 10px 16px 0; padding: 9px 12px; background: var(--surface); border-radius: 10px; font-size: 0.78rem; color: var(--text-3); line-height: 1.5;">
      ${tabMeta[currentTab]?.desc || ''}
    </div>

    ${currentTab === 'items' ? `
    <!-- 月次サマリーバー -->
    <div style="margin: 10px 16px 0; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
      <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 10px; padding: 10px 12px; text-align: center;">
        <div style="font-size: 0.7rem; color: var(--text-3); margin-bottom: 2px;">月収入合計</div>
        <div style="font-size: 1rem; font-weight: 800; color: var(--success);">¥${monthlyIncome.toLocaleString()}</div>
      </div>
      <div style="background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.18); border-radius: 10px; padding: 10px 12px; text-align: center;">
        <div style="font-size: 0.7rem; color: var(--text-3); margin-bottom: 2px;">月支出合計</div>
        <div style="font-size: 1rem; font-weight: 800; color: var(--danger);">¥${monthlyExpense.toLocaleString()}</div>
      </div>
      <div style="background: ${monthlyBalance >= 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)'}; border: 1px solid ${monthlyBalance >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; border-radius: 10px; padding: 10px 12px; text-align: center;">
        <div style="font-size: 0.7rem; color: var(--text-3); margin-bottom: 2px;">月収支</div>
        <div style="font-size: 1rem; font-weight: 800; color: ${monthlyBalance >= 0 ? 'var(--success)' : 'var(--danger)'};">${monthlyBalance >= 0 ? '+' : ''}¥${monthlyBalance.toLocaleString()}</div>
      </div>
    </div>
    ` : ''}

    <!-- リスト＋追加ボタン -->
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px 0;">
      <div style="font-weight: 700; font-size: 0.9rem; color: var(--text);">
        ${tabMeta[currentTab]?.icon} ${tabMeta[currentTab]?.label}一覧
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        ${currentTab === 'clients' ? `<button id="bulk-generate-btn" class="btn small">一括生成</button>` : ''}
        ${currentTab === 'cards' ? `
          <button id="import-btn" class="btn small">インポート</button>
          <input type="file" id="import-file" class="hidden" accept=".json">
        ` : ''}
        <button id="add-btn" class="btn primary" style="padding: 7px 16px; font-size: 0.85rem;">＋ 追加</button>
      </div>
    </div>

    <div class="master-list" style="padding: 8px 16px 100px;">
      ${currentTab === 'items' ? `
        <div style="display: flex; gap: 6px; margin-bottom: 12px;">
          <button onclick="switchItemType('income')" style="flex:1; padding: 8px; border-radius: 10px; border: 1.5px solid ${currentItemType === 'income' ? 'var(--success)' : 'var(--card-border)'}; background: ${currentItemType === 'income' ? 'rgba(16,185,129,0.1)' : 'var(--card)'}; color: ${currentItemType === 'income' ? 'var(--success)' : 'var(--text-2)'}; font-weight: ${currentItemType === 'income' ? '700' : '500'}; cursor: pointer; font-size: 0.85rem;">
            ↑ 収入 (${activeIncomeItems.length}件)
          </button>
          <button onclick="switchItemType('expense')" style="flex:1; padding: 8px; border-radius: 10px; border: 1.5px solid ${currentItemType === 'expense' ? 'var(--danger)' : 'var(--card-border)'}; background: ${currentItemType === 'expense' ? 'rgba(239,68,68,0.08)' : 'var(--card)'}; color: ${currentItemType === 'expense' ? 'var(--danger)' : 'var(--text-2)'}; font-weight: ${currentItemType === 'expense' ? '700' : '500'}; cursor: pointer; font-size: 0.85rem;">
            ↓ 支出 (${activeExpenseItems.length}件)
          </button>
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
                <label>登録するもの</label>
                <select id="master-type" onchange="toggleMasterFormFields()">
                  <option value="expense">支出</option>
                  <option value="income">収入</option>
                </select>
              </div>
              <div class="form-group">
                <label>分類</label>
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
            <div id="master-form-guide" class="form-guide"></div>
            <div id="field-amount" class="form-group">
              <div class="form-row">
                <div>
                  <label id="master-amount-mode-label">支払額の決まり方</label>
                  <select id="master-amount-mode">
                    <option value="fixed">毎月ほぼ同じ</option>
                    <option value="variable">月ごとに変わる</option>
                  </select>
                  <div id="master-amount-mode-hint" class="hint-text">変わる場合は、今月額をダッシュボードで更新します。</div>
                </div>
                <div>
                  <label id="master-amount-label">毎月の支払額</label>
                  <input type="text" inputmode="numeric" id="master-amount" required placeholder="例: 80,000" oninput="handleNumericInput(this)">
                </div>
              </div>
            </div>
            <div id="field-rule" class="form-group">
              <label id="master-rule-label">支払予定日</label>
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
                <label id="master-bank-label">支払元銀行</label>
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
            <div class="form-guide">
              <strong>銀行で登録するもの:</strong> 口座名だけです。カード引落や収支の入出金先として紐付けます。口座残高は毎回調べる前提にしません。
            </div>
          ` : currentTab === 'clients' ? `
              <div class="form-group">
                <label>クライアント名</label>
                <input type="text" id="client-name" required placeholder="例: 株式会社〇〇">
              <div class="hint-text">請求書の宛先と同じ名前がおすすめです。</div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>報酬の決まり方</label>
                <select id="client-amount-mode">
                  <option value="fixed">毎月固定</option>
                  <option value="variable">時給・出来高で変動</option>
                </select>
                <div class="hint-text">変動の場合は、ダッシュボードで今月の見込み額・実入金額を更新します。</div>
              </div>
              <div class="form-group">
                <label>月の見込み額</label>
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
          ` : currentTab === 'cards' ? `
            <input type="hidden" id="loan-type" value="クレジットカード">
            <div style="margin-bottom: 14px; padding: 10px 12px; background: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.18); border-radius: 8px; font-size: 0.78rem; color: var(--text-3);">
              💡 今月のカード支払い額は <strong style="color:var(--primary);">ダッシュボード</strong> で入力します。ここではカード名・引落日・銀行などの基本情報だけ登録してください。
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>限度額</label>
                <input type="text" inputmode="numeric" id="loan-limit" oninput="handleNumericInput(this)" required placeholder="例: 500,000">
              </div>
              <div class="form-group" style="display:flex;flex-direction:column;justify-content:flex-end;">
                <label style="visibility:hidden;">dummy</label>
                <div style="font-size:0.75rem;color:var(--text-3);padding:8px 0;">引落日・銀行を設定するとカレンダーへ正確に反映されます</div>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>引落日 (1-31)</label>
                <input type="number" id="loan-day" min="1" max="31" value="27">
              </div>
              <div class="form-group">
                <label>引落銀行</label>
                <select id="loan-bank-id">
                  <option value="">(未選択)</option>
                  ${items.filter(i => i.type === 'bank').map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>土日祝の調整</label>
              <select id="loan-adjustment">
                <option value="none">調整なし</option>
                <option value="prev_weekday" selected>前営業日 (金曜など)</option>
                <option value="next_weekday">翌営業日 (月曜など)</option>
              </select>
            </div>
            <div class="form-group">
              <label>メモ</label>
              <textarea id="loan-notes" rows="2" placeholder="備考など"></textarea>
            </div>
            <div class="form-group">
              <label>ブランドロゴ</label>
              <input type="hidden" id="loan-logo">
              <div id="logo-selection" class="logo-candidate-grid">
                ${CARD_BRANDS.map(brand => {
                  const url = brand.logoUrl || `https://www.google.com/s2/favicons?domain=${brand.domain}&sz=64`;
                  return `
                    <div class="logo-candidate" onclick="selectCardLogo('${url}', this)">
                      <img src="${url}" alt="${brand.name}">
                      <span>${brand.name}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
            <details class="collapsible">
              <summary>詳細設定 (締日・支払月オフセットなど)</summary>
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
                <div class="form-row">
                  <div class="form-group">
                    <label>年率 (%)</label>
                    <input type="number" id="loan-rate" step="any" value="0">
                  </div>
                </div>
              </div>
            </details>
          ` : `
            <div class="form-row">
              <div class="form-group">
                <label>種別</label>
                <select id="loan-type" onchange="toggleLoanFields()">
                  ${loanTypeOptionsHtml}
                </select>
              </div>
              <div class="form-group">
                <label>年利 (%)</label>
                <input type="number" id="loan-rate" step="any" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>現在残高</label>
                <input type="text" inputmode="numeric" id="loan-balance" oninput="handleNumericInput(this)" required>
              </div>
              <div class="form-group">
                <label>月間返済額</label>
                <input type="text" inputmode="numeric" id="loan-payment" oninput="handleNumericInput(this)" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>限度額 (任意)</label>
                <input type="text" inputmode="numeric" id="loan-limit" oninput="handleNumericInput(this)">
              </div>
              <div class="form-group">
                <label>返済日 (1-31)</label>
                <input type="number" id="loan-day" min="1" max="31" value="27">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>支払元銀行</label>
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

  window.editClientFromIncome = (id) => {
    currentTab = 'clients';
    renderMaster(container);
    setTimeout(() => {
      const client = appStore.data.master.clients.find(c => c.id === id);
      if (client) showModal(client);
    }, 0);
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
    const isIncome = type === 'income';
    const amountField = document.getElementById('field-amount');
    const ruleField = document.getElementById('field-rule');
    const balanceField = document.getElementById('field-balance');
    const bankSelectField = document.getElementById('field-bank-select');
    const guide = document.getElementById('master-form-guide');
    const amountModeLabel = document.getElementById('master-amount-mode-label');
    const amountModeHint = document.getElementById('master-amount-mode-hint');
    const amountLabel = document.getElementById('master-amount-label');
    const amountInput = document.getElementById('master-amount');
    const ruleLabel = document.getElementById('master-rule-label');
    const bankLabel = document.getElementById('master-bank-label');
    const tagSelect = document.getElementById('master-tag');

    if (amountField) amountField.classList.toggle('hidden', type === 'bank');
    if (ruleField) ruleField.classList.toggle('hidden', type === 'bank');
    if (balanceField) balanceField.classList.toggle('hidden', type !== 'bank');
    if (bankSelectField) bankSelectField.classList.toggle('hidden', type === 'bank');

    if (guide) {
      guide.innerHTML = isIncome
        ? '<strong>収入で登録するもの:</strong> 収入名、月の見込み額、入金予定日、入金先銀行。時給・出来高の案件は「月ごとに変わる」にして、今月額はダッシュボードで更新します。'
        : '<strong>支出で登録するもの:</strong> 固定費名、毎月の支払額、支払予定日、支払元銀行。カード利用額はここではなく、クレカ登録後にダッシュボードで今月請求額を入力します。';
    }
    if (amountModeLabel) amountModeLabel.textContent = isIncome ? '収入額の決まり方' : '支払額の決まり方';
    if (amountModeHint) {
      amountModeHint.textContent = isIncome
        ? '時給・出来高などは、今月の見込み額や実入金額をダッシュボードで更新します。'
        : '毎月変わる支出は、ここでは目安額を入れて必要に応じて今月だけ調整します。';
    }
    if (amountLabel) amountLabel.textContent = isIncome ? '月の見込み額' : '毎月の支払額';
    if (amountInput) amountInput.placeholder = isIncome ? '例: 300,000' : '例: 80,000';
    if (ruleLabel) ruleLabel.textContent = isIncome ? '入金予定日' : '支払予定日';
    if (bankLabel) bankLabel.textContent = isIncome ? '入金先銀行' : '支払元銀行';
    if (tagSelect) {
      const labels = isIncome
        ? { fixed: '固定収入', variable: '変動収入', card: 'カード以外', loan: '借入ではない', tax: '税金還付/保険', service: '継続収入', vehicle: '車両関連', business: '事業売上' }
        : { fixed: '固定費', variable: '変動費', card: 'カード払', loan: '借入返済', tax: '税金/保険', service: 'サブスク', vehicle: '車両', business: '事業' };
      Array.from(tagSelect.options).forEach(option => {
        if (labels[option.value]) option.textContent = labels[option.value];
      });
    }
    
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
  const isIncome = (items[0]?.type || currentItemType) === 'income';
  const tagLabels = {
    fixed: isIncome ? '固定収入' : '固定費',
    variable: isIncome ? '変動収入' : '変動費',
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
    { key: 'fixed', label: isIncome ? '固定収入' : '固定費' },
    { key: 'variable', label: isIncome ? '変動収入' : '変動費' },
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
    return `<div style="font-size: 0.85rem; color: var(--text-3); padding: 20px 0; text-align: center;">項目がありません。「＋ 追加」から登録してください。</div>`;
  }
  const accentColor = isIncome ? 'var(--success)' : 'var(--danger)';
  const accentBg   = isIncome ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.05)';
  const accentBorder = isIncome ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)';
  const sign = isIncome ? '+' : '-';

  return tagGroups
    .filter(group => grouped[group.key] && grouped[group.key].length > 0)
    .map(group => {
      const groupTotal = grouped[group.key].filter(i => i.active).reduce((s, i) => s + (i.amount || 0), 0);
      return `
      <div style="margin-bottom: 18px;">
        <!-- グループヘッダー -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--card-border);">
          <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-2);">${group.label}</span>
          <span style="font-size: 0.78rem; font-weight: 600; color: ${accentColor};">${sign}¥${groupTotal.toLocaleString()}/月</span>
        </div>
        <!-- アイテムリスト -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${grouped[group.key].map(item => {
            const isClientItem = item.__source === 'client';
            const editAction = isClientItem ? `editClientFromIncome('${item.clientId}')` : `editMasterItem('${item.id}')`;
            const toggleAction = isClientItem ? `toggleClient('${item.clientId}')` : `toggleMasterItem('${item.id}')`;
            const deleteAction = isClientItem ? `deleteClient('${item.clientId}')` : `deleteMasterItem('${item.id}')`;
            return `
            <div onclick="${editAction}"
              style="background: ${item.active ? accentBg : 'var(--surface)'}; border: 1px solid ${item.active ? accentBorder : 'var(--card-border)'}; border-radius: 12px; padding: 12px 14px; cursor: pointer; opacity: ${item.active ? '1' : '0.55'}; transition: opacity 0.2s;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <!-- 左: 名前・日付 -->
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${isClientItem ? '🤝' : getIcon(item.name, item.type)} ${item.name}
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-3); display: flex; gap: 8px; flex-wrap: wrap;">
                    <span>📅 毎月 ${formatRule(item.scheduleRule || {type:'monthly', day:item.day})}</span>
                    <span>🏦 ${bankMap[item.bankId] || '未設定'}</span>
                    ${isClientItem ? `<span style="color:var(--primary);font-weight:600;">クライアント</span>` : ''}
                    ${!item.active ? `<span style="color:var(--warn);font-weight:600;">● 無効</span>` : ''}
                  </div>
                </div>
                <!-- 右: 金額（大きく） -->
                <div style="text-align: right; flex-shrink: 0;">
                  ${item.amountMode === 'variable' ? `<div style="font-size: 0.65rem; color: var(--warn); font-weight: 700; margin-bottom: 1px;">今月額を更新</div>` : ''}
                  <div style="font-size: 1.25rem; font-weight: 800; color: ${accentColor}; letter-spacing: -0.5px;">
                    ${sign}¥${(item.amount || 0).toLocaleString()}
                  </div>
                  <div style="font-size: 0.65rem; color: var(--text-3);">${item.amountMode === 'variable' ? '見込み / 月' : '/ 月'}</div>
                </div>
              </div>
              <!-- アクションボタン -->
              <div style="display: flex; gap: 6px; margin-top: 10px; justify-content: flex-end;">
                <button onclick="event.stopPropagation(); ${toggleAction}" class="btn small ${item.active ? 'warn' : 'success'}" style="font-size: 0.72rem; padding: 3px 10px;">
                  ${item.active ? '無効化' : '有効化'}
                </button>
                <button onclick="event.stopPropagation(); ${deleteAction}" class="btn small danger" style="font-size: 0.72rem; padding: 3px 10px;">削除</button>
              </div>
            </div>
          `;
          }).join('')}
        </div>
      </div>
    `;
    }).join('');
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
  if (banks.length === 0) {
    return `<div style="font-size: 0.85rem; color: var(--text-3); padding: 20px 0; text-align: center;">銀行口座がありません。カードや収支の入出金先として使う口座名だけ登録してください。</div>`;
  }
  return `
    <div style="margin-bottom: 8px; padding: 10px 14px; background: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.18); border-radius: 10px; color: var(--text-2); font-size: 0.8rem; line-height: 1.55;">
      銀行は金額管理ではなく、カード引落・入金・支払いの紐付け先として使います。残高は今月画面の「手元資金」でざっくり入力してください。
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${banks.map(bank => `
        <div onclick="editMasterItem('${bank.id}')"
          style="background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px 14px; cursor: pointer; opacity: ${bank.active ? '1' : '0.55'};">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text);">
              🏦 ${bank.name}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-3);">紐付け先</div>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 10px; justify-content: flex-end;">
            <button onclick="event.stopPropagation(); toggleMasterItem('${bank.id}')" class="btn small ${bank.active ? 'warn' : 'success'}" style="font-size: 0.72rem; padding: 3px 10px;">
              ${bank.active ? '無効化' : '有効化'}
            </button>
            <button onclick="event.stopPropagation(); deleteMasterItem('${bank.id}')" class="btn small danger" style="font-size: 0.72rem; padding: 3px 10px;">削除</button>
          </div>
        </div>
      `).join('')}
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

  const totalBalance = loans.filter(l => l.active).reduce((s, l) => s + (l.currentBalance || 0), 0);
  const totalMonthlyPayment = loans.filter(l => l.active).reduce((s, l) => s + (l.monthlyPayment || 0), 0);
  return `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
      <div style="background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.18); border-radius: 10px; padding: 10px 12px; text-align: center;">
        <div style="font-size: 0.7rem; color: var(--text-3); margin-bottom: 2px;">総借入残高</div>
        <div style="font-size: 1rem; font-weight: 800; color: var(--danger);">¥${totalBalance.toLocaleString()}</div>
      </div>
      <div style="background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.12); border-radius: 10px; padding: 10px 12px; text-align: center;">
        <div style="font-size: 0.7rem; color: var(--text-3); margin-bottom: 2px;">月返済合計</div>
        <div style="font-size: 1rem; font-weight: 800; color: var(--danger);">¥${totalMonthlyPayment.toLocaleString()}</div>
      </div>
    </div>
    ${groupKeys.map(type => `
      <div style="margin-bottom: 16px;">
        <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-2); margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid var(--card-border);">${type}</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${grouped[type].map(loan => `
            <div onclick="editLoan('${loan.id}')"
              style="background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.15); border-left: 3px solid var(--danger); border-radius: 12px; padding: 12px 14px; cursor: pointer; opacity: ${loan.active ? '1' : '0.55'};">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 4px;">${getIcon(loan.name, 'loan')} ${loan.name}</div>
                  <div style="font-size: 0.75rem; color: var(--text-3);">📅 ${formatRule(loan.scheduleRule || {type:'monthly', day:loan.paymentDay})} &nbsp;🏦 ${bankMap[loan.bankId] || '未設定'}</div>
                  ${loan.notes ? `<div style="font-size: 0.7rem; color: var(--text-3); margin-top: 3px; font-style: italic;">📝 ${loan.notes}</div>` : ''}
                </div>
                <div style="text-align: right; flex-shrink: 0;">
                  <div style="font-size: 0.65rem; color: var(--text-3);">残高</div>
                  <div style="font-size: 1.15rem; font-weight: 800; color: var(--danger);">¥${(loan.currentBalance || 0).toLocaleString()}</div>
                  <div style="font-size: 0.7rem; color: var(--text-3); margin-top: 2px;">月返済 <strong style="color:var(--danger)">¥${(loan.monthlyPayment || 0).toLocaleString()}</strong></div>
                </div>
              </div>
              <div style="display: flex; gap: 6px; margin-top: 10px; justify-content: flex-end;">
                <button onclick="event.stopPropagation(); toggleLoan('${loan.id}')" class="btn small ${loan.active ? 'warn' : 'success'}" style="font-size: 0.72rem; padding: 3px 10px;">${loan.active ? '無効化' : '有効化'}</button>
                <button onclick="event.stopPropagation(); deleteLoan('${loan.id}')" class="btn small danger" style="font-size: 0.72rem; padding: 3px 10px;">削除</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

function renderCardsList(cards) {
  const bankMap = Object.fromEntries(appStore.data.master.items.filter(i => i.type === 'bank').map(b => [b.id, b.name]));

  if (cards.length === 0) {
    return `<div style="font-size: 0.85rem; color: #6b7280; padding: 10px 0;">クレジットカードが登録されていません。</div>`;
  }

  return `
    <div style="font-size: 0.75rem; color: var(--text-3); margin-bottom: 10px; padding: 8px 12px; background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.15); border-radius: 8px;">
      💡 今月のカード支払い額は <strong style="color:var(--primary);">🛟 ダッシュボード</strong> の「カード請求額を確定する」で入力します。ここではカードの基本情報だけ登録。
    </div>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${cards.map(card => {
        const logoUrl = card.logo || getLogoUrl(card.name);
        return `
          <div onclick="editLoan('${card.id}')"
            style="background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 14px 16px; cursor: pointer; opacity: ${card.active ? '1' : '0.55'};">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                  ${logoUrl ? `<img src="${logoUrl}" alt="" style="height: 20px; max-width: 50px; object-fit: contain; background: white; border-radius: 3px; padding: 2px;">` : `<span style="font-size:1.2rem;">💳</span>`}
                  <span style="font-size: 0.95rem; font-weight: 700; color: var(--text);">${card.name}</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-3); display: flex; gap: 10px; flex-wrap: wrap;">
                  <span>🏦 ${bankMap[card.bankId] || '銀行未設定'}</span>
                  <span>引落 ${card.paymentDay}日</span>
                  <span>限度 ¥${(card.maxLimit || 0).toLocaleString()}</span>
                </div>
              </div>
              <div style="text-align: right; flex-shrink: 0;">
                <div style="font-size: 0.65rem; color: var(--text-3);">引落先</div>
                <div style="font-size: 0.92rem; font-weight: 800; color: var(--text);">${bankMap[card.bankId] || '未設定'}</div>
                <div style="font-size: 0.65rem; color: var(--text-3);">請求額は今月で入力</div>
              </div>
            </div>
            ${card.notes ? `<div style="font-size: 0.7rem; color: var(--text-3); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--card-border); font-style: italic;">📝 ${card.notes}</div>` : ''}
            <div style="display: flex; gap: 6px; margin-top: 10px; justify-content: flex-end;">
              <button onclick="event.stopPropagation(); toggleLoan('${card.id}')" class="btn small ${card.active ? 'warn' : 'success'}" style="font-size: 0.72rem; padding: 3px 10px;">${card.active ? '無効化' : '有効化'}</button>
              <button onclick="event.stopPropagation(); deleteLoan('${card.id}')" class="btn small danger" style="font-size: 0.72rem; padding: 3px 10px;">削除</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderClientsList(clients) {
  const bankMap = Object.fromEntries(appStore.data.master.items.filter(i => i.type === 'bank').map(b => [b.id, b.name]));

  if (clients.length === 0) {
    return `<div style="font-size: 0.85rem; color: var(--text-3); padding: 20px 0; text-align: center;">クライアントがありません。</div>`;
  }

  const totalIncome = clients.filter(c => c.active).reduce((s, c) => s + (c.amount || 0), 0);
  return `
    <div style="margin-bottom: 8px; padding: 10px 14px; background: rgba(16,185,129,0.07); border: 1px solid rgba(16,185,129,0.2); border-radius: 10px; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 0.8rem; color: var(--text-2); font-weight: 600;">月収入合計</span>
      <span style="font-size: 1.1rem; font-weight: 800; color: var(--success);">+¥${totalIncome.toLocaleString()}</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${clients.map(client => `
        <div onclick="editClient('${client.id}')"
          style="background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.18); border-left: 3px solid var(--success); border-radius: 12px; padding: 12px 14px; cursor: pointer; opacity: ${client.active ? '1' : '0.55'};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 4px;">🤝 ${client.name}</div>
              <div style="font-size: 0.75rem; color: var(--text-3); display: flex; gap: 8px; flex-wrap: wrap;">
                <span>📅 ${formatRule(client.scheduleRule || { type: 'monthly', day: client.paymentDay || 15 })}</span>
                <span>🏦 ${bankMap[client.bankId] || '未設定'}</span>
                ${client.amountMode === 'variable' ? `<span style="color:var(--warn);font-weight:600;">今月額を更新</span>` : ''}
              </div>
              ${client.notes ? `<div style="font-size: 0.7rem; color: var(--text-3); margin-top: 3px; font-style: italic;">📝 ${client.notes}</div>` : ''}
            </div>
            <div style="text-align: right; flex-shrink: 0;">
              <div style="font-size: 1.2rem; font-weight: 800; color: var(--success);">+¥${(client.amount || 0).toLocaleString()}</div>
              <div style="font-size: 0.65rem; color: var(--text-3);">${client.amountMode === 'variable' ? '見込み / 月' : '/ 月'}</div>
            </div>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 10px; justify-content: flex-end;">
            <button onclick="event.stopPropagation(); toggleClient('${client.id}')" class="btn small ${client.active ? 'warn' : 'success'}" style="font-size: 0.72rem; padding: 3px 10px;">${client.active ? '無効化' : '有効化'}</button>
            <button onclick="event.stopPropagation(); deleteClient('${client.id}')" class="btn small danger" style="font-size: 0.72rem; padding: 3px 10px;">削除</button>
          </div>
        </div>
      `).join('')}
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
    } else if (currentTab === 'cards') {
      if (form['master-name']) form['master-name'].value = data.name || '';
      if (form['loan-limit']) form['loan-limit'].value = formatNumber(data.maxLimit || 0);
      if (form['loan-day']) form['loan-day'].value = data.paymentDay || (data.scheduleRule?.day) || 27;
      if (form['loan-deadline']) form['loan-deadline'].value = data.deadlineDay || '';
      if (form['loan-offset']) form['loan-offset'].value = data.payMonthOffset !== undefined ? data.payMonthOffset : 1;
      if (form['loan-rate']) form['loan-rate'].value = data.interestRate || 0;
      if (form['loan-logo']) {
        form['loan-logo'].value = data.logo || '';
        document.querySelectorAll('.logo-candidate').forEach(c => {
          const img = c.querySelector('img');
          if (img && img.src === data.logo) c.classList.add('selected');
          else c.classList.remove('selected');
        });
      }
      if (form['loan-bank-id']) form['loan-bank-id'].value = data.bankId || '';
      if (form['loan-adjustment']) form['loan-adjustment'].value = data.adjustment || 'none';
      if (form['loan-notes']) form['loan-notes'].value = data.notes || '';
    } else if (currentTab === 'loans') {
      if (form['loan-type']) {
        const options = Array.from(form['loan-type'].options).map(o => o.value);
        if (!options.includes(data.type)) {
          const option = document.createElement('option');
          option.value = data.type;
          option.textContent = data.type;
          form['loan-type'].appendChild(option);
        }
        form['loan-type'].value = data.type || '消費者金融';
      }
      if (form['master-name']) form['master-name'].value = data.name || '';
      if (form['loan-rate']) form['loan-rate'].value = data.interestRate || 0;
      if (form['loan-balance']) form['loan-balance'].value = formatNumber(data.currentBalance || 0);
      if (form['loan-payment']) form['loan-payment'].value = formatNumber(data.monthlyPayment || 0);
      if (form['loan-limit']) form['loan-limit'].value = formatNumber(data.maxLimit || 0);
      if (form['loan-day']) form['loan-day'].value = data.paymentDay || (data.scheduleRule?.day) || 27;
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
    if (currentTab === 'items') {
      if (form['master-type']) form['master-type'].value = currentItemType;
      if (form['master-tag']) form['master-tag'].value = currentItemType === 'income' ? 'business' : 'fixed';
      if (form['master-amount-mode']) form['master-amount-mode'].value = 'fixed';
      if (form['master-rule-type']) form['master-rule-type'].value = 'monthly';
      if (form['master-day']) form['master-day'].value = currentItemType === 'income' ? 25 : 27;
      window.toggleMasterFormFields();
    }
    if (currentTab === 'banks') {
      if (form['master-name']) form['master-name'].placeholder = '例: 楽天銀行、三菱UFJ銀行';
    }
    if (currentTab === 'clients') {
      if (form['client-amount-mode']) form['client-amount-mode'].value = 'fixed';
      if (form['client-rule-type']) form['client-rule-type'].value = 'monthly';
      if (form['client-day']) form['client-day'].value = 15;
      window.toggleClientRuleFields();
    }
    if (currentTab === 'loans') {
      if (form['loan-type']) {
        form['loan-type'].value = '消費者金融';
        window.toggleLoanFields();
      }
    }
  }
  modal.classList.remove('hidden');
}

window.hideModal = () => {
  document.getElementById('master-modal').classList.add('hidden');
  if (currentTab === 'clients') {
    currentTab = 'items';
    currentItemType = 'income';
    renderMaster(document.getElementById('app-container'));
  }
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
      // 銀行は紐付け先マスターとして扱い、残高入力は求めない。
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
      currentBalance: type === 'bank'
        ? (id ? (appStore.data.master.items.find(i => i.id === id)?.currentBalance || 0) : 0)
        : 0
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
  } else if (currentTab === 'cards') {
    requireField(requireText, form['master-name']);
    requireField(requireNumber, form['loan-limit']);
    if (firstInvalid) {
      window.showToast('必須項目を入力してください', 'warn');
      firstInvalid.focus();
      return;
    }
    const cardData = {
      name: form['master-name'].value,
      type: 'クレジットカード',
      interestRate: Number(form['loan-rate']?.value || 0),
      currentBalance: 0,
      monthlyPayment: 0,
      maxLimit: parseNumber(form['loan-limit'].value),
      paymentDay: Number(form['loan-day']?.value || 27),
      deadlineDay: form['loan-deadline']?.value ? Number(form['loan-deadline'].value) : null,
      payMonthOffset: Number(form['loan-offset']?.value || 1),
      bankId: form['loan-bank-id']?.value || '',
      logo: form['loan-logo']?.value || '',
      adjustment: form['loan-adjustment']?.value || 'none',
      notes: form['loan-notes']?.value || ''
    };
    let cardId = id;
    if (id) {
      appStore.updateLoan(id, cardData);
    } else {
      appStore.addLoan(cardData);
      const loans = appStore.data.master.loans || [];
      const added = loans.find(l => l.name === cardData.name && l.type === 'クレジットカード');
      cardId = added?.id;
    }
  } else if (currentTab === 'loans') {
    requireField(requireText, form['master-name']);
    requireField(requireNumber, form['loan-balance']);
    requireField(requireNumber, form['loan-payment']);
    if (firstInvalid) {
      window.showToast('必須項目を入力してください', 'warn');
      firstInvalid.focus();
      return;
    }
    const data = {
      name: form['master-name'] ? form['master-name'].value : '',
      type: form['loan-type'] ? form['loan-type'].value : '消費者金融',
      interestRate: Number(form['loan-rate'] ? form['loan-rate'].value : 0),
      currentBalance: parseNumber(form['loan-balance'] ? form['loan-balance'].value : 0),
      monthlyPayment: parseNumber(form['loan-payment'] ? form['loan-payment'].value : 0),
      maxLimit: parseNumber(form['loan-limit'] ? form['loan-limit'].value : 0),
      paymentDay: Number(form['loan-day'] ? form['loan-day'].value : 27),
      bankId: form['loan-bank-id'] ? form['loan-bank-id'].value : '',
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
  
  if (currentTab === 'clients') {
    currentTab = 'items';
    currentItemType = 'income';
  }
  hideModal();
  renderMaster(document.getElementById('app-container'));
}
