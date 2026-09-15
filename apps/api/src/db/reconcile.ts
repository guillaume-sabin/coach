/**
 * Passes de réconciliation exécutées après chaque import / ingestion.
 *
 * 1. Doublons inter-sources : Strava (ou toute app tierce) enregistre parfois la même séance que la montre
 *    avec un décalage de quelques secondes. Quand deux séances de sources différentes démarrent à moins de
 *    DUPLICATE_WINDOW_SEC, on garde celle de la montre (elle a la FC) et on supprime l'autre.
 *
 * 2. Routine quotidienne : les séances "Cooldown" de la montre et les "Other" Strava non appariés sont en
 *    réalité la routine mobilité / étirements de Guillaume : la première du jour est de la mobilité, les
 *    suivantes des étirements. Le jour est calculé dans le fuseau LOCAL_TZ (défaut Europe/Paris).
 */
import { db } from "./index.ts";

const DUPLICATE_WINDOW_SEC = Number(process.env.DUPLICATE_WINDOW_SEC ?? 180);
const LOCAL_TZ = process.env.LOCAL_TZ ?? "Europe/Paris";

const dayFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: LOCAL_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export const localDayOf = (iso: string): string => dayFmt.format(new Date(iso));

export interface ReconcileReport {
  duplicatesRemoved: number;
  mobility: number;
  stretching: number;
}

/** Sources considérées comme secondaires : perdent face à la montre en cas de doublon. */
const SECONDARY_DEVICES = ["Strava"];

export function reconcile(): ReconcileReport {
  return db.transaction(() => {
    const duplicatesRemoved = removeCrossSourceDuplicates();
    const routine = classifyDailyRoutine();
    return { duplicatesRemoved, ...routine };
  });
}

function removeCrossSourceDuplicates(): number {
  const placeholders = SECONDARY_DEVICES.map(() => "?").join(",");
  const res = db.$client
    .prepare(
      `DELETE FROM workouts
        WHERE device_name IN (${placeholders})
          AND EXISTS (
            SELECT 1 FROM workouts b
             WHERE b.id != workouts.id
               AND (b.device_name IS NULL OR b.device_name NOT IN (${placeholders}))
               AND abs(julianday(b.started_at) - julianday(workouts.started_at)) * 86400 < ?
          )`,
    )
    .run(...SECONDARY_DEVICES, ...SECONDARY_DEVICES, DUPLICATE_WINDOW_SEC);
  return res.changes;
}

function classifyDailyRoutine(): { mobility: number; stretching: number } {
  const rows = db.$client
    .prepare(
      `SELECT id, started_at FROM workouts
        WHERE activity_type LIKE '%Cooldown'
           OR (activity_type LIKE '%TypeOther' AND device_name IN (${SECONDARY_DEVICES.map(() => "?").join(",")}))
           OR sport IN ('mobility', 'stretching')
        ORDER BY started_at`,
    )
    .all(...SECONDARY_DEVICES) as { id: string; started_at: string }[];

  const update = db.$client.prepare("UPDATE workouts SET sport = ? WHERE id = ? AND sport != ?");
  const rankByDay = new Map<string, number>();
  let mobility = 0;
  let stretching = 0;

  for (const r of rows) {
    const day = localDayOf(r.started_at);
    const rank = (rankByDay.get(day) ?? 0) + 1;
    rankByDay.set(day, rank);
    const sport = rank === 1 ? "mobility" : "stretching";
    update.run(sport, r.id, sport);
    if (sport === "mobility") mobility++;
    else stretching++;
  }
  return { mobility, stretching };
}
