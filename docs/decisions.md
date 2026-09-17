# Décisions

Format court : contexte, décision, conséquence. Une décision se remplace, elle ne s'efface pas.

## D1. Un monorepo TypeScript pour l'API et le web, une app iOS native à côté

Pas de Mac au départ, donc Expo/React Native + PWA pour avoir vite quelque chose sur l'iPhone.
HealthKit n'étant lisible que par une app native, l'app SwiftUI a été ajoutée (plugin `apple-skills`), sans jeter
l'existant : la PWA reste le client « PC » et de secours.
**Conséquence** : deux implémentations des règles métier, tenues alignées par une fixture commune et la CI.

## D2. SQLite plutôt qu'une base NoSQL

Question posée : « une base NoSQL ne serait-elle pas plus judicieuse ? ». Les données sont tabulaires (une ligne
par séance, une par jour), interrogées par plage de dates et agrégées ; c'est le terrain du SQL. Le brut variable
est gardé dans une colonne JSON. Un seul fichier, zéro service à administrer.
**Conséquence** : requêtes simples, transactions pour l'import en masse, sauvegarde par copie de fichier.

## D3. La réconciliation vit dans l'API, après chaque écriture

Doublons et routine dépendent de l'ensemble des séances d'un jour, pas d'une séance isolée. Les passes tournent
donc après chaque import ou ingestion, dans une transaction, et sont idempotentes.
**Conséquence** : n'importe quelle source peut arriver dans n'importe quel ordre ; le résultat converge.

## D4. Logique pure isolée dans des paquets sans dépendance système

`packages/shared` (zod uniquement) et `CoachCore` (Foundation uniquement). C'est ce qui permet de tester le Swift
sur Windows et Linux, et de brancher les futurs calculs de charge sans toucher aux interfaces.
**Conséquence** : les vues et les services n'ont pas de logique à tester ; les tests d'app se concentrent sur
l'orchestration (`SyncEngine`) avec des doublures.

## D5. Sans Mac : compilation, tests et TestFlight délégués à GitHub Actions

Runner macOS pour compiler, exécuter les tests unitaires et d'interface dans le simulateur, et signer dans le cloud
Apple via une clé App Store Connect. Les secrets ne transitent que par GitHub Secrets.
**Conséquence** : un aller-retour CI de 15 à 25 minutes pour tout ce qui touche l'app ; d'où l'importance de
`CoachCore` testable en local en quelques secondes.

## D6. Tests parallèles par construction

Chaque test possède ses propres ressources : base SQLite en mémoire par fichier (Vitest en processus séparés),
fuseau passé explicitement (CoachCore), `ModelContainer` et `UserDefaults` dédiés par test (CoachTests).
**Conséquence** : aucun état partagé, donc aucun ordre imposé ; les suites s'exécutent en parallèle sur toutes
les plateformes.

## D7. Le LLM raisonnera sur des chiffres, pas sur des données brutes

Voir [Architecture › Demain](architecture.md#demain--le-coach). Charge et récupération sont calculées de façon
déterministe et testée ; le modèle reçoit un contexte compact et doit répondre dans un schéma JSON imposé.
**Conséquence** : un petit modèle local suffit, les résultats sont explicables et rejouables.
