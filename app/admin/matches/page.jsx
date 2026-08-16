"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listTeams, listCompetitions, listMatches, listScorers, listMatchScorers, replaceMatchScorer, addCompetition, createMatch } from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Matches() {
  const { user, role, activeOrganizationId } = useAuth();
  const [teams, setTeams] = useState([]);
  const [comps, setComps] = useState([]);
  const [matches, setMatches] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [comp, setComp] = useState("");
  const [matchDate, setMatchDate] = useState(() => localDateKey());
  const [kickoff, setKickoff] = useState("");
  const [newComp, setNewComp] = useState("");
  const [newSub, setNewSub] = useState("");
  const [duration, setDuration] = useState("90");
  const [competitionType, setCompetitionType] = useState("tournament");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      const [nextTeams, nextComps, nextMatches] = await Promise.all([
        listTeams(activeOrganizationId),
        listCompetitions(activeOrganizationId),
        listMatches(activeOrganizationId, role, user?.id),
      ]);
      setTeams(nextTeams);
      setComps(nextComps);
      setMatches(nextMatches);
      if (role === "admin") {
        const [nextScorers, nextAssignments] = await Promise.all([
          listScorers(activeOrganizationId),
          listMatchScorers(nextMatches.map((match) => match.id)),
        ]);
        setScorers(nextScorers);
        setAssignments(nextAssignments);
      }
    } catch (error) {
      setErr(error.message || "Could not load matches.");
    }
  }, [activeOrganizationId, role, user]);
  useEffect(() => { load(); }, [load]);

  async function addComp(e) {
    e.preventDefault();
    if (!newComp.trim()) return;
    const { error } = await addCompetition(activeOrganizationId, newComp.trim(), newSub.trim() || null, Number(duration), competitionType);
    if (error) return setErr(error.message);
    setNewComp(""); setNewSub(""); setDuration("90"); setCompetitionType("tournament"); load();
  }
  async function make(e) {
    e.preventDefault();
    setErr("");
    if (!home || !away || home === away) return setErr("Pick two different teams.");
    if (!matchDate) return setErr("Choose the match date.");
    const { error } = await createMatch(activeOrganizationId, comp || null, home, away, kickoff.trim() || null, matchDate);
    if (error) return setErr(error.message);
    setHome(""); setAway(""); setKickoff(""); load();
  }
  async function assignScorer(matchId, scorerId) {
    setErr("");
    const { error } = await replaceMatchScorer(matchId, scorerId || null);
    if (error) return setErr(error.message);
    setAssignments((current) => ({ ...current, [matchId]: scorerId ? [scorerId] : [] }));
  }
  const teamName = (id) => teams.find((t) => t.id === id)?.name || "—";

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{role === "admin" ? "Matches" : "Assigned matches"}</h1>

      {role === "admin" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 20 }}>
        <form onSubmit={make} style={card}>
          <div style={h3}>New match</div>
          <Field label="Competition">
            <select value={comp} onChange={(e) => setComp(e.target.value)} style={inp}>
              <option value="">— none —</option>
              {comps.map((c) => <option key={c.id} value={c.id}>{c.name}{c.sub ? ` · ${c.sub}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Home team">
            <select value={home} onChange={(e) => setHome(e.target.value)} style={inp}>
              <option value="">— pick —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Away team">
            <select value={away} onChange={(e) => setAway(e.target.value)} style={inp}>
              <option value="">— pick —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Match date"><input type="date" required value={matchDate} onChange={(e) => setMatchDate(e.target.value)} style={inp} /></Field>
          <Field label="Kick-off time (e.g. 16:00)"><input value={kickoff} onChange={(e) => setKickoff(e.target.value)} placeholder="16:00" style={inp} /></Field>
          <button type="submit" style={btn}>Create match</button>
          {err && <div style={{ color: "#F04444", fontSize: 13, marginTop: 8 }}>{err}</div>}
        </form>

        <form onSubmit={addComp} style={card}>
          <div style={h3}>New competition</div>
          <Field label="Name"><input value={newComp} onChange={(e) => setNewComp(e.target.value)} placeholder="Ijon Memorial Championship" style={inp} /></Field>
          <Field label="Sub-label (optional)"><input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Group A" style={inp} /></Field>
          <Field label="Competition type">
            <select value={competitionType} onChange={(e) => setCompetitionType(e.target.value)} style={inp}>
              <option value="tournament">Tournament / league</option>
              <option value="friendly">Friendly</option>
            </select>
          </Field>
          <Field label="Match duration">
            <select value={duration} onChange={(e) => setDuration(e.target.value)} style={inp}>
              <option value="60">60 minutes</option>
              <option value="70">70 minutes</option>
              <option value="80">80 minutes</option>
              <option value="90">90 minutes</option>
            </select>
          </Field>
          <button type="submit" style={btn}>Add competition</button>
        </form>
      </div>}

      {err && <div style={{ color: "#F04444", background: "#301719", borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div style={{ ...card, padding: 0 }}>
        <div style={{ ...h3, padding: "14px 16px 0" }}>All matches</div>
        {matches.length === 0 && <div style={{ color: "#8E939B", padding: 20, fontSize: 14 }}>{role === "admin" ? "No matches yet." : "No matches have been assigned to you."}</div>}
        {matches.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid #26282B", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: statusColor(m.status), width: 64 }}>{m.status}</span>
            <span style={{ flex: 1, minWidth: 200, fontSize: 14 }}><span style={{ color: "#8E939B", fontSize: 12 }}>{m.match_date} · </span>{m.home?.name || teamName(m.home_id)} <span style={{ color: "#5B6069" }}>vs</span> {m.away?.name || teamName(m.away_id)}</span>
            {role === "admin" && (
              <select value={assignments[m.id]?.[0] || ""} onChange={(e) => assignScorer(m.id, e.target.value)} aria-label={`Scorer for ${m.home?.name || teamName(m.home_id)} vs ${m.away?.name || teamName(m.away_id)}`} style={{ ...inp, width: 190, padding: "7px 9px", fontSize: 12 }}>
                <option value="">No scorer assigned</option>
                {scorers.map((scorer) => <option key={scorer.id} value={scorer.id}>{scorer.email}</option>)}
              </select>
            )}
            <Link href={`/admin/match/${m.id}`} style={{ ...btn, textDecoration: "none", padding: "7px 14px" }}>Score</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
function statusColor(s) { return s === "live" ? "#F04444" : s === "ft" ? "#8E939B" : s === "ht" ? "#F5C518" : "#4FC263"; }
function Field({ label, children }) { return <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}><span style={{ color: "#8E939B", fontSize: 12, fontWeight: 600 }}>{label}</span>{children}</label>; }
const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16 };
const h3 = { fontSize: 15, fontWeight: 700, marginBottom: 12 };
const inp = { width: "100%", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none" };
const btn = { padding: "10px 16px", borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" };
