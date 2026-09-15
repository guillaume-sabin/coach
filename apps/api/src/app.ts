import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";
import { getWorkout, listDailyMetrics, listWorkouts, logIngest, stats } from "./db/repo.ts";
import { importAppleHealthXml, openAppleHealthExport } from "./import/apple-health-xml.ts";
import { ingestFromApp } from "./import/app-ingest.ts";
import { ingestHealthAutoExport } from "./import/health-auto-export.ts";

export const app = new Hono();

app.use("*", logger());
app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "x-api-key"] }));

/** Auth minimale par clé partagée pour tout ce qui écrit. */
const requireKey = async (c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } ; json: (b: unknown, s?: number) => Response }, next: () => Promise<void>) => {
  const expected = process.env.INGEST_API_KEY;
  if (!expected || expected === "change-me") {
    return c.json({ error: "INGEST_API_KEY non configurée dans apps/api/.env" }, 503);
  }
  const given = c.req.header("x-api-key") ?? c.req.query("key");
  if (given !== expected) return c.json({ error: "clé invalide" }, 401);
  await next();
};

app.get("/health", (c) => c.json({ ok: true, now: new Date().toISOString() }));

app.get("/stats", (c) => c.json(stats()));

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  from: z.string().optional(),
  to: z.string().optional(),
  sport: z.string().optional(),
});

app.get("/workouts", (c) => {
  const q = ListQuery.safeParse(c.req.query());
  if (!q.success) return c.json({ error: q.error.flatten() }, 400);
  return c.json(listWorkouts(q.data));
});

app.get("/workouts/:id", (c) => {
  const w = getWorkout(c.req.param("id"));
  return w ? c.json(w) : c.json({ error: "introuvable" }, 404);
});

app.get("/metrics/daily", (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = c.req.query("from") ?? new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const to = c.req.query("to") ?? today;
  return c.json({ items: listDailyMetrics(from, to) });
});

/** Cible de l'automatisation "REST API" de Health Auto Export. */
app.post("/ingest/health-auto-export", requireKey, async (c) => {
  const receivedAt = new Date().toISOString();
  const text = await c.req.text();
  try {
    const payload = JSON.parse(text);
    const r = ingestHealthAutoExport(payload);
    logIngest({
      source: "health_auto_export",
      receivedAt,
      workoutsUpserted: r.workouts,
      metricsUpserted: r.metrics,
      bytes: text.length,
      error: null,
    });
    return c.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logIngest({ source: "health_auto_export", receivedAt, workoutsUpserted: 0, metricsUpserted: 0, bytes: text.length, error: msg });
    return c.json({ ok: false, error: msg }, 400);
  }
});

/** Cible de l'app iOS native (apps/ios). */
app.post("/ingest/app", requireKey, async (c) => {
  const receivedAt = new Date().toISOString();
  const text = await c.req.text();
  try {
    const r = ingestFromApp(JSON.parse(text));
    logIngest({ source: "ios_app", receivedAt, workoutsUpserted: r.workouts, metricsUpserted: r.metrics, bytes: text.length, error: null });
    return c.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logIngest({ source: "ios_app", receivedAt, workoutsUpserted: 0, metricsUpserted: 0, bytes: text.length, error: msg });
    return c.json({ ok: false, error: msg }, 400);
  }
});

/** Import de l'export Apple Santé par chemin local (le serveur tourne sur la même machine que le fichier). */
app.post("/import/apple-health", requireKey, async (c) => {
  const body = z.object({ path: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "body attendu : { path }" }, 400);
  const receivedAt = new Date().toISOString();
  try {
    const stream = await openAppleHealthExport(body.data.path);
    const r = await importAppleHealthXml(stream);
    logIngest({ source: "apple_health_export", receivedAt, workoutsUpserted: r.workouts, metricsUpserted: r.metricDays, bytes: 0, error: null });
    return c.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logIngest({ source: "apple_health_export", receivedAt, workoutsUpserted: 0, metricsUpserted: 0, bytes: 0, error: msg });
    return c.json({ ok: false, error: msg }, 400);
  }
});
