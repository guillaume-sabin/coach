import { beforeEach, describe, expect, it } from "vitest";
import { makeWorkout, resetDb, rows } from "../../test/db.ts";
import { getWorkout, listDailyMetrics, listWorkouts, logIngest, stats, transaction, upsertDailyMetric, upsertWorkout, workoutId } from "./repo.ts";

beforeEach(resetDb);

describe("workoutId", () => {
  it("est déterministe et court", () => {
    expect(workoutId("2026-09-15T17:05:12.000Z")).toBe(workoutId("2026-09-15T17:05:12.000Z"));
    expect(workoutId("2026-09-15T17:05:12.000Z")).toHaveLength(20);
    expect(workoutId("2026-09-15T17:05:12.000Z")).not.toBe(workoutId("2026-09-15T17:05:13.000Z"));
  });
});

describe("upsertWorkout", () => {
  it("insère puis complète sans écraser les valeurs connues par des nulls", () => {
    const startedAt = "2026-09-15T17:05:12.000Z";
    upsertWorkout(makeWorkout({ startedAt, avgHr: 146, maxHr: 171, distanceM: null, deviceName: "Apple Watch" }));
    upsertWorkout(makeWorkout({ startedAt, source: "ios_app", avgHr: null, maxHr: null, distanceM: 10120, deviceName: null }));

    const all = rows.workouts();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ source: "ios_app", avg_hr: 146, max_hr: 171, distance_m: 10120, device_name: "Apple Watch" });
  });

  it("une valeur non nulle plus récente remplace l'ancienne", () => {
    const startedAt = "2026-09-15T17:05:12.000Z";
    upsertWorkout(makeWorkout({ startedAt, avgHr: 140 }));
    upsertWorkout(makeWorkout({ startedAt, avgHr: 146, sport: "trail_running" }));
    expect(rows.workouts()[0]).toMatchObject({ avg_hr: 146, sport: "trail_running" });
  });

  it("l'identité est l'instant de début, quel que soit le type d'activité", () => {
    const startedAt = "2026-09-15T17:05:12.000Z";
    upsertWorkout(makeWorkout({ startedAt, activityType: "HKWorkoutActivityTypeRunning" }));
    upsertWorkout(makeWorkout({ startedAt, activityType: "Outdoor Run", source: "health_auto_export" }));
    expect(rows.workouts()).toHaveLength(1);
    expect(rows.workouts()[0].id).toBe(workoutId(startedAt));
  });

  it("conserve le brut en JSON", () => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-15T17:05:12.000Z", raw: { hello: "monde", n: 1 } }));
    expect(JSON.parse(rows.workouts()[0].raw!)).toEqual({ hello: "monde", n: 1 });
  });
});

describe("upsertDailyMetric", () => {
  it("fusionne champ par champ", () => {
    upsertDailyMetric({ date: "2026-09-15", hrvMs: 104, restingHr: 41 });
    upsertDailyMetric({ date: "2026-09-15", hrvMs: null, sleepMinutes: 466 });
    upsertDailyMetric({ date: "2026-09-15", restingHr: 40 });
    expect(rows.metrics()).toEqual([expect.objectContaining({ date: "2026-09-15", hrv_ms: 104, resting_hr: 40, sleep_minutes: 466, steps: null, vo2max: null })]);
  });
});

