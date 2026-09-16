import CoachCore
import SwiftUI

/// Trois sections de contenu de premier niveau (règle HIG : des catégories, pas des actions).
struct RootView: View {
    @Environment(SyncEngine.self) private var sync

    var body: some View {
        TabView {
            Tab("Séances", systemImage: "figure.run") {
                WorkoutsView()
            }
            Tab("Récupération", systemImage: "bed.double.fill") {
                RecoveryView()
            }
            Tab("Réglages", systemImage: "gearshape") {
                SettingsView()
            }
        }
        .task {
            // Première ouverture : on demande l'accès à Santé puis on synchronise.
            await sync.bootstrapIfNeeded()
        }
    }
}

#Preview {
    let container = PreviewData.container()
    let env = AppEnvironment.preview(modelContainer: container)
    RootView()
        .environment(env)
        .environment(env.sync)
        .modelContainer(container)
}
