"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function AdminLayout({ children }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const isLogin = path === "/admin/login";

  useEffect(() => {
    if (!loading && !user && !isLogin) router.replace("/admin/login");
  }, [loading, user, isLogin, router]);

  if (isLogin) return children;
  if (loading) return <Shell><div style={{ color: "#8E939B" }}>Loading…</div></Shell>;
  if (!user) return <Shell><div style={{ color: "#8E939B" }}>Redirecting to sign in…</div></Shell>;

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderBottom: "1px solid #26282B", position: "sticky", top: 0, background: "#0A0A0A", zIndex: 10, flexWrap: "wrap" }}>
        <Link href="/admin" style={{ fontWeight: 800, fontSize: 18 }}><span style={{ color: "#4FC263" }}>⚡</span>Touchline <span style={{ color: "#8E939B", fontWeight: 600, fontSize: 14 }}>admin</span></Link>
        <nav style={{ display: "flex", gap: 14, marginLeft: 8 }}>
          <Tab href="/admin/teams" path={path}>Teams</Tab>
          <Tab href="/admin/matches" path={path}>Matches</Tab>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ color: "#8E939B", fontSize: 13 }}>View site</Link>
          <button onClick={() => { signOut(); router.replace("/admin/login"); }} style={{ background: "#161719", color: "#fff", border: "1px solid #2A2C30", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>Sign out</button>
        </div>
      </div>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: 18 }}>{children}</div>
    </div>
  );
}
function Shell({ children }) { return <div style={{ minHeight: "100vh", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>; }
function Tab({ href, path, children }) {
  const on = path === href;
  return <Link href={href} style={{ color: on ? "#4FC263" : "#8E939B", fontWeight: on ? 700 : 500, fontSize: 14 }}>{children}</Link>;
}
