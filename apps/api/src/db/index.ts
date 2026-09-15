import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.ts";

const path = process.env.DATABASE_PATH ?? "./data/coach.db";
mkdirSync(dirname(path), { recursive: true });

const sqlite = new Database(path);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
export { schema };

/** Crée les tables si absentes (évite d'imposer drizzle-kit au premier lancement). */
export function ensureSchema(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT,
      sport TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_sec REAL NOT NULL,
      distance_m REAL,
      ascent_m REAL,
      descent_m REAL,
      avg_hr REAL,
      max_hr REAL,
      energy_kcal REAL,
      avg_pace_sec_per_km REAL,
      device_name TEXT,
      raw TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS workouts_started_at_idx ON workouts(started_at);
    CREATE UNIQUE INDEX IF NOT EXISTS workouts_dedupe_idx ON workouts(started_at);

    CREATE TABLE IF NOT EXISTS daily_metrics (
      date TEXT PRIMARY KEY,
      hrv_ms REAL,
      resting_hr REAL,
      vo2max REAL,
      sleep_minutes REAL,
      steps REAL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingest_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      received_at TEXT NOT NULL,
      workouts_upserted INTEGER NOT NULL,
      metrics_upserted INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      error TEXT
    );
  `);
}
