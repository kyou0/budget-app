import { store as appStore } from '../store.js';

const baseSteps = [
  {
    title: "🛟 ようこそ。まず見るのは「今月いけるか」です",
    content: "このアプリは家計簿の細かい記録ではなく、カード請求・収支調整・借金返済をまとめて「今月足りるか」を判断するための作業台です。",
    outcome: "最初にやることは、カード・収入・借入を登録して、今月の前提を作ることです。",
    target: null
  },
  {
    title: "📋 まずはマスターを登録します",
    content: "最初に登録する順番は、1. 毎月の収入、2. 借金・ローン、3. クレジットカードです。口座は正確な残高管理より、引落先の紐付け用と考えてOKです。",
    outcome: "登録できると、毎月の収入・返済額・カード引落日をもとに今月の見通しを作れます。",
    target: "#master",
    selector: '.nav-item[href="#master"]'
  },
  {
    title: "🧾 今月の予定データを作ります",
    content: "マスター登録後は、今月の固定収入・固定費・借金返済を予定データにします。これは詳細カレンダー用でもありますが、主目的は「今月足りるか」の判定材料を作ることです。",
    outcome: "できると、次に落ちる支払いと今月の収支見込みが自動で見えるようになります。",
    target: "#dashboard",
    selector: '.generation-strip'
  },
  {
    title: "💳 カード請求額を確定します",
    content: "カード明細が確定したら、カードごとに請求額だけ入れて「確定」します。毎月変わる金額はカードマスターではなく、この月の支払い予定として扱います。",
    outcome: "できると、引落日に支出予定が入り、今月足りるかの判定に反映されます。",
    target: "#dashboard",
    selector: '.control-card.primary-task'
  },
  {
    title: "⚖️ 臨時収入・追加支出を調整します",
    content: "案件が入った、旅行に行く、指輪を買う、など今月だけ変わるものはここにざっくり入れます。細かい家計簿入力ではなく、判断に必要な差額だけでOKです。",
    outcome: "できると、今月の月末見込みが即変わり、不足するかどうかがわかります。",
    target: "#dashboard",
    selector: '.control-board .control-card:nth-child(2)'
  },
  {
    title: "🚀 繰上げ返済を試します",
    content: "今月いくら追加で返済するかを入れると、月末見込みから差し引いたうえで、完済予定がどれくらい短くなるかを見られます。",
    outcome: "できると「返済したいけど今月足りる？」と「完済はどれだけ早まる？」を同時に確認できます。",
    target: "#dashboard",
    selector: '.control-card.loan-task'
  },
  {
    title: "🔮 先の大型支出を見通します",
    content: "旅行・指輪・大型購入など、数ヶ月先の予定は「見通し」から追加します。カレンダーに入れる前に、そもそも資金が足りるかを確認できます。",
    outcome: "できると、11月の旅行や7月の50万円支払いが現実的か、事前に判断できます。",
    target: "#analysis",
    selector: '.nav-item[href="#analysis"]'
  },
  {
    title: "🚀 準備完了です",
    content: "まずは「マスター」で収入・借入・カードを登録し、その後「今月」でカード請求と収支調整を行ってください。",
    outcome: "毎月見るべき場所は、基本的に「今月」タブの3つの操作カードだけです。",
    target: null
  }
];

const demoSteps = [
  {
    title: "✨ デモツアーへようこそ",
    content: "サンプルデータで、今月の収支・支払い予定・返済ペースの見方を確認します。背景の画面も見ながら進めてください。",
    outcome: "このツアーでは、どこを触れば今月の判断ができるかを確認します。",
    target: null
  },
  {
    title: "📋 登録する場所はマスターです",
    content: "収入・借入・カードの基本情報は「マスター」で登録します。毎月変わるカード請求額はここではなく、今月タブで入力します。",
    outcome: "ここが整うと、今月の収支判定と返済見込みの土台ができます。",
    target: "#master",
    selector: '.nav-item[href="#master"]'
  },
  {
    title: "🧾 今月の予定データ",
    content: "固定収入・固定費・返済予定を今月分に展開します。カレンダーを見るためというより、今月の判定材料を作る操作です。",
    outcome: "できると、支払い予定や延滞候補が見えるようになります。",
    target: "#dashboard",
    selector: '.generation-strip'
  },
  {
    title: "💳 カード請求額",
    content: "カード明細が確定したら、このカード欄に金額を入れます。引落日はカード設定から使われます。",
    outcome: "できると、今月の支出見込みにカード引落が反映されます。",
    target: "#dashboard",
    selector: '.control-card.primary-task'
  },
  {
    title: "⚖️ 収支調整",
    content: "臨時収入や追加支出はここに入れます。家計簿として細かく分けず、今月の判断に必要な差額だけ入れます。",
    outcome: "入力すると、月末見込みが変わります。",
    target: "#dashboard",
    selector: '.control-board .control-card:nth-child(2)'
  },
  {
    title: "🚀 返済ペース",
    content: "繰上げ返済予定を入れると、今月の資金繰りと完済予定の変化を同時に確認できます。",
    outcome: "できると「返したいけど今月は大丈夫か」が見えます。",
    target: "#dashboard",
    selector: '.control-card.loan-task'
  },
  {
    title: "🔮 将来の予定",
    content: "旅行・指輪・大型支払いなどは「見通し」に入れます。未来の予定をカレンダー化する前に、足りるかどうかを試算できます。",
    outcome: "できると、数ヶ月先の不足を早めに発見できます。",
    target: "#analysis",
    selector: '.nav-item[href="#analysis"]'
  },
  {
    title: "🚀 体験完了",
    content: "このまま続けて編集してOKです。本番利用では、まず収入・借入・カードを登録してから、今月タブでカード請求と収支調整を行ってください。",
    outcome: "毎月の作業は「カード確定」「収支調整」「返済ペース確認」の3つです。",
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
  clearTutorialHighlight();
  const step = currentSteps[index];
  const overlay = document.createElement('div');
  overlay.id = 'tutorial-overlay';
  overlay.className = 'tutorial-overlay';
  
  overlay.innerHTML = `
    <div class="tutorial-card">
      <div class="tutorial-step-label">STEP ${index + 1} / ${currentSteps.length}</div>
      <h3>${step.title}</h3>
      <p>${step.content}</p>
      ${step.outcome ? `<div class="tutorial-outcome"><strong>できるとわかること</strong><span>${step.outcome}</span></div>` : ''}
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
  window.setTimeout(() => highlightTutorialTarget(step), 120);
}

function clearTutorialHighlight() {
  document.querySelectorAll('.tutorial-highlight').forEach(el => {
    el.classList.remove('tutorial-highlight');
  });
}

function highlightTutorialTarget(step) {
  if (!step.selector) return;
  const target = document.querySelector(step.selector);
  if (!target) return;
  target.classList.add('tutorial-highlight');
  target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
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
  clearTutorialHighlight();
  
  appStore.updateSettings({ tutorialCompleted: true });
  window.showToast("チュートリアル完了！", "success");
}
