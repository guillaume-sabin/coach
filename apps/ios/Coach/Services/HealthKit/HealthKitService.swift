import CoachCore
import Foundation
import HealthKit

/// Implémentation HealthKit réelle. Toutes les requêtes utilisent les descripteurs async (iOS 15.4+).
final class HealthKitService: HealthDataProviding, @unchecked Sendable {
    private let store = HKHealthStore()

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private var readTypes: Set<HKObjectType> {
        [
            .workoutType(),
            HKQuantityType(.heartRate),
            HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.restingHeartRate),
            HKQuantityType(.vo2Max),
            HKQuantityType(.stepCount),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.distanceCycling),
            HKQuantityType(.distanceSwimming),
            HKQuantityType(.activeEnergyBurned),
            HKCategoryType(.sleepAnalysis),
            HKSeriesType.workoutRoute(),
        ]
    }

    func requestAuthorization() async throws {
        guard isAvailable else { throw HealthError.notAvailable }
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    // MARK: - Séances

    func fetchWorkouts(since anchor: Data?) async throws -> (drafts: [WorkoutDraft], anchor: Data?) {
        let decodedAnchor = try anchor.flatMap {
            try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: $0)
        }
        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.workout()],
            anchor: decodedAnchor
        )
        let result = try await descriptor.result(for: store)
        let drafts = result.addedSamples.map(WorkoutMapper.draft(from:))
        let newAnchor = try NSKeyedArchiver.archivedData(withRootObject: result.newAnchor, requiringSecureCoding: true)
        return (drafts, newAnchor)
    }

    func heartRateSeries(from: Date, to: Date) async throws -> [HeartRateSample] {
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(.heartRate), predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let samples = try await descriptor.result(for: store)
        let unit = HKUnit.count().unitDivided(by: .minute())
        return samples.map { HeartRateSample(date: $0.startDate, bpm: $0.quantity.doubleValue(for: unit)) }
    }

    // MARK: - Métriques journalières

    func fetchDailyMetrics(from: Date, to: Date) async throws -> [DailyMetricDraft] {
        var byDay: [String: DailyMetricDraft] = [:]
        func entry(_ day: String) -> DailyMetricDraft {
            byDay[day] ?? DailyMetricDraft(day: day)
        }

        let ms = HKUnit.secondUnit(with: .milli)
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let vo2Unit = HKUnit(from: "ml/kg*min")

        for (day, value) in try await dailyAverages(.heartRateVariabilitySDNN, unit: ms, from: from, to: to) {
            var e = entry(day); e.hrvMs = value; byDay[day] = e
        }
        for (day, value) in try await dailyAverages(.restingHeartRate, unit: bpm, from: from, to: to) {
            var e = entry(day); e.restingHr = value; byDay[day] = e
        }
        for (day, value) in try await dailyAverages(.vo2Max, unit: vo2Unit, from: from, to: to) {
            var e = entry(day); e.vo2max = value; byDay[day] = e
        }
        for (day, value) in try await dailySums(.stepCount, unit: .count(), from: from, to: to) {
            var e = entry(day); e.steps = value; byDay[day] = e
        }
        for (day, minutes) in try await sleepMinutesByWakeDay(from: from, to: to) {
            var e = entry(day); e.sleepMinutes = minutes; byDay[day] = e
        }
        return byDay.values.sorted { $0.day < $1.day }
    }

    private func dailyAverages(_ id: HKQuantityTypeIdentifier, unit: HKUnit, from: Date, to: Date) async throws -> [(String, Double)] {
        try await dailyStatistics(id, options: .discreteAverage, from: from, to: to) { $0.averageQuantity()?.doubleValue(for: unit) }
    }

    private func dailySums(_ id: HKQuantityTypeIdentifier, unit: HKUnit, from: Date, to: Date) async throws -> [(String, Double)] {
        try await dailyStatistics(id, options: .cumulativeSum, from: from, to: to) { $0.sumQuantity()?.doubleValue(for: unit) }
    }

    private func dailyStatistics(
        _ id: HKQuantityTypeIdentifier,
        options: HKStatisticsOptions,
        from: Date,
        to: Date,
        value: @escaping (HKStatistics) -> Double?
    ) async throws -> [(String, Double)] {
        let calendar = DayKey.calendar
        let anchor = calendar.startOfDay(for: from)
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to)
        let descriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: .quantitySample(type: HKQuantityType(id), predicate: predicate),
            options: options,
            anchorDate: anchor,
            intervalComponents: DateComponents(day: 1)
        )
        let collection = try await descriptor.result(for: store)
        var out: [(String, Double)] = []
        collection.enumerateStatistics(from: anchor, to: to) { stats, _ in
            if let v = value(stats) { out.append((DayKey.key(for: stats.startDate), v)) }
        }
        return out
    }

    /// Somme des phases "endormi" (Core, Deep, REM, Unspecified), rattachée au jour du réveil.
    /// Seule la montre compte : l'iPhone n'enregistre que "au lit", ce qui doublerait le total.
    private func sleepMinutesByWakeDay(from: Date, to: Date) async throws -> [(String, Double)] {
        let predicate = HKQuery.predicateForSamples(withStart: from.addingTimeInterval(-12 * 3600), end: to)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis), predicate: predicate)],
            sortDescriptors: []
        )
        let samples = try await descriptor.result(for: store)
        let asleep = HKCategoryValueSleepAnalysis.allAsleepValues.map(\.rawValue)
        var bySource: [String: [String: Double]] = [:]  // jour -> source -> minutes
        for s in samples where asleep.contains(s.value) {
            let day = DayKey.key(for: s.endDate)
            let source = s.sourceRevision.source.name
            bySource[day, default: [:]][source, default: 0] += s.endDate.timeIntervalSince(s.startDate) / 60
        }
        return bySource.map { day, sources in
            let watch = sources.filter { $0.key.localizedCaseInsensitiveContains("watch") }
            let pool = watch.isEmpty ? sources : watch
            return (day, pool.values.max() ?? 0)
        }
    }

    // MARK: - Arrière-plan

    func startObservingWorkouts(onChange: @escaping @Sendable () async -> Void) async throws {
        try await store.enableBackgroundDelivery(for: .workoutType(), frequency: .immediate)
        let query = HKObserverQuery(sampleType: .workoutType(), predicate: nil) { _, completion, error in
            guard error == nil else { completion(); return }
            Task {
                await onChange()
                completion()
            }
        }
        store.execute(query)
    }
}
