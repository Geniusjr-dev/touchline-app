"use client";
import AdminReturnButton from "@/components/AdminReturnButton";
import PullToRefresh from "@/components/PullToRefresh";
import NavigationWarmup from "@/components/NavigationWarmup";
import { ThemeProvider } from "@/lib/theme";
export default function Providers({ children }) {
  return (
    <ThemeProvider>
      {children}
      <NavigationWarmup />
      <PullToRefresh />
      <AdminReturnButton />
    </ThemeProvider>
  );
}
