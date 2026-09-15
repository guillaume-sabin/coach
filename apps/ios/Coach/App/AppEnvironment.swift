import CoachCore
import Foundation
import Observation
import SwiftData

/// Point unique de composition des dépendances. Les vues n'instancient jamais un service.
@Observable
@MainActor
final class AppEnvironment {
    let health: any HealthDataProviding
    let api: any APIClient
    let settings: AppSettings
    let sync: SyncEngine

    init(health: any HealthDataProviding, api: any APIClient, settings: AppSettings, modelContainer: ModelContainer) {
        self.health = health
        self.api = api
        self.settings = settings
        self.sync = SyncEngine(health: health, api: api, settings: settings, modelContainer: modelContainer)
    }

    static func live(modelContainer: ModelContainer) -> AppEnvironment {
        let settings = AppSettings()
        return AppEnvironment(
            health: HealthKitService(),
            api: URLSessionAPIClient(configuration: settings),
            settings: settings,
            modelContainer: modelContainer
        )
    }

    /// Environnement pour les previews et les tests : aucune dépendance système.
    static func preview(modelContainer: ModelContainer) -> AppEnvironment {
        AppEnvironment(
            health: PreviewHealthData(),
            api: NoOpAPIClient(),
            settings: AppSettings(defaults: UserDefaults(suiteName: "preview") ?? .standard),
            modelContainer: modelContainer
        )
    }
}

/// Réglages persistés. `UserDefaults` sert de stockage : ce sont des préférences, pas le modèle.
@Observable
@MainActor
final class AppSettings: APIConfiguration {
    private let defaults: UserDefaults

    var apiBaseURL: URL {
        didSet { defaults.set(apiBaseURL.absoluteString, forKey: Keys.apiBaseURL) }
    }
    var apiKey: String {
        didSet { defaults.set(apiKey, forKey: Keys.apiKey) }
    }
    var syncEnabled: Bool {
        didSet { defaults.set(syncEnabled, forKey: Keys.syncEnabled) }
    }
    var lastSyncAt: Date? {
        didSet { defaults.set(lastSyncAt, forKey: Keys.lastSyncAt) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        apiBaseURL = defaults.string(forKey: Keys.apiBaseURL).flatMap(URL.init) ?? URL(string: "http://192.168.1.10:3210")!
        apiKey = defaults.string(forKey: Keys.apiKey) ?? ""
        syncEnabled = defaults.object(forKey: Keys.syncEnabled) as? Bool ?? true
        lastSyncAt = defaults.object(forKey: Keys.lastSyncAt) as? Date
    }

    private enum Keys {
        static let apiBaseURL = "settings.apiBaseURL"
        static let apiKey = "settings.apiKey"
        static let syncEnabled = "settings.syncEnabled"
        static let lastSyncAt = "settings.lastSyncAt"
    }
}
