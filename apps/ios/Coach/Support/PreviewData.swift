import CoachCore
import Foundation
import SwiftData

/// Données factices pour les previews Xcode et les tests d'interface.
enum PreviewData {
    @MainActor
    static func container() -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try! ModelContainer(for: Workout.self, DailyMetric.self, configurations: config)
        let context = container.mainContext
        for draft in RoutineClassifier.classifyRoutine(sampleDrafts()) {
            context.insert(Workout(draft: draft))
        }
        for m in sampleMetrics() {
            let d = DailyMetric(day: m.day)
            d.hrvMs = m.hrvMs; d.restingHr = m.restingHr; d.vo2max = m.vo2max; d.sleepMinutes = m.sleepMinutes; d.steps = m.steps
            context.insert(d)
        }
        return container
    }

    static func sampleDrafts(now: Date = .now) -> [WorkoutDraft] {
        func at(_ daysAgo: Int, _ hour: Int, _ minute: Int = 0) -> Date {
            var c = DayKey.calendar.dateComponents([.year, .month, .day], from: now.addingTimeInterval(-Double(daysAgo) * 86_400))
            c.hour = hour; c.minute = minute
            return DayKey.calendar.date(from: c)!
        }
        func run(_ start: Date, min: Double, km: Double, dPlus: Double, hr: Double) -> WorkoutDraft {
            let type = "HKWorkoutActivityTypeRunning"
            return WorkoutDraft(
                startedAt: start, endedAt: start.addingTimeInterval(min * 60), healthKitUUID: UUID(),
                activityType: type, sport: SportClassifier.sport(forActivityType: type, distanceM: km * 1000, ascentM: dPlus),
                durationSec: min * 60, distanceM: km * 1000, ascentM: dPlus, descentM: dPlus * 0.95,
                avgHr: hr, maxHr: hr + 25, energyKcal: km * 68, sourceName: "Apple Watch de Guillaume", deviceName: "Apple Watch"
            )
        }
        func cooldown(_ start: Date, min: Double) -> WorkoutDraft {
            WorkoutDraft(
                startedAt: start, endedAt: start.addingTimeInterval(min * 60), healthKitUUID: UUID(),
                activityType: "HKWorkoutActivityTypeCooldown", sport: .mobility, durationSec: min * 60,
                distanceM: nil, ascentM: nil, descentM: nil, avgHr: 82, maxHr: 101, energyKcal: min * 5,
                sourceName: "Apple Watch de Guillaume", deviceName: "Apple Watch"
            )
        }
        return [
            run(at(1, 17, 6), min: 79, km: 15, dPlus: 146, hr: 139),
            run(at(2, 17, 49), min: 28, km: 5.2, dPlus: 52, hr: 124),
            run(at(3, 17, 40), min: 52, km: 10.2, dPlus: 188, hr: 141),
            run(at(6, 9, 10), min: 155, km: 18.3, dPlus: 940, hr: 141),
            cooldown(at(1, 19, 24), min: 32), cooldown(at(1, 21, 0), min: 14),
            cooldown(at(2, 19, 27), min: 19), cooldown(at(2, 20, 27), min: 14),
            cooldown(at(3, 18, 34), min: 17), cooldown(at(3, 21, 0), min: 13),
        ]
    }

    static func sampleMetrics(now: Date = .now) -> [DailyMetricDraft] {
        (0..<30).map { i in
            let day = DayKey.key(for: now.addingTimeInterval(-Double(i) * 86_400))
            return DailyMetricDraft(day: day, hrvMs: 95 + Double((i * 7) % 30), restingHr: 40 + Double(i % 7), vo2max: 65, sleepMinutes: 440 + Double((i * 13) % 90), steps: 6000 + Double((i * 997) % 12000))
        }
    }
}

/// Fournisseur Santé factice : renvoie les mêmes échantillons, jamais d'accès système.
struct PreviewHealthData: HealthDataProviding {
    var isAvailable: Bool { true }
    func requestAuthorization() async throws {}
    func fetchWorkouts(since anchor: Data?) async throws -> (drafts: [WorkoutDraft], anchor: Data?) {
        (anchor == nil ? PreviewData.sampleDrafts() : [], Data([1]))
    }
    func fetchDailyMetrics(from: Date, to: Date) async throws -> [DailyMetricDraft] { PreviewData.sampleMetrics() }
    func heartRateSeries(from: Date, to: Date) async throws -> [HeartRateSample] {
        stride(from: 0.0, to: to.timeIntervalSince(from), by: 30).map {
            HeartRateSample(date: from.addingTimeInterval($0), bpm: 120 + 25 * sin($0 / 400) + Double(Int($0) % 7))
        }
    }
    func startObservingWorkouts(onChange: @escaping @Sendable () async -> Void) async throws {}
}
