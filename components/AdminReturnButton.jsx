"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMyAccess } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

const defaultAdminPath = "/admin";
const returnPathKey = "touchline-admin-return-path";

export default function AdminReturnButton() {
  const pathname = usePathname();
  const { t } = useTheme();
  const [userId, setUserId] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [returnPath, setReturnPath] = useState(defaultAdminPath);

  useEffect(() => {
    if (!supabase) return undefined;

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUserId(data.session?.user?.id || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setAuthorized(false);
    if (!userId) return () => { active = false; };

    getMyAccess(userId)
      .then(({ profile, memberships }) => {
        if (!active) return;
        setAuthorized(profile?.status !== "suspended" && memberships.length > 0);
      })
      .catch(() => {
        if (active) setAuthorized(false);
      });

    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    try {
      const savedPath = window.sessionStorage.getItem(returnPathKey);
      const validPath = savedPath?.startsWith("/admin") && savedPath !== "/admin/login";
      setReturnPath(validPath ? savedPath : defaultAdminPath);
    } catch {
      setReturnPath(defaultAdminPath);
    }
  }, [pathname]);

  if (!authorized || pathname.startsWith("/admin")) return null;

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
      Admin portal
    </Link>
  );
}
