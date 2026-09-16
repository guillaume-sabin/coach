import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, rows, sampleJson } from "../../test/db.ts";
import { ingestHealthAutoExport, parseWorkout } from "./health-auto-export.ts";

beforeEach(resetDb);

describe("parseWorkout", () => {
  it("normalise un workout Health Auto Export complet", () => {
    const w = parseWorkout({
      name: "Outdoor Run",
      start: "2026-09-13 07:02:11 +0200",
      end: "2026-09-13 07:58:40 +0200",
      duration: 3389,
      distance: { qty: 10.42, units: "km" },
      activeEnergyBurned: { qty: 712, units: "kcal" },
      elevationUp: { qty: 86, units: "m" },
      avgHeartRate: { qty: 152, units: "bpm" },
      maxHeartRate: { qty: 176, units: "bpm" },
      id: "A1",
      source: "Apple Watch de Guillaume",
    });
    expect(w).toMatchObject({
      source: "health_auto_export",
      sourceId: "A1",
      sport: "running",
      activityType: "Outdoor Run",
      startedAt: "2026-09-13T05:02:11.000Z",
      endedAt: "2026-09-13T05:58:40.000Z",
      durationSec: 3389,
      distanceM: 10_420,
      ascentM: 86,
      descentM: null,
      avgHr: 152,
      maxHr: 176,
      energyKcal: 712,
      deviceName: "Apple Watch de Guillaume",
    });
    expect(w!.avgPaceSecPerKm).toBeCloseTo(3389 / 10.42, 6);
  });

  it("retourne null sans dates de début et de fin", () => {
    expect(parseWorkout({ name: "Outdoor Run", start: "2026-09-13 07:02:11 +0200" })).toBeNull();
    expect(parseWorkout({ name: "Outdoor Run", end: "2026-09-13 07:02:11 +0200" })).toBeNull();
  });

  it("se rabat sur l'horloge quand la durée déclarée dépasse l'horloge", () => {
    const w = parseWorkout({
      name: "Outdoor Run",
      start: "2026-09-13 07:00:00 +0200",
      end: "2026-09-13 08:00:00 +0200",
      duration: 7200,
    });
    expect(w!.durationSec).toBe(3600);
  });

  it("garde une durée déclarée plus courte que l'horloge (pauses)", () => {
    const w = parseWorkout({
      name: "Outdoor Run",
      start: "2026-09-13 07:00:00 +0200",
      end: "2026-09-13 08:00:00 +0200",
      duration: 3000,
    });
    expect(w!.durationSec).toBe(3000);
  });

  it("accepte les noms de champs alternatifs et l'objet elevation", () => {
    const w = parseWorkout({
      workoutActivityType: "Hiking",
      startDate: "2026-09-12 14:00:00 +0200",
      endDate: "2026-09-12 16:30:00 +0200",
      totalDistance: { qty: 8.1, units: "km" },
      elevation: { ascent: 520, descent: 480, units: "m" },
      averageHeartRate: 118,
    });
    expect(w).toMatchObject({ sport: "hiking", distanceM: 8_100, ascentM: 520, descentM: 480, avgHr: 118, durationSec: 9_000 });
  });

  it("interprète une distance nue comme des kilomètres et applique l'heuristique trail", () => {
    const w = parseWorkout({
      name: "Outdoor Run",
      start: "2026-09-14 09:10:00 +0200",
      end: "2026-09-14 11:45:30 +0200",
      distance: 18.3,
      elevationUp: 940,
    });
    expect(w).toMatchObject({ sport: "trail_running", distanceM: 18_300, ascentM: 940 });
  });
});

describe("ingestHealthAutoExport avec l'échantillon", () => {
  it("écrit séances et métriques journalières agrégées", () => {
    const r = ingestHealthAutoExport(sampleJson("hae-sample.json"));
    expect(r).toEqual({ workouts: 3, metrics: 2 });

    const workouts = rows.workouts();
    expect(workouts.map((w) => [w.activity_type, w.sport])).toEqual([
      ["Hiking", "hiking"],
      ["Outdoor Run", "running"],
      ["Outdoor Run", "trail_running"],
    ]);
    expect(workouts.every((w) => w.source === "health_auto_export")).toBe(true);
    expect(workouts.map((w) => w.source_id)).toEqual(["A3", "A1", "A2"]);

    const metrics = rows.metrics();
    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toMatchObject({ date: "2026-09-13", hrv_ms: 48, resting_hr: 49, steps: 14_210, vo2max: 51.3 });
    expect(metrics[0].sleep_minutes).toBeCloseTo(432, 6);
    expect(metrics[1]).toMatchObject({ date: "2026-09-14", hrv_ms: 41, resting_hr: 52, steps: null, vo2max: null, sleep_minutes: null });
  });

  it("est idempotent : rejouer le même envoi ne crée pas de doublon", () => {
    const payload = sampleJson("hae-sample.json");
    ingestHealthAutoExport(payload);
    ingestHealthAutoExport(payload);
    expect(rows.workouts()).toHaveLength(3);
    expect(rows.metrics()).toHaveLength(2);
  });
});

describe("ingestHealthAutoExport : tolérance", () => {
  it("accepte un payload sans enveloppe data et ignore les entrées invalides", () => {
    const r = ingestHealthAutoExport({
      workouts: [
        { name: "Outdoor Run", start: "2026-09-13 07:02:11 +0200", end: "2026-09-13 07:58:40 +0200" },
        { name: "Sans dates" },
        "pas un objet",
        null,
      ],
      metrics: [{ name: "heart_rate_variability", data: "pas une liste" }, { pasDeNom: true }],
    });
    expect(r).toEqual({ workouts: 1, metrics: 0 });
  });

  it("moyenne plusieurs échantillons HRV le même jour, somme les pas, garde le dernier VO2max", () => {
    ingestHealthAutoExport({
      data: {
        metrics: [
          { name: "heart_rate_variability", units: "ms", data: [{ date: "2026-09-13 05:00:00 +0200", qty: 40 }, { date: "2026-09-13 06:00:00 +0200", qty: 60 }] },
          { name: "step_count", units: "count", data: [{ date: "2026-09-13 08:00:00 +0200", qty: 1000 }, { date: "2026-09-13 09:00:00 +0200", qty: 500 }] },
          { name: "vo2_max", data: [{ date: "2026-09-13 08:00:00 +0200", qty: 50 }, { date: "2026-09-13 09:00:00 +0200", qty: 51 }] },
        ],
      },
    });
    expect(rows.metrics()).toEqual([expect.objectContaining({ date: "2026-09-13", hrv_ms: 50, steps: 1500, vo2max: 51 })]);
  });

  it("rattache la nuit au jour du réveil et somme les phases si « asleep » manque", () => {
    ingestHealthAutoExport({
      data: {
        metrics: [
          {
            name: "sleep_analysis",
            units: "hr",
            data: [{ date: "2026-09-12 23:10:00 +0200", core: 4, deep: 1.5, rem: 1.5, sleepEnd: "2026-09-13 06:40:00 +0200" }],
          },
        ],
      },
    });
    expect(rows.metrics()).toEqual([expect.objectContaining({ date: "2026-09-13", sleep_minutes: 420 })]);
  });

  it("un payload vide ne fait rien", () => {
    expect(ingestHealthAutoExport({})).toEqual({ workouts: 0, metrics: 0 });
    expect(ingestHealthAutoExport(null)).toEqual({ workouts: 0, metrics: 0 });
    expect(rows.workouts()).toHaveLength(0);
  });
});
