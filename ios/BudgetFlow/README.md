# BudgetFlow iOS

SwiftUI で進めるネイティブ版の初期プロジェクトです。

## 方針

- Web 版の「家計簿」ではなく「今月生きていけるか」を見る思想を維持する
- iPhone で毎月のカード請求、税金の納付書、時給案件の稼働時間をすぐ入力できる UI を優先する
- マスターは毎月の前提、今月画面は変動・確定額の入力に分ける
- 将来的に EventKit / CloudKit / Widget / 通知との連携を追加する

## 現在入っているもの

- 今月の月末見込み
- 手元資金の更新
- 入金・支払いの一覧
- 今月だけのカード確定額入力
- 日付が決まっている単発収支の入力
- 直近7日以内の支払い期限チェック
- 支払い前日のローカル通知
- 変動収入の時給 × 時間計算
- 借入残高、毎月返済額、年率からの完済見込み
- 今月の繰上げ返済予定の反映
- 税金・保険テンプレート
  - 国民健康保険
  - 住民税（普通徴収）
  - 個人事業税
  - 所得税
  - 消費税
  - 国民年金
- UserDefaults ベースの最小保存

## 次に足すとよいもの

- iCloud / CloudKit 同期
- EventKit によるカレンダー連携
- カード会社ごとの締日・引落日のプリセット
- Widget で「今月足りるか」だけを見る表示

## 開き方

```sh
open ios/BudgetFlow/BudgetFlow.xcodeproj
```

まずは Xcode 上部の実行先で iPhone Simulator を選んで Run してください。シミュレータでは署名なしで動くようにしています。

実機で動かす場合は Xcode に Apple ID / Team が登録されている必要があります。

1. Xcode > Settings > Accounts を開く
2. `onuma.kyosuke@gmail.com` の Apple ID を追加、または再ログインする
3. BudgetFlow target > Signing & Capabilities を開く
4. Team に `onuma.kyosuke@gmail.com` の Personal Team / Team を選ぶ
5. Automatically manage signing を有効にする
6. 実行先に接続中の iPhone を選んで Run する

リポジトリには Provisioning Profile のUUIDを固定しません。Xcodeがローカル環境で自動生成したものを使う前提です。
