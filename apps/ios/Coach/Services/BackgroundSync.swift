import CoachCore
import BackgroundTasks
import Foundation

/// Rafraîchissement périodique en arrière-plan, en complément de la livraison HealthKit immédiate.
/// Le système choisit l'instant réel ; on redemande un créneau après chaque exécution.
enum BackgroundSync {
    static let taskIdentifier = "com.guillaumesabin.coach.sync"

    @MainActor
    static func register(environment: AppEnvironment) {
        schedule()
    }

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 4 * 3600)
        try? BGTaskScheduler.shared.submit(request)
    }

    @MainActor
    static func handleRefresh(environment: AppEnvironment) async {
        schedule()
        await environment.sync.refresh()
    }
}
