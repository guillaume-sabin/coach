import CoachCore
import SwiftData
import SwiftUI

@main
struct CoachApp: App {
    /// Conteneur d'injection : services HealthKit, API et moteur de synchronisation.
    @State private var environment: AppEnvironment

    private let modelContainer: ModelContainer

    init() {
        do {
            modelContainer = try ModelContainer(for: Workout.self, DailyMetric.self)
        } catch {
            fatalError("Impossible d'ouvrir la base SwiftData : \(error)")
        }
        let env = AppEnvironment.live(modelContainer: modelContainer)
        _environment = State(initialValue: env)
        BackgroundSync.register(environment: env)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .environment(environment.sync)
        }
        .modelContainer(modelContainer)
        .backgroundTask(.appRefresh(BackgroundSync.taskIdentifier)) {
            await BackgroundSync.handleRefresh(environment: environment)
        }
    }
}
