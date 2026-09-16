import { z } from "zod";

/** Sports normalisés utilisés par toute l'app (mobile, web, API, coach). */
export const Sport = z.enum([
  "running",
  "trail_running",
  "hiking",
  "walking",
  "cycling",
  "swimming",
  "strength",
  "mobility",
  "stretching",
  "other",
]);
export type Sport = z.infer<typeof Sport>;

/** Une séance normalisée, indépendante de la source (HealthKit, export XML, Health Auto Export). */
export const Workout = z.object({
  id: z.string(),
  source: z.enum(["apple_health_export", "health_auto_export", "ios_app", "manual"]),
  sourceId: z.string().nullable(),
  sport: Sport,
  activityType: z.string(),
  startedAt: z.string(), // ISO 8601
  endedAt: z.string(),
  durationSec: z.number(),
  distanceM: z.number().nullable(),
  ascentM: z.number().nullable(),
  descentM: z.number().nullable(),
  avgHr: z.number().nullable(),
  maxHr: z.number().nullable(),
  energyKcal: z.number().nullable(),
  avgPaceSecPerKm: z.number().nullable(),
  deviceName: z.string().nullable(),
  createdAt: z.string(),
});
export type Workout = z.infer<typeof Workout>;

/** Métriques journalières de récupération issues de la montre. */
export const DailyMetric = z.object({
  date: z.string(), // YYYY-MM-DD
  hrvMs: z.number().nullable(),
  restingHr: z.number().nullable(),
  vo2max: z.number().nullable(),
  sleepMinutes: z.number().nullable(),
  steps: z.number().nullable(),
});
export type DailyMetric = z.infer<typeof DailyMetric>;

export const WorkoutListResponse = z.object({
  items: z.array(Workout),
  total: z.number(),
});
export type WorkoutListResponse = z.infer<typeof WorkoutListResponse>;

export const SPORT_LABELS: Record<Sport, string> = {
  running: "Course à pied",
  trail_running: "Trail",
  hiking: "Randonnée",
  walking: "Marche",
  cycling: "Vélo",
  swimming: "Natation",
  strength: "Renforcement",
  mobility: "Mobilité",
  stretching: "Étirements",
  other: "Autre",
};

/** Sports "légers" exclus du volume d'entraînement mais utiles au suivi de routine. */
export const ROUTINE_SPORTS: readonly Sport[] = ["mobility", "stretching"];

/** Mapping HKWorkoutActivityType (ou libellé Health Auto Export) -> sport normalisé. */
export function sportFromActivityType(activityType: string): Sport {
  const t = activityType.replace("HKWorkoutActivityType", "").toLowerCase().trim();
  if (t.includes("trail")) return "trail_running";
  if (t === "running" || t.includes("run")) return "running";
  if (t === "hiking" || t.includes("hik")) return "hiking";
  if (t === "walking" || t.includes("walk")) return "walking";
  if (t === "cycling" || t.includes("cycl") || t.includes("bike")) return "cycling";
  if (t === "swimming" || t.includes("swim")) return "swimming";
  // Sur la montre, Guillaume enregistre mobilité et étirements en "Cooldown" ; la 1re du jour est de la
  // mobilité, la suivante des étirements. Le rang est appliqué après import (voir api/db/reconcile.ts).
  if (t === "cooldown" || t.includes("flexibility") || t.includes("mobility")) return "mobility";
  if (t.includes("stretch")) return "stretching";
  if (
    t.includes("strength") ||
    t.includes("functional") ||
    t.includes("core") ||
    t.includes("crosstraining") ||
    t.includes("cross training")
  )
    return "strength";
  return "other";
}

/** Heuristique trail : une course avec beaucoup de dénivelé rapporté à la distance (>= 25 m D+/km). */
export function refineTrail(sport: Sport, distanceM: number | null, ascentM: number | null): Sport {
  if (sport !== "running" || !distanceM || !ascentM || distanceM < 1000) return sport;
  const mPerKm = ascentM / (distanceM / 1000);
  return mPerKm >= 25 ? "trail_running" : sport;
}

export function paceSecPerKm(distanceM: number | null, durationSec: number): number | null {
  if (!distanceM || distanceM < 100 || durationSec <= 0) return null;
  return durationSec / (distanceM / 1000);
}

export function formatPace(secPerKm: number | null): string {
  if (!secPerKm || !isFinite(secPerKm)) return "–";
  // Arrondir le total avant de séparer minutes et secondes : sinon 359,6 s donnerait « 5:60 ».
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")} /km`;
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} h ${m.toString().padStart(2, "0")}` : `${m} min`;
}
