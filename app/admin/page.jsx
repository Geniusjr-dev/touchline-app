"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { listMatches, listTeams, formatMatchClock } from "@/lib/db";

const LIVE = ["live", "ht", "et_live", "et_ht"];

export default function Console() {
  const { role, activeOrganizationId, user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState({});
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      const [ms, ts] = await Promise.all([listMatches(activeOrganizationId, role, user?.id), listTeams(activeOrganizationId)]);
      setMatches(ms);
      const map = {}; ts.forEach((t) => (map[t.id] = t)); setTeams(map);
    } catch (_) {}
  }, [activeOrganizationId, role, user]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(i); }, []);

  const nm = (m, id) => {
    const embedded = id === m.home_id ? m.home : m.away;
    return embedded?.display_name || embedded?.name || teams[id]?.display_name || teams[id]?.name || "TBD";
  };
  const live = matches.filter((m) => LIVE.includes(m.status));
  const upcoming = matches.filter((m) => m.status === "scheduled");
  const recent = matches.filter((m) => m.status === "ft").slice(0, 6);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{role === "admin" ? "Match console" : "Assigned matches"}</h1>
      <p style={{ color: "#8E939B", fontSize: 14, marginBottom: 18 }}>{role === "admin" ? "Every match at a glance. Open the scorer to control a game live." : "Open a match assigned to you and score it live."}</p>

      <Panel title="Active now">
        {live.length === 0 && <Muted>No matches are live right now.</Muted>}
        {live.map((m) => (
          <Row key={m.id}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: m.status === "ht" || m.status === "et_ht" ? "#F5C518" : "#F04444" }} />
            <span style={{ ...chip, background: m.status.includes("ht") ? "rgba(245,197,24,.15)" : "rgba(79,194,99,.15)", color: m.status.includes("ht") ? "#F5C518" : "#4FC263" }}>{m.status === "ht" ? "HT" : m.status === "et_ht" ? "ET HT" : m.status === "et_live" ? "ET" : "LIVE"}</span>
            <span className="tnum" style={{ fontSize: 13, color: "#8E939B", minWidth: 60 }}>{formatMatchClock(m)}</span>
            <span style={{ flex: 1, fontSize: 14.5 }}>{nm(m, m.home_id)} <span style={{ color: "#5B6069" }}>v</span> {nm(m, m.away_id)}</span>
            <Link href={`/admin/match/${m.id}`} style={{ ...btn }}>Open scorer</Link>
          </Row>
        ))}
      </Panel>

      <Panel title="Up next">
        {upcoming.length === 0 && <Muted>No scheduled matches.</Muted>}
        {upcoming.slice(0, 10).map((m) => (
          <Row key={m.id}>
            <span style={{ color: "#8E939B", fontSize: 12, minWidth: 96 }}>{m.match_date}{m.kickoff ? ` · ${m.kickoff}` : ""}</span>
            <span style={{ flex: 1, fontSize: 14.5 }}>{nm(m, m.home_id)} <span style={{ color: "#5B6069" }}>v</span> {nm(m, m.away_id)}</span>
            <Link href={`/admin/match/${m.id}`} style={{ ...btn, background: "#161719", color: "#fff", border: "1px solid #2A2C30" }}>Open scorer</Link>
          </Row>
        ))}
      </Panel>

      {recent.length > 0 && (
        <Panel title="Recently finished">
          {recent.map((m) => (
            <Row key={m.id}>
              <span style={{ ...chip, background: "rgba(138,146,158,.15)", color: "#8E939B" }}>FT</span>
              <span style={{ flex: 1, fontSize: 14.5 }}>{nm(m, m.home_id)} <span className="tnum" style={{ color: "#8E939B" }}>{m.home_score}-{m.away_score}</span> {nm(m, m.away_id)}</span>
              <Link href={`/admin/match/${m.id}`} style={{ color: "#8E939B", fontSize: 13 }}>Review</Link>
            </Row>
          ))}
        </Panel>
      )}

      {role === "admin" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
          <NavCard href="/admin/matches" title="Matches" desc="Create fixtures, assign scorers, edit or delete games." />
          <NavCard href="/admin/competitions" title="Competitions" desc="Friendly, league or tournament formats and groups." />
          <NavCard href="/admin/teams" title="Teams" desc="Teams, colours, display names and squads." />
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return <div style={{ background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16, marginBottom: 14 }}>
    <div style={{ color: "#8E939B", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
    {children}
  </div>;
}
function Row({ children }) { return <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 2px", borderTop: "1px solid #26282B", flexWrap: "wrap" }}>{children}</div>; }
function Muted({ children }) { return <div style={{ color: "#8E939B", fontSize: 14, padding: "4px 0" }}>{children}</div>; }
function NavCard({ href, title, desc }) {
  return <Link href={href} style={{ background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16, textDecoration: "none" }}>
    <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{title}</div>
    <div style={{ color: "#8E939B", fontSize: 12.5 }}>{desc}</div>
  </Link>;
}
const chip = { display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800 };
const btn = { padding: "8px 14px", borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, fontSize: 13, textDecoration: "none" };
