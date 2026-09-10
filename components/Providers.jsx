"use client";
import AdminReturnButton from "@/components/AdminReturnButton";
import PullToRefresh from "@/components/PullToRefresh";
import { ThemeProvider } from "@/lib/theme";
export default function Providers({ children }) {
  return (
    <ThemeProvider>
      {children}
      <PullToRefresh />
      <AdminReturnButton />
    </ThemeProvider>
  );
}
