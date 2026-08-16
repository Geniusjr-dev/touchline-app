"use client";
import { useEffect, useState } from "react";
import { listTeams, addTeam, listPlayers, addPlayer, deletePlayer } from "@/lib/db";

const COLORS = ["#18A558", "#2563EB", "#DC2626", "#7C3AED", "#EA580C", "#0891B2", "#DB2777", "#CA8A04"];

export default function Teams() {
  const [teams, setTeams] = useState([]);
  const [name, setName] = useState(""); const [short, setShort] = useState("");
  const [display, setDisplay] = useState(""); const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);

  const load = () => listTeams().then(setTeams).catch(() => {});
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !short.trim()) return;
    setBusy(true); setErr("");
    const { error } = await addTeam(name.trim(), short.trim().toUpperCase().slice(0, 4), color, display.trim() || null);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setName(""); setShort(""); setDisplay(""); load();
  }

  return (
    <div>
      <h1>Teams and squads</h1>
      <p className="sub">Register teams, set a crest colour and short code, and build each squad.</p>

      <form onSubmit={submit} className="panel">
        <div className="eyebrow">Add a team</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}><span>Team name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Buya Stars" /></label>
          <label className="field" style={{ width: 100, marginBottom: 0 }}><span>Short code</span><input value={short} onChange={(e) => setShort(e.target.value)} placeholder="BUY" style={{ textTransform: "uppercase" }} /></label>
          <label className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}><span>Display name (optional, for long names)</span><input value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="shorter label" /></label>
          <div className="field" style={{ marginBottom: 0 }}><span>Colour</span>
            <div style={{ display: "flex", gap: 6 }}>
              {COLORS.map((c) => <button type="button" key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: color === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer" }} />)}
            </div>
          </div>
          <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "Adding." : "Add team"}</button>
        </div>
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{err}</div>}
      </form>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="eyebrow">Registered teams</div>
        {teams.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14 }}>No teams yet.</div>}
        {teams.map((tm) => (
          <div key={tm.id} style={{ borderTop: "1px solid var(--border)" }}>
            <button onClick={() => setOpen(open === tm.id ? null : tm.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 4px", background: "transparent", border: "none", cursor: "pointer", color: "var(--text)" }}>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: tm.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{tm.short}</span>
              <span style={{ fontSize: 15, fontWeight: 600, flex: 1, textAlign: "left" }}>{tm.name}{tm.display_name ? <span style={{ color: "var(--faint)", fontWeight: 400 }}>  shown as {tm.display_name}</span> : ""}</span>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>{open === tm.id ? "Hide squad" : "Squad"}</span>
            </button>
            {open === tm.id && <Squad teamId={tm.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Squad({ teamId }) {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState(""); const [number, setNumber] = useState(""); const [pos, setPos] = useState("");
  const load = () => listPlayers(teamId).then(setPlayers).catch(() => {});
  useEffect(() => { load(); }, [teamId]);
  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await addPlayer(teamId, name.trim(), number ? Number(number) : null, pos.trim() || null);
    setName(""); setNumber(""); setPos(""); load();
  }
  async function del(id) { await deletePlayer(id); load(); }
  return (
    <div style={{ padding: "0 4px 16px" }}>
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", padding: "12px 0" }}>
        <label className="field" style={{ width: 64, marginBottom: 0 }}><span>No.</span><input type="number" value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <label className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}><span>Player name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field" style={{ width: 140, marginBottom: 0 }}><span>Position</span><input value={pos} onChange={(e) => setPos(e.target.value)} /></label>
        <button type="submit" className="btn btn-primary">Add player</button>
      </form>
      {players.length === 0 && <div style={{ color: "var(--faint)", fontSize: 13 }}>No players yet.</div>}
      {players.map((p) => (
        <div key={p.id} className="row">
          <span className="scoreline" style={{ color: "var(--muted)", width: 26 }}>{p.number ?? "-"}</span>
          <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>{p.position || ""}</span>
          <button onClick={() => del(p.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--muted)" }}>Remove</button>
        </div>
      ))}
    </div>
  );
}
