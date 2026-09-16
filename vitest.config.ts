import { defineConfig } from "vitest/config";

/**
 * Un seul point d'entrée pour tous les tests TypeScript du monorepo (`npm test`).
 * Chaque projet tourne dans son propre contexte ; les fichiers de test s'exécutent en parallèle
 * sur autant de workers que de cœurs. L'API utilise des processus séparés (`forks`) : better-sqlite3
 * est un module natif, et chaque fichier de test reçoit ainsi sa propre base SQLite en mémoire.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          root: "packages/shared",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "api",
          root: "apps/api",
          include: ["src/**/*.test.ts"],
          setupFiles: ["test/setup.ts"],
          pool: "forks",
          testTimeout: 20_000,
        },
      },
      {
        test: {
          name: "mobile",
          root: "apps/mobile",
          include: ["src/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["packages/shared/src/**", "apps/api/src/**", "apps/mobile/src/**"],
      exclude: [
        "**/*.test.ts",
        "apps/api/src/server.ts",
        "apps/api/src/import/cli.ts",
        "apps/api/src/db/reconcile-cli.ts",
        "apps/api/src/db/schema.ts",
        "apps/mobile/src/theme.ts",
        "apps/mobile/src/useQuery.ts",
      ],
    },
  },
});
