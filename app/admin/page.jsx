"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listMatches, listTeams, clockSeconds, fmtClock } from "@/lib/db";

export default function Console() {
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState({});
  const [, setTick] = useState(0);

  const load = () => {
    listMatches().then(setMatches).catch(() => {});
    listTeams().then((ts) => { const map = {}; ts.forEach((t) => (map[t.id] = t)); setTeams(map); }).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { const i = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(i); }, []);

  const nm = (id) => teams[id]?.display_name || teams[id]?.name || "TBD";
  const score = (m) => {
    if (m.score_home_manual != null && m.score_away_manual != null) return `${m.score_home_manual} - ${m.score_away_manual}`;
    return `${(m.events_home ?? "")}`; // placeholder, list view uses status only
  };
  const live = matches.filter((m) => m.status === "live" || m.status === "ht");
  const upcoming = matches.filter((m) => m.status === "scheduled");

  return (
    <div>
      <h1>Match console</h1>
      <p className="sub">Live control for every match. Green is in play, amber is paused at the break.</p>

      <div className="panel">
        <div className="eyebrow">Active matches</div>
        {live.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14 }}>No matches are live right now.</div>}
        {live.map((m) => (
          <div key={m.id} className="row" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="live-dot" />
            <span className="chip" style={{ background: m.status === "ht" ? "rgba(245,158,11,.15)" : "rgba(34,197,94,.15)", color: m.status === "ht" ? "var(--warning)" : "var(--accent)" }}>
              {m.status === "ht" ? "HT" : "LIVE"}
            </span>
            <span className="scoreline" style={{ fontSize: 13, color: "var(--muted)", minWidth: 52 }}>
              {m.status === "live" ? fmtClock(clockSeconds(m)) : fmtClock(m.elapsed_seconds || 0)}
            </span>
            <span style={{ flex: 1, fontSize: 14.5 }}>{nm(m.home_id)} <span style={{ color: "var(--faint)" }}>v</span> {nm(m.away_id)}</span>
            <Link href={`/admin/match/${m.id}`} className="btn btn-primary btn-sm">Open scorer</Link>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="eyebrow">Up next</div>
        {upcoming.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14 }}>No scheduled matches.</div>}
        {upcoming.slice(0, 8).map((m) => (
          <div key={m.id} className="row" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="scoreline" style={{ fontSize: 13, color: "var(--muted)", minWidth: 52 }}>{m.kickoff || "--:--"}</span>
            <span style={{ flex: 1, fontSize: 14.5 }}>{nm(m.home_id)} <span style={{ color: "var(--faint)" }}>v</span> {nm(m.away_id)}</span>
            <Link href={`/admin/match/${m.id}`} className="btn btn-sm">Open scorer</Link>
          </div>
        ))}
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <Link href="/admin/matches" className="panel" style={{ display: "block" }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Matches and competitions</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Create fixtures, set up leagues and tournaments, edit or delete games.</div>
        </Link>
        <Link href="/admin/teams" className="panel" style={{ display: "block" }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Teams and squads</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Add teams, set colours and short names, register player squads.</div>
        </Link>
      </div>
    </div>
  );
}
