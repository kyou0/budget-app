import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: BudgetStore
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            MonthView()
                .tabItem { Label("今月", systemImage: "lifepreserver") }
                .tag(0)

            MasterView()
                .tabItem { Label("マスター", systemImage: "tray.full") }
                .tag(1)
        }
    }
}

struct MonthView: View {
    @EnvironmentObject private var store: BudgetStore
    @State private var startingCashText = ""
    @State private var reminderStatus = ""
    private let yen = FloatingPointFormatStyle<Double>.Currency(code: "JPY").precision(.fractionLength(0))

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(statusTitle)
                            .font(.title2.bold())
                        Text("月末見込み \(Double(store.summary.balance), format: yen)")
                            .font(.largeTitle.bold())
                            .foregroundStyle(store.summary.balance >= 0 ? .green : .red)
                        HStack {
                            Stat(label: "入金", value: store.summary.income, color: .green)
                            Stat(label: "支払い", value: store.summary.expense, color: .red)
                        }
                        HStack {
                            TextField("今の手元資金", text: $startingCashText)
                                .keyboardType(.numberPad)
                                .textFieldStyle(.roundedBorder)
                            Button("反映") {
                                store.updateStartingCash(parseInt(startingCashText))
                            }
                            .buttonStyle(.bordered)
                        }
                        Button {
                            Task {
                                do {
                                    let count = try await store.schedulePaymentReminders()
                                    reminderStatus = count > 0 ? "\(count)件の支払い通知を設定しました" : "通知対象の支払いはありません"
                                } catch {
                                    reminderStatus = "通知を設定できませんでした"
                                }
                            }
                        } label: {
                            Label("支払い通知を設定", systemImage: "bell.badge")
                        }
                        .buttonStyle(.borderedProminent)

                        if !reminderStatus.isEmpty {
                            Text(reminderStatus)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 8)
                }

                PaymentRiskSection()

                QuickEntrySection()

                DebtOverviewSection()

                Section("今月の確定・見込み") {
                    ForEach(store.monthlyAdjustments) { adjustment in
                        AdjustmentRow(adjustment: adjustment)
                    }
                }
            }
            .navigationTitle("今月生きていけるか")
            .onAppear {
                startingCashText = "\(store.startingCash)"
            }
        }
    }

    private var statusTitle: String {
        store.summary.balance >= 0 ? "今月は耐えられそう" : "このままだと不足"
    }
}

struct PaymentRiskSection: View {
    @EnvironmentObject private var store: BudgetStore

    var body: some View {
        Section("支払い期限チェック") {
            if store.upcomingExpenses.isEmpty {
                Text("直近7日以内の支払いはありません。")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.upcomingExpenses) { adjustment in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: riskIcon(for: adjustment))
                            .foregroundStyle(riskColor(for: adjustment))
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(adjustment.name)
                                .font(.headline)
                            Text(dueLabel(for: adjustment.date))
                                .font(.caption)
                                .foregroundStyle(riskColor(for: adjustment))
                        }
                        Spacer()
                        Text("\(adjustment.amount)円")
                            .font(.headline)
                    }
                }
            }
        }
    }

    private func dueLabel(for date: Date) -> String {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let dueDate = calendar.startOfDay(for: date)
        let days = calendar.dateComponents([.day], from: today, to: dueDate).day ?? 0
        if days < 0 { return "\(-days)日超過" }
        if days == 0 { return "今日支払い" }
        if days == 1 { return "明日支払い" }
        return "あと\(days)日"
    }

    private func riskColor(for adjustment: MonthlyAdjustment) -> Color {
        let days = daysUntil(adjustment.date)
        if days < 0 { return .red }
        if days <= 1 { return .orange }
        return .blue
    }

    private func riskIcon(for adjustment: MonthlyAdjustment) -> String {
        let days = daysUntil(adjustment.date)
        if days < 0 { return "exclamationmark.triangle.fill" }
        if days <= 1 { return "clock.badge.exclamationmark" }
        return "calendar.badge.clock"
    }

    private func daysUntil(_ date: Date) -> Int {
        let calendar = Calendar.current
        return calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: Date()),
            to: calendar.startOfDay(for: date)
        ).day ?? 0
    }
}

struct QuickEntrySection: View {
    @EnvironmentObject private var store: BudgetStore
    @State private var cardName = "クレジットカード"
    @State private var cardAmount = ""
    @State private var withdrawalDay = "27"
    @State private var itemName = ""
    @State private var itemAmount = ""
    @State private var itemDate = Date()
    @State private var itemKind: CashflowKind = .expense

