/** Relance les passes de réconciliation sur la base existante : npm run reconcile -w @coach/api */
import { ensureSchema } from "./index.ts";
import { reconcile } from "./reconcile.ts";
import { stats } from "./repo.ts";

try {
  process.loadEnvFile?.();
} catch {
  /* pas de .env */
}

ensureSchema();
console.log(reconcile());
console.log(JSON.stringify(stats(), null, 2));
