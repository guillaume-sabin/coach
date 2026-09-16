import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ROUTINE_SPORTS,
  SPORT_LABELS,
  Sport,
  Workout,
  formatDuration,
  formatPace,
  paceSecPerKm,
  refineTrail,
  sportFromActivityType,
} from "./index.ts";

interface FixtureCase {
  activityType: string;
  distanceM: number | null;
  ascentM: number | null;
  expected: Sport;
  note?: string;
}

const fixture = JSON.parse(
  readFileSync(new URL("../../../_context/samples/sport-classification-cases.json", import.meta.url), "utf8"),
) as { cases: FixtureCase[] };

describe("classification des sports (fixture partagée avec CoachCore)", () => {
  it.each(fixture.cases.map((c) => [c.activityType, c.distanceM, c.ascentM, c.expected] as const))(
    "%s (%s m, %s m D+) => %s",
    (activityType, distanceM, ascentM, expected) => {
      expect(refineTrail(sportFromActivityType(activityType), distanceM, ascentM)).toBe(expected);
    },
  );

  it("la fixture couvre chaque sport normalisé au moins une fois", () => {
    const covered = new Set(fixture.cases.map((c) => c.expected));
    for (const sport of Sport.options) expect(covered, `sport ${sport} absent de la fixture`).toContain(sport);
  });
});

describe("sportFromActivityType", () => {
  it("est insensible à la casse et aux espaces autour", () => {
    expect(sportFromActivityType("  RUNNING ")).toBe("running");
    expect(sportFromActivityType("hkworkoutactivitytypeCooldown")).toBe("other");
  });

  it("préfixe HealthKit retiré uniquement quand il est exact", () => {
    expect(sportFromActivityType("HKWorkoutActivityTypeRunning")).toBe("running");
    expect(sportFromActivityType("Running")).toBe("running");
  });
});

describe("refineTrail", () => {
  it("ne requalifie jamais un autre sport que la course", () => {
    for (const sport of Sport.options.filter((s) => s !== "running")) {
      expect(refineTrail(sport, 10_000, 2_000)).toBe(sport);
    }
  });

  it("ignore les distances nulles, absentes ou inférieures à 1 km", () => {
    expect(refineTrail("running", 0, 500)).toBe("running");
    expect(refineTrail("running", null, 500)).toBe("running");
    expect(refineTrail("running", 999, 500)).toBe("running");
  });
});

describe("paceSecPerKm", () => {
  it("calcule l'allure en s/km", () => {
    expect(paceSecPerKm(10_000, 3_000)).toBe(300);
    expect(paceSecPerKm(10_120, 3_208)).toBeCloseTo(316.996, 3);
  });

  it("retourne null sous 100 m ou sans durée", () => {
    expect(paceSecPerKm(null, 600)).toBeNull();
    expect(paceSecPerKm(99, 600)).toBeNull();
    expect(paceSecPerKm(0, 600)).toBeNull();
    expect(paceSecPerKm(5_000, 0)).toBeNull();
    expect(paceSecPerKm(5_000, -1)).toBeNull();
  });
});

describe("formats", () => {
  it.each([
    [300, "5:00 /km"],
    [316.996, "5:17 /km"],
    [359.6, "6:00 /km"],
    [59.4, "0:59 /km"],
  ])("formatPace(%s) => %s", (v, expected) => {
    expect(formatPace(v)).toBe(expected);
  });

  it("formatPace affiche un tiret sans valeur", () => {
    expect(formatPace(null)).toBe("–");
    expect(formatPace(0)).toBe("–");
    expect(formatPace(Infinity)).toBe("–");
    expect(formatPace(NaN)).toBe("–");
  });

  it.each([
    [0, "0 min"],
    [1_500, "25 min"],
    [3_599, "59 min"],
    [3_600, "1 h 00"],
    [5_400, "1 h 30"],
    [9_330, "2 h 35"],
  ])("formatDuration(%s) => %s", (v, expected) => {
    expect(formatDuration(v)).toBe(expected);
  });
});

describe("contrat de données", () => {
  it("chaque sport a un libellé français", () => {
    for (const sport of Sport.options) expect(SPORT_LABELS[sport]).toBeTruthy();
  });

  it("la routine se limite à mobilité et étirements", () => {
    expect([...ROUTINE_SPORTS].sort()).toEqual(["mobility", "stretching"]);
  });

  it("le schéma Workout rejette un sport inconnu et une source inconnue", () => {
    const base = {
      id: "abc",
      source: "ios_app",
      sourceId: null,
      sport: "running",
      activityType: "HKWorkoutActivityTypeRunning",
      startedAt: "2026-09-15T17:05:12.000Z",
      endedAt: "2026-09-15T17:58:40.000Z",
      durationSec: 3208,
      distanceM: 10120,
      ascentM: 94,
      descentM: null,
      avgHr: 146,
      maxHr: 171,
      energyKcal: 690,
      avgPaceSecPerKm: null,
      deviceName: "Apple Watch",
      createdAt: "2026-09-15T18:00:00.000Z",
    };
    expect(Workout.safeParse(base).success).toBe(true);
    expect(Workout.safeParse({ ...base, sport: "padel" }).success).toBe(false);
    expect(Workout.safeParse({ ...base, source: "garmin" }).success).toBe(false);
  });
});
