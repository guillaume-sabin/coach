/**
 * Ingestion des envois de l'app iOS "Health Auto Export" (automatisation REST API, format JSON).
 *
 * Le format exact varie selon la version de l'app et les options cochées ; ce parseur est volontairement
 * tolérant : il cherche les champs sous plusieurs noms, conserve le brut, et ne rejette jamais un
 * workout pour un champ secondaire manquant. Forme générale attendue :
 *
 * {
 *   "data": {
 *     "workouts": [{ "name": "Outdoor Run", "start": "...", "end": "...", "duration": 3600,
 *                    "distance": {"qty": 10.2, "units": "km"}, "activeEnergyBurned": {...},
 *                    "elevationUp": {"qty": 120, "units": "m"}, "avgHeartRate": {"qty": 150, "units": "bpm"},
 *                    "maxHeartRate": {...}, "heartRateData": [...], "route": [...] }],
 *     "metrics":  [{ "name": "heart_rate_variability", "units": "ms", "data": [{"date": "...", "qty": 45}] },
 *                  { "name": "sleep_analysis", "units": "hr", "data": [{"date": "...", "asleep": 7.1, ...}] }]
 *   }
 * }
 */
import { paceSecPerKm, refineTrail, sportFromActivityType } from "@coach/shared";
import { reconcile } from "../db/reconcile.ts";
import { transaction, upsertDailyMetric, upsertWorkout, type WorkoutInput } from "../db/repo.ts";
import { localDay, secondsBetween, toIso } from "./dates.ts";
import { num, toKcal, toMeters, toMinutes, toSeconds } from "./units.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lit une quantité qui peut être un nombre nu ou un objet {qty, units}. */
function qty(v: unknown): { qty: number | null; unit: string | null } {
  if (isObj(v)) return { qty: num(v.qty ?? v.value), unit: (v.units ?? v.unit) as string | null };
  return { qty: num(v), unit: null };
}

function first(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] != null) return o[k];
  return undefined;
}

export function parseWorkout(w: Obj): WorkoutInput | null {
  const start = first(w, ["start", "startDate", "start_date"]);
  const end = first(w, ["end", "endDate", "end_date"]);
  const name = String(first(w, ["name", "workoutActivityType", "type", "activityType"]) ?? "Other");
  if (typeof start !== "string" || typeof end !== "string") return null;

  const startedAt = toIso(start);
  const endedAt = toIso(end);

  const dur = qty(first(w, ["duration"]));
  let durationSec = toSeconds(dur.qty, dur.unit ?? "s");
  const wall = secondsBetween(startedAt, endedAt);
  // Si la durée déclarée est incohérente (ex : exprimée en minutes sans unité), on se rabat sur l'horloge.
  if (!durationSec || durationSec <= 0 || durationSec > wall * 1.05 + 60) durationSec = wall;

  const dist = qty(first(w, ["distance", "totalDistance"]));
  const energy = qty(first(w, ["activeEnergyBurned", "activeEnergy", "totalEnergyBurned", "energy"]));
  const up = qty(first(w, ["elevationUp", "elevationAscended", "totalAscent", "ascent"]));
  const down = qty(first(w, ["elevationDown", "elevationDescended", "totalDescent", "descent"]));
  const elev = first(w, ["elevation"]);
  const avgHr = qty(first(w, ["avgHeartRate", "averageHeartRate", "heartRateAverage"]));
  const maxHr = qty(first(w, ["maxHeartRate", "heartRateMaximum"]));

  let ascentM = toMeters(up.qty, up.unit);
  let descentM = toMeters(down.qty, down.unit);
  if (isObj(elev)) {
    const u = (elev.units as string) ?? "m";
    ascentM ??= toMeters(num(elev.ascent), u);
    descentM ??= toMeters(num(elev.descent), u);
  }

  const distanceM = toMeters(dist.qty, dist.unit ?? "km");
  const sport = refineTrail(sportFromActivityType(name), distanceM, ascentM);

  return {
    source: "health_auto_export",
    sourceId: typeof w.id === "string" ? w.id : null,
    sport,
    activityType: name,
    startedAt,
    endedAt,
    durationSec,
    distanceM,
    ascentM,
    descentM,
    avgHr: avgHr.qty,
    maxHr: maxHr.qty,
    energyKcal: toKcal(energy.qty, energy.unit),
    avgPaceSecPerKm: paceSecPerKm(distanceM, durationSec),
    deviceName: typeof w.source === "string" ? w.source : null,
    raw: w,
  };
}

const METRIC_FIELD: Record<string, "hrvMs" | "restingHr" | "vo2max" | "steps"> = {
  heart_rate_variability: "hrvMs",
  hrv: "hrvMs",
  resting_heart_rate: "restingHr",
  vo2_max: "vo2max",
  vo2max: "vo2max",
  step_count: "steps",
  steps: "steps",
};

export function ingestHealthAutoExport(payload: unknown): { workouts: number; metrics: number } {
  const root = isObj(payload) && isObj(payload.data) ? payload.data : isObj(payload) ? payload : {};
  const workoutsIn = Array.isArray(root.workouts) ? (root.workouts as unknown[]) : [];
  const metricsIn = Array.isArray(root.metrics) ? (root.metrics as unknown[]) : [];

  const parsed = workoutsIn.filter(isObj).map(parseWorkout).filter((w): w is WorkoutInput => !!w);

  // Agrégation par jour local : plusieurs échantillons HRV par jour -> moyenne.
  const perDay = new Map<string, Partial<Record<"hrvMs" | "restingHr" | "vo2max" | "steps" | "sleepMinutes", number[]>>>();
  const push = (date: string, field: keyof (typeof perDay extends Map<string, infer V> ? V : never), v: number | null) => {
    if (v == null) return;
    const d = perDay.get(date) ?? {};
    (d[field] ??= []).push(v);
    perDay.set(date, d);
  };

  for (const m of metricsIn) {
    if (!isObj(m) || typeof m.name !== "string" || !Array.isArray(m.data)) continue;
    const name = m.name.toLowerCase();
    const unit = typeof m.units === "string" ? m.units : null;

    for (const point of m.data) {
      if (!isObj(point) || typeof point.date !== "string") continue;
      const date = localDay(point.date);
      if (name === "sleep_analysis") {
        // "asleep" total ; sinon somme des phases. Health Auto Export exprime en heures par défaut.
        const asleep =
          num(point.asleep) ??
          num(point.totalSleep) ??
          [point.core, point.deep, point.rem].map(num).reduce<number | null>((s, x) => (x == null ? s : (s ?? 0) + x), null);
        const wake = typeof point.sleepEnd === "string" ? localDay(point.sleepEnd) : date;
        push(wake, "sleepMinutes", toMinutes(asleep, unit ?? "hr"));
      } else {
        const field = METRIC_FIELD[name];
        if (field) push(date, field, num(point.qty ?? point.value ?? point.avg));
      }
    }
  }

  transaction(() => {
    for (const w of parsed) upsertWorkout(w);
    for (const [date, d] of perDay) {
      const avg = (xs?: number[]) => (xs?.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
      const sum = (xs?: number[]) => (xs?.length ? xs.reduce((s, x) => s + x, 0) : null);
      upsertDailyMetric({
        date,
        hrvMs: avg(d.hrvMs),
        restingHr: avg(d.restingHr),
        vo2max: d.vo2max?.at(-1) ?? null,
        steps: sum(d.steps),
        sleepMinutes: sum(d.sleepMinutes),
      });
    }
  });
  reconcile();

  return { workouts: parsed.length, metrics: perDay.size };
}
