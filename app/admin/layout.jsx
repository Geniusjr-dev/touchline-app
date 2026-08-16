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
  if (loading) return <div className="admin"><div className="wrap" style={{ color: "var(--muted)" }}>Loading.</div></div>;
  if (!user) return <div className="admin"><div className="wrap" style={{ color: "var(--muted)" }}>Redirecting to sign in.</div></div>;

  return (
    <div className="admin">
      <div className="topbar">
        <Link href="/admin" className="brand"><span style={{ color: "var(--accent)" }}>⚡</span> Touchline <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 13 }}>Control Centre</span></Link>
        <nav style={{ display: "flex", gap: 16, marginLeft: 6 }}>
          <Link href="/admin" className={"navlink" + (path === "/admin" ? " on" : "")}>Console</Link>
          <Link href="/admin/matches" className={"navlink" + (path.startsWith("/admin/matches") || path.startsWith("/admin/match") ? " on" : "")}>Matches</Link>
          <Link href="/admin/teams" className={"navlink" + (path.startsWith("/admin/teams") ? " on" : "")}>Teams</Link>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/" className="navlink">View site</Link>
          <button onClick={() => { signOut(); router.replace("/admin/login"); }} className="btn btn-sm">Sign out</button>
        </div>
      </div>
      <div className="wrap">{children}</div>
    </div>
  );
}
