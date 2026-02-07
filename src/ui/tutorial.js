import { store as appStore } from '../store.js';

const baseSteps = [
  {
    title: "💰 ようこそ Budget App へ！",
    content: "このアプリは、滞納を未然に防ぎ、借金完済をサポートするための家計簿です。<br>まずは使い方の基本をマスターしましょう。",
    target: null
  },
  {
    title: "⚙️ ステップ 1: マスター登録",
    content: "「マスター」タブから、銀行口座、毎月の収入、支出などを登録します。銀行・収支・借入でタブが分かれているので、まずは「銀行口座」を登録し、次に「収支項目」で銀行を紐づけましょう。",
    target: "#master"
  },
  {
    title: "📅 ステップ 2: 予定の生成",
    content: "カレンダー画面の「○月の予定を生成」ボタンを押すと、マスターから予定が作成されます。内容を修正したい時は再生成も可能です。",
    target: "#dashboard"
  },
  {
    title: "✅ ステップ 3: 支払い完了",
    content: "支払いが終わったら、カレンダーの項目をクリックして「完了」にしましょう。<br>遅れると自動で延滞ペナルティが計算されます。",
    target: "#dashboard"
  },
  {
    title: "📈 ステップ 4: 分析とシミュレーション",
    content: "「分析」タブでは、完済予定日や、返済額を増やした時の短縮効果を確認できます。",
    target: "#analysis"
  },
  {
    title: "☁️ ステップ 5: クラウド同期",
    content: "「設定」から Google ドライブ同期を有効にすると、スマホと PC でデータを共有できます。",
    target: "#settings"
  },
  {
    title: "🚀 準備完了！",
    content: "さっそく使ってみましょう！<br>まずは「マスター」で銀行残高や項目を登録するのがオススメです。",
    target: null
  }
];

const demoSteps = [
  {
    title: "✨ デモツアーへようこそ",
    content: "サンプルデータで全体の流れを体験できます。<br>気になる場所を見ながら操作イメージを掴みましょう。",
    target: null
  },
  {
    title: "⚙️ マスター編集",
    content: "「マスター」タブで、銀行・収支・借入を追加/編集できます。<br>現実の項目に合わせてカスタムしましょう。",
    target: "#master"
  },
  {
    title: "📅 カレンダーの予定",
    content: "「カレンダー」で月次予定を生成し、支払い/入金の流れを確認できます。",
    target: "#dashboard"
  },
  {
    title: "✅ 完了処理",
    content: "カレンダーの項目をクリックして、日付や金額を調整し、完了にできます。",
    target: "#dashboard"
  },
  {
    title: "📈 分析",
    content: "「分析」タブで、借入ごとの完済見込みや返済ペースを確認できます。",
    target: "#analysis"
  },
  {
    title: "☁️ 同期とリマインド",
    content: "「設定」で Google 連携をすると、Drive同期やカレンダー連携が使えます。<br>Googleカレンダーの通知でリマインドとしても活用できます。",
    target: "#settings"
  },
  {
    title: "🚀 体験完了",
    content: "このまま続けて編集してもOKです。<br>本番利用時はGoogleログインを有効にしてください。",
    target: null
  }
];

let currentStep = 0;
let currentSteps = baseSteps;

export function startTutorial(options = {}) {
  const mode = options.mode || 'default';
  currentSteps = mode === 'demo' ? demoSteps : baseSteps;
  currentStep = 0;
  showStep(currentStep);
}

function showStep(index) {
  const step = currentSteps[index];
  const overlay = document.createElement('div');
  overlay.id = 'tutorial-overlay';
  overlay.className = 'tutorial-overlay';
  
  overlay.innerHTML = `
    <div class="tutorial-card">
      <h3>${step.title}</h3>
      <p>${step.content}</p>
      <div class="tutorial-actions">
        ${index > 0 ? `<button onclick="window.prevTutorialStep()" class="btn">戻る</button>` : ''}
        <button onclick="window.nextTutorialStep()" class="btn primary">
          ${index === currentSteps.length - 1 ? '始める！' : '次へ'}
        </button>
      </div>
      <div class="tutorial-progress">${index + 1} / ${currentSteps.length}</div>
    </div>
  `;

  const existing = document.getElementById('tutorial-overlay');
  if (existing) existing.remove();
  document.body.appendChild(overlay);

  if (step.target) {
    // ターゲットのタブへ移動
    window.location.hash = step.target;
  }
}

window.nextTutorialStep = () => {
  currentStep++;
  if (currentStep < currentSteps.length) {
    showStep(currentStep);
  } else {
    finishTutorial();
  }
};

window.prevTutorialStep = () => {
  if (currentStep > 0) {
    currentStep--;
    showStep(currentStep);
  }
};

function finishTutorial() {
  const overlay = document.getElementById('tutorial-overlay');
  if (overlay) overlay.remove();
  
  appStore.updateSettings({ tutorialCompleted: true });
  window.showToast("チュートリアル完了！", "success");
}
