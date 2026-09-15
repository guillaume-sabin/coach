import Foundation
import Testing
@testable import CoachCore

@Suite("Classification des séances", .serialized)
struct RoutineClassifierTests {
    init() {
        DayKey.timeZone = TimeZone(identifier: "Europe/Paris")!
    }

    private func draft(_ start: Date, type: String, source: String, minutes: Double = 15, hr: Double? = 80) -> WorkoutDraft {
        WorkoutDraft(
            startedAt: start, endedAt: start.addingTimeInterval(minutes * 60), healthKitUUID: UUID(),
            activityType: type, sport: SportClassifier.sport(forActivityType: type, distanceM: nil, ascentM: nil),
            durationSec: minutes * 60, avgHr: hr, sourceName: source
        )
    }

    /// 14 septembre 2026, 19 h 24 à Paris.
    private var evening: Date {
        DayKey.calendar.date(from: DateComponents(year: 2026, month: 9, day: 14, hour: 19, minute: 24))!
    }

    @Test("La première Cooldown du jour est de la mobilité, la seconde des étirements")
    func routineRank() {
        let drafts = [
            draft(evening, type: "HKWorkoutActivityTypeCooldown", source: "Apple Watch de Guillaume"),
            draft(evening.addingTimeInterval(5400), type: "HKWorkoutActivityTypeCooldown", source: "Apple Watch de Guillaume"),
        ]
        #expect(RoutineClassifier.classifyRoutine(drafts).map(\.sport) == [.mobility, .stretching])
    }

    @Test("Le rang repart à zéro le jour suivant")
    func rankResetsNextDay() {
        let drafts = [
            draft(evening, type: "HKWorkoutActivityTypeCooldown", source: "Apple Watch de Guillaume"),
            draft(evening.addingTimeInterval(86_400), type: "HKWorkoutActivityTypeCooldown", source: "Apple Watch de Guillaume"),
        ]
        #expect(RoutineClassifier.classifyRoutine(drafts).map(\.sport) == [.mobility, .mobility])
    }

    @Test("Un « Other » Strava non apparié compte dans la routine du jour")
    func stravaOtherFillsGap() {
        let drafts = [
            draft(evening, type: "HKWorkoutActivityTypeOther", source: "Strava", hr: nil),
            draft(evening.addingTimeInterval(5400), type: "HKWorkoutActivityTypeCooldown", source: "Apple Watch de Guillaume"),
        ]
        #expect(RoutineClassifier.classifyRoutine(drafts).map(\.sport) == [.mobility, .stretching])
    }

    @Test("Strava décalé de 20 s est un doublon : on garde la montre")
    func dedupePrefersWatch() {
        let strava = draft(evening.addingTimeInterval(-20), type: "HKWorkoutActivityTypeOther", source: "Strava", hr: nil)
        let watch = draft(evening, type: "HKWorkoutActivityTypeCooldown", source: "Apple Watch de Guillaume")
        let out = RoutineClassifier.dedupe([strava, watch])
        #expect(out.count == 1)
        #expect(out.first?.sourceName == "Apple Watch de Guillaume")
    }

    @Test("Deux séances à plus de 3 minutes d'écart sont conservées")
    func dedupeKeepsDistinct() {
        let a = draft(evening, type: "HKWorkoutActivityTypeCooldown", source: "Apple Watch de Guillaume")
        let b = draft(evening.addingTimeInterval(200), type: "HKWorkoutActivityTypeOther", source: "Strava", hr: nil)
        #expect(RoutineClassifier.dedupe([a, b]).count == 2)
    }

    @Test("La course n'est pas touchée par la classification de routine")
    func runningUntouched() {
        let run = draft(evening.addingTimeInterval(-7200), type: "HKWorkoutActivityTypeRunning", source: "Apple Watch de Guillaume", minutes: 52, hr: 149)
        #expect(RoutineClassifier.classifyRoutine([run]).first?.sport == .running)
    }

    @Test("Le volume 7 jours exclut la routine")
    func volumeExcludesRoutine() {
        var run = draft(evening.addingTimeInterval(-7200), type: "HKWorkoutActivityTypeRunning", source: "Apple Watch de Guillaume", minutes: 60, hr: 149)
        run.distanceM = 12_000
        run.ascentM = 150
        let routine = draft(evening, type: "HKWorkoutActivityTypeCooldown", source: "Apple Watch de Guillaume", minutes: 20)
        let volume = RoutineClassifier.trainingVolume(RoutineClassifier.classifyRoutine([run, routine]), since: evening.addingTimeInterval(-7 * 86_400))
        #expect(volume.count == 1)
        #expect(volume.durationSec == 3600)
        #expect(volume.distanceM == 12_000)
    }
}

@Suite("Sports et heuristiques")
struct SportClassifierTests {
    @Test("Heuristique trail : 940 m de D+ sur 18,3 km")
    func trailHeuristic() {
        #expect(SportClassifier.sport(forActivityType: "HKWorkoutActivityTypeRunning", distanceM: 18_300, ascentM: 940) == .trailRunning)
        #expect(SportClassifier.sport(forActivityType: "HKWorkoutActivityTypeRunning", distanceM: 10_420, ascentM: 86) == .running)
    }

    @Test("Types HealthKit courants", arguments: [
        ("HKWorkoutActivityTypeWalking", Sport.walking),
        ("HKWorkoutActivityTypeHiking", .hiking),
        ("HKWorkoutActivityTypeCycling", .cycling),
        ("HKWorkoutActivityTypeFunctionalStrengthTraining", .strength),
        ("HKWorkoutActivityTypeCooldown", .mobility),
        ("HKWorkoutActivityTypeStairs", .other),
    ])
    func mapping(name: String, expected: Sport) {
        #expect(SportClassifier.sport(forActivityType: name, distanceM: nil, ascentM: nil) == expected)
    }

    @Test("Allure et formats")
    func formats() {
        #expect(Format.pace(Pace.secondsPerKm(distanceM: 10_000, durationSec: 3000)) == "5:00 /km")
        #expect(Format.duration(5_400) == "1 h 30")
        #expect(Format.duration(1_500) == "25 min")
        #expect(Format.distance(18_300) == "18.3 km")
        #expect(Format.sleep(466) == "7 h 46")
    }
}

@Suite("Contrat API")
struct APIContractTests {
    @Test("Le payload iOS est encodé comme l'API l'attend")
    func encodesPayload() throws {
        let start = Date(timeIntervalSince1970: 1_789_491_912) // 2026-09-15T17:05:12Z
        let draft = WorkoutDraft(
            startedAt: start, endedAt: start.addingTimeInterval(3208), activityType: "HKWorkoutActivityTypeRunning",
            sport: .running, durationSec: 3208, distanceM: 10_120, ascentM: 94, avgHr: 146, sourceName: "Apple Watch de Guillaume"
        )
        let data = try APIJSON.encoder.encode(IngestPayload(workouts: [WorkoutPayload(draft: draft)], metrics: []))
        let json = String(decoding: data, as: UTF8.self)
        #expect(json.contains("\"source\":\"ios_app\""))
        #expect(json.contains("\"sport\":\"running\""))
        #expect(json.contains("\"startedAt\":\"2026-09-15T17:05:12Z\""))
        // 3208 s / 10,12 km = 316,996… : l'API arrondit à l'affichage, le payload garde la valeur exacte.
        #expect(json.contains("\"avgPaceSecPerKm\":316.99"))
        #expect(json.contains("\"deviceName\":\"Apple Watch de Guillaume\""))
    }
}
