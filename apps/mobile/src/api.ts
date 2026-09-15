import { Platform } from "react-native";
import type { DailyMetric, Workout, WorkoutListResponse } from "@coach/shared";

const DEFAULT_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3210";
const STORAGE_KEY = "coach.apiUrl";

/**
 * Sur le web (et la PWA iPhone), l'URL de l'API peut être changée à chaud :
 *  - via ?api=http://192.168.1.10:3210 dans l'adresse, mémorisé ensuite dans localStorage
 *  - via l'écran Réglages
 */
export function getApiUrl(): string {
  if (Platform.OS !== "web" || typeof window === "undefined") return DEFAULT_URL;
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("api");
    if (fromQuery) {
      window.localStorage.setItem(STORAGE_KEY, fromQuery);
      return fromQuery;
    }
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

export function setApiUrl(url: string): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ""));
  } catch {
    /* stockage indisponible */
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`);
  if (!res.ok) throw new Error(`API ${res.status} sur ${path}`);
  return (await res.json()) as T;
}

export interface Stats {
  workouts: { total: number; first: string | null; last: string | null };
  metricDays: number;
  bySport: { sport: string; count: number }[];
}

export const api = {
  stats: () => get<Stats>("/stats"),
  workouts: (params: { limit?: number; offset?: number; sport?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    if (params.sport) q.set("sport", params.sport);
    return get<WorkoutListResponse>(`/workouts?${q}`);
  },
  workout: (id: string) => get<Workout & { raw: unknown }>(`/workouts/${id}`),
  dailyMetrics: (days = 60) => {
    const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    return get<{ items: DailyMetric[] }>(`/metrics/daily?from=${from}`);
  },
};
