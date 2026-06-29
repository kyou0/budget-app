import Foundation

@MainActor
final class BudgetStore: ObservableObject {
    @Published var startingCash: Int = 120_000
    @Published var masterEntries: [MasterEntry] = []
    @Published var monthlyAdjustments: [MonthlyAdjustment] = []
    @Published var debtAccounts: [DebtAccount] = []

    private let entriesKey = "budgetFlow.masterEntries"
    private let adjustmentsKey = "budgetFlow.monthlyAdjustments"
    private let startingCashKey = "budgetFlow.startingCash"
    private let debtAccountsKey = "budgetFlow.debtAccounts"

    init() {
        load()
        if masterEntries.isEmpty {
            seed()
        }
        refreshCurrentMonth()
    }

    var summary: MonthSummary {
        let income = monthlyAdjustments
            .filter { $0.kind == .income }
            .reduce(0) { $0 + $1.amount }
        let expense = monthlyAdjustments
            .filter { $0.kind == .expense }
            .reduce(0) { $0 + $1.amount }
        return MonthSummary(income: income, expense: expense, startingCash: startingCash)
    }

    var debtProjections: [DebtProjection] {
        debtAccounts.map { account in
            let projection = Self.projectDebt(account)
            return DebtProjection(
                account: account,
                monthsRemaining: projection.months,
                payoffDate: projection.payoffDate,
                warning: projection.warning
            )
        }
    }

    func updateStartingCash(_ amount: Int) {
        startingCash = amount
        save()
    }

    func addTaxPreset(_ preset: TaxPreset, amount: Int) {
        masterEntries.append(
            MasterEntry(
                name: preset.name,
                kind: .expense,
                category: .tax,
                amount: amount,
                amountMode: .fixed,
                estimateType: .amount,
                hourlyRate: 0,
                expectedHours: 0,
                scheduleRule: preset.rule,
                note: preset.note
            )
        )
        refreshCurrentMonth()
        save()
    }

    func addHourlyIncome(name: String, hourlyRate: Int, expectedHours: Double, day: Int) {
        masterEntries.append(
            MasterEntry(
                name: name,
                kind: .income,
                category: .income,
                amount: Int((Double(hourlyRate) * expectedHours).rounded()),
                amountMode: .variable,
                estimateType: .hourly,
                hourlyRate: hourlyRate,
                expectedHours: expectedHours,
                scheduleRule: .monthly(day: day),
                note: "時給案件"
            )
        )
        refreshCurrentMonth()
        save()
    }

    func addCreditCardPayment(cardName: String, amount: Int, withdrawalDay: Int) {
        let dueDate = dateInCurrentMonth(day: withdrawalDay)
        addOneTimeAdjustment(
            name: "\(cardName) カード引落",
            kind: .expense,
            date: dueDate,
            amount: amount,
            isConfirmed: true
        )
    }

    func addOneTimeAdjustment(name: String, kind: CashflowKind, date: Date, amount: Int, isConfirmed: Bool = true) {
        monthlyAdjustments.append(
            MonthlyAdjustment(
                masterId: nil,
                name: name,
                kind: kind,
                date: date,
                amount: amount,
                hourlyRate: 0,
                hours: 0,
                isConfirmed: isConfirmed
            )
        )
        monthlyAdjustments.sort { $0.date < $1.date }
        save()
    }

    func addDebtAccount(name: String, balance: Int, monthlyPayment: Int, annualRate: Double, paymentDay: Int) {
        let account = DebtAccount(
            name: name,
            balance: balance,
            monthlyPayment: monthlyPayment,
            annualRate: annualRate,
            extraPaymentThisMonth: 0,
            paymentDay: paymentDay,
            note: ""
        )
        debtAccounts.append(account)
        refreshCurrentMonth()
        save()
    }

    func updateDebtExtraPayment(_ account: DebtAccount, amount: Int) {
        guard let index = debtAccounts.firstIndex(where: { $0.id == account.id }) else { return }
        debtAccounts[index].extraPaymentThisMonth = amount
        refreshCurrentMonth()
        save()
    }

    func updateAdjustment(_ adjustment: MonthlyAdjustment, amount: Int, hourlyRate: Int? = nil, hours: Double? = nil) {
        guard let index = monthlyAdjustments.firstIndex(where: { $0.id == adjustment.id }) else { return }
        monthlyAdjustments[index].amount = amount
        if let hourlyRate {
            monthlyAdjustments[index].hourlyRate = hourlyRate
        }
        if let hours {
            monthlyAdjustments[index].hours = hours
        }
        monthlyAdjustments[index].isConfirmed = true
        save()
    }

