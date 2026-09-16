import CoachCore
import Foundation
import SwiftData
import Testing
@testable import Coach

@Suite("SyncEngine : HealthKit -> SwiftData -> API")
@MainActor
struct SyncEngineTests {
    @Test("Une synchro complète importe, classe la routine, pousse et marque comme envoyé")
    func fullRefresh() async throws {
        let h = try SyncHarness()
        h.health.drafts = [
            runDraft(),
            cooldownDraft(at: sampleStart.addingTimeInterval(2 * 3600)),
            cooldownDraft(at: sampleStart.addingTimeInterval(4 * 3600)),
        ]
        h.health.metrics = [DailyMetricDraft(day: "2026-09-15", hrvMs: 104, restingHr: 41)]

        await h.engine.refresh()

        #expect(h.engine.phase == .idle)
        #expect(h.engine.lastError == nil)
        #expect(h.workouts.map(\.sport) == [.running, .mobility, .stretching])
        #expect(h.workouts.allSatisfy { $0.syncedAt != nil })
        #expect(h.metrics.map(\.day) == ["2026-09-15"])
        #expect(h.metrics.first?.syncedAt != nil)

        // Un lot de séances puis un lot de métriques.
        #expect(h.api.ingested.count == 2)
        #expect(h.api.ingested[0].workouts.map(\.sport) == ["running", "mobility", "stretching"])
        #expect(h.api.ingested[0].workouts.first?.deviceName == watchName)
        #expect(h.api.ingested[1].metrics.first?.hrvMs == 104)

        #expect(h.engine.pendingPush == 0)
        #expect(h.settings.lastSyncAt != nil)
        #expect(h.anchor != nil)
    }

    @Test("Envoi désactivé : le cache local se remplit, rien ne part")
    func syncDisabled() async throws {
        let h = try SyncHarness()
        h.settings.syncEnabled = false
        h.health.drafts = [runDraft()]

        await h.engine.refresh()

        #expect(h.engine.phase == .idle)
        #expect(h.workouts.count == 1)
        #expect(h.workouts.first?.syncedAt == nil)
        #expect(h.api.ingested.isEmpty)
    }

    @Test("Échec de l'API : état en erreur, données locales conservées, renvoi au prochain essai")
    func apiFailureThenRetry() async throws {
        let h = try SyncHarness()
        h.health.drafts = [runDraft()]
        h.api.failure = NetworkError.http(status: 401, message: "clé invalide")

        await h.engine.refresh()

        #expect(h.engine.isFailed)
        #expect(h.engine.isBusy == false)
        #expect(h.engine.lastError?.contains("401") == true)
        #expect(h.workouts.count == 1)
        #expect(h.workouts.first?.syncedAt == nil)
        #expect(h.settings.lastSyncAt == nil)

        h.api.failure = nil
        await h.engine.refresh()

        #expect(h.engine.phase == .idle)
        #expect(h.api.ingested.count == 1)
        #expect(h.workouts.first?.syncedAt != nil)
    }

    @Test("Relire la même séance la met à jour sans la dupliquer")
    func reimportMerges() async throws {
        let h = try SyncHarness()
        h.health.drafts = [runDraft(hr: nil, distanceM: 10_120)]
        await h.engine.refresh()
        #expect(h.workouts.first?.syncedAt != nil)

        h.health.drafts = [runDraft(hr: 150, distanceM: nil)]
        await h.engine.refresh()

        #expect(h.workouts.count == 1)
        let w = h.workouts[0]
        #expect(w.avgHr == 150)
        #expect(w.distanceM == 10_120) // valeur connue conservée
        // Modifiée, la séance a été renvoyée.
        #expect(h.api.ingested.filter { !$0.workouts.isEmpty }.count == 2)
    }

    @Test("Le doublon Strava d'une séance montre est éliminé localement")
    func stravaDuplicateRemoved() async throws {
        let h = try SyncHarness()
        var strava = runDraft(at: sampleStart.addingTimeInterval(20), hr: nil)
        strava.sourceName = "Strava"
        strava.deviceName = nil
        h.health.drafts = [strava, runDraft()]

        await h.engine.refresh()

        #expect(h.workouts.count == 1)
        #expect(h.workouts.first?.sourceName == watchName)
    }

    @Test("Un doublon Strava déjà en base disparaît quand la séance montre arrive")
    func lateWatchWorkoutEvictsStoredDuplicate() async throws {
        let h = try SyncHarness()
        var strava = runDraft(at: sampleStart.addingTimeInterval(20), hr: nil)
        strava.sourceName = "Strava"
        strava.deviceName = nil
        h.health.drafts = [strava]
        await h.engine.refresh()
        #expect(h.workouts.first?.sourceName == "Strava")

        h.health.drafts = [runDraft()]
        await h.engine.refresh()

        #expect(h.workouts.count == 1)
        #expect(h.workouts.first?.sourceName == watchName)
    }

