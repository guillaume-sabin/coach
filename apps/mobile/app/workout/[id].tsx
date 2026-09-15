import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SPORT_LABELS, formatDuration, formatPace, type Sport } from "@coach/shared";
import { api } from "@/api";
import { bpm, formatDate, formatTime, km, meters, round } from "@/format";
import { SPORT_ICONS, useTheme } from "@/theme";
import { useQuery } from "@/useQuery";

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const q = useQuery(() => api.workout(id), [id]);
  const w = q.data;

  if (q.loading) return <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />;
  if (q.error || !w)
    return <Text style={{ color: "#e03131", margin: 16 }}>{q.error ?? "Séance introuvable"}</Text>;

  const sport = w.sport as Sport;
  const isRun = sport === "running" || sport === "trail_running";
  const speedKmh = w.distanceM && w.durationSec ? (w.distanceM / 1000) / (w.durationSec / 3600) : null;

  const rows: [string, string][] = [
    ["Durée", formatDuration(w.durationSec)],
    ["Distance", km(w.distanceM)],
    [isRun ? "Allure moyenne" : "Vitesse moyenne", isRun ? formatPace(w.avgPaceSecPerKm) : speedKmh ? `${round(speedKmh, 1)} km/h` : "–"],
    ["Dénivelé +", meters(w.ascentM)],
    ["Dénivelé −", meters(w.descentM)],
    ["FC moyenne", bpm(w.avgHr)],
    ["FC max", bpm(w.maxHr)],
    ["Énergie", w.energyKcal ? `${Math.round(w.energyKcal)} kcal` : "–"],
    ["Début", `${formatDate(w.startedAt)} ${formatTime(w.startedAt)}`],
    ["Fin", formatTime(w.endedAt)],
    ["Appareil", w.deviceName ?? "–"],
    ["Source", w.source === "apple_health_export" ? "Export Apple Santé" : w.source === "health_auto_export" ? "Health Auto Export" : w.source],
  ];

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: SPORT_LABELS[sport] ?? w.activityType }} />
      <View style={[styles.hero, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={styles.heroIcon}>{SPORT_ICONS[sport] ?? "🎽"}</Text>
        <Text style={[styles.heroTitle, { color: t.text }]}>{SPORT_LABELS[sport] ?? w.activityType}</Text>
        <Text style={{ color: t.muted }}>{w.activityType.replace("HKWorkoutActivityType", "")}</Text>
      </View>
      <View style={[styles.table, { backgroundColor: t.card, borderColor: t.border }]}>
        {rows.map(([label, value], i) => (
          <View key={label} style={[styles.tr, i > 0 && { borderTopWidth: 1, borderTopColor: t.border }]}>
            <Text style={{ color: t.muted }}>{label}</Text>
            <Text style={{ color: t.text, fontWeight: "600" }}>{value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, paddingBottom: 40, maxWidth: 720, width: "100%", alignSelf: "center" },
  hero: { borderRadius: 14, borderWidth: 1, padding: 20, alignItems: "center", marginBottom: 10 },
  heroIcon: { fontSize: 40 },
  heroTitle: { fontSize: 22, fontWeight: "700", marginTop: 6 },
  table: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14 },
  tr: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, gap: 12 },
});
