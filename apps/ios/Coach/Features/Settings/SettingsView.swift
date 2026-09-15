import CoachCore
import SwiftUI

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(SyncEngine.self) private var sync
    @State private var urlText = ""
    @State private var connectionStatus: String?
    @State private var confirmResync = false

    var body: some View {
        @Bindable var settings = env.settings
        NavigationStack {
            Form {
                Section {
                    TextField("http://192.168.1.10:3210", text: $urlText)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(saveURL)
                    SecureField("Clé d'API (INGEST_API_KEY)", text: $settings.apiKey)
                    Toggle("Envoyer vers l'API", isOn: $settings.syncEnabled)
                    Button("Tester la connexion") { Task { await testConnection() } }
                    if let connectionStatus {
                        Text(connectionStatus).font(.footnote).foregroundStyle(.secondary)
                    }
                } header: {
                    Text("API sur le PC")
                } footer: {
                    Text("L'API affiche son adresse locale au démarrage. L'iPhone doit être sur le même Wi‑Fi.")
                }

                Section("Synchronisation") {
                    LabeledContent("Dernière synchro", value: settings.lastSyncAt.map { $0.formatted(.relative(presentation: .named)) } ?? "jamais")
                    LabeledContent("En attente d'envoi", value: "\(sync.pendingPush)")
                    Button("Synchroniser maintenant") { Task { await sync.refresh() } }
                        .disabled(sync.isBusy)
                    Button("Relire tout l'historique Santé", role: .destructive) { confirmResync = true }
                        .disabled(sync.isBusy)
                }

                Section("Données") {
                    Text("Coach lit uniquement Santé et n'y écrit rien. Les séances sont stockées sur l'iPhone puis envoyées à votre propre API.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Réglages")
            .onAppear { urlText = settings.apiBaseURL.absoluteString }
            .confirmationDialog("Relire tout l'historique ?", isPresented: $confirmResync, titleVisibility: .visible) {
                Button("Relire", role: .destructive) { Task { await sync.fullResync() } }
            } message: {
                Text("Toutes les séances Santé seront relues et renvoyées à l'API. Aucune donnée n'est supprimée.")
            }
        }
    }

    private func saveURL() {
        guard let url = URL(string: urlText.trimmingCharacters(in: .whitespaces)), url.scheme != nil else {
            connectionStatus = "URL invalide"
            return
        }
        env.settings.apiBaseURL = url
    }

    private func testConnection() async {
        saveURL()
        connectionStatus = "Test…"
        switch await sync.testConnection() {
        case .success: connectionStatus = "✅ API joignable"
        case let .failure(error): connectionStatus = "❌ \(error.localizedDescription)"
        }
    }
}

#Preview {
    let container = PreviewData.container()
    let env = AppEnvironment.preview(modelContainer: container)
    SettingsView().environment(env).environment(env.sync)
}
