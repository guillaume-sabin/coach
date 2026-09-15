# Coach — app iOS native

SwiftUI · SwiftData · HealthKit · Swift Charts · iOS 18+. Structure conforme au plugin `apple-skills` :
`@Observable` + `@State`/`@Environment` (pas d'`ObservableObject`), `NavigationStack` avec liens par valeur,
`TabView` à trois catégories de contenu, services injectés par protocole, corps de vues sans effets de bord.

```
CoachCore/        paquet Swift pur (Sport, classification, routine, formats, contrat API) + tests Swift Testing
Coach/
  App/            CoachApp (entrée), AppEnvironment (composition des dépendances), RootView (tabs)
  Models/         Workout / DailyMetric (@Model SwiftData), pont vers les brouillons de CoachCore
  Services/
    HealthKit/    HealthDataProviding (protocole), HealthKitService (réel), WorkoutMapper (HKWorkout -> draft)
    Sync/         APIClient (URLSession, protocole), SyncEngine (HealthKit -> SwiftData -> API)
    BackgroundSync      BGAppRefreshTask
  Features/       Workouts (liste, ligne, détail avec courbe FC), Recovery, Settings
  Support/        PreviewData (fournisseur Santé factice)
```

## Tester la logique depuis Windows ou Linux

Le paquet `CoachCore` ne dépend d'aucun framework Apple :

```bash
winget install --id Swift.Toolchain --exact          # une fois (Visual Studio Build Tools requis)
powershell -File apps/ios/CoachCore/test.ps1        # configure SDKROOT et le PATH, puis swift test
```

## Intégration continue

`.github/workflows/ci.yml` exécute à chaque push : tests CoachCore sur Linux, typecheck et fumée de l'API, puis compilation de l'app complète sur un runner macOS avec lancement dans le simulateur iPhone et capture d'écran publiée en artefact. Aucun compte Apple Developer n'est nécessaire pour le simulateur.

## Construire (nécessite un Mac avec Xcode 16+)

```bash
brew install xcodegen
cd apps/ios
xcodegen generate
open Coach.xcodeproj
```

1. Dans le target **Coach** › Signing & Capabilities, choisir votre équipe (`DEVELOPMENT_TEAM` dans `project.yml`).
2. HealthKit et Background Delivery sont déjà déclarés dans `Coach.entitlements` ; le compte Apple Developer doit avoir la capability HealthKit activée pour l'identifiant `com.guillaume.coach`.
3. Lancer sur un **iPhone physique** : le simulateur n'a pas de données Santé réelles.
4. Dans l'app, onglet Réglages : URL de l'API (adresse affichée par `npm run api`) et clé `INGEST_API_KEY`.

## Ce que fait l'app

- Demande l'accès en lecture à Santé, lit les séances par requête ancrée (incrémentale), les métriques journalières (HRV, FC repos, VO₂max, pas, sommeil) et la série FC d'une séance à la demande.
- Applique localement les règles de réconciliation (doublons Strava à moins de 3 min, routine mobilité/étirements) pour afficher la même chose que l'API hors connexion.
- Pousse les nouveautés vers `POST /ingest/app` par lots ; livraison HealthKit en arrière-plan + rafraîchissement périodique.

## Non vérifié

Ce code a été écrit sur Windows sans compilateur Swift. Attendez-vous à quelques erreurs de compilation
à la première ouverture dans Xcode (signatures d'API, isolation d'acteur) ; la structure et la logique sont en place.