    var body: some View {
        Section("今月だけ入力") {
            VStack(alignment: .leading, spacing: 8) {
                Text("カード確定額")
                    .font(.headline)
                TextField("カード名", text: $cardName)
                    .textFieldStyle(.roundedBorder)
                HStack {
                    TextField("確定額", text: $cardAmount)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                    TextField("引落日", text: $withdrawalDay)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 88)
                }
                Button("カード引落を今月に追加") {
                    store.addCreditCardPayment(
                        cardName: cardName.isEmpty ? "カード" : cardName,
                        amount: parseInt(cardAmount),
                        withdrawalDay: parseInt(withdrawalDay)
                    )
                    cardAmount = ""
                }
                .buttonStyle(.borderedProminent)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("日付が決まっている収支")
                    .font(.headline)
                Picker("区分", selection: $itemKind) {
                    ForEach(CashflowKind.allCases) { kind in
                        Text(kind.label).tag(kind)
                    }
                }
                .pickerStyle(.segmented)
                DatePicker("日付", selection: $itemDate, displayedComponents: .date)
                TextField("内容", text: $itemName)
                    .textFieldStyle(.roundedBorder)
                TextField("金額", text: $itemAmount)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                Button("今月の予定に追加") {
                    store.addOneTimeAdjustment(
                        name: itemName.isEmpty ? "日付確定の収支" : itemName,
                        kind: itemKind,
                        date: itemDate,
                        amount: parseInt(itemAmount)
                    )
                    itemName = ""
                    itemAmount = ""
                }
                .buttonStyle(.bordered)
            }
        }
    }
}

struct DebtOverviewSection: View {
    @EnvironmentObject private var store: BudgetStore

    var body: some View {
        Section("借金・返済見通し") {
            if store.debtProjections.isEmpty {
                Text("借入をマスターに追加すると、今月の返済額と完済見込みをここで見られます。")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.debtProjections, id: \.self) { projection in
                    DebtProjectionRow(projection: projection)
                }
            }
        }
    }
}

struct DebtProjectionRow: View {
    @EnvironmentObject private var store: BudgetStore
    @State private var extraPaymentText = ""
    var projection: DebtProjection
    private let yen = FloatingPointFormatStyle<Double>.Currency(code: "JPY").precision(.fractionLength(0))

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading) {
                    Text(projection.account.name)
                        .font(.headline)
                    Text("残高 \(Double(projection.account.balance), format: yen)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("月 \(Double(projection.account.monthlyPayment), format: yen)")
                    .font(.subheadline.bold())
            }

            if let warning = projection.warning {
                Text(warning)
                    .font(.caption)
                    .foregroundStyle(.orange)
            } else if let months = projection.monthsRemaining, let payoffDate = projection.payoffDate {
                Text("このペースなら約\(months)か月、\(payoffDate, style: .date)ごろ完済")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                TextField("今月の繰上げ返済", text: $extraPaymentText)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                Button("反映") {
                    store.updateDebtExtraPayment(projection.account, amount: parseInt(extraPaymentText))
                }
                .buttonStyle(.bordered)
            }
        }
        .onAppear {
            extraPaymentText = projection.account.extraPaymentThisMonth > 0 ? "\(projection.account.extraPaymentThisMonth)" : ""
        }
    }
}

struct Stat: View {
    var label: String
    var value: Int
    var color: Color
    private let yen = FloatingPointFormatStyle<Double>.Currency(code: "JPY").precision(.fractionLength(0))

    var body: some View {
        VStack(alignment: .leading) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(Double(value), format: yen)
                .font(.headline)
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct AdjustmentRow: View {
    @EnvironmentObject private var store: BudgetStore
    @State private var amountText = ""
    @State private var hourlyRateText = ""
    @State private var hoursText = ""
    var adjustment: MonthlyAdjustment

    private let yen = FloatingPointFormatStyle<Double>.Currency(code: "JPY").precision(.fractionLength(0))

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading) {
                    Text(adjustment.name)
                        .font(.headline)
                    Text("\(adjustment.date.formatted(date: .abbreviated, time: .omitted)) / \(dueLabel)")
                        .font(.caption)
                        .foregroundStyle(dueColor)
                }
                Spacer()
                Text(Double(adjustment.amount), format: yen)
                    .foregroundStyle(adjustment.kind == .income ? .green : .red)
                    .font(.headline)
            }

            if adjustment.kind == .income, adjustment.hourlyRate > 0 || adjustment.hours > 0 {
                HStack {
                    TextField("時給", text: $hourlyRateText)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                    TextField("時間", text: $hoursText)
                        .keyboardType(.decimalPad)
                        .textFieldStyle(.roundedBorder)
                    Button("計算") {
                        let rate = Int(hourlyRateText.replacingOccurrences(of: ",", with: "")) ?? 0
                        let hours = Double(hoursText) ?? 0
                        let amount = Int((Double(rate) * hours).rounded())
                        amountText = "\(amount)"
                        store.updateAdjustment(adjustment, amount: amount, hourlyRate: rate, hours: hours)
                    }
                    .buttonStyle(.bordered)
                }
            }

