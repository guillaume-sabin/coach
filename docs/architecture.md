# Architecture

## Aujourd'hui

```mermaid
flowchart LR
    subgraph Sources["Sources de données"]
        W[Apple Watch Ultra] --> HK[(HealthKit<br/>sur l'iPhone)]
        HK --> XML[Export Apple Santé<br/>export.zip]
        HK --> HAE[Health Auto Export<br/>JSON automatique]
        HK --> IOS[App iOS Coach<br/>SwiftUI · SwiftData]
    end

    subgraph Serveur["PC Windows : apps/api"]
        API[API Hono<br/>/ingest · /workouts · /metrics]
        NORM[Normalisation<br/>+ réconciliation]
        DB[(SQLite<br/>workouts · daily_metrics)]
        API --> NORM --> DB
        DB --> API
    end

    XML -- import CLI --> API
    HAE -- POST /ingest/health-auto-export --> API
    IOS -- POST /ingest/app --> API

    subgraph Clients["Consultation"]
        PWA[PWA Expo web<br/>Safari iPhone / PC]
        IOS
    end
    API -- JSON --> PWA

    SHARED[/packages/shared<br/>types + règles TS/] -.- API
    SHARED -.- PWA
    CORE[/CoachCore<br/>règles Swift/] -.- IOS
    SHARED <-. même fixture de tests .-> CORE
```

Trois idées à retenir :

1. **L'API est la source de vérité.** Tout ce qui écrit passe par elle et par la réconciliation (`reconcile.ts`).
2. **L'app iOS est autonome.** Elle applique localement les mêmes règles (`CoachCore`) pour afficher un résultat
   identique sans réseau, puis pousse vers l'API par lots. Une fixture partagée garantit que les deux implémentations
   classent pareil.
3. **Le brut est conservé.** Chaque séance garde son payload d'origine en colonne JSON : on peut recalculer sans
   réimporter.

## Demain : le coach

```mermaid
flowchart LR
    DB[(SQLite)] --> LOAD[Charge d'entraînement<br/>TRIMP · ACWR · monotonie]
    DB --> RECUP[Récupération<br/>HRV · FC repos · sommeil]
    LOAD & RECUP --> CTX[Contexte structuré<br/>JSON compact]
    OBJ[Objectifs & contraintes<br/>course visée, jours dispo] --> CTX
    CTX --> LLM[LLM local via Ollama<br/>modèle 3–4 B, sortie JSON contrainte]
    LLM --> PLAN[(Plan hebdo versionné)]
    PLAN --> IOS[App iOS] & PWA[PWA]
    IOS -. séance réalisée .-> DB
```

Direction fixée :

- **Les calculs restent déterministes et testés** (charge, tendances) ; le LLM ne fait que raisonner sur un contexte
  déjà chiffré et produire un plan au format imposé. Il ne voit jamais la base brute.
- **Le plan est une donnée comme une autre** : versionné en base, régénéré après chaque séance, comparable d'une
  version à l'autre.
- **Le LLM tourne sur le PC** (RTX 3050 Ti, 4 Go de VRAM) : modèles de 3 à 4 milliards de paramètres, quantifiés.
  Aucune donnée de santé ne quitte le réseau local.

## Couches et responsabilités

| Couche | Emplacement | Ce qu'elle fait | Ce qu'elle ne fait pas |
| --- | --- | --- | --- |
| Contrat | `packages/shared`, `CoachCore/APIContract.swift` | types, enum `Sport`, schémas zod, payloads | accès réseau ou base |
| Règles métier | `packages/shared`, `apps/api/src/db/reconcile.ts`, `CoachCore` | classification, trail, doublons, routine, formats | interface |
| Persistance | `apps/api/src/db`, `apps/ios/Coach/Models` | SQLite via drizzle ; SwiftData | logique métier |
| Ingestion | `apps/api/src/import` | parseurs XML / JSON tolérants, dates et unités Apple | décisions métier (déléguées aux règles) |
| Interface | `apps/mobile`, `apps/ios/Coach/Features` | affichage, navigation, réglages | calculs (délégués à shared / CoachCore) |
