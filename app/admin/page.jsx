"use client";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function AdminHome() {
  const { role } = useAuth();
  const cards = role === "admin"
    ? [
        { href: "/admin/teams", title: "Teams", desc: "Add and manage the teams in your tournaments." },
        { href: "/admin/matches", title: "Matches", desc: "Create fixtures, assign scorers and open the live scorer." },
      ]
    : [{ href: "/admin/matches", title: "Assigned matches", desc: "Open a match assigned to you and score it live." }];
  return (
    <div className="admin-dashboard">
      <h1 style={{ fontSize: 20, marginBottom: 6 }}>Dashboard</h1>
      <p style={{ color: "var(--admin-dim)", fontSize: 14, marginBottom: 20 }}>{role === "admin" ? "Manage teams, create matches, and control scorer access." : "Score only the matches assigned to your account."}</p>
      <div className="admin-dashboard-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {cards.map((c) => (
          <Link className="admin-dashboard-card" key={c.href} href={c.href} style={{ background: "var(--admin-card)", border: "1px solid var(--admin-divider)", borderRadius: 16, padding: 22, textDecoration: "none" }}>
            <div style={{ color: "var(--admin-text)", fontSize: 19, fontWeight: 700, marginBottom: 8 }}>{c.title}</div>
            <div style={{ color: "var(--admin-dim)", fontSize: 14, lineHeight: 1.5 }}>{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
