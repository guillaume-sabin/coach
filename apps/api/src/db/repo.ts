import { desc, eq, sql, and, gte, lte } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { DailyMetric, Workout } from "@coach/shared";
import { db, schema } from "./index.ts";

export type WorkoutInput = Omit<Workout, "id" | "createdAt"> & { raw?: unknown };

/** Id stable et déterministe : même instant de début => même id, quelle que soit la source. */
export function workoutId(startedAt: string): string {
  return createHash("sha1").update(startedAt).digest("hex").slice(0, 20);
}

/** Insère ou complète une séance. Les valeurs nulles n'écrasent jamais une valeur existante. */
export function upsertWorkout(w: WorkoutInput): void {
  const id = workoutId(w.startedAt);
  const now = new Date().toISOString();
  db.insert(schema.workouts)
    .values({ ...w, id, raw: w.raw ?? null, createdAt: now })
    .onConflictDoUpdate({
      target: schema.workouts.startedAt,
      set: {
        source: w.source,
        sourceId: w.sourceId,
        sport: w.sport,
        endedAt: w.endedAt,
        durationSec: w.durationSec,
        distanceM: sql`coalesce(${w.distanceM}, ${schema.workouts.distanceM})`,
        ascentM: sql`coalesce(${w.ascentM}, ${schema.workouts.ascentM})`,
        descentM: sql`coalesce(${w.descentM}, ${schema.workouts.descentM})`,
        avgHr: sql`coalesce(${w.avgHr}, ${schema.workouts.avgHr})`,
        maxHr: sql`coalesce(${w.maxHr}, ${schema.workouts.maxHr})`,
        energyKcal: sql`coalesce(${w.energyKcal}, ${schema.workouts.energyKcal})`,
        avgPaceSecPerKm: sql`coalesce(${w.avgPaceSecPerKm}, ${schema.workouts.avgPaceSecPerKm})`,
        deviceName: sql`coalesce(${w.deviceName}, ${schema.workouts.deviceName})`,
        raw: w.raw ?? null,
      },
    })
    .run();
}

export function upsertDailyMetric(m: Partial<DailyMetric> & { date: string }): void {
  const now = new Date().toISOString();
  db.insert(schema.dailyMetrics)
    .values({ ...m, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.dailyMetrics.date,
      set: {
        hrvMs: sql`coalesce(${m.hrvMs ?? null}, ${schema.dailyMetrics.hrvMs})`,
        restingHr: sql`coalesce(${m.restingHr ?? null}, ${schema.dailyMetrics.restingHr})`,
        vo2max: sql`coalesce(${m.vo2max ?? null}, ${schema.dailyMetrics.vo2max})`,
        sleepMinutes: sql`coalesce(${m.sleepMinutes ?? null}, ${schema.dailyMetrics.sleepMinutes})`,
        steps: sql`coalesce(${m.steps ?? null}, ${schema.dailyMetrics.steps})`,
        updatedAt: now,
      },
    })
    .run();
}

export function listWorkouts(opts: {
  limit: number;
  offset: number;
  from?: string;
  to?: string;
  sport?: string;
}) {
  const conds = [];
  if (opts.from) conds.push(gte(schema.workouts.startedAt, opts.from));
  if (opts.to) conds.push(lte(schema.workouts.startedAt, opts.to));
  if (opts.sport) conds.push(eq(schema.workouts.sport, opts.sport));
  const where = conds.length ? and(...conds) : undefined;

  const items = db
    .select()
    .from(schema.workouts)
    .where(where)
    .orderBy(desc(schema.workouts.startedAt))
    .limit(opts.limit)
    .offset(opts.offset)
    .all()
    .map(({ raw: _raw, ...w }) => w);
  const [{ total }] = db
    .select({ total: sql<number>`count(*)` })
    .from(schema.workouts)
    .where(where)
    .all();
  return { items, total };
}

export function getWorkout(id: string) {
  return db.select().from(schema.workouts).where(eq(schema.workouts.id, id)).get() ?? null;
}

export function listDailyMetrics(from: string, to: string) {
  return db
    .select()
    .from(schema.dailyMetrics)
    .where(and(gte(schema.dailyMetrics.date, from), lte(schema.dailyMetrics.date, to)))
    .orderBy(schema.dailyMetrics.date)
    .all();
}

export function logIngest(entry: Omit<typeof schema.ingestLog.$inferInsert, "id">): void {
  db.insert(schema.ingestLog).values(entry).run();
}

export function stats() {
  const [w] = db
    .select({
      total: sql<number>`count(*)`,
      first: sql<string | null>`min(started_at)`,
      last: sql<string | null>`max(started_at)`,
    })
    .from(schema.workouts)
    .all();
  const [m] = db.select({ days: sql<number>`count(*)` }).from(schema.dailyMetrics).all();
  const bySport = db
    .select({ sport: schema.workouts.sport, count: sql<number>`count(*)` })
    .from(schema.workouts)
    .groupBy(schema.workouts.sport)
    .all();
  return { workouts: w, metricDays: m.days, bySport };
}

/** Exécute une fonction dans une transaction SQLite (import en masse). */
export function transaction<T>(fn: () => T): T {
  return db.transaction(fn);
}
