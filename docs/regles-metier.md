# Règles métier

Ces règles sont implémentées deux fois (TypeScript et Swift) et vérifiées par la même fixture
`_context/samples/sport-classification-cases.json`. Toute modification doit être faite des deux côtés.

## 1. Identité d'une séance

Une séance est identifiée par **son instant de début** (`startedAt`, UTC). Quelle que soit la source (export XML,
Health Auto Export, app iOS), la même séance retombe sur la même ligne et les champs manquants sont complétés,
jamais écrasés par un vide.

## 2. Sport normalisé

Le type d'activité brut (`HKWorkoutActivityTypeRunning`, `Outdoor Run`, `Cooldown`…) est ramené à dix sports :
course, trail, randonnée, marche, vélo, natation, renforcement, mobilité, étirements, autre.

**Heuristique trail** : une course d'au moins 1 km avec **25 m de dénivelé positif par km ou plus** devient du trail.
Un libellé contenant « trail » l'emporte toujours.

## 3. Doublons entre sources

Strava réécrit parfois dans Santé une séance déjà enregistrée par la montre, décalée de quelques secondes.
Deux séances de sources différentes qui démarrent à **moins de 180 s** l'une de l'autre sont la même : on garde
celle de la montre (elle a la fréquence cardiaque), on supprime l'autre. La borne est exclue : 180 s exactement,
ce sont deux séances.

## 4. La routine du soir

Guillaume enregistre chaque soir deux séances « Cooldown » sur la montre : la première est de la **mobilité**,
la seconde des **étirements**. Le rang est calculé par **jour civil à Paris** (Europe/Paris), pas par jour UTC.
Un « Other » venant de Strava non apparié compte dans cette routine ; un « Other » venant de la montre non.

Ces deux sports sont suivis mais **exclus du volume d'entraînement** (résumé 7 jours, futurs calculs de charge).

## 5. Métriques journalières

| Métrique | Agrégation par jour |
| --- | --- |
| HRV, FC repos | moyenne des échantillons |
| VO₂max | dernière valeur |
| Pas | somme ; la montre est préférée à l'iPhone quand les deux existent |
| Sommeil | somme des phases « Asleep » uniquement, rattachée au **jour du réveil** ; « InBed » ignoré |

## 6. Dates et unités

Apple écrit `2026-09-13 07:02:11 +0200` : on stocke l'ISO UTC et on garde le jour local de la source pour les
agrégats journaliers. Les unités (`km`, `mi`, `cm`, `kJ`, `hr`…) sont converties en mètres, kcal, secondes.
