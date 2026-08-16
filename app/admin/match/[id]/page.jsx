"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  getMatchRaw, getEvents, listTeams, listPlayers, deleteEvent, setMatchDetails,
  kickOff, halfTime, secondHalf, fullTime, startExtraTime, resetMatch, reopenMatch,
  recordGoal, recordCard, recordSub, clockSeconds, footballMinute, fmtClock,
} from "@/lib/db";

const PERIOD = { pre: "Not started", first: "1st half", ht: "Half time", second: "2nd half", ft: "Full time", et: "Extra time" };

export default function Scorer() {
  const { id } = useParams();
  const { user } = useAuth();
  const [m, setM] = useState(null);
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState({});
  const [squads, setSquads] = useState({});
  const [prompt, setPrompt] = useState(null); // {kind:'goal'|'card'|'sub', side, cardType}
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const [ref, setRef] = useState(""); const [venue, setVenue] = useState("");

  const load = async () => {
    const [mm, ev, ts] = await Promise.all([getMatchRaw(id), getEvents(id), listTeams()]);
    setM(mm); setEvents(ev); setRef(mm?.referee || ""); setVenue(mm?.venue || "");
    const map = {}; ts.forEach((t) => (map[t.id] = t)); setTeams(map);
    if (mm) { const [hp, ap] = await Promise.all([listPlayers(mm.home_id), listPlayers(mm.away_id)]); setSquads({ [mm.home_id]: hp, [mm.away_id]: ap }); }
  };
  useEffect(() => { load(); }, [id]);
  // live ticking clock
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(i); }, []);

  if (!m) return <div style={{ color: "#8E939B" }}>Loading…</div>;
  const home = teams[m.home_id] || { name: "Home", short: "H", color: "#18A558" };
  const away = teams[m.away_id] || { name: "Away", short: "A", color: "#2563EB" };
  const hs = events.filter((e) => e.type === "goal" && e.side === "home").length;
  const as = events.filter((e) => e.type === "goal" && e.side === "away").length;
  const secs = clockSeconds(m);
  const locked = !!m.locked_at;
  const sideTeamId = (side) => (side === "home" ? m.home_id : m.away_id);

  async function run(fn) { setBusy(true); await fn(); await load(); setBusy(false); }
  const doKick = () => run(() => kickOff(id));
  const doHT = () => run(() => halfTime(id, clockSeconds(m)));
  const do2nd = () => run(() => secondHalf(id));
  const doFT = () => run(() => fullTime(id, clockSeconds(m)));
  const doET = () => run(() => startExtraTime(id));
  const doReset = () => run(() => resetMatch(id));
  async function doReopen() {
    const reason = window.prompt("Reason for reopening this match?");
    if (!reason) return;
    await run(() => reopenMatch(id, reason, user?.id));
  }
  async function commitGoal(side, opts) { await run(() => recordGoal(id, side, events, clockSeconds(m), opts, user?.id)); setPrompt(null); }
  async function commitCard(side, cardType, opts) { await run(() => recordCard(id, side, cardType, events, clockSeconds(m), opts, user?.id)); setPrompt(null); }
  async function commitSub(side, on, off) { await run(() => recordSub(id, side, events, clockSeconds(m), on, off, user?.id)); setPrompt(null); }
  async function removeEvent(eid) { await run(() => deleteEvent(eid)); }
  async function saveDetails() { await run(() => setMatchDetails(id, { referee: ref.trim() || null, venue: venue.trim() || null })); }

  return (
    <div>
      <Link href="/admin/matches" style={{ color: "#8E939B", fontSize: 13 }}>← All matches</Link>

      {/* scoreboard with live clock */}
      <div style={{ ...card, textAlign: "center", margin: "12px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <Badge t={home} />
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{hs} <span style={{ color: "#5B6069" }}>-</span> {as}</div>
          <Badge t={away} />
        </div>
        <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, fontFamily: "ui-monospace, monospace", color: m.clock_running ? "#F04444" : "#8E939B" }}>
          {(m.status === "live" || m.status === "ht") ? fmtClock(m.status === "ht" ? (m.elapsed_seconds || 0) : secs) : ""}
          <span style={{ color: "#8E939B", fontWeight: 700, fontSize: 12, marginLeft: 8 }}>{PERIOD[m.current_period] || m.status}</span>
        </div>
      </div>

      {/* status */}
      <div style={card}>
        <div style={label}>MATCH CLOCK</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={busy} onClick={doKick} style={{ ...pill, ...(m.current_period === "first" ? on : {}) }}>Kick off</button>
          <button disabled={busy} onClick={doHT} style={{ ...pill, ...(m.current_period === "ht" ? on : {}) }}>Half time</button>
          <button disabled={busy} onClick={do2nd} style={{ ...pill, ...(m.current_period === "second" ? on : {}) }}>2nd half</button>
          <button disabled={busy} onClick={doFT} style={{ ...pill, ...(m.current_period === "ft" ? on : {}) }}>Full time</button>
          {m.status === "ft" && <button disabled={busy} onClick={doET} style={pill}>Extra time</button>}
          <button disabled={busy} onClick={doReset} style={pill}>Reset</button>
        </div>
      </div>

      {locked ? (
        <div style={{ ...card, borderColor: "#5a2323", background: "#221515" }}>
          <div style={{ color: "#F04444", fontWeight: 800, marginBottom: 6 }}>Match locked — Full time</div>
          <div style={{ color: "#c98", fontSize: 13, marginBottom: 12 }}>Scoring is closed. Reopen only for a correction or extra time; the reason is recorded.</div>
          <button onClick={doReopen} style={{ ...pill, background: "#3a1616", color: "#F04444" }}>Reopen match</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          {[["home", home], ["away", away]].map(([side, team]) => (
            <div key={side} style={{ ...card, marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Badge t={team} size={24} /><span style={{ fontWeight: 700, fontSize: 14 }}>{team.name}</span></div>
              <button disabled={busy} onClick={() => setPrompt({ kind: "goal", side })}
                style={{ width: "100%", padding: 16, borderRadius: 10, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, fontSize: 18, cursor: "pointer", marginBottom: 10 }}>⚽ + GOAL</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={busy} onClick={() => setPrompt({ kind: "card", side, cardType: "yellow" })} style={{ ...half, background: "#3a3410", color: "#F5C518" }}>+ Yellow</button>
                <button disabled={busy} onClick={() => setPrompt({ kind: "card", side, cardType: "red" })} style={{ ...half, background: "#3a1616", color: "#F04444" }}>+ Red</button>
              </div>
              <button disabled={busy} onClick={() => setPrompt({ kind: "sub", side })} style={{ ...half, width: "100%", marginTop: 8, background: "#0E0F11", color: "#fff" }}>Substitution</button>
            </div>
          ))}
        </div>
      )}

      {/* referee + venue */}
      <div style={card}>
        <div style={label}>MATCH DETAILS</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ flex: 1, minWidth: 160 }}><div style={flabel}>Referee</div><input value={ref} onChange={(e) => setRef(e.target.value)} style={finp} /></label>
          <label style={{ flex: 1, minWidth: 160 }}><div style={flabel}>Stadium / park</div><input value={venue} onChange={(e) => setVenue(e.target.value)} style={finp} /></label>
          <button onClick={saveDetails} style={{ ...pill, background: "#4FC263", color: "#062" }}>Save</button>
        </div>
      </div>

      {/* event log */}
      <div style={card}>
        <div style={label}>EVENT LOG</div>
        {events.length === 0 && <div style={{ color: "#8E939B", fontSize: 14, padding: "8px 0" }}>No events yet.</div>}
        {[...events].sort((a, b) => (a.minute || 0) - (b.minute || 0)).map((e) => {
          const emoji = e.type === "goal" ? "⚽" : e.type === "yellow" ? "🟨" : e.type === "red" ? "🟥" : "🔁";
          const team = teams[sideTeamId(e.side)] || {};
          return (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid #26282B" }}>
              <span style={{ fontFamily: "monospace", color: "#8E939B", width: 34, fontSize: 13 }}>{e.minute}′</span>
              <span style={{ fontSize: 14 }}>{emoji}</span>
              <span style={{ flex: 1, fontSize: 14 }}>
                {e.type === "sub"
                  ? <><span style={{ color: "#3FC463" }}>{e.player}</span> <span style={{ color: "#5B6069" }}>for</span> <span style={{ color: "#F04444" }}>{e.assist}</span></>
                  : <>{e.player || <span style={{ color: "#5B6069" }}>Unknown</span>}
                      {e.type === "goal" && e.score_home_after != null && <span style={{ color: "#4FC263", fontFamily: "monospace" }}> {e.score_home_after}-{e.score_away_after}</span>}
                      {e.is_penalty && <span style={badge}>PEN</span>}{e.is_own_goal && <span style={badge}>OG</span>}</>}
                <span style={{ color: "#5B6069" }}> · {team.short || e.side}</span>
              </span>
              {!locked && <button onClick={() => removeEvent(e.id)} style={{ background: "none", border: "none", color: "#8E939B", cursor: "pointer", fontSize: 12 }}>Delete</button>}
            </div>
          );
        })}
      </div>

      {prompt?.kind === "goal" && <GoalPrompt team={prompt.side === "home" ? home : away} squad={squads[sideTeamId(prompt.side)] || []}
        curScore={prompt.side === "home" ? `${hs + 1} - ${as}` : `${hs} - ${as + 1}`}
        onCancel={() => setPrompt(null)} onCommit={(opts) => commitGoal(prompt.side, opts)} />}
      {prompt?.kind === "card" && <PickPrompt title={`${prompt.cardType === "yellow" ? "Yellow" : "Red"} card`} team={prompt.side === "home" ? home : away}
        squad={squads[sideTeamId(prompt.side)] || []} onCancel={() => setPrompt(null)} onCommit={(player, pid) => commitCard(prompt.side, prompt.cardType, { player, playerId: pid })} />}
      {prompt?.kind === "sub" && <SubForm team={prompt.side === "home" ? home : away} squad={squads[sideTeamId(prompt.side)] || []}
        onCancel={() => setPrompt(null)} onCommit={(on, off) => commitSub(prompt.side, on, off)} />}
    </div>
  );
}