    @Test("La routine est reclassée sur tout le jour quand une séance arrive plus tard")
    func routineReclassifiedAcrossDays() async throws {
        let h = try SyncHarness()
        let evening = sampleStart.addingTimeInterval(4 * 3600)
        h.health.drafts = [cooldownDraft(at: evening)]
        await h.engine.refresh()
        #expect(h.workouts.map(\.sport) == [.mobility])

        // La séance de 19 h arrive après celle de 21 h : elle devient la mobilité, l'autre passe en étirements.
        h.health.drafts = [cooldownDraft(at: sampleStart.addingTimeInterval(2 * 3600))]
        await h.engine.refresh()

        #expect(h.workouts.map(\.sport) == [.mobility, .stretching])
        #expect(h.workouts.allSatisfy { $0.syncedAt != nil })
    }

    @Test("Les métriques sont fusionnées champ par champ et renvoyées")
    func metricsMerge() async throws {
        let h = try SyncHarness()
        h.health.metrics = [DailyMetricDraft(day: "2026-09-15", hrvMs: 104)]
        await h.engine.refresh()
        h.health.metrics = [DailyMetricDraft(day: "2026-09-15", restingHr: 41), DailyMetricDraft(day: "2026-09-16", steps: 9210)]
        await h.engine.refresh()

        #expect(h.metrics.map(\.day) == ["2026-09-15", "2026-09-16"])
        #expect(h.metrics[0].hrvMs == 104)
        #expect(h.metrics[0].restingHr == 41)
        #expect(h.metrics.allSatisfy { $0.syncedAt != nil })
    }

    @Test("Sans dernière synchro, les métriques sont relues sur 400 jours ; ensuite sur 3 jours glissants")
    func metricsWindow() async throws {
        let h = try SyncHarness()
        await h.engine.refresh()
        let first = try #require(h.health.metricsRequests.first)
        let span = first.to.timeIntervalSince(first.from) / 86_400
        #expect(span > 395 && span < 405)

        await h.engine.refresh()
        let second = try #require(h.health.metricsRequests.last)
        #expect(abs(second.to.timeIntervalSince(second.from) - 3 * 86_400) < 5)
    }

    @Test("Relire tout l'historique efface l'ancre")
    func fullResyncResetsAnchor() async throws {
        let h = try SyncHarness()
        h.health.drafts = [runDraft()]
        await h.engine.refresh()
        #expect(h.anchor != nil)

        await h.engine.fullResync()

        #expect(h.health.fetchWorkoutsCalls.count == 2)
        #expect(h.health.fetchWorkoutsCalls[1] == nil)
        #expect(h.workouts.count == 1)
    }

    @Test("Santé indisponible : état en erreur explicite, aucun accès demandé")
    func healthUnavailable() async throws {
        let h = try SyncHarness(healthAvailable: false)
        await h.engine.bootstrapIfNeeded()

        #expect(h.engine.isFailed)
        #expect(h.engine.lastError == nil) // l'échec vient de la disponibilité, pas d'une erreur de synchro
        #expect(h.health.authorizationRequests == 0)
        #expect(h.health.fetchWorkoutsCalls.isEmpty)
    }

    @Test("Le démarrage demande l'accès une seule fois, observe, synchronise, et réagit aux nouveautés")
    func bootstrapOnce() async throws {
        let h = try SyncHarness()
        h.health.drafts = [runDraft()]

        await h.engine.bootstrapIfNeeded()
        await h.engine.bootstrapIfNeeded()

        #expect(h.health.authorizationRequests == 1)
        #expect(h.health.observing)
        #expect(h.workouts.count == 1)

        h.health.drafts = [cooldownDraft(at: sampleStart.addingTimeInterval(3 * 3600))]
        await h.health.simulateNewData()
        #expect(h.workouts.count == 2)
    }

    @Test("Refus d'autorisation : état en erreur")
    func authorizationDenied() async throws {
        let h = try SyncHarness()
        h.health.authorizationError = HealthError.notAuthorized
        await h.engine.bootstrapIfNeeded()
        #expect(h.engine.isFailed)
        #expect(h.engine.lastError == HealthError.notAuthorized.localizedDescription)
        #expect(h.health.fetchWorkoutsCalls.isEmpty)
    }

    @Test("Test de connexion : succès et échec remontent tels quels")
    func testConnection() async throws {
        let h = try SyncHarness()
        switch await h.engine.testConnection() {
        case .success: #expect(h.api.healthChecks == 1)
        case .failure(let e): Issue.record("attendu un succès, reçu \(e)")
        }
        h.api.failure = NetworkError.transport(URLError(.cannotConnectToHost))
        if case .success = await h.engine.testConnection() { Issue.record("attendu un échec") }
    }
}
