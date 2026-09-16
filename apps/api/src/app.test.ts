import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeWorkout, resetDb, rows, sampleText } from "../test/db.ts";
import { app } from "./app.ts";
import { upsertDailyMetric, upsertWorkout, workoutId } from "./db/repo.ts";

beforeEach(resetDb);

const KEY = process.env.INGEST_API_KEY!;
const json = (body: string, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body,
});

describe("routes de lecture", () => {
  it("GET /health répond ok avec une date", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(() => new Date(body.now).toISOString()).not.toThrow();
  });

  it("GET /stats reflète la base", async () => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-10T05:00:00Z" }));
    const body = await (await app.request("/stats")).json();
    expect(body.workouts.total).toBe(1);
    expect(body.bySport).toEqual([{ sport: "running", count: 1 }]);
  });

  it("GET /workouts pagine, filtre et valide la query", async () => {
    for (let i = 1; i <= 5; i++) upsertWorkout(makeWorkout({ startedAt: `2026-09-1${i}T05:00:00Z`, sport: i % 2 ? "running" : "hiking" }));

    const page = await (await app.request("/workouts?limit=2&offset=1")).json();
    expect(page.total).toBe(5);
    expect(page.items.map((w: { startedAt: string }) => w.startedAt)).toEqual(["2026-09-14T05:00:00.000Z", "2026-09-13T05:00:00.000Z"]);

    const hiking = await (await app.request("/workouts?sport=hiking")).json();
    expect(hiking.total).toBe(2);

    expect((await app.request("/workouts?limit=0")).status).toBe(400);
    expect((await app.request("/workouts?limit=501")).status).toBe(400);
    expect((await app.request("/workouts?offset=-1")).status).toBe(400);
    expect((await app.request("/workouts?limit=abc")).status).toBe(400);
  });

  it("GET /workouts/:id renvoie la séance avec son brut, 404 sinon", async () => {
    const startedAt = "2026-09-10T05:00:00.000Z";
    upsertWorkout(makeWorkout({ startedAt, raw: { k: "v" } }));
    const ok = await app.request(`/workouts/${workoutId(startedAt)}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ startedAt, raw: { k: "v" } });
    expect((await app.request("/workouts/nope")).status).toBe(404);
  });

  it("GET /metrics/daily respecte from/to", async () => {
    upsertDailyMetric({ date: "2026-01-01", hrvMs: 1 });
    upsertDailyMetric({ date: "2026-09-15", hrvMs: 2 });
    const body = await (await app.request("/metrics/daily?from=2026-09-01&to=2026-09-30")).json();
    expect(body.items.map((m: { date: string }) => m.date)).toEqual(["2026-09-15"]);
  });
});

describe("authentification des routes d'écriture", () => {
  const originalKey = process.env.INGEST_API_KEY;
  afterEach(() => {
    process.env.INGEST_API_KEY = originalKey;
  });

  it.each(["/ingest/health-auto-export", "/ingest/app", "/import/apple-health"])("%s refuse sans clé (401)", async (path) => {
    const res = await app.request(path, json("{}"));
    expect(res.status).toBe(401);
    expect(rows.ingestLog()).toHaveLength(0);
  });

  it("accepte la clé dans l'en-tête ou dans ?key=", async () => {
    expect((await app.request("/ingest/app", json("{}", { "x-api-key": KEY }))).status).toBe(200);
    expect((await app.request(`/ingest/app?key=${KEY}`, json("{}"))).status).toBe(200);
  });

  it("répond 503 quand la clé serveur n'est pas configurée ou vaut change-me", async () => {
    process.env.INGEST_API_KEY = "change-me";
    expect((await app.request("/ingest/app", json("{}", { "x-api-key": "change-me" }))).status).toBe(503);
    delete process.env.INGEST_API_KEY;
    expect((await app.request("/ingest/app", json("{}", { "x-api-key": "x" }))).status).toBe(503);
  });
});

describe("POST /ingest/app", () => {
  it("ingère l'échantillon iOS et journalise", async () => {
    const text = sampleText("ios-app-sample.json");
    const res = await app.request("/ingest/app", json(text, { "x-api-key": KEY }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, workouts: 2, metrics: 1 });
    expect(rows.workouts()).toHaveLength(2);
    expect(rows.ingestLog()).toEqual([expect.objectContaining({ source: "ios_app", workouts_upserted: 2, metrics_upserted: 1, bytes: text.length, error: null })]);
  });

  it("répond 400 et journalise l'erreur sur un payload invalide", async () => {
    const res = await app.request("/ingest/app", json('{"workouts":[{"sport":"padel"}]}', { "x-api-key": KEY }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(rows.workouts()).toHaveLength(0);
    expect(rows.ingestLog()[0]).toMatchObject({ source: "ios_app", workouts_upserted: 0, error: expect.stringContaining("sport") });
  });

  it("répond 400 sur un JSON illisible", async () => {
    const res = await app.request("/ingest/app", json("{pas du json", { "x-api-key": KEY }));
    expect(res.status).toBe(400);
  });
});

describe("POST /ingest/health-auto-export", () => {
  it("ingère l'échantillon Health Auto Export", async () => {
    const res = await app.request("/ingest/health-auto-export", json(sampleText("hae-sample.json"), { "x-api-key": KEY }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, workouts: 3, metrics: 2 });
    expect(rows.ingestLog()[0]).toMatchObject({ source: "health_auto_export", workouts_upserted: 3, metrics_upserted: 2 });
  });
});

describe("POST /import/apple-health", () => {
  it("exige un chemin", async () => {
    const res = await app.request("/import/apple-health", json("{}", { "x-api-key": KEY }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "body attendu : { path }" });
  });

  it("répond 400 et journalise si le fichier n'existe pas", async () => {
    const res = await app.request("/import/apple-health", json('{"path":"C:/nulle/part/export.zip"}', { "x-api-key": KEY }));
    expect(res.status).toBe(400);
    expect(rows.ingestLog()[0]).toMatchObject({ source: "apple_health_export", error: expect.any(String) });
  });
});

describe("CORS", () => {
  it("autorise la PWA depuis n'importe quelle origine avec l'en-tête x-api-key", async () => {
    const res = await app.request("/ingest/app", {
      method: "OPTIONS",
      headers: { origin: "http://localhost:8081", "access-control-request-method": "POST", "access-control-request-headers": "x-api-key" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("x-api-key");
  });
});
