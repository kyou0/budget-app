import Foundation

enum CashflowKind: String, Codable, CaseIterable, Identifiable {
    case income
    case expense

    var id: String { rawValue }
    var label: String { self == .income ? "入金" : "支払い" }
}

enum MasterCategory: String, Codable, CaseIterable, Identifiable {
    case income
    case expense
    case tax
    case creditCard
    case loan
    case bank

    var id: String { rawValue }
}

enum AmountMode: String, Codable {
    case fixed
    case variable
}

enum EstimateType: String, Codable {
    case amount
    case hourly
}

struct ScheduleRule: Codable, Hashable {
    enum RuleType: String, Codable {
        case monthly
        case monthEnd
        case monthlyRange
        case specificDates
    }

    struct MonthDay: Codable, Hashable, Identifiable {
        var month: Int
        var day: Int
        var id: String { "\(month)-\(day)" }
    }

    var type: RuleType
    var day: Int?
    var startMonth: Int?
    var endMonth: Int?
    var dates: [MonthDay]?

    static func monthly(day: Int) -> ScheduleRule {
        ScheduleRule(type: .monthly, day: day, startMonth: nil, endMonth: nil, dates: nil)
    }

    static var monthEnd: ScheduleRule {
        ScheduleRule(type: .monthEnd, day: nil, startMonth: nil, endMonth: nil, dates: nil)
    }
}

struct MasterEntry: Identifiable, Codable, Hashable {
    var id = UUID()
    var name: String
    var kind: CashflowKind
    var category: MasterCategory
    var amount: Int
    var amountMode: AmountMode
    var estimateType: EstimateType
    var hourlyRate: Int
    var expectedHours: Double
    var scheduleRule: ScheduleRule
    var note: String

    var estimatedMonthlyAmount: Int {
        if estimateType == .hourly, hourlyRate > 0, expectedHours > 0 {
            return Int((Double(hourlyRate) * expectedHours).rounded())
        }
        return amount
    }
}

struct MonthlyAdjustment: Identifiable, Codable, Hashable {
    var id = UUID()
    var masterId: UUID?
    var name: String
    var kind: CashflowKind
    var date: Date
    var amount: Int
    var hourlyRate: Int
    var hours: Double
    var isConfirmed: Bool
}

struct TaxPreset: Identifiable, Hashable {
    var id: String
    var name: String
    var rule: ScheduleRule
    var note: String

    static let presets: [TaxPreset] = [
        TaxPreset(
            id: "national_health",
            name: "国民健康保険",
            rule: ScheduleRule(type: .monthlyRange, day: 31, startMonth: 6, endMonth: 3, dates: nil),
            note: "多くの自治体で6月から翌3月まで。通知書の期別金額を入力します。"
        ),
        TaxPreset(
            id: "resident",
            name: "住民税（普通徴収）",
            rule: ScheduleRule(type: .specificDates, day: nil, startMonth: nil, endMonth: nil, dates: [
                .init(month: 6, day: 30),
                .init(month: 8, day: 31),
                .init(month: 10, day: 31),
                .init(month: 1, day: 31)
            ]),
            note: "普通徴収は年4回が基本。自治体の通知額を入力します。"
        ),
        TaxPreset(
            id: "business_tax",
            name: "個人事業税",
            rule: ScheduleRule(type: .specificDates, day: nil, startMonth: nil, endMonth: nil, dates: [
                .init(month: 8, day: 31),
                .init(month: 11, day: 30)
            ]),
            note: "対象業種・所得により発生します。納税通知書の金額を入力します。"
        ),
        TaxPreset(
            id: "income_tax",
            name: "所得税・復興特別所得税",
            rule: ScheduleRule(type: .specificDates, day: nil, startMonth: nil, endMonth: nil, dates: [
                .init(month: 3, day: 15)
            ]),
            note: "確定申告で確定した納付額を入力します。"
        ),
        TaxPreset(
            id: "consumption_tax",
            name: "消費税・地方消費税",
            rule: ScheduleRule(type: .specificDates, day: nil, startMonth: nil, endMonth: nil, dates: [
                .init(month: 3, day: 31)
            ]),
            note: "課税事業者のみ。確定申告で確定した納付額を入力します。"
        ),
        TaxPreset(
            id: "national_pension",
            name: "国民年金",
            rule: .monthEnd,
            note: "毎月納付する場合。前納は今月の確定支出として登録します。"
        )
    ]
}

struct MonthSummary {
    var income: Int
    var expense: Int
    var startingCash: Int

    var balance: Int { startingCash + income - expense }
}
