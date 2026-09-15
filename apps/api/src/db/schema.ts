import { sqliteTable, text, real, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workouts = sqliteTable(
  "workouts",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    sport: text("sport").notNull(),
    activityType: text("activity_type").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at").notNull(),
    durationSec: real("duration_sec").notNull(),
    distanceM: real("distance_m"),
    ascentM: real("ascent_m"),
    descentM: real("descent_m"),
    avgHr: real("avg_hr"),
    maxHr: real("max_hr"),
    energyKcal: real("energy_kcal"),
    avgPaceSecPerKm: real("avg_pace_sec_per_km"),
    deviceName: text("device_name"),
    /** Payload brut de la source, conservé tel quel (colonne JSON). */
    raw: text("raw", { mode: "json" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("workouts_started_at_idx").on(t.startedAt),
    // Dédoublonnage : une séance = même instant de début, quelle que soit la source ou le libellé du type
    uniqueIndex("workouts_dedupe_idx").on(t.startedAt),
  ],
);

export const dailyMetrics = sqliteTable("daily_metrics", {
  date: text("date").primaryKey(), // YYYY-MM-DD
  hrvMs: real("hrv_ms"),
  restingHr: real("resting_hr"),
  vo2max: real("vo2max"),
  sleepMinutes: real("sleep_minutes"),
  steps: real("steps"),
  updatedAt: text("updated_at").notNull(),
});

/** Journal des envois reçus (debug + rejouabilité). */
export const ingestLog = sqliteTable("ingest_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  receivedAt: text("received_at").notNull(),
  workoutsUpserted: integer("workouts_upserted").notNull(),
  metricsUpserted: integer("metrics_upserted").notNull(),
  bytes: integer("bytes").notNull(),
  error: text("error"),
});