    func refreshCurrentMonth() {
        let now = Date()
        let calendar = Calendar.current
        let year = calendar.component(.year, from: now)
        let month = calendar.component(.month, from: now)
        let generated = ScheduleEngine.materialize(entries: masterEntries, year: year, month: month)
            + materializeDebtPayments(year: year, month: month)
        let debtIds = Set(debtAccounts.map(\.id))
        let existingByMaster = Dictionary(uniqueKeysWithValues: monthlyAdjustments.compactMap { adjustment in
            adjustment.masterId.map { ($0, adjustment) }
        })
        let manualCurrentMonth = monthlyAdjustments.filter { adjustment in
            adjustment.masterId == nil
                && calendar.component(.year, from: adjustment.date) == year
                && calendar.component(.month, from: adjustment.date) == month
        }

        monthlyAdjustments = (generated.map { generatedItem in
            if let masterId = generatedItem.masterId, debtIds.contains(masterId) {
                return generatedItem
            }
            guard let masterId = generatedItem.masterId, let existing = existingByMaster[masterId] else {
                return generatedItem
            }
            return MonthlyAdjustment(
                id: existing.id,
                masterId: generatedItem.masterId,
                name: generatedItem.name,
                kind: generatedItem.kind,
                date: generatedItem.date,
                amount: existing.isConfirmed ? existing.amount : generatedItem.amount,
                hourlyRate: existing.hourlyRate,
                hours: existing.hours,
                isConfirmed: existing.isConfirmed
            )
        } + manualCurrentMonth)
        .sorted { $0.date < $1.date }
    }

    private func seed() {
        addHourlyIncome(name: "デジタルハック", hourlyRate: 3_000, expectedHours: 80, day: 25)
        addTaxPreset(TaxPreset.presets[0], amount: 30_000)
        addTaxPreset(TaxPreset.presets[1], amount: 50_000)
    }

    private func load() {
        let defaults = UserDefaults.standard
        startingCash = defaults.integer(forKey: startingCashKey)
        if startingCash == 0 {
            startingCash = 120_000
        }
        masterEntries = decode([MasterEntry].self, key: entriesKey) ?? []
        monthlyAdjustments = decode([MonthlyAdjustment].self, key: adjustmentsKey) ?? []
        debtAccounts = decode([DebtAccount].self, key: debtAccountsKey) ?? []
    }

    private func save() {
        let defaults = UserDefaults.standard
        defaults.set(startingCash, forKey: startingCashKey)
        encode(masterEntries, key: entriesKey)
        encode(monthlyAdjustments, key: adjustmentsKey)
        encode(debtAccounts, key: debtAccountsKey)
    }

    private func decode<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func encode<T: Encodable>(_ value: T, key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func materializeDebtPayments(year: Int, month: Int) -> [MonthlyAdjustment] {
        debtAccounts.map { account in
            let day = min(max(account.paymentDay, 1), ScheduleEngine.lastDayOfMonth(year: year, month: month))
            let date = Calendar.current.date(from: DateComponents(year: year, month: month, day: day)) ?? Date()
            return MonthlyAdjustment(
                masterId: account.id,
                name: "\(account.name) 返済",
                kind: .expense,
                date: date,
                amount: account.monthlyPayment + account.extraPaymentThisMonth,
                hourlyRate: 0,
                hours: 0,
                isConfirmed: true
            )
        }
    }

    private func dateInCurrentMonth(day: Int) -> Date {
        let calendar = Calendar.current
        let now = Date()
        let year = calendar.component(.year, from: now)
        let month = calendar.component(.month, from: now)
        let safeDay = min(max(day, 1), ScheduleEngine.lastDayOfMonth(year: year, month: month))
        return calendar.date(from: DateComponents(year: year, month: month, day: safeDay)) ?? now
    }

    private static func projectDebt(_ account: DebtAccount) -> (months: Int?, payoffDate: Date?, warning: String?) {
        let monthlyRate = max(account.annualRate, 0) / 100 / 12
        let monthlyPayment = account.monthlyPayment
        guard account.balance > 0 else {
            return (0, Date(), nil)
        }
        guard monthlyPayment > 0 else {
            return (nil, nil, "毎月返済額が未入力です")
        }
        if monthlyRate > 0, Double(monthlyPayment) <= Double(account.balance) * monthlyRate {
            return (nil, nil, "利息に対して返済額が少なく、完済見込みを出せません")
        }

        var remaining = Double(account.balance - account.extraPaymentThisMonth)
        var months = 0
        while remaining > 0, months < 600 {
            remaining += remaining * monthlyRate
            remaining -= Double(monthlyPayment)
            months += 1
        }
        guard months < 600 else {
            return (nil, nil, "完済まで50年以上かかる見込みです")
        }
        let payoffDate = Calendar.current.date(byAdding: .month, value: months, to: Date())
        return (months, payoffDate, nil)
    }
}
