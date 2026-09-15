/**
 * Import de l'export complet Apple Santé (Réglages > Santé > Exporter toutes les données).
 * Le fichier export.xml pèse souvent plusieurs centaines de Mo : on le lit en streaming avec sax.
 *
 * Éléments exploités :
 *  - <Workout> + enfants <WorkoutStatistics>, <MetadataEntry>  -> table workouts
 *  - <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN|RestingHeartRate|VO2Max|StepCount">
 *  - <Record type="HKCategoryTypeIdentifierSleepAnalysis">     -> table daily_metrics
 */
import sax from "sax";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import yauzl from "yauzl";
import { paceSecPerKm, refineTrail, sportFromActivityType } from "@coach/shared";
import { reconcile } from "../db/reconcile.ts";
import { transaction, upsertDailyMetric, upsertWorkout, type WorkoutInput } from "../db/repo.ts";
import { localDay, secondsBetween, toIso } from "./dates.ts";
import { num, parseQtyUnit, toKcal, toMeters, toSeconds } from "./units.ts";

type Attrs = Record<string, string>;

interface PendingWorkout {
  attrs: Attrs;
  stats: Attrs[];
  metadata: Record<string, string>;
  routeFile: string | null;
}

interface DayAcc {
  hrv: number[];
  restingHr: number[];
  vo2: number[];
  stepsBySource: Map<string, number>;
  sleepSecBySource: Map<string, number>;
}

export interface ImportReport {
  workouts: number;
  metricDays: number;
  skipped: number;
  durationMs: number;
}

function buildWorkout(p: PendingWorkout): WorkoutInput | null {
  const a = p.attrs;
  if (!a.startDate || !a.endDate || !a.workoutActivityType) return null;
  const startedAt = toIso(a.startDate);
  const endedAt = toIso(a.endDate);

  let durationSec = toSeconds(num(a.duration), a.durationUnit ?? "min");
  if (!durationSec || durationSec <= 0) durationSec = secondsBetween(startedAt, endedAt);

  let distanceM = toMeters(num(a.totalDistance), a.totalDistanceUnit);
  let energyKcal = toKcal(num(a.totalEnergyBurned), a.totalEnergyBurnedUnit);
  let avgHr: number | null = null;
  let maxHr: number | null = null;

  for (const s of p.stats) {
    const type = s.type ?? "";
    if (type.startsWith("HKQuantityTypeIdentifierDistance") && distanceM == null) {
      distanceM = toMeters(num(s.sum), s.unit);
    } else if (type === "HKQuantityTypeIdentifierActiveEnergyBurned" && energyKcal == null) {
      energyKcal = toKcal(num(s.sum), s.unit);
    } else if (type === "HKQuantityTypeIdentifierHeartRate") {
      avgHr = num(s.average);
      maxHr = num(s.maximum);
    }
  }

  const asc = parseQtyUnit(p.metadata.HKElevationAscended);
  const desc = parseQtyUnit(p.metadata.HKElevationDescended);
  const ascentM = asc ? toMeters(asc.qty, asc.unit) : null;
  const descentM = desc ? toMeters(desc.qty, desc.unit) : null;

  const sport = refineTrail(sportFromActivityType(a.workoutActivityType), distanceM, ascentM);

  return {
    source: "apple_health_export",
    sourceId: p.metadata.HKExternalUUID ?? null,
    sport,
    activityType: a.workoutActivityType,
    startedAt,
    endedAt,
    durationSec,
    distanceM,
    ascentM,
    descentM,
    avgHr,
    maxHr,
    energyKcal,
    avgPaceSecPerKm: paceSecPerKm(distanceM, durationSec),
    deviceName: a.sourceName ?? null,
    raw: { attrs: a, stats: p.stats, metadata: p.metadata, routeFile: p.routeFile },
  };
}

function isWatch(sourceName: string | undefined): boolean {
  return /watch/i.test(sourceName ?? "");
}

