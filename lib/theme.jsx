"use client";
import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = {
  dark: {
    bg: "#000000", card: "#161719", divider: "#26282B", text: "#FFFFFF", dim: "#8E939B",
    faint: "#5B6069", tab: "#7A7F87", pill: "#1F2124", pillBorder: "#2A2C30", nav: "#0A0A0B",
    navText: "#8E939B", accent: "#4FC263", green: "#3FC463", red: "#F04444", yellow: "#F5C518",
    blue: "#1E9BF0", rateGreen: "#2FA85A", chip: "#26282B", seg: "#0E0F11", segActive: "#26282B",
    groupHead: "#131417", pitch1: "#1B1B1B", pitch2: "#202020", pitchLine: "rgba(255,255,255,0.11)",
    disc: "#0E2C1A", drawPill: "#5B6069", track: "#2C2F33", hl: "#1C2A22", win: "#3FC463", loss: "#F04444",
    page: "#0A0A0A",
  },
  light: {
    bg: "#F2F3F5", card: "#FFFFFF", divider: "#E7E9EC", text: "#0C0D0F", dim: "#666B73",
    faint: "#A2A7AF", tab: "#8A8F97", pill: "#EEF0F2", pillBorder: "#E2E4E7", nav: "#FFFFFF",
    navText: "#666B73", accent: "#1F9E4B", green: "#1E9E4B", red: "#E23B3B", yellow: "#E8B90C",
    blue: "#1877D2", rateGreen: "#22945A", chip: "#F0F2F4", seg: "#E7E9EC", segActive: "#FFFFFF",
    groupHead: "#FFFFFF", pitch1: "#0AA466", pitch2: "#07975E", pitchLine: "rgba(255,255,255,0.24)",
    disc: "#1C6E38", drawPill: "#9CA1A9", track: "#E3E6EA", hl: "#E9F6EE", win: "#1F9E4B", loss: "#E23B3B",
    page: "#DFE2E6",
  },
};

const ThemeCtx = createContext({ mode: "dark", t: THEMES.dark, toggle: () => {} });
const themeStorageKey = "touchline-theme";

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState("dark");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const savedMode = window.localStorage.getItem(themeStorageKey);
      if (savedMode === "light" || savedMode === "dark") setMode(savedMode);
    } catch {
      // The app still works when browser storage is unavailable.
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(themeStorageKey, mode);
    } catch {
      // Keep the selected theme in memory when browser storage is unavailable.
    }
    document.documentElement.style.background = THEMES[mode].bg;
    document.body.style.background = THEMES[mode].bg;
    document.documentElement.style.colorScheme = mode;
  }, [mode, restored]);

  const value = {
    mode,
    t: THEMES[mode],
    setMode,
    toggle: () => setMode((current) => (current === "dark" ? "light" : "dark")),
  };
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);
