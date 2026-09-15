/**
 * Ingestion depuis l'app iOS native (apps/ios) : séances déjà normalisées et métriques journalières.
 * Contrat : `IngestPayload` dans apps/ios/Coach/Services/Sync/APIClient.swift.
 */
import { z } from "zod";
import { DailyMetric, Sport, paceSecPerKm } from "@coach/shared";
import { reconcile } from "../db/reconcile.ts";
import { transaction, upsertDailyMetric, upsertWorkout } from "../db/repo.ts";

const WorkoutIn = z.object({
  source: z.literal("ios_app").default("ios_app"),
  sourceId: z.string().nullish(),
  sport: Sport,
  activityType: z.string(),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }),
  durationSec: z.number().nonnegative(),
  distanceM: z.number().nullish(),
  ascentM: z.number().nullish(),
  descentM: z.number().nullish(),
  avgHr: z.number().nullish(),
  maxHr: z.number().nullish(),
  energyKcal: z.number().nullish(),
  avgPaceSecPerKm: z.number().nullish(),
  deviceName: z.string().nullish(),
});

export const AppIngestPayload = z.object({
  workouts: z.array(WorkoutIn).default([]),
  metrics: z.array(DailyMetric.partial().required({ date: true })).default([]),
});

export function ingestFromApp(payload: unknown): { workouts: number; metrics: number } {
  const data = AppIngestPayload.parse(payload);
  transaction(() => {
    for (const w of data.workouts) {
      const startedAt = new Date(w.startedAt).toISOString();
      upsertWorkout({
        source: "ios_app",
        sourceId: w.sourceId ?? null,
        sport: w.sport,
        activityType: w.activityType,
        startedAt,
        endedAt: new Date(w.endedAt).toISOString(),
        durationSec: w.durationSec,
        distanceM: w.distanceM ?? null,
        ascentM: w.ascentM ?? null,
        descentM: w.descentM ?? null,
        avgHr: w.avgHr ?? null,
        maxHr: w.maxHr ?? null,
        energyKcal: w.energyKcal ?? null,
        avgPaceSecPerKm: w.avgPaceSecPerKm ?? paceSecPerKm(w.distanceM ?? null, w.durationSec),
        deviceName: w.deviceName ?? null,
        raw: w,
      });
    }
    for (const m of data.metrics) upsertDailyMetric(m);
  });
  reconcile();
  return { workouts: data.workouts.length, metrics: data.metrics.length };
}
