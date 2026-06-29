import Foundation

@MainActor
final class BudgetStore: ObservableObject {
    @Published var startingCash: Int = 120_000
    @Published var masterEntries: [MasterEntry] = []
    @Published var monthlyAdjustments: [MonthlyAdjustment] = []

    private let entriesKey = "budgetFlow.masterEntries"
    private let adjustmentsKey = "budgetFlow.monthlyAdjustments"
    private let startingCashKey = "budgetFlow.startingCash"

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
        let existingByMaster = Dictionary(uniqueKeysWithValues: monthlyAdjustments.compactMap { adjustment in
            adjustment.masterId.map { ($0, adjustment) }
        })

        monthlyAdjustments = generated.map { generatedItem in
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
        }
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
    }

    private func save() {
        let defaults = UserDefaults.standard
        defaults.set(startingCash, forKey: startingCashKey)
        encode(masterEntries, key: entriesKey)
        encode(monthlyAdjustments, key: adjustmentsKey)
    }

    private func decode<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func encode<T: Encodable>(_ value: T, key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
