import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "@/theme";

export default function RootLayout() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.card },
          headerTintColor: t.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Séances" }} />
        <Stack.Screen name="workout/[id]" options={{ title: "Séance" }} />
        <Stack.Screen name="recovery" options={{ title: "Récupération" }} />
        <Stack.Screen name="settings" options={{ title: "Réglages", presentation: "modal" }} />
      </Stack>
    </>
  );
}
