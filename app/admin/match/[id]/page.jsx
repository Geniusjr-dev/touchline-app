"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getMatchRaw, getEvents, listTeams, listPlayers, setStatus, addEvent, deleteEvent, updateEvent, liveMinute } from "@/lib/db";

export default function Scorer() {
  const { id } = useParams();
  const [m, setM] = useState(null);
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState({});
  const [squads, setSquads] = useState({}); // teamId -> players[]
  const [busy, setBusy] = useState(false);
  const [subFor, setSubFor] = useState(null); // side

  const load = async () => {
    const [mm, ev, ts] = await Promise.all([getMatchRaw(id), getEvents(id), listTeams()]);
    setM(mm); setEvents(ev);
    const map = {}; ts.forEach((t) => (map[t.id] = t)); setTeams(map);
    if (mm) {
      const [hp, ap] = await Promise.all([listPlayers(mm.home_id), listPlayers(mm.away_id)]);
      setSquads({ [mm.home_id]: hp, [mm.away_id]: ap });
    }
  };
  useEffect(() => { load(); }, [id]);

  if (!m) return <div style={{ color: "#8E939B" }}>Loading…</div>;
  const home = teams[m.home_id] || { name: "Home", short: "H", color: "#18A558" };
  const away = teams[m.away_id] || { name: "Away", short: "A", color: "#2563EB" };
  const hs = events.filter((e) => e.type === "goal" && e.side === "home").length;
  const as = events.filter((e) => e.type === "goal" && e.side === "away").length;
  const min = liveMinute(m);
  const sideTeamId = (side) => (side === "home" ? m.home_id : m.away_id);

  // score-first: add immediately with no player, current minute
  async function quickAdd(type, side) {
    setBusy(true);
    await addEvent(id, { type, side, minute: min || 0, player: null, assist: null });
    await load(); setBusy(false);
  }
  async function undoLast(type, side) {
    const mine = events.filter((e) => e.type === type && e.side === side).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!mine.length) return;
    setBusy(true); await deleteEvent(mine[0].id); await load(); setBusy(false);
  }
  async function changeStatus(s) { setBusy(true); await setStatus(id, s); await load(); setBusy(false); }
  async function attribute(eid, patch) { await updateEvent(eid, patch); await load(); }
  async function removeEvent(eid) { setBusy(true); await deleteEvent(eid); await load(); setBusy(false); }
  async function saveSub(side, on, off) {
    setBusy(true);
    await addEvent(id, { type: "sub", side, minute: min || 0, player: on, assist: off });
    setSubFor(null); await load(); setBusy(false);
  }

  const statuses = [["live", "Kick off / Live"], ["ht", "Half time"], ["ft", "Full time"], ["scheduled", "Reset"]];

  return (
    <div>
      <Link href="/admin/matches" style={{ color: "#8E939B", fontSize: 13 }}>← All matches</Link>

      <div style={{ ...card, textAlign: "center", margin: "12px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <Badge t={home} />
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{hs} <span style={{ color: "#5B6069" }}>-</span> {as}</div>
          <Badge t={away} />
        </div>
        <div style={{ marginTop: 8, color: m.status === "live" ? "#F04444" : "#8E939B", fontSize: 13, fontWeight: 700 }}>
          {m.status === "live" ? `LIVE ${min}′` : m.status.toUpperCase()}
        </div>
      </div>

      {/* status */}
      <div style={card}>
        <div style={label}>MATCH STATUS</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {statuses.map(([s, txt]) => (
            <button key={s} disabled={busy} onClick={() => changeStatus(s)}
              style={{ ...pill, background: m.status === s ? "#4FC263" : "#0E0F11", color: m.status === s ? "#062" : "#fff" }}>{txt}</button>
          ))}
        </div>
      </div>

      {/* fast score-first controls */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        {[["home", home], ["away", away]].map(([side, team]) => (
          <div key={side} style={{ ...card, marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Badge t={team} size={24} /><span style={{ fontWeight: 700, fontSize: 14 }}>{team.name}</span>
            </div>
            <button disabled={busy} onClick={() => quickAdd("goal", side)}
              style={{ width: "100%", padding: 16, borderRadius: 10, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, fontSize: 18, cursor: "pointer", marginBottom: 8 }}>
              ⚽ + GOAL
            </button>
            <button disabled={busy} onClick={() => undoLast("goal", side)}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #2A2C30", background: "transparent", color: "#8E939B", fontSize: 12, cursor: "pointer", marginBottom: 10 }}>
              Undo last goal
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy} onClick={() => quickAdd("yellow", side)} style={{ ...half, background: "#3a3410", color: "#F5C518" }}>+ Yellow</button>
              <button disabled={busy} onClick={() => quickAdd("red", side)} style={{ ...half, background: "#3a1616", color: "#F04444" }}>+ Red</button>
            </div>
            <button disabled={busy} onClick={() => setSubFor(side)} style={{ ...half, width: "100%", marginTop: 8, background: "#0E0F11", color: "#fff" }}>Substitution</button>
          </div>
        ))}
      </div>

      {/* event log with attribution */}
      <div style={card}>
        <div style={label}>EVENT LOG — tap a name field to say who</div>
        {events.length === 0 && <div style={{ color: "#8E939B", fontSize: 14, padding: "8px 0" }}>No events yet.</div>}
        {[...events].sort((a, b) => (a.minute || 0) - (b.minute || 0)).map((e) => (
          <EventRow key={e.id} e={e} squad={squads[sideTeamId(e.side)] || []} onAttribute={attribute} onRemove={removeEvent} />
        ))}
      </div>

      {subFor && <SubForm side={subFor} team={subFor === "home" ? home : away} squad={squads[sideTeamId(subFor)] || []} onCancel={() => setSubFor(null)} onSave={saveSub} />}
    </div>
  );
}

function EventRow({ e, squad, onAttribute, onRemove }) {
  const [name, setName] = useState(e.player || "");
  const listId = "sq-" + e.id;
  const emoji = e.type === "goal" ? "⚽" : e.type === "yellow" ? "🟨" : e.type === "red" ? "🟥" : e.type === "miss" ? "❌" : "🔁";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #26282B" }}>
      <span style={{ fontFamily: "monospace", color: "#8E939B", width: 30, fontSize: 13 }}>{e.minute}′</span>
      <span style={{ fontSize: 14 }}>{emoji}</span>
      {e.type === "sub" ? (
        <span style={{ flex: 1, fontSize: 14 }}><span style={{ color: "#3FC463" }}>{e.player}</span> <span style={{ color: "#5B6069" }}>for</span> <span style={{ color: "#F04444" }}>{e.assist}</span></span>
      ) : (
        <>
          <input list={listId} value={name} onChange={(ev) => setName(ev.target.value)}
            onBlur={() => name !== (e.player || "") && onAttribute(e.id, { player: name.trim() || null })}
            onKeyDown={(ev) => ev.key === "Enter" && ev.target.blur()}
            placeholder={e.type === "goal" ? "Who scored?" : "Which player?"}
            style={{ flex: 1, padding: "6px 8px", borderRadius: 7, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 13, outline: "none" }} />
          <datalist id={listId}>{squad.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        </>
      )}
      <span style={{ color: "#5B6069", fontSize: 12, width: 44 }}>{e.side}</span>
      <button onClick={() => onRemove(e.id)} style={{ background: "none", border: "none", color: "#8E939B", cursor: "pointer", fontSize: 12 }}>Delete</button>
    </div>
  );
}

function SubForm({ side, team, squad, onCancel, onSave }) {
  const [on, setOn] = useState("");
  const [off, setOff] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onCancel}>
      <div style={{ background: "#161719", borderRadius: 14, padding: 18, width: "100%", maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Substitution · {team.name}</div>
        <label style={flabel}>Player coming ON</label>
        <input list="sub-on" value={on} onChange={(e) => setOn(e.target.value)} style={finp} />
        <label style={flabel}>Player going OFF</label>
        <input list="sub-off" value={off} onChange={(e) => setOff(e.target.value)} style={finp} />
        <datalist id="sub-on">{squad.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <datalist id="sub-off">{squad.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => on.trim() && off.trim() && onSave(side, on.trim(), off.trim())} style={{ flex: 1, padding: 11, borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" }}>Add</button>
        </div>
      </div>
    </div>
  );
}

function Badge({ t, size = 40 }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", background: t.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.36 }}>{t.short}</span>;
}
const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16, marginBottom: 14 };
const label = { color: "#8E939B", fontSize: 12, fontWeight: 700, marginBottom: 10 };
const pill = { padding: "8px 14px", borderRadius: 9, border: "1px solid #2A2C30", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const half = { flex: 1, padding: 10, borderRadius: 8, border: "1px solid #2A2C30", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const flabel = { display: "block", color: "#8E939B", fontSize: 12, fontWeight: 600, margin: "8px 0 4px" };
const finp = { width: "100%", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none" };
