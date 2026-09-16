import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, rows, sampleStream, xmlStream } from "../../test/db.ts";
import { importAppleHealthXml, openAppleHealthExport } from "./apple-health-xml.ts";

beforeEach(resetDb);

const wrap = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="fr_FR">\n${inner}\n</HealthData>`;

describe("import de l'échantillon export.xml (non-régression)", () => {
  it("produit exactement les séances et métriques attendues", async () => {
    const report = await importAppleHealthXml(sampleStream("export.xml"));
    expect(report).toMatchObject({ workouts: 2, metricDays: 1, skipped: 0 });

    const workouts = rows.workouts();
    expect(workouts).toHaveLength(2);

    const [first, second] = workouts;
    expect(first).toMatchObject({
      source: "apple_health_export",
      sport: "running",
      activity_type: "HKWorkoutActivityTypeRunning",
      started_at: "2026-09-10T05:00:00.000Z",
      ended_at: "2026-09-10T05:52:29.000Z",
      distance_m: 9_870,
      ascent_m: 123, // 12300 cm dans les métadonnées
      descent_m: null,
      avg_hr: 149,
      max_hr: 171,
      energy_kcal: 640,
      device_name: "Apple Watch de Guillaume",
    });
    expect(first.duration_sec).toBeCloseTo(52.48 * 60, 6);
    expect(first.avg_pace_sec_per_km).toBeCloseTo((52.48 * 60) / 9.87, 6);
    expect(JSON.parse(first.raw!)).toMatchObject({ routeFile: "/workout-routes/route_2026-09-10_7.52am.gpx" });

    // Séance sans statistique de distance : pas d'allure, FC conservée.
    expect(second).toMatchObject({ started_at: "2026-09-13T05:02:11.000Z", distance_m: null, avg_pace_sec_per_km: null, avg_hr: 152, max_hr: 176 });

    expect(rows.metrics()).toEqual([
      expect.objectContaining({
        date: "2026-09-10",
        hrv_ms: 55.2,
        resting_hr: 47,
        steps: 3000, // la montre est préférée à l'iPhone (2800)
        sleep_minutes: 450, // 230 min Core + 220 min Deep ; InBed ignoré
        vo2max: null,
      }),
    ]);
  });

  it("rejouer l'import ne duplique rien", async () => {
    await importAppleHealthXml(sampleStream("export.xml"));
    await importAppleHealthXml(sampleStream("export.xml"));
    expect(rows.workouts()).toHaveLength(2);
    expect(rows.metrics()).toHaveLength(1);
  });
});

describe("règles d'extraction", () => {
  it("ignore une séance sans dates ou sans type et la compte comme skipped", async () => {
    const report = await importAppleHealthXml(
      xmlStream(
        wrap(`
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="10" durationUnit="min" startDate="2026-09-10 07:00:00 +0200"/>
 <Workout duration="10" durationUnit="min" startDate="2026-09-10 08:00:00 +0200" endDate="2026-09-10 08:10:00 +0200"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeWalking" startDate="2026-09-10 09:00:00 +0200" endDate="2026-09-10 09:30:00 +0200"/>`),
      ),
    );
    expect(report).toMatchObject({ workouts: 1, skipped: 2 });
    // Sans attribut duration, la durée vient de l'horloge.
    expect(rows.workouts()[0]).toMatchObject({ sport: "walking", duration_sec: 1800 });
  });

  it("prend totalDistance et totalEnergyBurned de l'élément avant les statistiques", async () => {
    await importAppleHealthXml(
      xmlStream(
        wrap(`
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" totalDistance="6.2" totalDistanceUnit="km" totalEnergyBurned="400" totalEnergyBurnedUnit="kcal" startDate="2026-09-10 07:00:00 +0200" endDate="2026-09-10 07:30:00 +0200">
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="9" unit="km"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="900" unit="kcal"/>
 </Workout>`),
      ),
    );
    expect(rows.workouts()[0]).toMatchObject({ distance_m: 6_200, energy_kcal: 400 });
  });

  it("qualifie en trail une course à fort dénivelé et lit HKExternalUUID", async () => {
    await importAppleHealthXml(
      xmlStream(
        wrap(`
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="155" durationUnit="min" sourceName="Apple Watch de Guillaume" startDate="2026-09-14 09:10:00 +0200" endDate="2026-09-14 11:45:00 +0200">
  <MetadataEntry key="HKElevationAscended" value="94000 cm"/>
  <MetadataEntry key="HKElevationDescended" value="91500 cm"/>
  <MetadataEntry key="HKExternalUUID" value="ext-42"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="18.3" unit="km"/>
 </Workout>`),
      ),
    );
    expect(rows.workouts()[0]).toMatchObject({ sport: "trail_running", ascent_m: 940, descent_m: 915, source_id: "ext-42" });
  });

  it("agrège les métriques par jour local de la source, sommeil au jour du réveil", async () => {
    await importAppleHealthXml(
      xmlStream(
        wrap(`
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Apple Watch" startDate="2026-09-10 05:12:00 +0200" endDate="2026-09-10 05:13:00 +0200" value="50"/>
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Apple Watch" startDate="2026-09-10 23:50:00 +0200" endDate="2026-09-10 23:51:00 +0200" value="70"/>
 <Record type="HKQuantityTypeIdentifierVO2Max" sourceName="Apple Watch" startDate="2026-09-10 08:00:00 +0200" endDate="2026-09-10 08:00:00 +0200" value="64.1"/>
 <Record type="HKQuantityTypeIdentifierVO2Max" sourceName="Apple Watch" startDate="2026-09-10 18:00:00 +0200" endDate="2026-09-10 18:00:00 +0200" value="65.3"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-09-10 23:00:00 +0200" endDate="2026-09-11 06:00:00 +0200" value="HKCategoryValueSleepAnalysisAsleepUnspecified"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-09-11 06:00:00 +0200" endDate="2026-09-11 06:20:00 +0200" value="HKCategoryValueSleepAnalysisAwake"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" startDate="2026-09-11 08:00:00 +0200" endDate="2026-09-11 09:00:00 +0200" value="4000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" startDate="2026-09-11 09:00:00 +0200" endDate="2026-09-11 10:00:00 +0200" value="1000"/>`),
      ),
    );
    const metrics = rows.metrics();
    expect(metrics).toEqual([
      expect.objectContaining({ date: "2026-09-10", hrv_ms: 60, vo2max: 65.3, sleep_minutes: null, steps: null }),
      // 7 h de sommeil (Awake exclu) ; sans montre, les pas iPhone sont sommés.
      expect.objectContaining({ date: "2026-09-11", sleep_minutes: 420, steps: 5000, hrv_ms: null }),
    ]);
  });

  it("supprime le doublon Strava d'une séance montre et classe la routine", async () => {
    await importAppleHealthXml(
      xmlStream(
        wrap(`
 <Workout workoutActivityType="HKWorkoutActivityTypeCooldown" duration="32" durationUnit="min" sourceName="Apple Watch de Guillaume" startDate="2026-09-14 19:24:00 +0200" endDate="2026-09-14 19:56:00 +0200"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeOther" duration="32" durationUnit="min" sourceName="Strava" startDate="2026-09-14 19:23:40 +0200" endDate="2026-09-14 19:55:40 +0200"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeCooldown" duration="14" durationUnit="min" sourceName="Apple Watch de Guillaume" startDate="2026-09-14 21:00:00 +0200" endDate="2026-09-14 21:14:00 +0200"/>`),
      ),
    );
    const workouts = rows.workouts();
    expect(workouts.map((w) => [w.device_name, w.sport])).toEqual([
      ["Apple Watch de Guillaume", "mobility"],
      ["Apple Watch de Guillaume", "stretching"],
    ]);
  });

  it("survit à une entité XML inconnue dans les métadonnées", async () => {
    const report = await importAppleHealthXml(
      xmlStream(
        wrap(`
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="10" durationUnit="min" startDate="2026-09-10 07:00:00 +0200" endDate="2026-09-10 07:10:00 +0200">
  <MetadataEntry key="HKWeatherCondition" value="Soleil &nbsp; voil&eacute;"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="10" durationUnit="min" startDate="2026-09-10 08:00:00 +0200" endDate="2026-09-10 08:10:00 +0200"/>`),
      ),
    );
    expect(report.workouts).toBeGreaterThanOrEqual(1);
    expect(rows.workouts().some((w) => w.sport === "walking")).toBe(true);
  });
});

describe("openAppleHealthExport", () => {
  it("ouvre directement un fichier .xml", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coach-xml-"));
    const file = join(dir, "export.xml");
    writeFileSync(
      file,
      wrap(`
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="10" durationUnit="min" startDate="2026-09-10 07:00:00 +0200" endDate="2026-09-10 07:10:00 +0200"/>`),
    );
    const report = await importAppleHealthXml(await openAppleHealthExport(file));
    expect(report.workouts).toBe(1);
  });

  it("échoue proprement sur un zip inexistant", async () => {
    await expect(openAppleHealthExport(join(tmpdir(), "inexistant-coach.zip"))).rejects.toThrow();
  });
});
