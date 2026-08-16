"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listTeams, listCompetitions, listMatches, addCompetition, createMatch } from "@/lib/db";

export default function Matches() {
  const [teams, setTeams] = useState([]);
  const [comps, setComps] = useState([]);
  const [matches, setMatches] = useState([]);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [comp, setComp] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [newComp, setNewComp] = useState("");
  const [newSub, setNewSub] = useState("");
  const [newFormat, setNewFormat] = useState("tournament");
  const [err, setErr] = useState("");

  const load = () => {
    listTeams().then(setTeams).catch(() => {});
    listCompetitions().then(setComps).catch(() => {});
    listMatches().then(setMatches).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function addComp(e) {
    e.preventDefault();
    if (!newComp.trim()) return;
    const { error } = await addCompetition(newComp.trim(), newSub.trim() || null, newFormat);
    if (error) return setErr(error.message);
    setNewComp(""); setNewSub(""); listCompetitions().then(setComps);
  }
  async function make(e) {
    e.preventDefault();
    setErr("");
    if (!home || !away || home === away) return setErr("Pick two different teams.");
    const { error } = await createMatch(comp || null, home, away, kickoff.trim() || null);
    if (error) return setErr(error.message);
    setHome(""); setAway(""); setKickoff(""); load();
  }
  const teamName = (id) => teams.find((t) => t.id === id)?.name || "—";

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Matches</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
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
          <Field label="Kick-off label (e.g. 16:00)"><input value={kickoff} onChange={(e) => setKickoff(e.target.value)} style={inp} /></Field>
          <button type="submit" style={btn}>Create match</button>
          {err && <div style={{ color: "#F04444", fontSize: 13, marginTop: 8 }}>{err}</div>}
        </form>

        <form onSubmit={addComp} style={card}>
          <div style={h3}>New competition</div>
          <Field label="Name"><input value={newComp} onChange={(e) => setNewComp(e.target.value)} placeholder="Ijon Memorial Championship" style={inp} /></Field>
          <Field label="Format">
            <select value={newFormat} onChange={(e) => setNewFormat(e.target.value)} style={inp}>
              <option value="friendly">Friendly (no table)</option>
              <option value="league">League (one full table)</option>
              <option value="tournament">Tournament (group table)</option>
            </select>
          </Field>
          <Field label={newFormat === "tournament" ? "Group label (e.g. Group A)" : "Sub-label (optional)"}>
            <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder={newFormat === "tournament" ? "Group A" : ""} style={inp} />
          </Field>
          <button type="submit" style={btn}>Add competition</button>
        </form>
      </div>

      <div style={{ ...card, padding: 0 }}>
        <div style={{ ...h3, padding: "14px 16px 0" }}>All matches</div>
        {matches.length === 0 && <div style={{ color: "#8E939B", padding: 20, fontSize: 14 }}>No matches yet.</div>}
        {matches.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid #26282B" }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: statusColor(m.status), width: 64 }}>{m.status}</span>
            <span style={{ flex: 1, fontSize: 14 }}>{m.home?.name || teamName(m.home_id)} <span style={{ color: "#5B6069" }}>vs</span> {m.away?.name || teamName(m.away_id)}</span>
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
