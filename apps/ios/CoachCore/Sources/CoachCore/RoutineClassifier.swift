import Foundation

/// Règles métier partagées avec l'API (`apps/api/src/db/reconcile.ts`), appliquées localement
/// pour que l'app affiche la même chose que le serveur, y compris hors connexion.
public enum RoutineClassifier {
    /// Deux séances de sources différentes qui démarrent à moins de cette fenêtre sont la même séance.
    public static let duplicateWindow: TimeInterval = 180

    /// Supprime les doublons inter-sources en gardant la version montre (elle a la fréquence cardiaque).
    public static func dedupe(_ drafts: [WorkoutDraft]) -> [WorkoutDraft] {
        let sorted = drafts.sorted { $0.startedAt < $1.startedAt }
        var kept: [WorkoutDraft] = []
        for d in sorted {
            if let i = kept.lastIndex(where: { abs($0.startedAt.timeIntervalSince(d.startedAt)) < duplicateWindow }) {
                let existing = kept[i]
                if d.isFromWatch && !existing.isFromWatch {
                    kept[i] = d
                } else if !existing.isFromWatch && d.avgHr != nil && existing.avgHr == nil {
                    kept[i] = d
                }
            } else {
                kept.append(d)
            }
        }
        return kept
    }

    /// La routine du soir : première séance "Cooldown" (ou "Other" tiers) du jour = mobilité, suivantes = étirements.
    public static func classifyRoutine(_ drafts: [WorkoutDraft]) -> [WorkoutDraft] {
        var rankByDay: [String: Int] = [:]
        return drafts.sorted { $0.startedAt < $1.startedAt }.map { d in
            guard isRoutineCandidate(d) else { return d }
            let day = DayKey.key(for: d.startedAt)
            let rank = (rankByDay[day] ?? 0) + 1
            rankByDay[day] = rank
            var out = d
            out.sport = rank == 1 ? .mobility : .stretching
            return out
        }
    }

    public static func isRoutineCandidate(_ d: WorkoutDraft) -> Bool {
        if d.sport.isRoutine { return true }
        if d.activityType.hasSuffix("Cooldown") { return true }
        return d.activityType.hasSuffix("TypeOther") && !d.isFromWatch
    }

    /// Volume d'entraînement sur une fenêtre glissante, routine exclue.
    public static func trainingVolume(_ drafts: [WorkoutDraft], since: Date) -> TrainingVolume {
        drafts
            .filter { $0.startedAt >= since && !$0.sport.isRoutine }
            .reduce(into: TrainingVolume()) { acc, w in
                acc.durationSec += w.durationSec
                acc.distanceM += w.distanceM ?? 0
                acc.ascentM += w.ascentM ?? 0
                acc.count += 1
            }
    }
}

public struct TrainingVolume: Equatable, Sendable {
    public var durationSec: Double = 0
    public var distanceM: Double = 0
    public var ascentM: Double = 0
    public var count: Int = 0

    public init() {}
}
