import Foundation

/// Contrat JSON avec `apps/api` (route `POST /ingest/app`). Les dates sont encodées en ISO 8601.

public struct EmptyBody: Encodable, Sendable {
    public init() {}
}

public struct HealthResponse: Decodable, Sendable {
    public var ok: Bool
}

public struct IngestPayload: Encodable, Sendable {
    public var workouts: [WorkoutPayload]
    public var metrics: [DailyMetricPayload]

    public init(workouts: [WorkoutPayload], metrics: [DailyMetricPayload]) {
        self.workouts = workouts
        self.metrics = metrics
    }
}

public struct WorkoutPayload: Encodable, Sendable {
    public var source = "ios_app"
    public var sourceId: String?
    public var sport: String
    public var activityType: String
    public var startedAt: Date
    public var endedAt: Date
    public var durationSec: Double
    public var distanceM: Double?
    public var ascentM: Double?
    public var descentM: Double?
    public var avgHr: Double?
    public var maxHr: Double?
    public var energyKcal: Double?
    public var avgPaceSecPerKm: Double?
    public var deviceName: String?

    public init(draft d: WorkoutDraft) {
        sourceId = d.healthKitUUID?.uuidString
        sport = d.sport.rawValue
        activityType = d.activityType
        startedAt = d.startedAt
        endedAt = d.endedAt
        durationSec = d.durationSec
        distanceM = d.distanceM
        ascentM = d.ascentM
        descentM = d.descentM
        avgHr = d.avgHr
        maxHr = d.maxHr
        energyKcal = d.energyKcal
        avgPaceSecPerKm = d.avgPaceSecPerKm
        deviceName = d.sourceName ?? d.deviceName
    }
}

public struct DailyMetricPayload: Encodable, Sendable {
    public var date: String
    public var hrvMs: Double?
    public var restingHr: Double?
    public var vo2max: Double?
    public var sleepMinutes: Double?
    public var steps: Double?

    public init(draft d: DailyMetricDraft) {
        date = d.day
        hrvMs = d.hrvMs
        restingHr = d.restingHr
        vo2max = d.vo2max
        sleepMinutes = d.sleepMinutes
        steps = d.steps
    }
}

public struct IngestResponse: Decodable, Sendable {
    public var ok: Bool
    public var workouts: Int
    public var metrics: Int
}

public enum APIJSON {
    public static var encoder: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }

    public static var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }
}
