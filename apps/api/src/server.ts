import { serve } from "@hono/node-server";
import { networkInterfaces } from "node:os";

try {
  process.loadEnvFile?.();
} catch {
  /* pas de .env : valeurs par défaut */
}

const { ensureSchema } = await import("./db/index.ts");
const { app } = await import("./app.ts");

ensureSchema();

const port = Number(process.env.PORT ?? 3210);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i!.address}:${port}`);
  console.log(`API coach démarrée sur http://localhost:${port}`);
  if (lan.length) console.log(`Depuis l'iPhone (même Wi-Fi) : ${lan.join("  ")}`);
});
