# Travailler sur le projet

## Lancer

```bash
npm install
npm run api          # API sur http://localhost:3210, affiche aussi l'adresse Wi-Fi pour l'iPhone
npm run web          # PWA Expo (web)
```

Copier `apps/api/.env.example` en `.env` et choisir une `INGEST_API_KEY` : sans elle, toute écriture est refusée.

Importer l'historique :

```bash
npm run import:apple -w @coach/api -- "C:\chemin\vers\export.zip"
```

## Tester

```bash
npm test             # TypeScript : shared, API, mobile (parallèle)
npm run test:swift   # CoachCore sur Windows (toolchain Swift installé par winget)
```

L'app iOS (CoachTests, CoachUITests) ne se teste que sur macOS : la CI s'en charge à chaque push.
Détail dans [apps/ios/README.md](../apps/ios/README.md).

## Livrer

| Quoi | Comment |
| --- | --- |
| Vérifier | pousser sur `main` : la CI lance quatre jobs en parallèle, tout doit être vert |
| Installer sur l'iPhone | onglet Actions › TestFlight › Run workflow, après avoir saisi les quatre secrets Apple (procédure dans `apps/ios/README.md`) |
| Suivre une session | écrire un handoff dans `_context/handoffs/` : fait, reste à faire, surprises |

## Ajouter une règle métier

1. Écrire le cas dans `_context/samples/sport-classification-cases.json` si c'est une classification, sinon un test
   dans `packages/shared` **et** dans `CoachCore`.
2. Implémenter dans `packages/shared/src/index.ts` (ou `apps/api/src/db/reconcile.ts`) puis dans
   `apps/ios/CoachCore/Sources/CoachCore`.
3. `npm test` et `npm run test:swift` : les deux doivent être verts avant de pousser.

## Repères

- Les échantillons de `_context/samples/` sont des contrats testés : ne pas les modifier sans intention.
- Les secrets ne vont que dans `.env` (ignoré par git) et dans GitHub Secrets. Jamais dans le code ni dans une conversation.
- Le fuseau de référence est Europe/Paris ; tout ce qui parle de « jour » l'utilise.
