import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ROUTINE_SPORTS, SPORT_LABELS, formatDuration, formatPace, type Sport, type Workout } from "@coach/shared";
import { api } from "@/api";
import { formatDate, km, meters } from "@/format";
import { SPORT_COLORS, SPORT_ICONS, useTheme } from "@/theme";
import { useQuery } from "@/useQuery";

const FILTERS: (Sport | "all")[] = ["all", "running", "trail_running", "hiking", "cycling", "strength", "mobility", "stretching"];

export default function WorkoutsScreen() {
  const t = useTheme();
  const router = useRouter();
  const [sport, setSport] = useState<Sport | "all">("all");
  const workouts = useQuery(() => api.workouts({ limit: 200, sport: sport === "all" ? undefined : sport }), [sport]);
  const stats = useQuery(() => api.stats(), []);

  const weekly = useMemo(() => summarizeWeek(workouts.data?.items ?? []), [workouts.data]);

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <FlatList
        data={workouts.data?.items ?? []}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={workouts.loading} onRefresh={workouts.refetch} tintColor={t.accent} />}
        ListHeaderComponent={
          <View>
            <View style={styles.row}>
              <StatCard label="7 jours (hors routine)" value={formatDuration(weekly.durationSec)} sub={`${km(weekly.distanceM)} · ${meters(weekly.ascentM)} D+`} />
              <StatCard label="Séances" value={String(stats.data?.workouts.total ?? "–")} sub={stats.data?.workouts.first ? `depuis ${new Date(stats.data.workouts.first).getFullYear()}` : ""} />
            </View>
            <View style={styles.row}>
              <Pressable onPress={() => router.push("/recovery")} style={[styles.linkBtn, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={[styles.linkText, { color: t.text }]}>💤 Récupération</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/settings")} style={[styles.linkBtn, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={[styles.linkText, { color: t.text }]}>⚙️ Réglages</Text>
              </Pressable>
            </View>
            <FlatList
              horizontal
              data={FILTERS}
              keyExtractor={(f) => f}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
              renderItem={({ item }) => {
                const active = item === sport;
                return (
                  <Pressable
                    onPress={() => setSport(item)}
                    style={[styles.chip, { backgroundColor: active ? t.accent : t.card, borderColor: active ? t.accent : t.border }]}
                  >
                    <Text style={{ color: active ? "#fff" : t.text, fontWeight: "600" }}>
                      {item === "all" ? "Tout" : SPORT_LABELS[item]}
                    </Text>
                  </Pressable>
                );
              }}
            />
            {workouts.error && (
              <View style={[styles.card, { backgroundColor: t.card, borderColor: "#e03131" }]}>
                <Text style={{ color: "#e03131", fontWeight: "600" }}>API injoignable</Text>
                <Text style={{ color: t.muted, marginTop: 4 }}>{workouts.error}</Text>
                <Text style={{ color: t.muted, marginTop: 4 }}>Vérifiez l'URL dans Réglages et que l'API tourne.</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !workouts.loading && !workouts.error ? (
            <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={{ color: t.text, fontWeight: "600" }}>Aucune séance pour l'instant</Text>
              <Text style={{ color: t.muted, marginTop: 4 }}>
                Importez votre export Apple Santé ou configurez Health Auto Export vers l'API.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => <WorkoutRow w={item} />}
      />
    </View>
  );
}

function WorkoutRow({ w }: { w: Workout }) {
  const t = useTheme();
  const router = useRouter();
  const color = SPORT_COLORS[w.sport as Sport] ?? SPORT_COLORS.other;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/workout/[id]", params: { id: w.id } })}
      style={[styles.card, styles.workout, { backgroundColor: t.card, borderColor: t.border }]}
    >
        <View style={[styles.iconWrap, { backgroundColor: color + "22" }]}>
          <Text style={styles.icon}>{SPORT_ICONS[w.sport as Sport] ?? "🎽"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.between}>
            <Text style={[styles.title, { color: t.text }]}>{SPORT_LABELS[w.sport as Sport] ?? w.activityType}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>{formatDate(w.startedAt)}</Text>
          </View>
          <Text style={{ color: t.muted, marginTop: 2 }}>
            {formatDuration(w.durationSec)}
            {w.distanceM ? ` · ${km(w.distanceM)}` : ""}
            {w.ascentM && w.ascentM > 20 ? ` · ${meters(w.ascentM)} D+` : ""}
            {w.avgPaceSecPerKm && (w.sport === "running" || w.sport === "trail_running") ? ` · ${formatPace(w.avgPaceSecPerKm)}` : ""}
            {w.avgHr ? ` · ${Math.round(w.avgHr)} bpm` : ""}
          </Text>
        </View>
    </Pressable>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { flex: 1, backgroundColor: t.card, borderColor: t.border }]}>
      <Text style={{ color: t.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: "700", marginTop: 4 }}>{value}</Text>
      {sub ? <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

function summarizeWeek(items: Workout[]) {
  const since = Date.now() - 7 * 86400_000;
  return items
    .filter((w) => new Date(w.startedAt).getTime() >= since && !ROUTINE_SPORTS.includes(w.sport as Sport))
    .reduce(
      (acc, w) => ({
        durationSec: acc.durationSec + w.durationSec,
        distanceM: acc.distanceM + (w.distanceM ?? 0),
        ascentM: acc.ascentM + (w.ascentM ?? 0),
      }),
      { durationSec: 0, distanceM: 0, ascentM: 0 },
    );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 12, paddingBottom: 40, maxWidth: 720, width: "100%", alignSelf: "center" },
  row: { flexDirection: "row", gap: 10 },
  filters: { gap: 8, paddingVertical: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  linkBtn: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "center", marginBottom: 4 },
  linkText: { fontWeight: "600" },
  workout: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  icon: { fontSize: 22 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  title: { fontSize: 16, fontWeight: "600" },
});
