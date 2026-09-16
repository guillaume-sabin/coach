import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { db, ensureSchema } from "../src/db/index.ts";
import type { WorkoutInput } from "../src/db/repo.ts";

ensureSchema();

/** Vide toutes les tables : à appeler dans `beforeEach` pour isoler les tests d'un même fichier. */
export function resetDb(): void {
  db.$client.exec("DELETE FROM workouts; DELETE FROM daily_metrics; DELETE FROM ingest_log;");
}

export interface WorkoutRow {
  id: string;
  source: string;
  source_id: string | null;
  sport: string;
  activity_type: string;
  started_at: string;
  ended_at: string;
  duration_sec: number;
  distance_m: number | null;
  ascent_m: number | null;
  descent_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  energy_kcal: number | null;
  avg_pace_sec_per_km: number | null;
  device_name: string | null;
  raw: string | null;
  created_at: string;
}

export interface DailyMetricRow {
  date: string;
  hrv_ms: number | null;
  resting_hr: number | null;
  vo2max: number | null;
  sleep_minutes: number | null;
  steps: number | null;
  updated_at: string;
}

export interface IngestLogRow {
  id: number;
  source: string;
  received_at: string;
  workouts_upserted: number;
  metrics_upserted: number;
  bytes: number;
  error: string | null;
}

export const rows = {
  workouts: () => db.$client.prepare("SELECT * FROM workouts ORDER BY started_at").all() as WorkoutRow[],
  metrics: () => db.$client.prepare("SELECT * FROM daily_metrics ORDER BY date").all() as DailyMetricRow[],
  ingestLog: () => db.$client.prepare("SELECT * FROM ingest_log ORDER BY id").all() as IngestLogRow[],
};

/** Fabrique une séance minimale ; tout champ peut être surchargé. */
export function makeWorkout(overrides: Partial<WorkoutInput> & { startedAt: string }): WorkoutInput {
  const startedAt = new Date(overrides.startedAt).toISOString();
  const durationSec = overrides.durationSec ?? 1800;
  return {
    source: "apple_health_export",
    sourceId: null,
    sport: "running",
    activityType: "HKWorkoutActivityTypeRunning",
    endedAt: new Date(new Date(startedAt).getTime() + durationSec * 1000).toISOString(),
    durationSec,
    distanceM: null,
    ascentM: null,
    descentM: null,
    avgHr: null,
    maxHr: null,
    energyKcal: null,
    avgPaceSecPerKm: null,
    deviceName: "Apple Watch de Guillaume",
    ...overrides,
    startedAt,
  };
}

const samplesDir = new URL("../../../_context/samples/", import.meta.url);

export function sampleText(name: string): string {
  return readFileSync(new URL(name, samplesDir), "utf8");
}

export function sampleJson<T = unknown>(name: string): T {
  return JSON.parse(sampleText(name)) as T;
}

export function sampleStream(name: string): Readable {
  return Readable.from([sampleText(name)]);
}

export function xmlStream(xml: string): Readable {
  return Readable.from([xml]);
}
