"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/lib/theme";

export default function AdminLayout({ children }) {
  const { user, profile, memberships, activeOrganizationId, role, loading, accessError, signOut, setActiveOrganization, retryAccess } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const isLogin = path === "/admin/login";
  const { mode, t, toggle } = useTheme();
  const themeStyle = adminThemeStyle(t, mode);

  useEffect(() => {
    if (!loading && !user && !isLogin) router.replace("/admin/login");
    if (!loading && user && role === "scorer" && path.startsWith("/admin/teams")) router.replace("/admin/matches");
  }, [loading, user, role, path, isLogin, router]);

  if (isLogin) return <div className="touchline-admin" style={themeStyle}>{children}</div>;
  if (loading) return <Shell themeStyle={themeStyle}><div style={{ width: 220, height: 12, borderRadius: 6, background: "var(--admin-card)" }} /></Shell>;
  if (!user) return <Shell themeStyle={themeStyle}><div style={{ width: 220, height: 12, borderRadius: 6, background: "var(--admin-card)" }} /></Shell>;
  if (profile?.status === "suspended") return <Shell themeStyle={themeStyle}><div style={{ color: "#F04444", padding: 24, textAlign: "center" }}>This Touchline account has been suspended.</div></Shell>;
  if (accessError) return <Shell themeStyle={themeStyle}><div style={{ width: "min(360px, calc(100% - 32px))", background: "var(--admin-card)", border: "1px solid var(--admin-control-border)", borderRadius: 14, padding: 20, textAlign: "center" }}>
    <div style={{ color: "var(--admin-text)", fontSize: 14 }}>Organization access could not be verified.</div>
    <div style={{ color: "var(--admin-dim)", fontSize: 12, lineHeight: 1.5, marginTop: 7 }}>Your membership has not been removed. Check the connection and try again.</div>
    <button onClick={retryAccess} style={{ marginTop: 14, background: "#4FC263", color: "#07130B", border: 0, borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Try again</button>
  </div></Shell>;
  if (!activeOrganizationId || !role) return <Shell themeStyle={themeStyle}><div style={{ color: "var(--admin-dim)", padding: 24, textAlign: "center" }}>Your account has not been added to a Touchline organization yet. Ask an administrator to grant access.</div></Shell>;
  if (role === "scorer" && path.startsWith("/admin/teams")) return <Shell themeStyle={themeStyle}><div style={{ width: 220, height: 12, borderRadius: 6, background: "var(--admin-card)" }} /></Shell>;

  return (
    <div className="touchline-admin" style={{ ...themeStyle, minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderBottom: "1px solid var(--admin-divider)", position: "sticky", top: 0, background: "var(--admin-bg)", zIndex: 10, flexWrap: "wrap" }}>
        <Link href="/admin" style={{ color: "var(--admin-text)", fontSize: 17 }}><span style={{ color: "#4FC263" }}>⚡</span>Touchline <span style={{ color: "var(--admin-dim)", fontSize: 13 }}>admin</span></Link>
        <nav style={{ display: "flex", gap: 14, marginLeft: 8 }}>
          {role === "admin" && <Tab href="/admin/teams" path={path}>Teams</Tab>}
          <Tab href="/admin/matches" path={path}>Matches</Tab>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {memberships.length > 1 && (
            <select value={activeOrganizationId} onChange={(e) => setActiveOrganization(e.target.value)}
              aria-label="Active organization"
              style={{ background: "var(--admin-control)", color: "var(--admin-text)", border: "1px solid var(--admin-control-border)", borderRadius: 8, padding: "6px 8px", fontSize: 12 }}>
              {memberships.map((membership) => (
                <option key={membership.organization_id} value={membership.organization_id}>{membership.organization?.name || "Organization"}</option>
              ))}
            </select>
          )}
          <button type="button" onClick={toggle} aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`} title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`} className="inline-flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--admin-control)", color: "var(--admin-text)", border: "1px solid var(--admin-control-border)", cursor: "pointer" }}>
            {mode === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link href="/" style={{ color: "var(--admin-dim)", fontSize: 13 }}>View site</Link>
          <button onClick={() => { signOut(); router.replace("/admin/login"); }} style={{ background: "var(--admin-control)", color: "var(--admin-text)", border: "1px solid var(--admin-control-border)", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>Sign out</button>
        </div>
      </div>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: 18 }}>{children}</div>
    </div>
  );
}
function Shell({ children, themeStyle }) { return <div className="touchline-admin" style={{ ...themeStyle, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>; }
function Tab({ href, path, children }) {
  const on = path === href;
  return <Link href={href} style={{ color: on ? "#4FC263" : "var(--admin-dim)", fontSize: 14 }}>{children}</Link>;
}

function adminThemeStyle(t, mode) {
  return {
    "--admin-bg": t.bg,
    "--admin-card": t.card,
    "--admin-divider": t.divider,
    "--admin-text": t.text,
    "--admin-dim": t.dim,
    "--admin-faint": t.faint,
    "--admin-control": t.pill,
    "--admin-control-border": t.pillBorder,
    "--admin-input": mode === "dark" ? "#0E0F11" : "#F7F8FA",
    "--admin-elevated": mode === "dark" ? "#22252A" : "#EEF0F2",
    "--admin-soft-green": mode === "dark" ? "#17271C" : "#E7F6EB",
    "--admin-soft-danger": mode === "dark" ? "#2A1A1A" : "#FCEAEA",
    "--admin-soft-warning": mode === "dark" ? "#2B2110" : "#FFF6D9",
    "--admin-danger-text": mode === "dark" ? "#F87070" : "#C62828",
    "--admin-warning-text": mode === "dark" ? "#F5C518" : "#7A5B00",
    background: t.bg,
    color: t.text,
    colorScheme: mode,
  };
}
