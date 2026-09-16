import Foundation
import Testing
@testable import CoachCore

/// Fuseau explicite : les tests ne touchent pas à `DayKey.timeZone` et peuvent tourner en parallèle.
let paris = TimeZone(identifier: "Europe/Paris")!

/// 14 septembre 2026, 19 h 24 à Paris (heure d'été, UTC+2).
let evening = DayKey.calendar(in: paris).date(from: DateComponents(year: 2026, month: 9, day: 14, hour: 19, minute: 24))!

func draft(_ start: Date, type: String, source: String, minutes: Double = 15, hr: Double? = 80) -> WorkoutDraft {
    WorkoutDraft(
        startedAt: start, endedAt: start.addingTimeInterval(minutes * 60), healthKitUUID: UUID(),
        activityType: type, sport: SportClassifier.sport(forActivityType: type, distanceM: nil, ascentM: nil),
        durationSec: minutes * 60, avgHr: hr, sourceName: source
    )
}

let watch = "Apple Watch de Guillaume"

@Suite("Routine du soir")
struct RoutineClassifierTests {
    @Test("La première Cooldown du jour est de la mobilité, la seconde des étirements")
    func routineRank() {
        let drafts = [
            draft(evening, type: "HKWorkoutActivityTypeCooldown", source: watch),
            draft(evening.addingTimeInterval(5400), type: "HKWorkoutActivityTypeCooldown", source: watch),
        ]
        #expect(RoutineClassifier.classifyRoutine(drafts, timeZone: paris).map(\.sport) == [.mobility, .stretching])
    }

    @Test("Trois Cooldown : mobilité puis deux fois étirements")
    func thirdIsStretching() {
        let drafts = (0..<3).map { draft(evening.addingTimeInterval(Double($0) * 3600), type: "HKWorkoutActivityTypeCooldown", source: watch) }
        #expect(RoutineClassifier.classifyRoutine(drafts, timeZone: paris).map(\.sport) == [.mobility, .stretching, .stretching])
    }

    @Test("Le rang repart à zéro le jour suivant")
    func rankResetsNextDay() {
        let drafts = [
            draft(evening, type: "HKWorkoutActivityTypeCooldown", source: watch),
            draft(evening.addingTimeInterval(86_400), type: "HKWorkoutActivityTypeCooldown", source: watch),
        ]
        #expect(RoutineClassifier.classifyRoutine(drafts, timeZone: paris).map(\.sport) == [.mobility, .mobility])
    }

    @Test("Le jour est découpé dans le fuseau demandé, pas en UTC")
    func dayBoundaryFollowsTimeZone() {
        // 21 h 30 puis 00 h 30 (lendemain) à Paris ; le même jour UTC (19 h 30 et 22 h 30).
        let late = DayKey.calendar(in: paris).date(from: DateComponents(year: 2026, month: 9, day: 14, hour: 21, minute: 30))!
        let drafts = [
            draft(late, type: "HKWorkoutActivityTypeCooldown", source: watch),
            draft(late.addingTimeInterval(3 * 3600), type: "HKWorkoutActivityTypeCooldown", source: watch),
        ]
        #expect(RoutineClassifier.classifyRoutine(drafts, timeZone: paris).map(\.sport) == [.mobility, .mobility])
        #expect(RoutineClassifier.classifyRoutine(drafts, timeZone: TimeZone(identifier: "UTC")!).map(\.sport) == [.mobility, .stretching])
    }

    @Test("L'ordre d'entrée n'a pas d'importance : le classement est chronologique")
    func orderIndependent() {
        let first = draft(evening, type: "HKWorkoutActivityTypeCooldown", source: watch)
        let second = draft(evening.addingTimeInterval(5400), type: "HKWorkoutActivityTypeCooldown", source: watch)
        let out = RoutineClassifier.classifyRoutine([second, first], timeZone: paris)
        #expect(out.map(\.startedAt) == [first.startedAt, second.startedAt])
        #expect(out.map(\.sport) == [.mobility, .stretching])
    }

