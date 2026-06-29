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
                    }
                    .padding(.vertical, 8)
                }

                Section("今月の確定・見込み") {
                    ForEach(store.monthlyAdjustments) { adjustment in
                        AdjustmentRow(adjustment: adjustment)
                    }
                }
            }
            .navigationTitle("今月生きていけるか")
        }
    }

    private var statusTitle: String {
        store.summary.balance >= 0 ? "今月は耐えられそう" : "このままだと不足"
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
                    Text(adjustment.date, style: .date)
                        .font(.caption)
                        .foregroundStyle(.secondary)
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
}

struct MasterView: View {
    @EnvironmentObject private var store: BudgetStore
    @State private var taxAmount = "30000"
    @State private var selectedPreset = TaxPreset.presets[0]
    @State private var incomeName = "新規時給案件"
    @State private var hourlyRate = "3000"
    @State private var expectedHours = "80"

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
                }
            }
            .navigationTitle("マスター")
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(BudgetStore())
}