export async function importAppleHealthXml(xmlStream: Readable): Promise<ImportReport> {
  const t0 = Date.now();
  const days = new Map<string, DayAcc>();
  const pending: WorkoutInput[] = [];
  let skipped = 0;
  let current: PendingWorkout | null = null;

  const day = (d: string): DayAcc => {
    let acc = days.get(d);
    if (!acc) {
      acc = { hrv: [], restingHr: [], vo2: [], stepsBySource: new Map(), sleepSecBySource: new Map() };
      days.set(d, acc);
    }
    return acc;
  };

  const parser = sax.createStream(true, { trim: true });

  parser.on("opentag", (node) => {
    const attrs = node.attributes as Attrs;
    switch (node.name) {
      case "Workout":
        current = { attrs, stats: [], metadata: {}, routeFile: null };
        break;
      case "WorkoutStatistics":
        current?.stats.push(attrs);
        break;
      case "MetadataEntry":
        if (current && attrs.key) current.metadata[attrs.key] = attrs.value;
        break;
      case "FileReference":
        if (current) current.routeFile = attrs.path ?? null;
        break;
      case "Record":
        handleRecord(attrs);
        break;
    }
  });

  parser.on("closetag", (name) => {
    if (name !== "Workout" || !current) return;
    const w = buildWorkout(current);
    if (w) pending.push(w);
    else skipped++;
    current = null;
  });

  function handleRecord(a: Attrs) {
    const type = a.type;
    if (!type || !a.startDate) return;
    const v = num(a.value);
    switch (type) {
      case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
        if (v != null) day(localDay(a.startDate)).hrv.push(v);
        break;
      case "HKQuantityTypeIdentifierRestingHeartRate":
        if (v != null) day(localDay(a.startDate)).restingHr.push(v);
        break;
      case "HKQuantityTypeIdentifierVO2Max":
        if (v != null) day(localDay(a.startDate)).vo2.push(v);
        break;
      case "HKQuantityTypeIdentifierStepCount": {
        if (v == null) return;
        const acc = day(localDay(a.startDate)).stepsBySource;
        const src = a.sourceName ?? "?";
        acc.set(src, (acc.get(src) ?? 0) + v);
        break;
      }
      case "HKCategoryTypeIdentifierSleepAnalysis": {
        // Seules les phases "Asleep*" comptent ; InBed est ignoré. La nuit est rattachée au jour du réveil.
        if (!a.value?.includes("Asleep") || !a.endDate) return;
        const sec = secondsBetween(toIso(a.startDate), toIso(a.endDate));
        const acc = day(localDay(a.endDate)).sleepSecBySource;
        const src = a.sourceName ?? "?";
        acc.set(src, (acc.get(src) ?? 0) + sec);
        break;
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    parser.on("error", (e) => {
      // sax s'arrête sur une erreur ; on tente de reprendre (entités HTML exotiques dans les métadonnées)
      (parser as unknown as { _parser: { error: unknown; resume: () => void } })._parser.error = null;
      (parser as unknown as { _parser: { error: unknown; resume: () => void } })._parser.resume();
      void e;
    });
    parser.on("end", resolve);
    xmlStream.on("error", reject);
    xmlStream.pipe(parser);
  });

  // Écriture en une transaction : des dizaines de milliers de lignes en une fraction de seconde.
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const preferWatch = (m: Map<string, number>): number | null => {
    if (m.size === 0) return null;
    const watch = [...m.entries()].filter(([s]) => isWatch(s));
    const pool = watch.length ? watch : [...m.entries()];
    return Math.max(...pool.map(([, v]) => v));
  };

  transaction(() => {
    for (const w of pending) upsertWorkout(w);
    for (const [date, acc] of days) {
      const sleepSec = preferWatch(acc.sleepSecBySource);
      upsertDailyMetric({
        date,
        hrvMs: avg(acc.hrv),
        restingHr: avg(acc.restingHr),
        vo2max: acc.vo2.at(-1) ?? null,
        steps: preferWatch(acc.stepsBySource),
        sleepMinutes: sleepSec == null ? null : sleepSec / 60,
      });
    }
  });
  reconcile();

  return { workouts: pending.length, metricDays: days.size, skipped, durationMs: Date.now() - t0 };
}

/** Ouvre soit un export.zip (contenant apple_health_export/export.xml), soit directement export.xml. */
export async function openAppleHealthExport(path: string): Promise<Readable> {
  if (!path.toLowerCase().endsWith(".zip")) return createReadStream(path);

  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip illisible"));
      zip.on("entry", (entry) => {
        if (/(^|\/)export\.xml$/i.test(entry.fileName)) {
          zip.openReadStream(entry, (e, stream) => {
            if (e || !stream) return reject(e ?? new Error("export.xml illisible"));
            resolve(stream);
          });
        } else {
          zip.readEntry();
        }
      });
      zip.on("end", () => reject(new Error("export.xml introuvable dans le zip")));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}
