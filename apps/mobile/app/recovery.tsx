import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { DailyMetric } from "@coach/shared";
import { api } from "@/api";
import { round } from "@/format";
import { useTheme } from "@/theme";
import { useQuery } from "@/useQuery";

/** Métriques de récupération des 60 derniers jours : HRV, FC repos, sommeil, VO2max. */
export default function RecoveryScreen() {
  const t = useTheme();
  const q = useQuery(() => api.dailyMetrics(60), []);
  const items = [...(q.data?.items ?? [])].reverse();

  if (q.loading) return <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />;
  if (q.error) return <Text style={{ color: "#e03131", margin: 16 }}>{q.error}</Text>;

  const last7 = items.slice(0, 7);
  const prev28 = items.slice(7, 35);
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };

  const cards: { label: string; now: number | null; base: number | null; unit: string; higherIsBetter: boolean; digits?: number }[] = [
    { label: "HRV", now: avg(last7.map((d) => d.hrvMs)), base: avg(prev28.map((d) => d.hrvMs)), unit: "ms", higherIsBetter: true },
    { label: "FC repos", now: avg(last7.map((d) => d.restingHr)), base: avg(prev28.map((d) => d.restingHr)), unit: "bpm", higherIsBetter: false },
    { label: "Sommeil", now: avg(last7.map((d) => d.sleepMinutes)), base: avg(prev28.map((d) => d.sleepMinutes)), unit: "min", higherIsBetter: true },
    { label: "VO₂max", now: items.find((d) => d.vo2max != null)?.vo2max ?? null, base: null, unit: "", higherIsBetter: true, digits: 1 },
  ];

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.container}>
      <Text style={{ color: t.muted, marginBottom: 10 }}>Moyenne des 7 derniers jours comparée aux 4 semaines précédentes.</Text>
      <View style={styles.grid}>
        {cards.map((c) => {
          const delta = c.now != null && c.base != null ? c.now - c.base : null;
          const good = delta == null ? null : c.higherIsBetter ? delta >= 0 : delta <= 0;
          return (
            <View key={c.label} style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
              <Text style={{ color: t.muted, fontSize: 12, textTransform: "uppercase" }}>{c.label}</Text>
              <Text style={{ color: t.text, fontSize: 26, fontWeight: "700", marginTop: 4 }}>
                {c.unit === "min" && c.now != null ? `${Math.floor(c.now / 60)} h ${String(Math.round(c.now % 60)).padStart(2, "0")}` : `${round(c.now, c.digits ?? 0)} ${c.unit}`}
              </Text>
              {delta != null && (
                <Text style={{ color: good ? "#2f9e44" : "#e03131", fontSize: 13, marginTop: 2 }}>
                  {delta >= 0 ? "+" : ""}{round(delta, c.digits ?? 0)} {c.unit} vs 4 sem.
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <Text style={[styles.h2, { color: t.text }]}>Jour par jour</Text>
      <View style={[styles.table, { backgroundColor: t.card, borderColor: t.border }]}>
        <Row t={t} header cells={["Date", "HRV", "FC repos", "Sommeil", "Pas"]} />
        {items.slice(0, 30).map((d) => (
          <Row key={d.date} t={t} cells={[d.date.slice(5), round(d.hrvMs), round(d.restingHr), sleep(d), d.steps != null ? Math.round(d.steps).toLocaleString("fr-FR") : "–"]} />
        ))}
        {items.length === 0 && <Text style={{ color: t.muted, padding: 14 }}>Aucune métrique importée.</Text>}
      </View>
    </ScrollView>
  );
}

function sleep(d: DailyMetric): string {
  if (d.sleepMinutes == null) return "–";
  return `${Math.floor(d.sleepMinutes / 60)}h${String(Math.round(d.sleepMinutes % 60)).padStart(2, "0")}`;
}

function Row({ cells, header, t }: { cells: string[]; header?: boolean; t: ReturnType<typeof useTheme> }) {
  return (
    <View style={[styles.tr, { borderTopColor: t.border, borderTopWidth: header ? 0 : 1 }]}>
      {cells.map((c, i) => (
        <Text key={i} style={{ flex: i === 0 ? 1.2 : 1, color: header ? t.muted : t.text, fontWeight: header ? "600" : "400", fontSize: 13, textAlign: i === 0 ? "left" : "right" }}>
          {c}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, paddingBottom: 40, maxWidth: 720, width: "100%", alignSelf: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { flexBasis: "47%", flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 14 },
  h2: { fontSize: 18, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  table: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14 },
  tr: { flexDirection: "row", paddingVertical: 10, gap: 6 },
});
