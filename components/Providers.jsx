"use client";
import AdminReturnButton from "@/components/AdminReturnButton";
import { ThemeProvider } from "@/lib/theme";
export default function Providers({ children }) {
  return (
    <ThemeProvider>
      {children}
      <AdminReturnButton />
    </ThemeProvider>
  );
}
