import CoachCore
import Foundation
import HealthKit
import SwiftData
import Testing
@testable import Coach

@Suite("Modèle Workout")
@MainActor
struct WorkoutModelTests {
    @Test("Aller-retour brouillon -> modèle -> brouillon")
    func draftRoundTrip() {
        let d = runDraft()
        let w = Workout(draft: d)
        #expect(w.draft == d)
        #expect(w.sport == .running)
        #expect(w.syncedAt == nil)
        #expect(w.avgPaceSecPerKm == d.avgPaceSecPerKm)
    }

    @Test("merge : les valeurs connues survivent aux nils, les nouvelles valeurs priment, syncedAt est remis à zéro")
    func mergeSemantics() {
        let w = Workout(draft: runDraft(hr: 146, distanceM: 10_120))
        w.syncedAt = .now
        let originalUUID = w.healthKitUUID

        var update = runDraft(hr: 150, distanceM: nil)
        update.durationSec = 3300
        update.endedAt = update.startedAt.addingTimeInterval(3300)
        update.sourceName = nil
        w.merge(update)

        #expect(w.avgHr == 150)
        #expect(w.distanceM == 10_120)
        #expect(w.durationSec == 3300)
        #expect(w.sourceName == watchName)
        #expect(w.healthKitUUID == originalUUID)
        #expect(w.syncedAt == nil)
    }

    @Test("Un sport inconnu en base se lit comme « other »")
    func unknownSportRaw() {
        let w = Workout(draft: runDraft())
        w.sportRaw = "padel"
        #expect(w.sport == .other)
        w.sport = .trailRunning
        #expect(w.sportRaw == "trail_running")
    }

    @Test("La contrainte d'unicité sur startedAt est respectée par SwiftData")
    func uniqueStartedAt() throws {
        let container = try ModelContainer(for: Workout.self, DailyMetric.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let context = container.mainContext
        context.insert(Workout(draft: runDraft(hr: 100)))
        try context.save()
        context.insert(Workout(draft: runDraft(hr: 200)))
        try context.save()
        let all = try context.fetch(FetchDescriptor<Workout>())
        #expect(all.count == 1)
    }

    @Test("DailyMetric : date dérivée de la clé de jour")
    func dailyMetricDate() {
        let m = DailyMetric(day: "2026-09-15")
        #expect(m.date != nil)
        #expect(DayKey.key(for: m.date!) == "2026-09-15")
        #expect(m.draft == DailyMetricDraft(day: "2026-09-15"))
    }
}

@Suite("Réglages persistés")
@MainActor
struct AppSettingsTests {
    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "CoachTests.settings.\(UUID().uuidString)")!
    }

    @Test("Valeurs par défaut")
    func defaults() {
        let s = AppSettings(defaults: freshDefaults())
        #expect(s.apiBaseURL.absoluteString == "http://192.168.1.10:3210")
        #expect(s.apiKey == "")
        #expect(s.syncEnabled)
        #expect(s.lastSyncAt == nil)
    }

    @Test("Chaque réglage est relu par une nouvelle instance")
    func persistence() {
        let defaults = freshDefaults()
        let s = AppSettings(defaults: defaults)
        s.apiBaseURL = URL(string: "http://coach.local:3210")!
        s.apiKey = "secret"
        s.syncEnabled = false
        let when = Date(timeIntervalSince1970: 1_789_491_600)
        s.lastSyncAt = when

        let again = AppSettings(defaults: defaults)
        #expect(again.apiBaseURL.absoluteString == "http://coach.local:3210")
        #expect(again.apiKey == "secret")
        #expect(again.syncEnabled == false)
        #expect(again.lastSyncAt == when)
    }

    @Test("AppSettings fournit la configuration réseau du client API")
    func apiConfiguration() {
        let s = AppSettings(defaults: freshDefaults())
        s.apiKey = "k"
        let config: any APIConfiguration = s
        #expect(config.apiKey == "k")
        #expect(config.apiBaseURL == s.apiBaseURL)
    }
}

@Suite("Correspondance HealthKit")
struct WorkoutMapperTests {
    @Test("Noms canoniques identiques à l'export XML Apple Santé", arguments: [
        (HKWorkoutActivityType.running, "HKWorkoutActivityTypeRunning"),
        (.cooldown, "HKWorkoutActivityTypeCooldown"),
        (.functionalStrengthTraining, "HKWorkoutActivityTypeFunctionalStrengthTraining"),
        (.hiking, "HKWorkoutActivityTypeHiking"),
        (.other, "HKWorkoutActivityTypeOther"),
    ])
    func canonicalNames(type: HKWorkoutActivityType, expected: String) {
        #expect(WorkoutMapper.canonicalName(type) == expected)
    }

    @Test("Un type non listé reste identifiable par sa valeur brute")
    func unknownType() {
        let name = WorkoutMapper.canonicalName(.badminton)
        #expect(name == "HKWorkoutActivityTypeRaw\(HKWorkoutActivityType.badminton.rawValue)")
        #expect(SportClassifier.sport(forActivityType: name, distanceM: nil, ascentM: nil) == .other)
    }

    @Test("Le nom canonique se classe comme côté API")
    func canonicalNamesClassify() {
        #expect(SportClassifier.sport(forActivityType: WorkoutMapper.canonicalName(.cooldown), distanceM: nil, ascentM: nil) == .mobility)
        #expect(SportClassifier.sport(forActivityType: WorkoutMapper.canonicalName(.running), distanceM: 18_300, ascentM: 940) == .trailRunning)
    }
}

@Suite("Données de démonstration et mode de lancement")
@MainActor
struct PreviewDataTests {
    @Test("Le conteneur de preview contient les séances classées et 30 jours de métriques")
    func previewContainer() throws {
        let container = PreviewData.container()
        let workouts = try container.mainContext.fetch(FetchDescriptor<Workout>())
        #expect(workouts.count == 10)
        #expect(workouts.filter { $0.sport == .mobility }.count == 3)
        #expect(workouts.filter { $0.sport == .stretching }.count == 3)
        #expect(workouts.contains { $0.sport == .trailRunning })
        let metrics = try container.mainContext.fetch(FetchDescriptor<DailyMetric>())
        #expect(metrics.count == 30)
    }

    @Test("Le fournisseur Santé factice ne livre les séances qu'au premier passage")
    func previewHealthData() async throws {
        let p = PreviewHealthData()
        let (first, anchor) = try await p.fetchWorkouts(since: nil)
        #expect(first.count == 10)
        let (second, _) = try await p.fetchWorkouts(since: anchor)
        #expect(second.isEmpty)
    }

    @Test("Sous test, l'app ne démarre pas ses services réels")
    func launchModeUnderTests() {
        #expect(LaunchMode.current != .normal)
    }
}
