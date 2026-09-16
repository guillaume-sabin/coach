import CoachCore
import Foundation
import SwiftData
@testable import Coach

/// Fournisseur Santé factice, entièrement pilotable : ce que renvoie HealthKit est décidé par le test.
@MainActor
final class MockHealthData: HealthDataProviding {
    nonisolated let isAvailable: Bool

    /// Séances livrées au prochain `fetchWorkouts`, puis consommées (comme une requête ancrée).
    var drafts: [WorkoutDraft] = []
    var metrics: [DailyMetricDraft] = []
    var authorizationError: Error?
    var fetchError: Error?

    private(set) var authorizationRequests = 0
    private(set) var fetchWorkoutsCalls: [Data?] = []
    private(set) var metricsRequests: [(from: Date, to: Date)] = []
    private(set) var observing = false
    private var onChange: (@Sendable () async -> Void)?

    init(isAvailable: Bool = true) {
        self.isAvailable = isAvailable
    }

    func requestAuthorization() async throws {
        authorizationRequests += 1
        if let authorizationError { throw authorizationError }
    }

    func fetchWorkouts(since anchor: Data?) async throws -> (drafts: [WorkoutDraft], anchor: Data?) {
        fetchWorkoutsCalls.append(anchor)
        if let fetchError { throw fetchError }
        defer { drafts = [] }
        return (drafts, Data([UInt8(truncatingIfNeeded: fetchWorkoutsCalls.count)]))
    }

    func fetchDailyMetrics(from: Date, to: Date) async throws -> [DailyMetricDraft] {
        metricsRequests.append((from, to))
        return metrics
    }

    func heartRateSeries(from: Date, to: Date) async throws -> [HeartRateSample] { [] }

    func startObservingWorkouts(onChange: @escaping @Sendable () async -> Void) async throws {
        observing = true
        self.onChange = onChange
    }

    /// Simule une notification HealthKit « nouvelles séances disponibles ».
    func simulateNewData() async {
        await onChange?()
    }
}

/// Client API qui enregistre ce qu'on lui envoie et répond comme le serveur, ou échoue à la demande.
@MainActor
final class RecordingAPIClient: APIClient {
    var failure: Error?
    private(set) var ingested: [IngestPayload] = []
    private(set) var healthChecks = 0

    func send<Body, Response>(_ endpoint: APIEndpoint<Body, Response>) async throws -> Response {
        if let failure { throw failure }
        if let payload = endpoint.body as? IngestPayload {
            ingested.append(payload)
            let json = #"{"ok":true,"workouts":\#(payload.workouts.count),"metrics":\#(payload.metrics.count)}"#
            return try APIJSON.decoder.decode(Response.self, from: Data(json.utf8))
        }
        healthChecks += 1
        return try APIJSON.decoder.decode(Response.self, from: Data(#"{"ok":true}"#.utf8))
    }
}

/// Assemble un `SyncEngine` isolé : base SwiftData en mémoire, `UserDefaults` dédié, doublures.
/// Chaque test crée le sien : les tests peuvent tourner en parallèle.
@MainActor
final class SyncHarness {
    let container: ModelContainer
    let defaults: UserDefaults
    let health: MockHealthData
    let api: RecordingAPIClient
    let settings: AppSettings
    let engine: SyncEngine

    init(healthAvailable: Bool = true) throws {
        container = try ModelContainer(
            for: Workout.self, DailyMetric.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        defaults = UserDefaults(suiteName: "CoachTests.\(UUID().uuidString)")!
        health = MockHealthData(isAvailable: healthAvailable)
        api = RecordingAPIClient()
        settings = AppSettings(defaults: defaults)
        engine = SyncEngine(health: health, api: api, settings: settings, modelContainer: container, defaults: defaults)
    }

    var workouts: [Workout] {
        try! container.mainContext.fetch(FetchDescriptor<Workout>(sortBy: [SortDescriptor(\.startedAt)]))
    }

    var metrics: [DailyMetric] {
        try! container.mainContext.fetch(FetchDescriptor<DailyMetric>(sortBy: [SortDescriptor(\.day)]))
    }

    var anchor: Data? { defaults.data(forKey: "sync.healthKitAnchor") }
}

// MARK: - Fabriques de brouillons

let watchName = "Apple Watch de Guillaume"

/// 15 septembre 2026, 17 h 00 UTC : même jour civil à Paris (19 h) et en UTC, loin de minuit.
let sampleStart = Date(timeIntervalSince1970: 1_789_491_600)

func runDraft(at start: Date = sampleStart, hr: Double? = 146, distanceM: Double? = 10_120) -> WorkoutDraft {
    WorkoutDraft(
        startedAt: start, endedAt: start.addingTimeInterval(3208), healthKitUUID: UUID(),
        activityType: "HKWorkoutActivityTypeRunning", sport: .running, durationSec: 3208,
        distanceM: distanceM, ascentM: 94, avgHr: hr, sourceName: watchName, deviceName: "Apple Watch"
    )
}

func cooldownDraft(at start: Date, source: String = watchName, type: String = "HKWorkoutActivityTypeCooldown") -> WorkoutDraft {
    WorkoutDraft(
        startedAt: start, endedAt: start.addingTimeInterval(900), healthKitUUID: UUID(),
        activityType: type, sport: SportClassifier.sport(forActivityType: type, distanceM: nil, ascentM: nil),
        durationSec: 900, avgHr: source == watchName ? 82 : nil, sourceName: source
    )
}
