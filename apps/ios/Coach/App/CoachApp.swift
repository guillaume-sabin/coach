import CoachCore
import SwiftData
import SwiftUI

@main
struct CoachApp: App {
    /// Conteneur d'injection : services HealthKit, API et moteur de synchronisation.
    @State private var environment: AppEnvironment

    private let modelContainer: ModelContainer

    init() {
        switch LaunchMode.current {
        case .normal:
            do {
                modelContainer = try ModelContainer(for: Workout.self, DailyMetric.self)
            } catch {
                fatalError("Impossible d'ouvrir la base SwiftData : \(error)")
            }
            let env = AppEnvironment.live(modelContainer: modelContainer)
            _environment = State(initialValue: env)
            BackgroundSync.register(environment: env)

        case .uiTests:
            // Données factices déterministes, aucun accès à Santé ni au réseau : les tests XCUITest pilotent l'UI.
            modelContainer = PreviewData.container()
            _environment = State(initialValue: AppEnvironment.preview(modelContainer: modelContainer))

        case .unitTests:
            // L'app n'est qu'un hôte pour le bundle de tests : base en mémoire, aucun service système.
            modelContainer = try! ModelContainer(for: Workout.self, DailyMetric.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
            _environment = State(initialValue: AppEnvironment.preview(modelContainer: modelContainer))
        }
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
