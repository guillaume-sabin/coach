import Foundation

/// Séance telle que lue depuis la source (HealthKit), avant persistance. Valeur pure, testable partout.
public struct WorkoutDraft: Sendable, Equatable, Codable {
    public var startedAt: Date
    public var endedAt: Date
    public var healthKitUUID: UUID?
    public var activityType: String
    public var sport: Sport
    public var durationSec: Double
    public var distanceM: Double?
    public var ascentM: Double?
    public var descentM: Double?
    public var avgHr: Double?
    public var maxHr: Double?
    public var energyKcal: Double?
    public var sourceName: String?
    public var deviceName: String?

    public init(
        startedAt: Date, endedAt: Date, healthKitUUID: UUID? = nil, activityType: String, sport: Sport,
        durationSec: Double, distanceM: Double? = nil, ascentM: Double? = nil, descentM: Double? = nil,
        avgHr: Double? = nil, maxHr: Double? = nil, energyKcal: Double? = nil,
        sourceName: String? = nil, deviceName: String? = nil
    ) {
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.healthKitUUID = healthKitUUID
        self.activityType = activityType
        self.sport = sport
        self.durationSec = durationSec
        self.distanceM = distanceM
        self.ascentM = ascentM
        self.descentM = descentM
        self.avgHr = avgHr
        self.maxHr = maxHr
        self.energyKcal = energyKcal
        self.sourceName = sourceName
        self.deviceName = deviceName
    }

    /// Vient de la montre (par opposition à une app tierce comme Strava qui réécrit dans Santé).
    public var isFromWatch: Bool {
        (sourceName ?? "").localizedCaseInsensitiveContains("watch")
            || (deviceName ?? "").localizedCaseInsensitiveContains("watch")
    }

    public var avgPaceSecPerKm: Double? {
        Pace.secondsPerKm(distanceM: distanceM, durationSec: durationSec)
    }
}

public enum Pace {
    public static func secondsPerKm(distanceM: Double?, durationSec: Double) -> Double? {
        guard let distanceM, distanceM >= 100, durationSec > 0 else { return nil }
        return durationSec / (distanceM / 1000)
    }
}

/// Métriques de récupération d'un jour civil local.
public struct DailyMetricDraft: Sendable, Equatable, Codable {
    public var day: String
    public var hrvMs: Double?
    public var restingHr: Double?
    public var vo2max: Double?
    public var sleepMinutes: Double?
    public var steps: Double?

    public init(day: String, hrvMs: Double? = nil, restingHr: Double? = nil, vo2max: Double? = nil, sleepMinutes: Double? = nil, steps: Double? = nil) {
        self.day = day
        self.hrvMs = hrvMs
        self.restingHr = restingHr
        self.vo2max = vo2max
        self.sleepMinutes = sleepMinutes
        self.steps = steps
    }
}

public struct HeartRateSample: Sendable, Identifiable, Equatable {
    public var id: Date { date }
    public var date: Date
    public var bpm: Double

    public init(date: Date, bpm: Double) {
        self.date = date
        self.bpm = bpm
    }
}

/// Clé de jour civil "YYYY-MM-DD" dans le fuseau de l'utilisateur.
public enum DayKey {
    /// Fuseau utilisé pour découper les jours. Modifiable dans les tests pour des résultats déterministes.
    nonisolated(unsafe) public static var timeZone: TimeZone = .autoupdatingCurrent

    public static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        return c
    }

    public static func key(for date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    public static func date(from key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}
