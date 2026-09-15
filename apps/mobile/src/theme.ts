import { useColorScheme } from "react-native";
import type { Sport } from "@coach/shared";

export function useTheme() {
  const dark = useColorScheme() === "dark";
  return {
    dark,
    bg: dark ? "#0f1115" : "#f6f7f9",
    card: dark ? "#181b22" : "#ffffff",
    border: dark ? "#262a33" : "#e5e7eb",
    text: dark ? "#f3f4f6" : "#111827",
    muted: dark ? "#9ca3af" : "#6b7280",
    accent: "#e8590c",
  };
}

export const SPORT_COLORS: Record<Sport, string> = {
  running: "#e8590c",
  trail_running: "#2f9e44",
  hiking: "#5c7cfa",
  walking: "#868e96",
  cycling: "#f59f00",
  swimming: "#1c7ed6",
  strength: "#ae3ec9",
  mobility: "#12b886",
  stretching: "#15aabf",
  other: "#adb5bd",
};

export const SPORT_ICONS: Record<Sport, string> = {
  running: "🏃",
  trail_running: "⛰️",
  hiking: "🥾",
  walking: "🚶",
  cycling: "🚴",
  swimming: "🏊",
  strength: "🏋️",
  mobility: "🤸",
  stretching: "🧘",
  other: "🎽",
};
