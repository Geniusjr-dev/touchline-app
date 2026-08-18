"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getMatchRaw, getEvents, listTeams, setStatus, setKits, addEvent, deleteEvent, liveMinute } from "@/lib/db";

// Colours the admin can pick from for a match kit. Includes dark + white change kits.
const KIT_PALETTE = ["#18A558", "#2563EB", "#DC2626", "#F5C518", "#7C3AED", "#EA580C", "#0891B2", "#DB2777", "#111827", "#F1F5F9"];
const sameColor = (x, y) => (x || "").toLowerCase() === (y || "").toLowerCase();

export default function Scorer() {
  const { id } = useParams();
  const [m, setM] = useState(null);
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState({});
  const [form, setForm] = useState(null); // {type, side}
  const [busy, setBusy] = useState(false);
  const [homeKit, setHomeKit] = useState(null);
  const [awayKit, setAwayKit] = useState(null);

  const load = async () => {
    const [mm, ev, ts] = await Promise.all([getMatchRaw(id), getEvents(id), listTeams()]);
    setM(mm); setEvents(ev);
    const map = {}; ts.forEach((t) => (map[t.id] = t)); setTeams(map);
  };
  useEffect(() => { load(); }, [id]);

  // Initialise kit colours once the match and its teams are loaded.
  // Away auto-switches to a non-clashing palette colour if it would match home.
  useEffect(() => {
    if (!m || (homeKit && awayKit)) return;
    const hcTeam = teams[m.home_id]?.color;
    const acTeam = teams[m.away_id]?.color;
    if (!hcTeam || !acTeam) return;
    const hc = m.home_kit || hcTeam;
    let ac = m.away_kit || acTeam;
    if (sameColor(ac, hc)) ac = KIT_PALETTE.find((c) => !sameColor(c, hc)) || "#DC2626";
    setHomeKit(hc); setAwayKit(ac);
  }, [m, teams, homeKit, awayKit]);

  if (!m) return <div style={{ color: "#8E939B" }}>Loading…</div>;
  const home = teams[m.home_id] || { name: "Home", short: "H", color: "#18A558" };
  const away = teams[m.away_id] || { name: "Away", short: "A", color: "#2563EB" };
  const hs = events.filter((e) => e.type === "goal" && e.side === "home").length;
  const as = events.filter((e) => e.type === "goal" && e.side === "away").length;
  const min = liveMinute(m);

  const clash = !!(homeKit && awayKit && sameColor(homeKit, awayKit));

  async function changeStatus(s) { setBusy(true); await setStatus(id, s); await load(); setBusy(false); }
  async function saveEvent(ev) { setBusy(true); await addEvent(id, ev); setForm(null); await load(); setBusy(false); }
  async function removeEvent(eid) { setBusy(true); await deleteEvent(eid); await load(); setBusy(false); }
  async function saveKits() { if (clash) return; setBusy(true); await setKits(id, homeKit, awayKit); await load(); setBusy(false); }
  // Kick-off persists the kits, then sets the match live. Blocked while colours clash.
  async function kickoff() { if (clash) return; setBusy(true); await setKits(id, homeKit, awayKit); await setStatus(id, "live"); await load(); setBusy(false); }

  const statuses = [["live", "Kick off / Live"], ["ht", "Half time"], ["ft", "Full time"], ["scheduled", "Reset"]];

  return (
    <div>
      <Link href="/admin/matches" style={{ color: "#8E939B", fontSize: 13 }}>← All matches</Link>

      {/* scoreboard */}
      <div style={{ background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 18, margin: "12px 0", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <TeamBadge t={home} />
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{hs} <span style={{ color: "#5B6069" }}>-</span> {as}</div>
          <TeamBadge t={away} />
        </div>
        <div style={{ marginTop: 8, color: m.status === "live" ? "#F04444" : "#8E939B", fontSize: 13, fontWeight: 700 }}>
          {m.status === "live" ? `LIVE ${min}′` : m.status.toUpperCase()}
        </div>
      </div>

      {/* kits — set the colours each team wears for THIS match (drives the live stats bars) */}
      <div style={{ ...card }}>
        <div style={label}>KITS FOR THIS MATCH</div>
        <div style={{ color: "#8E939B", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
          Set the colour each team wears today. The away team must switch if it clashes with the home colour. These colours drive the live stats bars — the crests keep each team&rsquo;s identity colour.
        </div>
        {[["home", home, homeKit, setHomeKit, awayKit], ["away", away, awayKit, setAwayKit, homeKit]].map(([side, team, val, setVal, other]) => (
          <div key={side} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: val || "#333", display: "inline-block", boxShadow: "0 0 0 2px #26282B", flexShrink: 0 }} />
            <span style={{ width: 120 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{team.name}</span>
              <div style={{ color: "#5B6069", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{side === "home" ? "Home kit" : "Away kit"}</div>
            </span>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {KIT_PALETTE.map((c) => {
                const isClash = sameColor(c, other);
                const on = sameColor(c, val);
                return (
                  <button key={c} type="button" disabled={isClash} onClick={() => setVal(c)}
                    title={isClash ? "Clashes with the other team" : c}
                    style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: isClash ? "not-allowed" : "pointer", opacity: isClash ? 0.2 : 1, border: on ? "2px solid #fff" : "2px solid transparent", boxShadow: on ? "none" : "0 0 0 1px #2A2C30" }} />
                );
              })}
            </div>
          </div>
        ))}
        {clash && <div style={{ color: "#F04444", fontSize: 13, fontWeight: 700, marginTop: 4 }}>⚠ Kit clash — the away team must switch to a different colour before kick-off.</div>}
        <div style={{ marginTop: 10 }}>
          <button disabled={busy || clash} onClick={saveKits}
            style={{ ...pill, background: "#0E0F11", color: "#fff", opacity: (busy || clash) ? 0.5 : 1, cursor: (busy || clash) ? "not-allowed" : "pointer" }}>Save kits</button>
        </div>
      </div>

      {/* status */}
      <div style={{ ...card }}>
        <div style={label}>MATCH STATUS</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {statuses.map(([s, txt]) => {
            const blocked = s === "live" && clash;
            return (
              <button key={s} disabled={busy || blocked} onClick={() => (s === "live" ? kickoff() : changeStatus(s))}
                title={blocked ? "Resolve the kit clash before kick-off" : ""}
                style={{ ...pill, background: m.status === s ? "#4FC263" : "#0E0F11", color: m.status === s ? "#062" : "#fff", opacity: blocked ? 0.5 : 1, cursor: blocked ? "not-allowed" : "pointer" }}>{txt}</button>
            );
          })}
        </div>
      </div>

      {/* add events */}
      <div style={{ ...card }}>
        <div style={label}>ADD EVENT</div>
        {[["home", home], ["away", away]].map(([side, team]) => (
          <div key={side} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <TeamBadge t={team} size={24} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{team.name}</span>
            <button style={ebtn} onClick={() => setForm({ type: "goal", side })}>⚽ Goal</button>
            <button style={{ ...ebtn, color: "#F5C518" }} onClick={() => setForm({ type: "yellow", side })}>Yellow</button>
            <button style={{ ...ebtn, color: "#F04444" }} onClick={() => setForm({ type: "red", side })}>Red</button>
            <button style={ebtn} onClick={() => setForm({ type: "sub", side })}>Sub</button>
          </div>
        ))}
      </div>

      {/* event log */}
      <div style={{ ...card }}>
        <div style={label}>EVENT LOG</div>
        {events.length === 0 && <div style={{ color: "#8E939B", fontSize: 14, padding: "8px 0" }}>No events yet.</div>}
        {[...events].sort((a, b) => (a.minute || 0) - (b.minute || 0)).map((e) => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #26282B" }}>
            <span style={{ fontFamily: "monospace", color: "#8E939B", width: 34, fontSize: 13 }}>{e.minute}′</span>
            <span style={{ fontSize: 13 }}>{icon(e.type)}</span>
            <span style={{ flex: 1, fontSize: 14 }}>
              {e.type === "sub" ? <><span style={{ color: "#3FC463" }}>{e.player}</span> <span style={{ color: "#5B6069" }}>for</span> <span style={{ color: "#F04444" }}>{e.assist}</span></> : e.player}
              <span style={{ color: "#5B6069" }}> · {e.side}</span>
            </span>
            <button onClick={() => removeEvent(e.id)} style={{ background: "none", border: "none", color: "#8E939B", cursor: "pointer", fontSize: 13 }}>Delete</button>
          </div>
        ))}
      </div>

      {form && <EventForm form={form} home={home} away={away} defaultMinute={min} onCancel={() => setForm(null)} onSave={saveEvent} />}
    </div>
  );
}

function EventForm({ form, home, away, defaultMinute, onCancel, onSave }) {
  const team = form.side === "home" ? home : away;
  const [player, setPlayer] = useState("");
  const [assist, setAssist] = useState("");
  const [minute, setMinute] = useState(defaultMinute || 0);
  const isSub = form.type === "sub";
  const title = form.type === "goal" ? "Goal" : form.type === "yellow" ? "Yellow card" : form.type === "red" ? "Red card" : "Substitution";
  function save() {
    if (!player.trim()) return;
    onSave({ type: form.type, side: form.side, minute: Number(minute) || 0, player: player.trim(), assist: (isSub || form.type === "goal") ? (assist.trim() || null) : null });
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onCancel}>
      <div style={{ background: "#161719", borderRadius: 14, padding: 18, width: "100%", maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>{title} · {team.name}</div>
        <label style={flabel}>{isSub ? "Player coming ON" : "Player"}</label>
        <input autoFocus value={player} onChange={(e) => setPlayer(e.target.value)} style={finp} />
        {(isSub || form.type === "goal") && <>
          <label style={flabel}>{isSub ? "Player going OFF" : "Assist (optional)"}</label>
          <input value={assist} onChange={(e) => setAssist(e.target.value)} style={finp} />
        </>}
        <label style={flabel}>Minute</label>
        <input type="number" value={minute} onChange={(e) => setMinute(e.target.value)} style={finp} />
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff", cursor: "pointer" }}>Cancel</button>
          <button onClick={save} style={{ flex: 1, padding: 11, borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" }}>Add</button>
        </div>
      </div>
    </div>
  );
}
function icon(type) { return type === "goal" ? "⚽" : type === "yellow" ? "🟨" : type === "red" ? "🟥" : "🔁"; }
function TeamBadge({ t, size = 40 }) {
  return <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
    <span style={{ width: size, height: size, borderRadius: "50%", background: t.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.36 }}>{t.short}</span>
  </span>;
}
const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16, marginBottom: 14 };
const label = { color: "#8E939B", fontSize: 12, fontWeight: 700, marginBottom: 10 };
const pill = { padding: "8px 14px", borderRadius: 9, border: "1px solid #2A2C30", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const ebtn = { padding: "6px 12px", borderRadius: 8, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const flabel = { display: "block", color: "#8E939B", fontSize: 12, fontWeight: 600, margin: "8px 0 4px" };
const finp = { width: "100%", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none" };
