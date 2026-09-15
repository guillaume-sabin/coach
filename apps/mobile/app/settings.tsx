import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { getApiUrl, setApiUrl } from "@/api";
import { useTheme } from "@/theme";

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const [url, setUrl] = useState(getApiUrl());
  const [status, setStatus] = useState<string | null>(null);

  const test = async () => {
    setStatus("Test…");
    try {
      const r = await fetch(`${url.replace(/\/+$/, "")}/health`);
      setStatus(r.ok ? "✅ API joignable" : `❌ HTTP ${r.status}`);
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const save = () => {
    setApiUrl(url);
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <Text style={{ color: t.muted, marginBottom: 8 }}>URL de l'API</Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={[styles.input, { color: t.text, backgroundColor: t.card, borderColor: t.border }]}
        placeholder="http://192.168.1.10:3210"
        placeholderTextColor={t.muted}
      />
      {Platform.OS !== "web" && (
        <Text style={{ color: t.muted, fontSize: 13, marginTop: 6 }}>
          Sur l'app native, l'URL est fixée par EXPO_PUBLIC_API_URL au build.
        </Text>
      )}
      <View style={styles.row}>
        <Pressable onPress={test} style={[styles.btn, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={{ color: t.text, fontWeight: "600" }}>Tester</Text>
        </Pressable>
        <Pressable onPress={save} style={[styles.btn, { backgroundColor: t.accent, borderColor: t.accent }]}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>Enregistrer</Text>
        </Pressable>
      </View>
      {status && <Text style={{ color: t.text, marginTop: 12 }}>{status}</Text>}

      <Text style={[styles.h2, { color: t.text }]}>Alimenter l'API</Text>
      <Text style={{ color: t.muted, lineHeight: 20 }}>
        1. Historique complet : sur l'iPhone, Santé → photo de profil → Exporter toutes les données, puis sur le PC :
        {"\n"}<Text style={styles.code}>npm run import:apple -- chemin/export.zip</Text>
        {"\n\n"}2. Synchro automatique : dans Health Auto Export, créer une automatisation « REST API » vers
        {"\n"}<Text style={styles.code}>{url.replace(/\/+$/, "")}/ingest/health-auto-export</Text>
        {"\n"}avec l'en-tête <Text style={styles.code}>x-api-key</Text> égal à INGEST_API_KEY du fichier .env de l'API.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, maxWidth: 720, width: "100%", alignSelf: "center" },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center" },
  h2: { fontSize: 18, fontWeight: "700", marginTop: 28, marginBottom: 8 },
  code: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 13 },
});
