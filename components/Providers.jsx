"use client";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider } from "@/components/AuthProvider";
export default function Providers({ children }) {
  return <ThemeProvider><AuthProvider>{children}</AuthProvider></ThemeProvider>;
}
