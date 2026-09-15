import CoachCore
import Foundation
import HealthKit

/// Transforme un `HKWorkout` en `WorkoutDraft`. Pur, testable, sans accès au store.
enum WorkoutMapper {
    static func draft(from w: HKWorkout) -> WorkoutDraft {
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let hr = w.statistics(for: HKQuantityType(.heartRate))
        let distance = [HKQuantityType(.distanceWalkingRunning), HKQuantityType(.distanceCycling), HKQuantityType(.distanceSwimming)]
            .compactMap { w.statistics(for: $0)?.sumQuantity()?.doubleValue(for: .meter()) }
            .first
        let energy = w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
        let ascent = (w.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity)?.doubleValue(for: .meter())
        let descent = (w.metadata?[HKMetadataKeyElevationDescended] as? HKQuantity)?.doubleValue(for: .meter())
        let activityType = canonicalName(w.workoutActivityType)

        return WorkoutDraft(
            startedAt: w.startDate,
            endedAt: w.endDate,
            healthKitUUID: w.uuid,
            activityType: activityType,
            sport: SportClassifier.sport(forActivityType: activityType, distanceM: distance, ascentM: ascent),
            durationSec: w.duration,
            distanceM: distance,
            ascentM: ascent,
            descentM: descent,
            avgHr: hr?.averageQuantity()?.doubleValue(for: bpm),
            maxHr: hr?.maximumQuantity()?.doubleValue(for: bpm),
            energyKcal: energy,
            sourceName: w.sourceRevision.source.name,
            deviceName: w.device?.name
        )
    }

    /// Nom canonique identique à celui de l'export XML Apple Santé (`HKWorkoutActivityTypeRunning`…),
    /// pour que l'API traite les deux sources de la même façon.
    static func canonicalName(_ type: HKWorkoutActivityType) -> String {
        let suffix: String
        switch type {
        case .running: suffix = "Running"
        case .walking: suffix = "Walking"
        case .hiking: suffix = "Hiking"
        case .cycling: suffix = "Cycling"
        case .swimming: suffix = "Swimming"
        case .functionalStrengthTraining: suffix = "FunctionalStrengthTraining"
        case .traditionalStrengthTraining: suffix = "TraditionalStrengthTraining"
        case .coreTraining: suffix = "CoreTraining"
        case .crossTraining: suffix = "CrossTraining"
        case .cooldown: suffix = "Cooldown"
        case .flexibility: suffix = "Flexibility"
        case .yoga: suffix = "Yoga"
        case .stairs: suffix = "Stairs"
        case .rowing: suffix = "Rowing"
        case .elliptical: suffix = "Elliptical"
        case .swimBikeRun: suffix = "SwimBikeRun"
        case .underwaterDiving: suffix = "UnderwaterDiving"
        case .other: suffix = "Other"
        default: suffix = "Raw\(type.rawValue)"
        }
        return "HKWorkoutActivityType\(suffix)"
    }
}
