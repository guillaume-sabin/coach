# Feuille de route

## Fait

- **Phase 1 : socle.** API, import de l'historique (2 549 séances lues, 1 808 après réconciliation), Health Auto
  Export, PWA, app iOS native (séances, détail avec courbe FC, récupération, réglages, synchro en arrière-plan).
- **Qualité.** 257 tests parallèles sur cinq couches, CI à quatre jobs, pipeline TestFlight prêt (secrets Apple à saisir).

## Prochaine étape : Phase 2, la charge d'entraînement

Objectif : chiffrer ce que le corps encaisse, avant de demander quoi que ce soit à un LLM.

| Indicateur | Définition retenue | Où |
| --- | --- | --- |
| TRIMP par séance | durée × intensité FC (Banister), FC max et repos issues des métriques | `shared` + `CoachCore` |
| Charge aiguë / chronique (ACWR) | somme 7 jours / moyenne 28 jours, routine exclue | idem |
| Monotonie et contrainte (Foster) | moyenne / écart-type hebdo ; charge × monotonie | idem |
| Allure ajustée trail | allure équivalente plat à partir du dénivelé | idem |
| Tendance récupération | HRV et FC repos vs. moyenne 30 jours | idem |

Livrables : route `GET /load` et écran « Charge » dans les deux clients, avec les mêmes chiffres partout.
Les formules sont testées sur des cas connus avant tout affichage.

## Ensuite : Phase 3, le coach local

1. Installer Ollama sur le PC ; retenir un modèle 3–4 B quantifié (4 Go de VRAM).
2. Construire le **contexte** : indicateurs de la phase 2, objectifs et jours disponibles saisis dans Réglages,
   dernières séances résumées.
3. Imposer un **schéma JSON de plan** (jours, type de séance, durée, intensité cible, justification courte) et
   valider la réponse ; réessayer ou dégrader proprement si le modèle sort du cadre.
4. Stocker chaque plan en base, régénérer après chaque séance, afficher l'écart prévu / réalisé.

## Plus tard, si utile

- Notifications iOS (« séance du jour ») et widget.
- Import des itinéraires GPX de l'export pour les profils de dénivelé.
- Sauvegarde automatique de la base.
- Export du plan vers le calendrier.

## Ce qu'on ne fera pas

- Pas d'écriture dans Santé.
- Pas d'hébergement cloud des données de santé : tout reste sur le réseau local.
- Pas de multi-utilisateur : c'est l'outil d'une personne.
