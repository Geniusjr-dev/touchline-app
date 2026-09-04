"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function AdminPortalShell({ children }) {
  const {
    user,
    profile,
    memberships,
    activeOrganizationId,
    role,
    loading,
    accessError,
    signOut,
    setActiveOrganization,
    retryAccess,
  } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const isLogin = path === "/admin/login";

  useEffect(() => {
    if (!loading && !user && !isLogin) router.replace("/admin/login");
    if (!loading && user && role === "scorer" && path.startsWith("/admin/teams")) router.replace("/admin/matches");
  }, [loading, user, role, path, isLogin, router]);

  if (isLogin) return children;
  if (loading || !user) return <PortalLoading />;
  if (profile?.status === "suspended") {
    return <PortalFrame><div style={{ color: "#F04444", padding: 24, textAlign: "center" }}>This Touchline account has been suspended.</div></PortalFrame>;
  }
  if (accessError) {
    return (
      <PortalFrame>
        <div style={{ width: "min(360px, calc(100% - 32px))", background: "#161719", border: "1px solid #2A2C30", borderRadius: 14, padding: 20, textAlign: "center" }}>
          <div style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 750 }}>Organization access could not be verified.</div>
          <div style={{ color: "#8E939B", fontSize: 12, lineHeight: 1.5, marginTop: 7 }}>Your membership has not been removed. Check the connection and try again.</div>
          <button type="button" onClick={retryAccess} style={{ marginTop: 14, background: "#4FC263", color: "#07130B", border: 0, borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Try again</button>
        </div>
      </PortalFrame>
    );
  }
  if (!activeOrganizationId || !role) {
    return <PortalFrame><div style={{ color: "#8E939B", padding: 24, textAlign: "center" }}>Your account has not been added to a Touchline organization yet. Ask an administrator to grant access.</div></PortalFrame>;
  }
  if (role === "scorer" && path.startsWith("/admin/teams")) return <PortalLoading />;

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", color: "#fff" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderBottom: "1px solid #26282B", position: "sticky", top: 0, background: "#0A0A0A", zIndex: 10, flexWrap: "wrap" }}>
        <Link href="/admin" style={{ fontSize: 17 }}><span style={{ color: "#4FC263" }}>⚡</span>Touchline <span style={{ color: "#8E939B", fontSize: 13 }}>admin</span></Link>
        <nav aria-label="Administration" style={{ display: "flex", gap: 14, marginLeft: 8 }}>
          {role === "admin" && <AdminTab href="/admin/teams" path={path}>Teams</AdminTab>}
          <AdminTab href="/admin/matches" path={path}>Matches</AdminTab>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {memberships.length > 1 && (
            <select
              value={activeOrganizationId}
              onChange={(event) => setActiveOrganization(event.target.value)}
              aria-label="Active organization"
              style={{ background: "#161719", color: "#fff", border: "1px solid #2A2C30", borderRadius: 8, padding: "6px 8px", fontSize: 12 }}
            >
              {memberships.map((membership) => (
                <option key={membership.organization_id} value={membership.organization_id}>{membership.organization?.name || "Organization"}</option>
              ))}
            </select>
          )}
          <Link
            href="/"
            onClick={() => {
              try {
                window.sessionStorage.setItem("touchline-admin-return-path", path);
              } catch {
                // The return button will use the admin dashboard when storage is unavailable.
              }
            }}
            style={{ color: "#8E939B", fontSize: 13 }}
          >
            Public site
          </Link>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/admin/login");
            }}
            style={{ background: "#161719", color: "#fff", border: "1px solid #2A2C30", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main style={{ maxWidth: 820, margin: "0 auto", padding: 18 }}>{children}</main>
    </div>
  );
}

function PortalFrame({ children }) {
  return <div style={{ minHeight: "100vh", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>;
}

function PortalLoading() {
  return <PortalFrame><div aria-label="Checking administrator access" style={{ width: 220, height: 12, borderRadius: 6, background: "#161719" }} /></PortalFrame>;
}

function AdminTab({ href, path, children }) {
  const active = path === href || path.startsWith(`${href}/`);
  return <Link href={href} aria-current={active ? "page" : undefined} style={{ color: active ? "#4FC263" : "#8E939B", fontWeight: active ? 700 : 500, fontSize: 14 }}>{children}</Link>;
}
