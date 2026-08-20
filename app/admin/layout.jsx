"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function AdminLayout({ children }) {
  const { user, profile, memberships, activeOrganizationId, role, loading, accessError, signOut, setActiveOrganization, retryAccess } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const isLogin = path === "/admin/login";

  useEffect(() => {
    if (!loading && !user && !isLogin) router.replace("/admin/login");
    if (!loading && user && role === "scorer" && path.startsWith("/admin/teams")) router.replace("/admin/matches");
  }, [loading, user, role, path, isLogin, router]);

  if (isLogin) return children;
  if (loading) return <Shell><div style={{ width: 220, height: 12, borderRadius: 6, background: "#161719" }} /></Shell>;
  if (!user) return <Shell><div style={{ width: 220, height: 12, borderRadius: 6, background: "#161719" }} /></Shell>;
  if (profile?.status === "suspended") return <Shell><div style={{ color: "#F04444", padding: 24, textAlign: "center" }}>This Touchline account has been suspended.</div></Shell>;
  if (accessError) return <Shell><div style={{ width: "min(360px, calc(100% - 32px))", background: "#161719", border: "1px solid #2A2C30", borderRadius: 14, padding: 20, textAlign: "center" }}>
    <div style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 750 }}>Organization access could not be verified.</div>
    <div style={{ color: "#8E939B", fontSize: 12, lineHeight: 1.5, marginTop: 7 }}>Your membership has not been removed. Check the connection and try again.</div>
    <button onClick={retryAccess} style={{ marginTop: 14, background: "#4FC263", color: "#07130B", border: 0, borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Try again</button>
  </div></Shell>;
  if (!activeOrganizationId || !role) return <Shell><div style={{ color: "#8E939B", padding: 24, textAlign: "center" }}>Your account has not been added to a Touchline organization yet. Ask an administrator to grant access.</div></Shell>;
  if (role === "scorer" && path.startsWith("/admin/teams")) return <Shell><div style={{ width: 220, height: 12, borderRadius: 6, background: "#161719" }} /></Shell>;

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderBottom: "1px solid #26282B", position: "sticky", top: 0, background: "#0A0A0A", zIndex: 10, flexWrap: "wrap" }}>
        <Link href="/admin" style={{ fontWeight: 800, fontSize: 18 }}><span style={{ color: "#4FC263" }}>⚡</span>Touchline <span style={{ color: "#8E939B", fontWeight: 600, fontSize: 14 }}>admin</span></Link>
        <nav style={{ display: "flex", gap: 14, marginLeft: 8 }}>
          {role === "admin" && <Tab href="/admin/teams" path={path}>Teams</Tab>}
          <Tab href="/admin/matches" path={path}>Matches</Tab>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {memberships.length > 1 && (
            <select value={activeOrganizationId} onChange={(e) => setActiveOrganization(e.target.value)}
              aria-label="Active organization"
              style={{ background: "#161719", color: "#fff", border: "1px solid #2A2C30", borderRadius: 8, padding: "6px 8px", fontSize: 12 }}>
              {memberships.map((membership) => (
                <option key={membership.organization_id} value={membership.organization_id}>{membership.organization?.name || "Organization"}</option>
              ))}
            </select>
          )}
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