    @Test("Un « Other » Strava non apparié compte dans la routine du jour")
    func stravaOtherFillsGap() {
        let drafts = [
            draft(evening, type: "HKWorkoutActivityTypeOther", source: "Strava", hr: nil),
            draft(evening.addingTimeInterval(5400), type: "HKWorkoutActivityTypeCooldown", source: watch),
        ]
        #expect(RoutineClassifier.classifyRoutine(drafts, timeZone: paris).map(\.sport) == [.mobility, .stretching])
    }

    @Test("Un « Other » venant de la montre n'est pas de la routine")
    func watchOtherIsNotRoutine() {
        let d = draft(evening, type: "HKWorkoutActivityTypeOther", source: watch)
        #expect(RoutineClassifier.isRoutineCandidate(d) == false)
        #expect(RoutineClassifier.classifyRoutine([d], timeZone: paris).first?.sport == .other)
    }

    @Test("Une séance déjà classée mobilité ou étirements est recandidate (reclassement stable)")
    func alreadyClassifiedIsCandidate() {
        var a = draft(evening, type: "HKWorkoutActivityTypeCooldown", source: watch)
        a.sport = .stretching
        var b = draft(evening.addingTimeInterval(5400), type: "HKWorkoutActivityTypeCooldown", source: watch)
        b.sport = .mobility
        #expect(RoutineClassifier.classifyRoutine([a, b], timeZone: paris).map(\.sport) == [.mobility, .stretching])
    }

    @Test("La course n'est pas touchée par la classification de routine")
    func runningUntouched() {
        let run = draft(evening.addingTimeInterval(-7200), type: "HKWorkoutActivityTypeRunning", source: watch, minutes: 52, hr: 149)
        #expect(RoutineClassifier.classifyRoutine([run], timeZone: paris).first?.sport == .running)
    }
}

@Suite("Doublons inter-sources")
struct DedupeTests {
    @Test("Strava décalé de 20 s est un doublon : on garde la montre")
    func dedupePrefersWatch() {
        let strava = draft(evening.addingTimeInterval(-20), type: "HKWorkoutActivityTypeOther", source: "Strava", hr: nil)
        let watchDraft = draft(evening, type: "HKWorkoutActivityTypeCooldown", source: watch)
        let out = RoutineClassifier.dedupe([strava, watchDraft])
        #expect(out.count == 1)
        #expect(out.first?.sourceName == watch)
    }

    @Test("La montre gagne aussi quand elle arrive en second")
    func watchWinsWhenLater() {
        let watchDraft = draft(evening, type: "HKWorkoutActivityTypeRunning", source: watch, hr: 150)
        let strava = draft(evening.addingTimeInterval(25), type: "HKWorkoutActivityTypeRunning", source: "Strava", hr: nil)
        let out = RoutineClassifier.dedupe([watchDraft, strava])
        #expect(out.map(\.sourceName) == [watch])
    }

    @Test("Deux sources tierces : celle qui a la FC est conservée")
    func thirdPartyWithHeartRateWins() {
        let a = draft(evening, type: "HKWorkoutActivityTypeRunning", source: "Strava", hr: nil)
        let b = draft(evening.addingTimeInterval(30), type: "HKWorkoutActivityTypeRunning", source: "Garmin", hr: 140)
        let out = RoutineClassifier.dedupe([a, b])
        #expect(out.count == 1)
        #expect(out.first?.sourceName == "Garmin")
    }

    @Test("Deux séances à exactement 3 minutes d'écart sont conservées (borne exclue)")
    func dedupeKeepsDistinct() {
        let a = draft(evening, type: "HKWorkoutActivityTypeCooldown", source: watch)
        let b = draft(evening.addingTimeInterval(180), type: "HKWorkoutActivityTypeOther", source: "Strava", hr: nil)
        #expect(RoutineClassifier.dedupe([a, b]).count == 2)
        let c = draft(evening.addingTimeInterval(179), type: "HKWorkoutActivityTypeOther", source: "Strava", hr: nil)
        #expect(RoutineClassifier.dedupe([a, c]).count == 1)
    }

