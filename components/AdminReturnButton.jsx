"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";

const defaultAdminPath = "/admin";
const returnPathKey = "touchline-admin-return-path";
const returnVisibleKey = "touchline-admin-return-visible";

export default function AdminReturnButton() {
  const pathname = usePathname();
  const { t } = useTheme();
  const [visible, setVisible] = useState(false);
  const [returnPath, setReturnPath] = useState(defaultAdminPath);

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      setVisible(false);
      return;
    }

    try {
      const savedPath = window.sessionStorage.getItem(returnPathKey);
      const validPath = savedPath?.startsWith("/admin") && savedPath !== "/admin/login";
      setReturnPath(validPath ? savedPath : defaultAdminPath);
      setVisible(window.sessionStorage.getItem(returnVisibleKey) === "1");
    } catch {
      setReturnPath(defaultAdminPath);
      setVisible(false);
    }
  }, [pathname]);

  if (!visible || pathname.startsWith("/admin")) return null;

  return (
    <Link
      href={returnPath}
      aria-label="Return to Touchline administration"
      className="fixed inline-flex items-center rounded-full"
      style={{
        right: "max(12px, calc((100vw - 480px) / 2 + 12px))",
        bottom: "max(76px, calc(env(safe-area-inset-bottom) + 70px))",
        zIndex: 65,
        gap: 6,
        height: 34,
        padding: "0 12px",
        background: t.accent,
        color: "#07130B",
        border: `1px solid ${t.pillBorder}`,
        boxShadow: "0 6px 20px rgba(0,0,0,0.32)",
        fontSize: 11.5,
      }}
    >
      <ShieldCheck size={15} />
      Back to admin
    </Link>
  );
}

