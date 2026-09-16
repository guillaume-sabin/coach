import CoachCore
import Foundation
import Observation
import OSLog
import SwiftData

/// Orchestre HealthKit → SwiftData → API. Source de vérité de l'état de synchronisation pour l'UI.
@Observable
@MainActor
final class SyncEngine {
    enum Phase: Equatable {
        case idle
        case requestingAccess
        case readingHealth
        case pushing
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    private(set) var lastError: String?
    private(set) var pendingPush: Int = 0
    var isBusy: Bool { phase != .idle && !isFailed }
    var isFailed: Bool { if case .failed = phase { return true } else { return false } }

    private let health: any HealthDataProviding
    private let api: any APIClient
    private let settings: AppSettings
    private let modelContainer: ModelContainer
    private let logger = Logger(subsystem: "com.guillaumesabin.coach", category: "sync")
    private var didBootstrap = false

    private let anchorKey = "sync.healthKitAnchor"
    private let metricsBackfillDays = 400

    init(health: any HealthDataProviding, api: any APIClient, settings: AppSettings, modelContainer: ModelContainer) {
        self.health = health
        self.api = api
        self.settings = settings
        self.modelContainer = modelContainer
    }

    /// Premier lancement de la scène : autorisation, observation en arrière-plan, synchro complète.
    func bootstrapIfNeeded() async {
        guard !didBootstrap else { return }
        didBootstrap = true
        guard health.isAvailable else {
            phase = .failed(HealthError.notAvailable.localizedDescription)
            return
        }
        do {
            phase = .requestingAccess
            try await health.requestAuthorization()
            try await health.startObservingWorkouts { [weak self] in
                await self?.refresh()
            }
        } catch {
            fail(error)
            return
        }
        await refresh()
    }

    /// Lit les nouveautés HealthKit, met à jour le cache local puis pousse vers l'API si activée.
    func refresh() async {
        guard !isBusy else { return }
        do {
            phase = .readingHealth
            try await importWorkouts()
            try await importMetrics()
            phase = .pushing
            try await pushPending()
            settings.lastSyncAt = .now
            phase = .idle
            lastError = nil
        } catch {
            fail(error)
        }
    }

    /// Relit tout l'historique HealthKit (réinitialise l'ancre).
    func fullResync() async {
        UserDefaults.standard.removeObject(forKey: anchorKey)
        phase = .idle
        await refresh()
    }

    func testConnection() async -> Result<Void, Error> {
        do {
            _ = try await api.send(Endpoints.health)
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    // MARK: - Import

    private func importWorkouts() async throws {
        let anchor = UserDefaults.standard.data(forKey: anchorKey)
        let (raw, newAnchor) = try await health.fetchWorkouts(since: anchor)
        guard !raw.isEmpty else {
            if let newAnchor { UserDefaults.standard.set(newAnchor, forKey: anchorKey) }
            return
        }
        logger.info("HealthKit : \(raw.count) séances reçues")

        let context = modelContainer.mainContext
        // On reclasse la routine sur l'ensemble des jours touchés, y compris les séances déjà connues.
        let touchedDays = Set(raw.map { DayKey.key(for: $0.startedAt) })
        let existing = try context.fetch(FetchDescriptor<Workout>())
        let existingDrafts = existing
            .filter { touchedDays.contains(DayKey.key(for: $0.startedAt)) }
            .map(\.draft)

        let merged = RoutineClassifier.classifyRoutine(RoutineClassifier.dedupe(existingDrafts + raw))
        let keepStarts = Set(merged.map(\.startedAt))
        var byStart = Dictionary(uniqueKeysWithValues: existing.map { ($0.startedAt, $0) })

        for draft in merged {
            if let w = byStart[draft.startedAt] {
                w.merge(draft)
                w.sport = draft.sport
            } else {
                let w = Workout(draft: draft)
                context.insert(w)
                byStart[draft.startedAt] = w
            }
        }
        // Séances locales des jours touchés éliminées par le dédoublonnage.
        for w in existing where touchedDays.contains(DayKey.key(for: w.startedAt)) && !keepStarts.contains(w.startedAt) {
            context.delete(w)
        }
        if context.hasChanges { try context.save() }
        if let newAnchor { UserDefaults.standard.set(newAnchor, forKey: anchorKey) }
    }

    private func importMetrics() async throws {
        let to = Date.now
        let from = settings.lastSyncAt.map { $0.addingTimeInterval(-3 * 86_400) }
            ?? DayKey.calendar.date(byAdding: .day, value: -metricsBackfillDays, to: to)!
        let drafts = try await health.fetchDailyMetrics(from: from, to: to)
        guard !drafts.isEmpty else { return }

        let context = modelContainer.mainContext
        let days = drafts.map(\.day)
        let existing = try context.fetch(FetchDescriptor<DailyMetric>(predicate: #Predicate { days.contains($0.day) }))
        var byDay = Dictionary(uniqueKeysWithValues: existing.map { ($0.day, $0) })
        for d in drafts {
            let m = byDay[d.day] ?? {
                let m = DailyMetric(day: d.day)
                context.insert(m)
                byDay[d.day] = m
                return m
            }()
            if let v = d.hrvMs { m.hrvMs = v }
            if let v = d.restingHr { m.restingHr = v }
            if let v = d.vo2max { m.vo2max = v }
            if let v = d.sleepMinutes { m.sleepMinutes = v }
            if let v = d.steps { m.steps = v }
            m.syncedAt = nil
        }
        if context.hasChanges { try context.save() }
    }

    // MARK: - Push

    private func pushPending() async throws {
        guard settings.syncEnabled else { return }
        let context = modelContainer.mainContext
        let workouts = try context.fetch(FetchDescriptor<Workout>(predicate: #Predicate { $0.syncedAt == nil }))
        let metrics = try context.fetch(FetchDescriptor<DailyMetric>(predicate: #Predicate { $0.syncedAt == nil }))
        pendingPush = workouts.count + metrics.count
        guard pendingPush > 0 else { return }

        // Lots de 200 pour rester sous quelques centaines de Ko par requête.
        for chunk in workouts.chunked(200) {
            let payload = IngestPayload(workouts: chunk.map { WorkoutPayload(draft: $0.draft) }, metrics: [])
            _ = try await api.send(Endpoints.ingest(payload))
            let now = Date.now
            chunk.forEach { $0.syncedAt = now }
            try context.save()
            pendingPush -= chunk.count
        }
        for chunk in metrics.chunked(500) {
            let payload = IngestPayload(workouts: [], metrics: chunk.map { DailyMetricPayload(draft: $0.draft) })
            _ = try await api.send(Endpoints.ingest(payload))
            let now = Date.now
            chunk.forEach { $0.syncedAt = now }
            try context.save()
            pendingPush -= chunk.count
        }
    }

    // MARK: - Helpers

    private func fail(_ error: Error) {
        logger.error("Synchro échouée : \(error.localizedDescription)")
        lastError = error.localizedDescription
        phase = .failed(error.localizedDescription)
    }

}

private extension Array {
    func chunked(_ size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map { Array(self[$0..<Swift.min($0 + size, count)]) }
    }
}