            HStack {
                TextField("今月の確定額", text: $amountText)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                Button(adjustment.isConfirmed ? "更新" : "確定") {
                    let amount = Int(amountText.replacingOccurrences(of: ",", with: "")) ?? adjustment.amount
                    store.updateAdjustment(adjustment, amount: amount)
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .onAppear {
            amountText = "\(adjustment.amount)"
            hourlyRateText = adjustment.hourlyRate > 0 ? "\(adjustment.hourlyRate)" : ""
            hoursText = adjustment.hours > 0 ? "\(adjustment.hours)" : ""
        }
    }

    private var dueLabel: String {
        guard adjustment.kind == .expense else { return adjustment.isConfirmed ? "確定" : "見込み" }
        let days = daysUntil(adjustment.date)
        if days < 0 { return "\(-days)日超過" }
        if days == 0 { return "今日" }
        if days == 1 { return "明日" }
        return "あと\(days)日"
    }

    private var dueColor: Color {
        guard adjustment.kind == .expense else { return .secondary }
        let days = daysUntil(adjustment.date)
        if days < 0 { return .red }
        if days <= 1 { return .orange }
        return .secondary
    }

    private func daysUntil(_ date: Date) -> Int {
        let calendar = Calendar.current
        return calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: Date()),
            to: calendar.startOfDay(for: date)
        ).day ?? 0
    }
}

struct MasterView: View {
    @EnvironmentObject private var store: BudgetStore
    @State private var taxAmount = "30000"
    @State private var selectedPreset = TaxPreset.presets[0]
    @State private var incomeName = "新規時給案件"
    @State private var hourlyRate = "3000"
    @State private var expectedHours = "80"
    @State private var debtName = "カードローン"
    @State private var debtBalance = ""
    @State private var debtMonthlyPayment = ""
    @State private var debtAnnualRate = "15.0"
    @State private var debtPaymentDay = "27"

    var body: some View {
        NavigationStack {
            Form {
                Section("税金・保険を追加") {
                    Picker("種類", selection: $selectedPreset) {
                        ForEach(TaxPreset.presets) { preset in
                            Text(preset.name).tag(preset)
                        }
                    }
                    Text(selectedPreset.note)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("納付書の金額", text: $taxAmount)
                        .keyboardType(.numberPad)
                    Button("税金予定に追加") {
                        let amount = Int(taxAmount.replacingOccurrences(of: ",", with: "")) ?? 0
                        store.addTaxPreset(selectedPreset, amount: amount)
                    }
                }

                Section("時給収入を追加") {
                    TextField("案件名", text: $incomeName)
                    TextField("時給", text: $hourlyRate)
                        .keyboardType(.numberPad)
                    TextField("月の想定稼働時間", text: $expectedHours)
                        .keyboardType(.decimalPad)
                    Button("時給案件に追加") {
                        store.addHourlyIncome(
                            name: incomeName,
                            hourlyRate: Int(hourlyRate.replacingOccurrences(of: ",", with: "")) ?? 0,
                            expectedHours: Double(expectedHours) ?? 0,
                            day: 25
                        )
                    }
                }

                Section("借入を追加") {
                    TextField("借入名", text: $debtName)
                    TextField("残高", text: $debtBalance)
                        .keyboardType(.numberPad)
                    TextField("毎月返済額", text: $debtMonthlyPayment)
                        .keyboardType(.numberPad)
                    TextField("年率", text: $debtAnnualRate)
                        .keyboardType(.decimalPad)
                    TextField("返済日", text: $debtPaymentDay)
                        .keyboardType(.numberPad)
                    Button("借入を追加") {
                        store.addDebtAccount(
                            name: debtName.isEmpty ? "借入" : debtName,
                            balance: parseInt(debtBalance),
                            monthlyPayment: parseInt(debtMonthlyPayment),
                            annualRate: Double(debtAnnualRate) ?? 0,
                            paymentDay: parseInt(debtPaymentDay)
                        )
                        debtBalance = ""
                        debtMonthlyPayment = ""
                    }
                }

                Section("登録済み") {
                    ForEach(store.masterEntries) { entry in
                        VStack(alignment: .leading) {
                            Text(entry.name)
                                .font(.headline)
                            Text(entry.note)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    ForEach(store.debtAccounts) { account in
                        VStack(alignment: .leading) {
                            Text(account.name)
                                .font(.headline)
                            Text("借入残高 \(account.balance)円 / 毎月 \(account.monthlyPayment)円")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("マスター")
        }
    }
}

private func parseInt(_ text: String) -> Int {
    Int(text.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
}

#Preview {
    ContentView()
        .environmentObject(BudgetStore())
}
