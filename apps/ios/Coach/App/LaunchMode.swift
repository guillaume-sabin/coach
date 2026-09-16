import Foundation

/// Contexte de lancement : l'app choisit ses dépendances (réelles ou factices) une seule fois, ici.
enum LaunchMode {
    case normal
    /// Lancée par XCUITest avec `--ui-testing` : données de démonstration, pas de Santé ni de réseau.
    case uiTests
    /// Hôte du bundle de tests unitaires `CoachTests` : aucun service système ne doit démarrer.
    case unitTests

    static var current: LaunchMode {
        let info = ProcessInfo.processInfo
        if info.arguments.contains("--ui-testing") { return .uiTests }
        if info.environment["XCTestConfigurationFilePath"] != nil || info.environment["XCTestBundlePath"] != nil { return .unitTests }
        return .normal
    }
}
