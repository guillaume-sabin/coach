# Coach : documentation

Coach récupère les séances et les données de récupération de l'Apple Watch Ultra de Guillaume, les normalise, puis
(bientôt) demande à un LLM local de proposer un plan d'entraînement qui s'adapte à ce qui a vraiment été fait.

Cinq pages, à lire dans l'ordre ou à la carte. Chacune tient en moins de cinq minutes.

| Page | Question à laquelle elle répond |
| --- | --- |
| [Architecture](architecture.md) | Quelles briques existent, comment elles se parlent, vers quoi on va ? |
| [Règles métier](regles-metier.md) | Comment une séance brute devient une séance « propre » ? |
| [Décisions](decisions.md) | Pourquoi ces choix techniques et pas d'autres ? |
| [Feuille de route](feuille-de-route.md) | Que construit-on ensuite, et dans quel ordre ? |
| [Travailler sur le projet](travailler.md) | Comment lancer, tester, livrer ? |

## En trente secondes

- **Trois façons d'alimenter la base** : l'export complet Apple Santé (historique), l'app Health Auto Export
  (automatique, sans code), l'app iOS native Coach (la cible à terme, lit HealthKit directement).
- **Une API TypeScript** (Hono + SQLite) qui reçoit, normalise, dédoublonne et sert les données.
- **Deux clients** : une PWA (Expo web) et l'app iOS SwiftUI, qui affichent la même chose.
- **Une logique métier écrite deux fois, testée contre la même fixture** : TypeScript côté serveur, Swift côté
  iPhone, pour que l'app fonctionne hors connexion sans jamais diverger du serveur.
- **Tout est testé et la CI est verte** : 257 tests répartis sur Linux, Node et macOS, exécutés en parallèle.

## Conventions du dépôt

- Français partout dans les textes, commentaires et messages de commit ; identifiants de code en anglais.
- Un handoff par session de travail dans `../_context/handoffs/` : ce qui a été fait, ce qui reste, ce qui a surpris.
- Les échantillons de `../_context/samples/` sont des **contrats** : les modifier casse volontairement des tests.
