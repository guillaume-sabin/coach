import CoachCore
import Foundation

/// Abstraction de HealthKit : une implémentation réelle, une pour les previews/tests.
protocol HealthDataProviding: Sendable {
    var isAvailable: Bool { get }
    func requestAuthorization() async throws
    /// Séances ajoutées depuis l'ancre précédente (nil = tout l'historique). Retourne la nouvelle ancre.
    func fetchWorkouts(since anchor: Data?) async throws -> (drafts: [WorkoutDraft], anchor: Data?)
    /// Métriques journalières agrégées sur l'intervalle.
    func fetchDailyMetrics(from: Date, to: Date) async throws -> [DailyMetricDraft]
    /// Série de fréquence cardiaque d'une séance (pour le détail).
    func heartRateSeries(from: Date, to: Date) async throws -> [HeartRateSample]
    /// Active la livraison en arrière-plan des nouvelles séances ; `onChange` est appelé à chaque ajout.
    func startObservingWorkouts(onChange: @escaping @Sendable () async -> Void) async throws
}

enum HealthError: LocalizedError {
    case notAvailable
    case notAuthorized

    var errorDescription: String? {
        switch self {
        case .notAvailable: "Les données Santé ne sont pas disponibles sur cet appareil."
        case .notAuthorized: "Coach n'a pas l'autorisation de lire vos données Santé. Ouvrez Réglages › Santé › Accès aux données."
        }
    }
}
