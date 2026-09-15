import CoachCore
import Foundation
import SwiftData

/// Séance persistée localement (cache HealthKit + classification). Identité : l'instant de début.
/// La logique pure (classification, formats, contrat API) vit dans le paquet `CoachCore`.
@Model
final class Workout {
    @Attribute(.unique) var startedAt: Date
    var endedAt: Date
    var healthKitUUID: UUID?
    var activityType: String
    var sportRaw: String
    var durationSec: Double
    var distanceM: Double?
    var ascentM: Double?
    var descentM: Double?
    var avgHr: Double?
    var maxHr: Double?
    var energyKcal: Double?
    var sourceName: String?
    var deviceName: String?
    /// Poussée vers l'API réussie.
    var syncedAt: Date?

    init(draft: WorkoutDraft) {
        startedAt = draft.startedAt
        endedAt = draft.endedAt
        healthKitUUID = draft.healthKitUUID
        activityType = draft.activityType
        sportRaw = draft.sport.rawValue
        durationSec = draft.durationSec
        distanceM = draft.distanceM
        ascentM = draft.ascentM
        descentM = draft.descentM
        avgHr = draft.avgHr
        maxHr = draft.maxHr
        energyKcal = draft.energyKcal
        sourceName = draft.sourceName
        deviceName = draft.deviceName
    }

    var sport: Sport {
        get { Sport(rawValue: sportRaw) ?? .other }
        set { sportRaw = newValue.rawValue }
    }

    var avgPaceSecPerKm: Double? {
        Pace.secondsPerKm(distanceM: distanceM, durationSec: durationSec)
    }

    /// Vue valeur de la séance, pour repasser dans les règles de `CoachCore`.
    var draft: WorkoutDraft {
        WorkoutDraft(
            startedAt: startedAt, endedAt: endedAt, healthKitUUID: healthKitUUID,
            activityType: activityType, sport: sport, durationSec: durationSec,
            distanceM: distanceM, ascentM: ascentM, descentM: descentM,
            avgHr: avgHr, maxHr: maxHr, energyKcal: energyKcal,
            sourceName: sourceName, deviceName: deviceName
        )
    }

    /// Complète les champs manquants depuis un nouveau brouillon sans écraser les valeurs connues.
    func merge(_ draft: WorkoutDraft) {
        endedAt = draft.endedAt
        durationSec = draft.durationSec
        activityType = draft.activityType
        healthKitUUID = healthKitUUID ?? draft.healthKitUUID
        distanceM = draft.distanceM ?? distanceM
        ascentM = draft.ascentM ?? ascentM
        descentM = draft.descentM ?? descentM
        avgHr = draft.avgHr ?? avgHr
        maxHr = draft.maxHr ?? maxHr
        energyKcal = draft.energyKcal ?? energyKcal
        sourceName = draft.sourceName ?? sourceName
        deviceName = draft.deviceName ?? deviceName
        syncedAt = nil
    }
}

/// Métriques de récupération par jour civil local.
@Model
final class DailyMetric {
    /// "YYYY-MM-DD" dans le fuseau de l'utilisateur.
    @Attribute(.unique) var day: String
    var hrvMs: Double?
    var restingHr: Double?
    var vo2max: Double?
    var sleepMinutes: Double?
    var steps: Double?
    var syncedAt: Date?

    init(day: String) {
        self.day = day
    }

    var date: Date? { DayKey.date(from: day) }

    var draft: DailyMetricDraft {
        DailyMetricDraft(day: day, hrvMs: hrvMs, restingHr: restingHr, vo2max: vo2max, sleepMinutes: sleepMinutes, steps: steps)
    }
}
