export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function km(m: number | null): string {
  return m == null ? "–" : `${(m / 1000).toFixed(m >= 10_000 ? 1 : 2)} km`;
}

export function meters(m: number | null): string {
  return m == null ? "–" : `${Math.round(m)} m`;
}

export function bpm(v: number | null): string {
  return v == null ? "–" : `${Math.round(v)} bpm`;
}

export function round(v: number | null, digits = 0): string {
  return v == null ? "–" : v.toFixed(digits);
}
