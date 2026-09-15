/**
 * Apple Santé et Health Auto Export datent au format "2024-03-10 07:12:34 +0100".
 * On normalise en ISO 8601 UTC pour le stockage, et on garde la date locale (YYYY-MM-DD)
 * pour agréger les métriques journalières du point de vue de l'utilisateur.
 */
export function toIso(appleDate: string): string {
  const s = appleDate.trim();
  // Déjà ISO ?
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toISOString();
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\s*([+-]\d{2}:?\d{2}|Z))?$/);
  if (!m) {
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new Error(`Date illisible : ${appleDate}`);
    return d.toISOString();
  }
  const tz = m[3] ? m[3].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2") : "Z";
  return new Date(`${m[1]}T${m[2]}${tz}`).toISOString();
}

/** Date locale telle qu'écrite par la source (avant conversion UTC). */
export function localDay(appleDate: string): string {
  return appleDate.trim().slice(0, 10);
}

export function secondsBetween(startIso: string, endIso: string): number {
  return Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
}
