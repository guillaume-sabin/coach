# Coach

Application perso : séances Apple Watch Ultra + planning d'entraînement adaptatif par LLM local.

## Structure

```
apps/api       API Hono + SQLite (drizzle) : ingestion, import, lecture
apps/ios       App iPhone native SwiftUI + HealthKit + SwiftData (build sur Mac, voir apps/ios/README.md)
apps/mobile    App Expo (React Native) : version web
packages/shared  Types zod, mapping des sports, helpers de formatage partagés
_context/      Notes de session, handoffs, échantillons de données
```

## Démarrer

```bash
npm install
npm run api          # http://localhost:3210  (affiche aussi l'IP LAN pour l'iPhone)
npm run web          # app Expo en mode web
```

Copier `apps/api/.env.example` vers `apps/api/.env` et définir `INGEST_API_KEY`.

## Alimenter la base

### 1. Historique complet : export Apple Santé

Sur l'iPhone : Santé → photo de profil → **Exporter toutes les données**. Récupérer `export.zip` sur le PC, puis :

```bash
npm run import:apple -w @coach/api -- "C:\chemin\vers\export.zip"
```

Le fichier `export.xml` est lu en streaming (plusieurs centaines de Mo sans problème). L'import est idempotent : relancer ne crée pas de doublons.

### 2. Synchro automatique : Health Auto Export

Dans l'app iOS Health Auto Export, créer une automatisation de type **REST API** :

- URL : `http://<IP-du-PC>:3210/ingest/health-auto-export`
- En-tête : `x-api-key: <INGEST_API_KEY>`
- Données : workouts + métriques (HRV, FC repos, sommeil, pas, VO2max), format JSON

Le parseur est tolérant aux variations de format ; le payload brut est conservé en colonne JSON pour réinterprétation ultérieure.

### Réconciliation automatique

Après chaque import ou ingestion (et via `npm run reconcile -w @coach/api`) :

- **Doublons inter-sources** : une séance Strava démarrant à moins de 3 min d'une séance de la montre est supprimée (la montre a la FC). Fenêtre : `DUPLICATE_WINDOW_SEC`.
- **Routine quotidienne** : les "Cooldown" de la montre et les "Other" Strava sont la routine mobilité / étirements. La première du jour (fuseau `LOCAL_TZ`, défaut Europe/Paris) devient `mobility`, les suivantes `stretching`. Ces deux sports sont exclus du volume d'entraînement affiché.

## API

| Route | Description |
| --- | --- |
| `GET /health` | ping |
| `GET /stats` | totaux, première/dernière séance, répartition par sport |
| `GET /workouts?limit&offset&from&to&sport` | liste paginée, triée du plus récent |
| `GET /workouts/:id` | détail + payload brut |
| `GET /metrics/daily?from&to` | HRV, FC repos, VO2max, sommeil, pas par jour |
| `POST /ingest/health-auto-export` | cible Health Auto Export (clé requise) |
| `POST /ingest/app` | cible de l'app iOS native : séances normalisées + métriques (clé requise) |
| `POST /import/apple-health` `{ path }` | import d'un export local (clé requise) |

## PWA sur iPhone

1. `npm run web`, puis ouvrir depuis Safari iPhone `http://<IP-du-PC>:8081/?api=http://<IP-du-PC>:3210`
2. Partager → **Sur l'écran d'accueil**. L'URL de l'API est mémorisée et modifiable dans Réglages.

## Tests

Tout est parallélisé : Vitest lance un worker par cœur (l'API reçoit une base SQLite en mémoire par fichier de test),
`swift test --parallel` pour CoachCore, clones de simulateur pour les tests unitaires iOS.

```bash
npm test                 # shared + API + mobile (Vitest) ; npm run test:watch pour itérer
npm run test:coverage    # idem avec couverture (coverage/lcov.info)
npm run test:swift       # CoachCore sur Windows (toolchain Swift winget)
```

| Couche | Outil | Ce qui est couvert |
| --- | --- | --- |
| `packages/shared` | Vitest | classification des sports (fixture partagée avec iOS), allure, formats, schémas zod |
| `apps/api` | Vitest, SQLite `:memory:` | dates/unités Apple, parseurs XML et Health Auto Export sur les échantillons (non-régression), contrat `/ingest/app`, réconciliation (doublons Strava, routine par jour Paris), dépôt, routes HTTP via `app.request` |
| `apps/mobile` | Vitest | formats, résolution de l'URL d'API (`?api=`, localStorage), client HTTP |
| `apps/ios/CoachCore` | Swift Testing | routine, doublons, fusion de relectures, volume, `DayKey`, formats, contrat JSON, même fixture de sports que l'API |
| `apps/ios` (CoachTests) | Swift Testing, SwiftData en mémoire | `SyncEngine` avec doublures HealthKit et API (import, reclassement, envoi par lots, échecs, ancre), modèles, réglages, correspondance HealthKit |
| `apps/ios` (CoachUITests) | XCUITest | parcours des trois onglets, détail, filtre, captures d'écran en artefact |

La fixture `_context/samples/sport-classification-cases.json` est lue par les tests TypeScript **et** Swift :
toute divergence de classification entre l'API et l'app fait échouer la CI.

## Feuille de route

- [x] Phase 1 : socle, ingestion, import, liste et détail des séances, récupération
- [ ] Phase 2 : métriques de charge (ACWR, TRIMP, monotonie), allure ajustée trail, tableau de bord
- [ ] Phase 3 : coach LLM via Ollama (sortie JSON contrainte), plan hebdo régénéré à chaque séance
- [~] Phase 4 : app iOS native SwiftUI écrite (apps/ios), à compiler sur Mac avec un compte Apple Developer
