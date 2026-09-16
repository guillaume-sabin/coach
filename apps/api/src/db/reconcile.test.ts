import { beforeEach, describe, expect, it } from "vitest";
import { makeWorkout, resetDb, rows } from "../../test/db.ts";
import { localDayOf, reconcile } from "./reconcile.ts";
import { upsertWorkout } from "./repo.ts";

beforeEach(resetDb);

const WATCH = "Apple Watch de Guillaume";
const cooldown = (startedAt: string, deviceName = WATCH) =>
  makeWorkout({ startedAt, deviceName, sport: "mobility", activityType: "HKWorkoutActivityTypeCooldown", durationSec: 900 });
const stravaOther = (startedAt: string) =>
  makeWorkout({ startedAt, deviceName: "Strava", sport: "other", activityType: "HKWorkoutActivityTypeOther", durationSec: 900 });

describe("localDayOf", () => {
  it("découpe les jours dans le fuseau Europe/Paris", () => {
    expect(localDayOf("2026-09-14T21:59:59Z")).toBe("2026-09-14"); // 23 h 59 à Paris
    expect(localDayOf("2026-09-14T22:00:00Z")).toBe("2026-09-15"); // minuit à Paris (été, UTC+2)
    expect(localDayOf("2026-01-14T23:00:00Z")).toBe("2026-01-15"); // hiver, UTC+1
    expect(localDayOf("2026-01-14T22:59:59Z")).toBe("2026-01-14");
  });
});

describe("doublons inter-sources", () => {
  it("supprime la copie Strava démarrée à moins de 3 minutes de la séance montre", () => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:00:00Z", avgHr: 150 }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T16:59:40Z", deviceName: "Strava", avgHr: null }));
    expect(reconcile()).toMatchObject({ duplicatesRemoved: 1 });
    expect(rows.workouts().map((w) => w.device_name)).toEqual([WATCH]);
  });

  it("garde deux séances espacées d'exactement 3 minutes (borne exclue, comme CoachCore)", () => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:00:00Z" }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:03:00Z", deviceName: "Strava" }));
    expect(reconcile().duplicatesRemoved).toBe(0);
    expect(rows.workouts()).toHaveLength(2);
  });

  it("supprime encore à 2 min 59 s", () => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:00:00Z" }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:02:59Z", deviceName: "Strava" }));
    expect(reconcile().duplicatesRemoved).toBe(1);
  });

  it("ne supprime jamais une séance montre, ni une séance Strava isolée", () => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:00:00Z" }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:00:30Z" }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-13T17:00:30Z", deviceName: "Strava" }));
    expect(reconcile().duplicatesRemoved).toBe(0);
    expect(rows.workouts()).toHaveLength(3);
  });

  it("deux Strava proches sans montre sont conservées", () => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:00:00Z", deviceName: "Strava" }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:00:30Z", deviceName: "Strava" }));
    expect(reconcile().duplicatesRemoved).toBe(0);
  });
});

describe("routine quotidienne", () => {
  it("première Cooldown du jour = mobilité, suivantes = étirements", () => {
    upsertWorkout(cooldown("2026-09-14T17:24:00Z"));
    upsertWorkout(cooldown("2026-09-14T19:00:00Z"));
    upsertWorkout(cooldown("2026-09-14T20:00:00Z"));
    expect(reconcile()).toMatchObject({ mobility: 1, stretching: 2 });
    expect(rows.workouts().map((w) => w.sport)).toEqual(["mobility", "stretching", "stretching"]);
  });

  it("le rang est calculé par jour local Paris, pas par jour UTC", () => {
    upsertWorkout(cooldown("2026-09-14T19:30:00Z")); // 21 h 30 le 14 à Paris
    upsertWorkout(cooldown("2026-09-14T22:30:00Z")); // 00 h 30 le 15 à Paris
    expect(reconcile()).toMatchObject({ mobility: 2, stretching: 0 });
  });

  it("l'ordre est chronologique quel que soit l'ordre d'insertion", () => {
    upsertWorkout(cooldown("2026-09-14T19:00:00Z"));
    upsertWorkout(cooldown("2026-09-14T17:24:00Z"));
    reconcile();
    expect(rows.workouts().map((w) => [w.started_at, w.sport])).toEqual([
      ["2026-09-14T17:24:00.000Z", "mobility"],
      ["2026-09-14T19:00:00.000Z", "stretching"],
    ]);
  });

  it("un « Other » Strava non apparié compte dans la routine", () => {
    upsertWorkout(stravaOther("2026-09-14T17:24:00Z"));
    upsertWorkout(cooldown("2026-09-14T19:00:00Z"));
    reconcile();
    expect(rows.workouts().map((w) => w.sport)).toEqual(["mobility", "stretching"]);
  });

  it("un « Other » montre n'est pas de la routine", () => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:24:00Z", sport: "other", activityType: "HKWorkoutActivityTypeOther" }));
    expect(reconcile()).toMatchObject({ mobility: 0, stretching: 0 });
    expect(rows.workouts()[0].sport).toBe("other");
  });

  it("la course et le renforcement ne sont jamais touchés", () => {
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T16:00:00Z", sport: "running" }));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:00:00Z", sport: "strength", activityType: "HKWorkoutActivityTypeFunctionalStrengthTraining" }));
    upsertWorkout(cooldown("2026-09-14T19:00:00Z"));
    reconcile();
    expect(rows.workouts().map((w) => w.sport)).toEqual(["running", "strength", "mobility"]);
  });

  it("est idempotente : un second passage ne change rien", () => {
    upsertWorkout(cooldown("2026-09-14T17:24:00Z"));
    upsertWorkout(cooldown("2026-09-14T19:00:00Z"));
    upsertWorkout(makeWorkout({ startedAt: "2026-09-14T17:24:20Z", deviceName: "Strava", sport: "other", activityType: "HKWorkoutActivityTypeOther" }));
    const first = reconcile();
    const snapshot = rows.workouts();
    const second = reconcile();
    expect(first).toEqual({ duplicatesRemoved: 1, mobility: 1, stretching: 1 });
    expect(second).toEqual({ duplicatesRemoved: 0, mobility: 1, stretching: 1 });
    expect(rows.workouts()).toEqual(snapshot);
  });

  it("le doublon Strava est retiré avant le classement : il ne consomme pas le rang", () => {
    upsertWorkout(stravaOther("2026-09-14T17:23:40Z"));
    upsertWorkout(cooldown("2026-09-14T17:24:00Z"));
    upsertWorkout(cooldown("2026-09-14T19:00:00Z"));
    expect(reconcile()).toEqual({ duplicatesRemoved: 1, mobility: 1, stretching: 1 });
  });
});
