/**
 * Exécuté avant chaque fichier de test de l'API, avant tout import du code testé.
 * Chaque fichier tourne dans son propre processus (pool `forks`) : la base `:memory:` est donc
 * privée au fichier et les fichiers peuvent s'exécuter en parallèle sans se marcher dessus.
 */
process.env.DATABASE_PATH = ":memory:";
process.env.INGEST_API_KEY = "test-key";
process.env.LOCAL_TZ = "Europe/Paris";
process.env.DUPLICATE_WINDOW_SEC = "180";
