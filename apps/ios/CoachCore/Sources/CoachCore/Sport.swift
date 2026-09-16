import Foundation

/// Sports normalisés, identiques à `packages/shared` côté API pour que les deux mondes se comprennent.
public enum Sport: String, Codable, CaseIterable, Identifiable, Sendable {
    case running
    case trailRunning = "trail_running"
    case hiking
    case walking
    case cycling
    case swimming
    case strength
    case mobility
    case stretching
    case other

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .running: "Course à pied"
        case .trailRunning: "Trail"
        case .hiking: "Randonnée"
        case .walking: "Marche"
        case .cycling: "Vélo"
        case .swimming: "Natation"
        case .strength: "Renforcement"
        case .mobility: "Mobilité"
        case .stretching: "Étirements"
        case .other: "Autre"
        }
    }

    /// Nom de symbole SF Symbols ; simple chaîne ici pour rester indépendant de SwiftUI.
    public var symbol: String {
        switch self {
        case .running: "figure.run"
        case .trailRunning: "mountain.2.fill"
        case .hiking: "figure.hiking"
        case .walking: "figure.walk"
        case .cycling: "figure.outdoor.cycle"
        case .swimming: "figure.pool.swim"
        case .strength: "dumbbell.fill"
        case .mobility: "figure.flexibility"
        case .stretching: "figure.cooldown"
        case .other: "figure.mixed.cardio"
        }
    }

    /// Sports de routine : suivis, mais exclus du volume d'entraînement.
    public var isRoutine: Bool { self == .mobility || self == .stretching }

    public var usesPace: Bool { self == .running || self == .trailRunning }

    /// Ordre d'affichage des filtres.
    public static let filterOrder: [Sport] = [.running, .trailRunning, .hiking, .cycling, .strength, .mobility, .stretching]
}

public enum SportClassifier {
    /// Seuil trail : dénivelé positif rapporté à la distance.
    public static let trailAscentPerKm: Double = 25

    /// Mapping du type d'activité HealthKit (nom canonique `HKWorkoutActivityType…`) vers un sport.
    public static func sport(forActivityType name: String, distanceM: Double?, ascentM: Double?) -> Sport {
        // Sans espaces : « Cross Training » (Health Auto Export) et « CrossTraining » (HealthKit) se classent pareil.
        let t = name.replacingOccurrences(of: "HKWorkoutActivityType", with: "").lowercased().replacingOccurrences(of: " ", with: "")
        let base: Sport
        if t.contains("trail") {
            base = .trailRunning
        } else if t.contains("run") {
            base = .running
        } else if t.contains("hik") {
            base = .hiking
        } else if t.contains("walk") {
            base = .walking
        } else if t.contains("cycl") || t.contains("bike") {
            base = .cycling
        } else if t.contains("swim") {
            base = .swimming
        } else if t.contains("strength") || t.contains("functional") || t.contains("core") || t.contains("crosstraining") {
            base = .strength
        } else if t == "cooldown" || t.contains("flexibility") || t.contains("mobility") {
            // Guillaume enregistre sa routine du soir en "Cooldown" ; le rang du jour affine ensuite (RoutineClassifier).
            base = .mobility
        } else if t.contains("stretch") {
            base = .stretching
        } else {
            base = .other
        }
        return refineTrail(base, distanceM: distanceM, ascentM: ascentM)
    }

    public static func refineTrail(_ sport: Sport, distanceM: Double?, ascentM: Double?) -> Sport {
        guard sport == .running, let distanceM, let ascentM, distanceM >= 1000 else { return sport }
        return ascentM / (distanceM / 1000) >= trailAscentPerKm ? .trailRunning : sport
    }
}
