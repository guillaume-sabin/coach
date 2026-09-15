/**
 * Import en ligne de commande de l'export Apple Santé.
 *   npm run import:apple -- "C:\chemin\vers\export.zip"
 *   npm run import:apple -- "C:\chemin\vers\apple_health_export\export.xml"
 */
import { ensureSchema } from "../db/index.ts";
import { stats } from "../db/repo.ts";
import { importAppleHealthXml, openAppleHealthExport } from "./apple-health-xml.ts";

try {
  process.loadEnvFile?.();
} catch {
  /* pas de .env */
}

const path = process.argv[2];
if (!path) {
  console.error("Usage : npm run import:apple -- <export.zip | export.xml>");
  process.exit(1);
}

ensureSchema();
console.log(`Lecture de ${path} …`);
const stream = await openAppleHealthExport(path);
const report = await importAppleHealthXml(stream);
console.log(
  `Import terminé en ${(report.durationMs / 1000).toFixed(1)} s : ${report.workouts} séances, ${report.metricDays} jours de métriques, ${report.skipped} éléments ignorés.`,
);
console.log(JSON.stringify(stats(), null, 2));
