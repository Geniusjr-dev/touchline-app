"use client";
import { ThemeProvider } from "@/lib/theme";
export default function Providers({ children }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