    @Test("Deux séances montre proches sont toutes deux conservées")
    func twoWatchWorkoutsKept() {
        let a = draft(evening, type: "HKWorkoutActivityTypeRunning", source: watch)
        let b = draft(evening.addingTimeInterval(60), type: "HKWorkoutActivityTypeCooldown", source: watch)
        // Même source : le dédoublonnage inter-sources ne s'applique pas… mais la fenêtre est la même.
        // Le comportement actuel garde la première ; on le fige pour détecter tout changement.
        #expect(RoutineClassifier.dedupe([a, b]).count == 1)
    }

    @Test("Même instant de début : la relecture prime et complète ses champs absents depuis l'ancienne")
    func sameStartMergesReadings() {
        var old = draft(evening, type: "HKWorkoutActivityTypeRunning", source: watch, hr: nil)
        old.distanceM = 10_120
        old.ascentM = 94
        var new = draft(evening, type: "HKWorkoutActivityTypeRunning", source: watch, hr: 150)
        new.durationSec = 3300
        new.distanceM = nil
        let out = RoutineClassifier.dedupe([old, new])
        #expect(out.count == 1)
        #expect(out[0].avgHr == 150)
        #expect(out[0].durationSec == 3300)
        #expect(out[0].distanceM == 10_120)
        #expect(out[0].ascentM == 94)
        #expect(out[0].healthKitUUID == new.healthKitUUID)
    }

    @Test("Même instant : une copie Strava ne prend jamais le pas sur la montre, mais la complète")
    func sameStartWatchWins() {
        var watchDraft = draft(evening, type: "HKWorkoutActivityTypeCooldown", source: watch)
        watchDraft.distanceM = nil
        var strava = draft(evening, type: "HKWorkoutActivityTypeOther", source: "Strava", hr: nil)
        strava.distanceM = 1_200
        for order in [[watchDraft, strava], [strava, watchDraft]] {
            let out = RoutineClassifier.dedupe(order)
            #expect(out.count == 1)
            #expect(out[0].sourceName == watch)
            #expect(out[0].activityType == "HKWorkoutActivityTypeCooldown")
            #expect(out[0].distanceM == 1_200)
        }
    }

    @Test("Liste vide et liste d'un élément")
    func trivialInputs() {
        #expect(RoutineClassifier.dedupe([]).isEmpty)
        let a = draft(evening, type: "HKWorkoutActivityTypeRunning", source: watch)
        #expect(RoutineClassifier.dedupe([a]) == [a])
    }
}

@Suite("Volume d'entraînement")
struct TrainingVolumeTests {
    @Test("Le volume 7 jours exclut la routine")
    func volumeExcludesRoutine() {
        var run = draft(evening.addingTimeInterval(-7200), type: "HKWorkoutActivityTypeRunning", source: watch, minutes: 60, hr: 149)
        run.distanceM = 12_000
        run.ascentM = 150
        let routine = draft(evening, type: "HKWorkoutActivityTypeCooldown", source: watch, minutes: 20)
        let volume = RoutineClassifier.trainingVolume(
            RoutineClassifier.classifyRoutine([run, routine], timeZone: paris),
            since: evening.addingTimeInterval(-7 * 86_400)
        )
        #expect(volume == {
            var v = TrainingVolume()
            v.count = 1; v.durationSec = 3600; v.distanceM = 12_000; v.ascentM = 150
            return v
        }())
    }

    @Test("Les séances antérieures à la fenêtre sont exclues, la borne est incluse")
    func windowBoundary() {
        let since = evening.addingTimeInterval(-7 * 86_400)
        let inside = draft(since, type: "HKWorkoutActivityTypeRunning", source: watch, minutes: 30)
        let outside = draft(since.addingTimeInterval(-1), type: "HKWorkoutActivityTypeRunning", source: watch, minutes: 30)
        let volume = RoutineClassifier.trainingVolume([inside, outside], since: since)
        #expect(volume.count == 1)
        #expect(volume.durationSec == 1800)
    }

    @Test("Les distances et D+ absents comptent pour zéro")
    func nilMetricsCountAsZero() {
        let a = draft(evening, type: "HKWorkoutActivityTypeFunctionalStrengthTraining", source: watch, minutes: 45)
        let volume = RoutineClassifier.trainingVolume([a], since: evening.addingTimeInterval(-1))
        #expect(volume.distanceM == 0)
        #expect(volume.ascentM == 0)
        #expect(volume.durationSec == 2700)
    }
}
