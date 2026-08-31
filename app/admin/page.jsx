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
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 6 }}>Dashboard</h1>
      <p style={{ color: "#8E939B", fontSize: 14, marginBottom: 20 }}>{role === "admin" ? "Manage teams, create matches, and control scorer access." : "Score only the matches assigned to your account."}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
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