describe("listWorkouts", () => {
  beforeEach(() => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-10T05:00:00Z", sport: "running" }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-12T05:00:00Z", sport: "hiking", raw: { x: 1 } }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T05:00:00Z", sport: "running" }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-15T05:00:00Z", sport: "mobility" }));
  });

  it("renvoie les plus récentes d'abord, sans le brut, avec le total", () => {
    const { items, total } = listWorkouts({ limit: 50, offset: 0 });
    expect(total).toBe(4);
    expect(items.map((w) => w.startedAt)).toEqual([
      "2026-09-15T05:00:00.000Z",
      "2026-09-14T05:00:00.000Z",
      "2026-09-12T05:00:00.000Z",
      "2026-09-10T05:00:00.000Z",
    ]);
    expect(items.some((w) => "raw" in w)).toBe(false);
  });

  it("pagine et filtre par sport et par dates", () => {
    expect(listWorkouts({ limit: 2, offset: 0 }).items).toHaveLength(2);
    expect(listWorkouts({ limit: 2, offset: 3 }).items.map((w) => w.startedAt)).toEqual(["2026-09-10T05:00:00.000Z"]);

    const running = listWorkouts({ limit: 50, offset: 0, sport: "running" });
    expect(running.total).toBe(2);
    expect(running.items.every((w) => w.sport === "running")).toBe(true);

    const window = listWorkouts({ limit: 50, offset: 0, from: "2026-09-11", to: "2026-09-14T23:59:59Z" });
    expect(window.items.map((w) => w.startedAt)).toEqual(["2026-09-14T05:00:00.000Z", "2026-09-12T05:00:00.000Z"]);
    expect(window.total).toBe(2);
  });
});

describe("getWorkout", () => {
  it("retourne la séance complète avec le brut, ou null", () => {
    const startedAt = "2026-09-12T05:00:00.000Z";
    upsertWorkout(makeWorkout({ startedAt, raw: { x: 1 } }));
    const w = getWorkout(workoutId(startedAt));
    expect(w).toMatchObject({ startedAt, raw: { x: 1 } });
    expect(getWorkout("inexistant")).toBeNull();
  });
});

describe("listDailyMetrics", () => {
  it("borne inclusivement et trie par date", () => {
    upsertDailyMetric({ date: "2026-09-10", hrvMs: 1 });
    upsertDailyMetric({ date: "2026-09-12", hrvMs: 2 });
    upsertDailyMetric({ date: "2026-09-15", hrvMs: 3 });
    expect(listDailyMetrics("2026-09-10", "2026-09-12").map((m) => m.date)).toEqual(["2026-09-10", "2026-09-12"]);
    expect(listDailyMetrics("2026-09-13", "2026-09-14")).toEqual([]);
  });
});

describe("stats et journal", () => {
  it("compte par sport et borne les dates", () => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-10T05:00:00Z", sport: "running" }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T05:00:00Z", sport: "running" }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-15T05:00:00Z", sport: "mobility" }));
    upsertDailyMetric({ date: "2026-09-15", hrvMs: 100 });

    const s = stats();
    expect(s.workouts).toEqual({ total: 3, first: "2026-09-10T05:00:00.000Z", last: "2026-09-15T05:00:00.000Z" });
    expect(s.metricDays).toBe(1);
    expect([...s.bySport].sort((a, b) => a.sport.localeCompare(b.sport))).toEqual([
      { sport: "mobility", count: 1 },
      { sport: "running", count: 2 },
    ]);
  });

  it("stats sur base vide", () => {
    expect(stats().workouts).toEqual({ total: 0, first: null, last: null });
  });

  it("logIngest enregistre l'envoi", () => {
    logIngest({ source: "ios_app", receivedAt: "2026-09-15T18:00:00.000Z", workoutsUpserted: 2, metricsUpserted: 1, bytes: 998, error: null });
    expect(rows.ingestLog()).toEqual([expect.objectContaining({ source: "ios_app", workouts_upserted: 2, metrics_upserted: 1, bytes: 998, error: null })]);
  });
});

describe("transaction", () => {
  it("annule toutes les écritures si la fonction lève", () => {
    expect(() =>
      transaction(() => {
        upsertWorkout(makeWorkout({ startedAt: "2026-09-10T05:00:00Z" }));
        throw new Error("boum");
      }),
    ).toThrow("boum");
    expect(rows.workouts()).toHaveLength(0);
  });

  it("retourne la valeur de la fonction", () => {
    expect(transaction(() => 42)).toBe(42);
  });
});
