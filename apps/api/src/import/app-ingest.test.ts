import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, rows, sampleJson } from "../../test/db.ts";
import { AppIngestPayload, ingestFromApp } from "./app-ingest.ts";

beforeEach(resetDb);

describe("contrat POST /ingest/app (échantillon généré par l'app iOS)", () => {
  it("accepte l'échantillon et calcule l'allure manquante", () => {
    const r = ingestFromApp(sampleJson("ios-app-sample.json"));
    expect(r).toEqual({ workouts: 2, metrics: 1 });

    const [run, cooldown] = rows.workouts();
    expect(run).toMatchObject({
      source: "ios_app",
      source_id: "0B3C1F7A-1111-2222-3333-444455556666",
      sport: "running",
      started_at: "2026-09-15T17:05:12.000Z",
      ended_at: "2026-09-15T17:58:40.000Z",
      duration_sec: 3208,
      distance_m: 10120,
      ascent_m: 94,
      descent_m: 90,
      avg_hr: 146,
      max_hr: 171,
      energy_kcal: 690,
      device_name: "Apple Watch de Guillaume",
    });
    expect(run.avg_pace_sec_per_km).toBeCloseTo(3208 / 10.12, 6);
    expect(JSON.parse(run.raw!)).toMatchObject({ sport: "running", activityType: "HKWorkoutActivityTypeRunning" });

    // Seule Cooldown du jour : mobilité.
    expect(cooldown).toMatchObject({ sport: "mobility", activity_type: "HKWorkoutActivityTypeCooldown", distance_m: null, avg_pace_sec_per_km: null });

    expect(rows.metrics()).toEqual([expect.objectContaining({ date: "2026-09-15", hrv_ms: 104, resting_hr: 41, sleep_minutes: 466, steps: 9210, vo2max: null })]);
  });

  it("garde l'allure envoyée par l'app quand elle est fournie", () => {
    ingestFromApp({
      workouts: [
        {
          sport: "running",
          activityType: "HKWorkoutActivityTypeRunning",
          startedAt: "2026-09-15T17:05:12Z",
          endedAt: "2026-09-15T17:58:40Z",
          durationSec: 3208,
          distanceM: 10120,
          avgPaceSecPerKm: 300,
        },
      ],
    });
    expect(rows.workouts()[0].avg_pace_sec_per_km).toBe(300);
  });

  it("normalise les dates avec décalage en UTC", () => {
    ingestFromApp({
      workouts: [
        { sport: "walking", activityType: "HKWorkoutActivityTypeWalking", startedAt: "2026-09-15T19:05:12+02:00", endedAt: "2026-09-15T19:35:12+02:00", durationSec: 1800 },
      ],
    });
    expect(rows.workouts()[0]).toMatchObject({ started_at: "2026-09-15T17:05:12.000Z", ended_at: "2026-09-15T17:35:12.000Z" });
  });

  it("deux Cooldown du même jour deviennent mobilité puis étirements, dans l'ordre chronologique", () => {
    ingestFromApp({
      workouts: [
        { sport: "mobility", activityType: "HKWorkoutActivityTypeCooldown", startedAt: "2026-09-15T19:00:00Z", endedAt: "2026-09-15T19:14:00Z", durationSec: 840 },
        { sport: "mobility", activityType: "HKWorkoutActivityTypeCooldown", startedAt: "2026-09-15T17:24:00Z", endedAt: "2026-09-15T17:56:00Z", durationSec: 1920 },
      ],
    });
    expect(rows.workouts().map((w) => [w.started_at, w.sport])).toEqual([
      ["2026-09-15T17:24:00.000Z", "mobility"],
      ["2026-09-15T19:00:00.000Z", "stretching"],
    ]);
  });
});

describe("validation du payload", () => {
  const valid = {
    sport: "running",
    activityType: "HKWorkoutActivityTypeRunning",
    startedAt: "2026-09-15T17:05:12Z",
    endedAt: "2026-09-15T17:58:40Z",
    durationSec: 3208,
  };

  it("un payload vide est valide et ne fait rien", () => {
    expect(AppIngestPayload.parse({})).toEqual({ workouts: [], metrics: [] });
    expect(ingestFromApp({})).toEqual({ workouts: 0, metrics: 0 });
  });

  it.each([
    ["sport inconnu", { ...valid, sport: "padel" }],
    ["date sans fuseau", { ...valid, startedAt: "2026-09-15 17:05:12" }],
    ["durée négative", { ...valid, durationSec: -1 }],
    ["type d'activité manquant", { ...valid, activityType: undefined }],
    ["source étrangère", { ...valid, source: "health_auto_export" }],
  ])("rejette : %s", (_label, workout) => {
    expect(() => ingestFromApp({ workouts: [workout] })).toThrow();
    expect(rows.workouts()).toHaveLength(0);
  });

  it("rejette une métrique sans date, et n'écrit rien du lot (transaction)", () => {
    expect(() => ingestFromApp({ workouts: [valid], metrics: [{ hrvMs: 100 }] })).toThrow();
    expect(rows.workouts()).toHaveLength(0);
    expect(rows.metrics()).toHaveLength(0);
  });
});