function GoalPrompt({ team, squad, curScore, onCancel, onCommit }) {
  const [pen, setPen] = useState(false); const [og, setOg] = useState(false);
  const commit = (player, playerId) => onCommit({ player, playerId, isPenalty: pen, isOwnGoal: og });
  return (
    <Modal onCancel={onCancel}>
      <div style={{ textAlign: "center", marginBottom: 4, color: "#8E939B", fontSize: 13 }}>Goal · {team.name}</div>
      <div style={{ textAlign: "center", fontSize: 34, fontWeight: 800, fontFamily: "monospace", marginBottom: 12 }}>{curScore}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <button onClick={() => setPen(!pen)} style={{ ...chip, ...(pen ? onChip : {}) }}>Penalty</button>
        <button onClick={() => setOg(!og)} style={{ ...chip, ...(og ? onChip : {}) }}>Own goal</button>
      </div>
      <div style={{ color: "#8E939B", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>WHO SCORED?</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 260, overflowY: "auto" }}>
        {squad.map((p) => <button key={p.id} onClick={() => commit(p.name, p.id)} style={playerBtn}>{p.number != null ? `${p.number} ` : ""}{p.name}</button>)}
      </div>
      {squad.length === 0 && <div style={{ color: "#5B6069", fontSize: 13, margin: "6px 0" }}>No squad added for this team yet — add players under Teams.</div>}
      <button onClick={() => commit(null, null)} style={{ ...playerBtn, width: "100%", marginTop: 10, color: "#8E939B" }}>Unknown scorer</button>
      <button onClick={onCancel} style={{ ...playerBtn, width: "100%", marginTop: 8, background: "transparent" }}>Cancel</button>
    </Modal>
  );
}
function PickPrompt({ title, team, squad, onCancel, onCommit }) {
  return (
    <Modal onCancel={onCancel}>
      <div style={{ textAlign: "center", marginBottom: 12, fontWeight: 800 }}>{title} · {team.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 280, overflowY: "auto" }}>
        {squad.map((p) => <button key={p.id} onClick={() => onCommit(p.name, p.id)} style={playerBtn}>{p.number != null ? `${p.number} ` : ""}{p.name}</button>)}
      </div>
      {squad.length === 0 && <div style={{ color: "#5B6069", fontSize: 13, margin: "6px 0" }}>No squad added yet.</div>}
      <button onClick={() => onCommit(null, null)} style={{ ...playerBtn, width: "100%", marginTop: 10, color: "#8E939B" }}>Unknown player</button>
      <button onClick={onCancel} style={{ ...playerBtn, width: "100%", marginTop: 8, background: "transparent" }}>Cancel</button>
    </Modal>
  );
}
function SubForm({ team, squad, onCancel, onCommit }) {
  const [on, setOn] = useState(""); const [off, setOff] = useState("");
  return (
    <Modal onCancel={onCancel}>
      <div style={{ fontWeight: 800, marginBottom: 12 }}>Substitution · {team.name}</div>
      <div style={flabel}>Player coming ON</div>
      <input list="son" value={on} onChange={(e) => setOn(e.target.value)} style={finp} />
      <div style={flabel}>Player going OFF</div>
      <input list="soff" value={off} onChange={(e) => setOff(e.target.value)} style={finp} />
      <datalist id="son">{squad.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <datalist id="soff">{squad.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff", cursor: "pointer" }}>Cancel</button>
        <button onClick={() => on.trim() && off.trim() && onCommit(on.trim(), off.trim())} style={{ flex: 1, padding: 11, borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" }}>Add</button>
      </div>
    </Modal>
  );
}
function Modal({ children, onCancel }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onCancel}>
    <div style={{ background: "#161719", borderRadius: 14, padding: 18, width: "100%", maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>;
}
function Badge({ t, size = 40 }) { return <span style={{ width: size, height: size, borderRadius: "50%", background: t.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.36 }}>{t.short}</span>; }

const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16, marginBottom: 14 };
const label = { color: "#8E939B", fontSize: 12, fontWeight: 700, marginBottom: 10 };
const pill = { padding: "8px 14px", borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const on = { background: "#4FC263", color: "#062" };
const half = { flex: 1, padding: 10, borderRadius: 8, border: "1px solid #2A2C30", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const chip = { padding: "6px 14px", borderRadius: 999, border: "1px solid #2A2C30", background: "#0E0F11", color: "#8E939B", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const onChip = { background: "#4FC263", color: "#062", borderColor: "#4FC263" };
const playerBtn = { padding: "10px 8px", borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "center" };
const badge = { marginLeft: 6, fontSize: 10, fontWeight: 800, color: "#8E939B", border: "1px solid #3a3d42", borderRadius: 4, padding: "1px 4px" };
const flabel = { color: "#8E939B", fontSize: 12, fontWeight: 600, margin: "4px 0" };
const finp = { width: "100%", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none" };
