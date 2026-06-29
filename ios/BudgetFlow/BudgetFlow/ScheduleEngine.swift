import Foundation

enum ScheduleEngine {
    static func dueDates(for rule: ScheduleRule, year: Int, month: Int, calendar: Calendar = .current) -> [Date] {
        let lastDay = lastDayOfMonth(year: year, month: month, calendar: calendar)

        switch rule.type {
        case .monthly:
            return [date(year: year, month: month, day: min(rule.day ?? 1, lastDay), calendar: calendar)]
        case .monthEnd:
            return [date(year: year, month: month, day: lastDay, calendar: calendar)]
        case .monthlyRange:
            guard isMonth(month, inRangeFrom: rule.startMonth ?? 1, to: rule.endMonth ?? 12) else {
                return []
            }
            return [date(year: year, month: month, day: min(rule.day ?? lastDay, lastDay), calendar: calendar)]
        case .specificDates:
            return (rule.dates ?? [])
                .filter { $0.month == month }
                .map { date(year: year, month: month, day: min($0.day, lastDay), calendar: calendar) }
        }
    }

    static func materialize(entries: [MasterEntry], year: Int, month: Int) -> [MonthlyAdjustment] {
        entries.flatMap { entry in
            dueDates(for: entry.scheduleRule, year: year, month: month).map { dueDate in
                MonthlyAdjustment(
                    masterId: entry.id,
                    name: entry.name,
                    kind: entry.kind,
                    date: dueDate,
                    amount: entry.estimatedMonthlyAmount,
                    hourlyRate: entry.hourlyRate,
                    hours: entry.expectedHours,
                    isConfirmed: entry.amountMode == .fixed
                )
            }
        }
        .sorted { $0.date < $1.date }
    }

    private static func isMonth(_ month: Int, inRangeFrom start: Int, to end: Int) -> Bool {
        if start <= end {
            return month >= start && month <= end
        }
        return month >= start || month <= end
    }

    private static func date(year: Int, month: Int, day: Int, calendar: Calendar) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day)) ?? Date()
    }

    static func lastDayOfMonth(year: Int, month: Int, calendar: Calendar = .current) -> Int {
        let start = date(year: year, month: month, day: 1, calendar: calendar)
        return calendar.range(of: .day, in: .month, for: start)?.count ?? 28
    }
}
