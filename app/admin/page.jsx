"use client";
import Link from "next/link";

export default function AdminHome() {
  const cards = [
    { href: "/admin/teams", title: "Teams", desc: "Add and manage the teams in your tournaments." },
    { href: "/admin/matches", title: "Matches", desc: "Create fixtures and open the live scorer for any match." },
  ];
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Dashboard</h1>
      <p style={{ color: "#8E939B", fontSize: 14, marginBottom: 20 }}>Manage teams, create matches, and score them live.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {cards.map((c) => (
          <Link key={c.href} href={c.href} style={{ background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 18, textDecoration: "none" }}>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
            <div style={{ color: "#8E939B", fontSize: 13 }}>{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
