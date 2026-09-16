import Foundation
import Testing
@testable import CoachCore

@Suite("Jour civil (DayKey)")
struct DayKeyTests {
    private let utc = TimeZone(identifier: "UTC")!

    @Test("La clé dépend du fuseau")
    func keyFollowsTimeZone() {
        let instant = Date(timeIntervalSince1970: 1_789_509_600) // 2026-09-15T22:00:00Z
        #expect(DayKey.key(for: instant, in: utc) == "2026-09-15")
        #expect(DayKey.key(for: instant, in: paris) == "2026-09-16")
    }

    @Test("Heure d'hiver : UTC+1")
    func winterOffset() {
        let instant = Date(timeIntervalSince1970: 1_768_431_600) // 2026-01-14T23:00:00Z
        #expect(DayKey.key(for: instant, in: paris) == "2026-01-15")
        #expect(DayKey.key(for: instant.addingTimeInterval(-1), in: paris) == "2026-01-14")
    }

    @Test("Aller-retour clé -> date -> clé")
    func roundTrip() {
        for key in ["2026-01-01", "2026-03-29", "2026-10-25", "2026-12-31"] {
            let date = DayKey.date(from: key, in: paris)
            #expect(date != nil)
            #expect(DayKey.key(for: date!, in: paris) == key)
        }
    }

    @Test("Clé mal formée")
    func malformedKey() {
        #expect(DayKey.date(from: "2026-09", in: paris) == nil)
        #expect(DayKey.date(from: "hier", in: paris) == nil)
        #expect(DayKey.date(from: "", in: paris) == nil)
    }

    @Test("Le calendrier est grégorien dans le fuseau demandé")
    func calendar() {
        let c = DayKey.calendar(in: paris)
        #expect(c.identifier == .gregorian)
        #expect(c.timeZone == paris)
    }
}

@Suite("Brouillons de séance")
struct WorkoutDraftTests {
    @Test("isFromWatch reconnaît la montre dans la source ou l'appareil, sans casse")
    func isFromWatch() {
        let base = draft(evening, type: "HKWorkoutActivityTypeRunning", source: "Strava")
        #expect(base.isFromWatch == false)
        var a = base; a.sourceName = "Apple Watch de Guillaume"
        #expect(a.isFromWatch)
        var b = base; b.sourceName = "Strava"; b.deviceName = "Apple WATCH Ultra"
        #expect(b.isFromWatch)
        var c = base; c.sourceName = nil; c.deviceName = nil
        #expect(c.isFromWatch == false)
    }

    @Test("L'allure dérive de la distance et de la durée")
    func pace() {
        var d = draft(evening, type: "HKWorkoutActivityTypeRunning", source: watch, minutes: 50)
        #expect(d.avgPaceSecPerKm == nil)
        d.distanceM = 10_000
        #expect(d.avgPaceSecPerKm == 300)
    }

    @Test("Codable : aller-retour sans perte")
    func codableRoundTrip() throws {
        var d = draft(evening, type: "HKWorkoutActivityTypeRunning", source: watch, minutes: 52, hr: 149)
        d.distanceM = 10_120; d.ascentM = 94; d.descentM = 90; d.maxHr = 171; d.energyKcal = 690; d.deviceName = "Apple Watch"
        let data = try JSONEncoder().encode(d)
        let back = try JSONDecoder().decode(WorkoutDraft.self, from: data)
        #expect(back == d)
    }

    @Test("filling(from:) ne complète que les champs absents")
    func filling() {
        var a = draft(evening, type: "HKWorkoutActivityTypeRunning", source: watch, hr: 150)
        a.distanceM = nil; a.ascentM = 10; a.deviceName = nil
        var b = draft(evening, type: "HKWorkoutActivityTypeRunning", source: "Strava", hr: 120)
        b.distanceM = 10_000; b.ascentM = 999; b.deviceName = "Téléphone"; b.energyKcal = 500
        let out = a.filling(from: b)
        #expect(out.avgHr == 150)
        #expect(out.ascentM == 10)
        #expect(out.sourceName == watch)
        #expect(out.distanceM == 10_000)
        #expect(out.deviceName == "Téléphone")
        #expect(out.energyKcal == 500)
        #expect(out.healthKitUUID == a.healthKitUUID)
        #expect(out.startedAt == a.startedAt && out.durationSec == a.durationSec && out.sport == a.sport)
    }

    @Test("Valeurs par défaut de l'initialiseur")
    func defaults() {
        let d = WorkoutDraft(startedAt: evening, endedAt: evening.addingTimeInterval(60), activityType: "X", sport: .other, durationSec: 60)
        #expect(d.healthKitUUID == nil)
        #expect(d.distanceM == nil && d.ascentM == nil && d.descentM == nil)
        #expect(d.avgHr == nil && d.maxHr == nil && d.energyKcal == nil)
        #expect(d.sourceName == nil && d.deviceName == nil)
    }
}

@Suite("Métriques journalières et FC")
struct DailyMetricDraftTests {
    @Test("Codable et égalité")
    func codable() throws {
        let m = DailyMetricDraft(day: "2026-09-15", hrvMs: 104, restingHr: 41, vo2max: 65, sleepMinutes: 466, steps: 9210)
        let back = try JSONDecoder().decode(DailyMetricDraft.self, from: JSONEncoder().encode(m))
        #expect(back == m)
        #expect(DailyMetricDraft(day: "2026-09-15").hrvMs == nil)
    }

    @Test("Un échantillon de FC est identifié par sa date")
    func heartRateSampleIdentity() {
        let s = HeartRateSample(date: evening, bpm: 150)
        #expect(s.id == evening)
        #expect(s == HeartRateSample(date: evening, bpm: 150))
    }
}
