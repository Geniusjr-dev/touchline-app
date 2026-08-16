"use client";
import { useCallback, useEffect, useState } from "react";
import { listTeams, addTeam, updateTeam, listPlayers, addPlayer, deletePlayer } from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";

const COLORS = ["#18A558", "#2563EB", "#DC2626", "#7C3AED", "#EA580C", "#0891B2", "#DB2777", "#CA8A04"];

export default function Teams() {
  const { activeOrganizationId } = useAuth();
  const [teams, setTeams] = useState([]);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [short, setShort] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [openTeam, setOpenTeam] = useState(null);

  const load = useCallback(() => listTeams(activeOrganizationId).then(setTeams).catch(() => {}), [activeOrganizationId]);
  useEffect(() => { if (activeOrganizationId) load(); }, [activeOrganizationId, load]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !short.trim()) return;
    setBusy(true); setErr("");
    const { error } = await addTeam(activeOrganizationId, name.trim(), displayName.trim() || null, short.trim().toUpperCase().slice(0, 4), color);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setName(""); setDisplayName(""); setShort(""); load();
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Teams and players</h1>
      <form onSubmit={submit} style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <Field label="Team name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Buya Stars Football Club" style={inp} /></Field>
          <Field label="Display name (optional)"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Buya Stars" maxLength={40} style={inp} /></Field>
          <Field label="Badge code (max 4)"><input value={short} onChange={(e) => setShort(e.target.value)} placeholder="BUY" style={{ ...inp, width: 110, textTransform: "uppercase" }} /></Field>
          <Field label="Colour">
            <div style={{ display: "flex", gap: 6 }}>
              {COLORS.map((c) => <button type="button" key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: color === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer" }} />)}
            </div>
          </Field>
          <button type="submit" disabled={busy} style={btn}>{busy ? "Adding." : "Add team"}</button>
        </div>
        {err && <div style={{ color: "#F04444", fontSize: 13, marginTop: 10 }}>{err}</div>}
      </form>

      <div style={{ ...card, padding: 0 }}>
        {teams.length === 0 && <div style={{ color: "#8E939B", padding: 20, fontSize: 14 }}>No teams yet.</div>}
        {teams.map((tm) => (
          <div key={tm.id} style={{ borderTop: "1px solid #26282B" }}>
            <button onClick={() => setOpenTeam(openTeam === tm.id ? null : tm.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer" }}>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: tm.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{tm.short}</span>
              <span style={{ flex: 1, textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: "#fff" }}>{tm.name}</span>
                {tm.display_name && <span style={{ display: "block", color: "#8E939B", fontSize: 12, marginTop: 2 }}>Shown as: {tm.display_name}</span>}
              </span>
              <span style={{ color: "#8E939B", fontSize: 13 }}>{openTeam === tm.id ? "Close" : "Edit and squad"}</span>
            </button>
            {openTeam === tm.id && (
              <div style={{ background: "#101113" }}>
                <TeamEditor team={tm} onSaved={load} />
                <Squad teamId={tm.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamEditor({ team, onSaved }) {
  const [name, setName] = useState(team.name || "");
  const [displayName, setDisplayName] = useState(team.display_name || "");
  const [short, setShort] = useState(team.short || "");
  const [color, setColor] = useState(team.color || COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save(e) {
    e.preventDefault();
    if (!name.trim() || !short.trim()) return;
    setSaving(true); setMessage("");
    const { error } = await updateTeam(team.id, name.trim(), displayName.trim() || null, short.trim().toUpperCase().slice(0, 4), color);
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Saved"); onSaved();
  }
  return (
    <form onSubmit={save} style={{ padding: "14px 16px", borderTop: "1px solid #26282B", borderBottom: "1px solid #26282B" }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Team display settings</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <Field label="Official team name"><input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inp, minWidth: 190 }} /></Field>
        <Field label="Display name (optional)"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Nottm Forest" maxLength={40} style={{ ...inp, minWidth: 170 }} /></Field>
        <Field label="Badge code"><input value={short} onChange={(e) => setShort(e.target.value)} maxLength={4} style={{ ...inp, width: 92, textTransform: "uppercase" }} /></Field>
        <Field label="Colour">
          <div style={{ display: "flex", gap: 5 }}>
            {COLORS.map((c) => <button type="button" key={c} onClick={() => setColor(c)} aria-label={`Use colour ${c}`} style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: color === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer" }} />)}
          </div>
        </Field>
        <button type="submit" disabled={saving} style={btn}>{saving ? "Saving." : "Save team"}</button>
      </div>
      <div style={{ color: message === "Saved" ? "#4FC263" : message ? "#F04444" : "#8E939B", fontSize: 12, marginTop: 8 }}>
        {message || "Public match rows never split team names. Add a shorter Display name when the official name is too long."}
      </div>
    </form>
  );
}

function Squad({ teamId }) {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [pos, setPos] = useState("");
  const load = useCallback(() => listPlayers(teamId).then(setPlayers).catch(() => {}), [teamId]);
  useEffect(() => { load(); }, [load]);
  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await addPlayer(teamId, name.trim(), number ? Number(number) : null, pos.trim() || null);
    setName(""); setNumber(""); setPos(""); load();
  }
  async function del(id) { await deletePlayer(id); load(); }
  return (
    <div style={{ padding: "0 16px 16px", background: "#101113" }}>
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", padding: "12px 0" }}>
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="#" style={{ ...inp, width: 56 }} type="number" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" style={{ ...inp, flex: 1, minWidth: 140 }} />
        <input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="Position" style={{ ...inp, width: 120 }} />
        <button type="submit" style={btn}>Add player</button>
      </form>
      {players.length === 0 && <div style={{ color: "#5B6069", fontSize: 13, paddingBottom: 8 }}>No players yet.</div>}
      {players.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid #26282B" }}>
          <span style={{ fontFamily: "monospace", color: "#8E939B", width: 26 }}>{p.number ?? "-"}</span>
          <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
          <span style={{ color: "#8E939B", fontSize: 12 }}>{p.position || ""}</span>
          <button onClick={() => del(p.id)} style={{ background: "none", border: "none", color: "#8E939B", cursor: "pointer", fontSize: 12 }}>Remove</button>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }) { return <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ color: "#8E939B", fontSize: 12, fontWeight: 600 }}>{label}</span>{children}</label>; }
const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16 };
const inp = { padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none" };
const btn = { padding: "10px 16px", borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" };
