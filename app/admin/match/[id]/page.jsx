"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  getMatchRaw, getEvents, listTeams, listPlayers, deleteEvent, updateEvent, setMatchDetails,
  kickOff, halfTime, secondHalf, fullTime, startExtraTime, resetMatch, reopenMatch,
  pauseClock, resumeClock, setStoppage, setManualScore, clearManualScore,
  recordGoal, recordCard, recordSub, clockSeconds, footballMinute, fmtClock,
} from "@/lib/db";

const PERIOD = { pre: "Not started", first: "First half", ht: "Half time", second: "Second half", ft: "Full time", et: "Extra time" };

export default function Scorer() {
  const { id } = useParams();
  const { user } = useAuth();
  const [m, setM] = useState(null);
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState({});
  const [squads, setSquads] = useState({});
  const [prompt, setPrompt] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [editEv, setEditEv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const [ref, setRef] = useState(""); const [venue, setVenue] = useState("");
  const [ovH, setOvH] = useState(""); const [ovA, setOvA] = useState(""); const [stop, setStop] = useState("");

  const load = async () => {
    const [mm, ev, ts] = await Promise.all([getMatchRaw(id), getEvents(id), listTeams()]);
    setM(mm); setEvents(ev); setRef(mm?.referee || ""); setVenue(mm?.venue || "");
    setStop(mm?.stoppage_seconds ? String(Math.round(mm.stoppage_seconds / 60)) : "");
    const map = {}; ts.forEach((t) => (map[t.id] = t)); setTeams(map);
    if (mm) { const [hp, ap] = await Promise.all([listPlayers(mm.home_id), listPlayers(mm.away_id)]); setSquads({ [mm.home_id]: hp, [mm.away_id]: ap }); }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(i); }, []);

  if (!m) return <div style={{ color: "var(--muted)" }}>Loading.</div>;
  const home = teams[m.home_id] || { name: "Home", short: "H", color: "#18A558" };
  const away = teams[m.away_id] || { name: "Away", short: "A", color: "#2563EB" };
  const manual = m.score_home_manual != null && m.score_away_manual != null;
  const hs = manual ? m.score_home_manual : events.filter((e) => e.type === "goal" && e.side === "home").length;
  const as = manual ? m.score_away_manual : events.filter((e) => e.type === "goal" && e.side === "away").length;
  const secs = clockSeconds(m);
  const stopMin = m.stoppage_seconds ? Math.round(m.stoppage_seconds / 60) : 0;
  const locked = !!m.locked_at;
  const running = !!m.clock_running;
  const sideTeamId = (side) => (side === "home" ? m.home_id : m.away_id);

  async function run(fn) { setBusy(true); await fn(); await load(); setBusy(false); }
  const ask = (title, body, onYes, danger = true) => setConfirm({ title, body, onYes, danger });

  async function doReopen() {
    const reason = window.prompt("Reason for reopening this match?");
    if (!reason) return;
    await run(() => reopenMatch(id, reason, user?.id));
  }
  async function commitGoal(side, opts) { await run(() => recordGoal(id, side, events, clockSeconds(m), opts, user?.id)); setPrompt(null); }
  async function commitCard(side, cardType, opts) { await run(() => recordCard(id, side, cardType, events, clockSeconds(m), opts, user?.id)); setPrompt(null); }
  async function commitSub(side, on, off) { await run(() => recordSub(id, side, events, clockSeconds(m), on, off, user?.id)); setPrompt(null); }
  async function saveDetails() { await run(() => setMatchDetails(id, { referee: ref.trim() || null, venue: venue.trim() || null })); }
  async function applyOverride() { if (ovH === "" || ovA === "") return; await run(() => setManualScore(id, Number(ovH), Number(ovA))); }
  async function applyStoppage() { await run(() => setStoppage(id, (Number(stop) || 0) * 60)); }

  return (
    <div>
      <Link href="/admin/matches" className="navlink">&#8592; All matches</Link>

      {/* scoreboard */}
      <div className="panel" style={{ textAlign: "center", marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <Badge t={home} /><div className="scoreline" style={{ fontSize: 42 }}>{hs} <span style={{ color: "var(--faint)" }}>-</span> {as}</div><Badge t={away} />
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {running && <span className="live-dot" />}
          <span className="scoreline" style={{ fontSize: 16, color: running ? "var(--danger)" : "var(--muted)" }}>
            {(m.status === "live" || m.status === "ht") ? fmtClock(m.status === "ht" ? (m.elapsed_seconds || 0) : secs) : ""}
            {stopMin > 0 && (m.status === "live") ? <span style={{ color: "var(--warning)" }}> +{stopMin}</span> : null}
          </span>
          <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{PERIOD[m.current_period] || m.status}</span>
        </div>
        {manual && <div style={{ marginTop: 10, color: "var(--warning)", fontSize: 12, fontWeight: 700 }}>Manual score override active</div>}
      </div>

      {/* clock controller */}
      <div className="panel">
        <div className="eyebrow">Clock controller</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={busy} className={"btn" + (m.current_period === "first" ? " btn-primary" : "")} onClick={() => run(() => kickOff(id))}>Kick off</button>
          {running
            ? <button disabled={busy} className="btn" onClick={() => run(() => pauseClock(id, clockSeconds(m)))}>Pause</button>
            : (m.status === "live" && <button disabled={busy} className="btn" onClick={() => run(() => resumeClock(id))}>Resume</button>)}
          <button disabled={busy} className={"btn" + (m.current_period === "ht" ? " btn-primary" : "")} onClick={() => run(() => halfTime(id, clockSeconds(m)))}>Half time</button>
          <button disabled={busy} className={"btn" + (m.current_period === "second" ? " btn-primary" : "")} onClick={() => run(() => secondHalf(id))}>Second half</button>
          <button disabled={busy} className="btn btn-danger" onClick={() => ask("End the match?", "Full time locks the score and events. You can reopen later with a reason.", () => run(() => fullTime(id, clockSeconds(m))))}>Full time</button>
          {m.status === "ft" && <button disabled={busy} className="btn" onClick={() => run(() => startExtraTime(id))}>Extra time</button>}
          <button disabled={busy} className="btn btn-ghost" onClick={() => ask("Reset this match?", "The clock, score and status return to not started. Events remain.", () => run(() => resetMatch(id)))}>Reset</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
          <label className="field" style={{ width: 150, marginBottom: 0 }}><span>Stoppage minutes</span><input type="number" min="0" value={stop} onChange={(e) => setStop(e.target.value)} /></label>
          <button disabled={busy} className="btn" onClick={applyStoppage}>Set stoppage</button>
        </div>
      </div>

      {locked ? (
        <div className="panel" style={{ borderColor: "rgba(239,68,68,.4)" }}>
          <div style={{ color: "var(--danger)", fontWeight: 800, marginBottom: 6 }}>Match locked, full time</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>Scoring is closed. Reopen only for a correction or extra time; the reason is recorded to the audit log.</div>
          <button className="btn btn-danger" onClick={doReopen}>Reopen match</button>
        </div>
      ) : (
        <div className="grid2">
          {[["home", home], ["away", away]].map(([side, team]) => (
            <div key={side} className="panel">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Badge t={team} size={26} /><span style={{ fontWeight: 700, fontSize: 15 }}>{team.name}</span></div>
              <button disabled={busy} className="btn btn-primary btn-lg" onClick={() => setPrompt({ kind: "goal", side })}>⚽ Goal</button>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button disabled={busy} className="btn" style={{ flex: 1, color: "var(--warning)" }} onClick={() => setPrompt({ kind: "card", side, cardType: "yellow" })}>Yellow</button>
                <button disabled={busy} className="btn" style={{ flex: 1, color: "var(--danger)" }} onClick={() => setPrompt({ kind: "card", side, cardType: "red" })}>Red</button>
                <button disabled={busy} className="btn" style={{ flex: 1 }} onClick={() => setPrompt({ kind: "sub", side })}>Sub</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* manual override */}
      <div className="panel">
        <div className="eyebrow">Manual score override</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field" style={{ width: 90, marginBottom: 0 }}><span>{home.short}</span><input type="number" min="0" value={ovH} onChange={(e) => setOvH(e.target.value)} placeholder={String(hs)} /></label>
          <label className="field" style={{ width: 90, marginBottom: 0 }}><span>{away.short}</span><input type="number" min="0" value={ovA} onChange={(e) => setOvA(e.target.value)} placeholder={String(as)} /></label>
          <button disabled={busy} className="btn btn-danger" onClick={() => ask("Force the score?", "This overrides the score shown everywhere, bypassing the goal events. Use only to fix a desync.", applyOverride)}>Force score</button>
          {manual && <button disabled={busy} className="btn btn-ghost" onClick={() => run(() => clearManualScore(id))}>Clear override</button>}
        </div>
        <p style={{ color: "var(--faint)", fontSize: 12, marginTop: 10, marginBottom: 0 }}>Emergency use. When set, the shown score and table use this value instead of the recorded goals.</p>
      </div>

      {/* details */}
      <div className="panel">
        <div className="eyebrow">Match details</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}><span>Referee</span><input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
          <label className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}><span>Stadium or park</span><input value={venue} onChange={(e) => setVenue(e.target.value)} /></label>
          <button disabled={busy} className="btn btn-primary" onClick={saveDetails}>Save details</button>
        </div>
      </div>

      {/* event log */}
      <div className="panel">
        <div className="eyebrow">Event log</div>
        {events.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14 }}>No events yet.</div>}
        {[...events].sort((a, b) => (a.minute || 0) - (b.minute || 0)).map((e) => {
          const emoji = e.type === "goal" ? "⚽" : e.type === "yellow" ? "🟨" : e.type === "red" ? "🟥" : "🔁";
          const team = teams[sideTeamId(e.side)] || {};
          return (
            <div key={e.id} className="row">
              <span className="scoreline" style={{ color: "var(--muted)", width: 34 }}>{e.minute}'</span>
              <span>{emoji}</span>
              <span style={{ flex: 1, fontSize: 14 }}>
                {e.type === "sub"
                  ? <><span style={{ color: "var(--accent)" }}>{e.player}</span> <span style={{ color: "var(--faint)" }}>for</span> <span style={{ color: "var(--danger)" }}>{e.assist}</span></>
                  : <>{e.player || <span style={{ color: "var(--faint)" }}>Unknown</span>}
                      {e.type === "goal" && e.score_home_after != null && <span className="scoreline" style={{ color: "var(--accent)" }}> {e.score_home_after}-{e.score_away_after}</span>}
                      {e.is_penalty && <span style={tag}>PEN</span>}{e.is_own_goal && <span style={tag}>OG</span>}</>}
                <span style={{ color: "var(--faint)" }}>  {team.short || e.side}</span>
              </span>
              {!locked && <><button className="btn btn-ghost btn-sm" style={{ color: "var(--muted)" }} onClick={() => setEditEv({ id: e.id, player: e.player || "", assist: e.assist || "", minute: e.minute })}>Edit</button>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--muted)" }} onClick={() => ask("Delete this event?", "It will be removed from the timeline and the score recalculated.", () => run(() => deleteEvent(e.id)))}>Delete</button></>}
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

      {editEv && <EditEvent ev={editEv} onCancel={() => setEditEv(null)} onSave={async (patch) => { await run(() => updateEvent(editEv.id, patch)); setEditEv(null); }} />}

      {confirm && (
        <div className="modalwrap" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{confirm.title}</div>
            <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 16 }}>{confirm.body}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirm(null)}>Cancel</button>
              <button className={"btn " + (confirm.danger ? "btn-danger" : "btn-primary")} style={{ flex: 1 }} onClick={() => { const y = confirm.onYes; setConfirm(null); y(); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalPrompt({ team, squad, curScore, onCancel, onCommit }) {
  const [pen, setPen] = useState(false); const [og, setOg] = useState(false);
  const commit = (player, playerId) => onCommit({ player, playerId, isPenalty: pen, isOwnGoal: og });
  return (
    <Modal onCancel={onCancel}>
      <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Goal, {team.name}</div>
      <div className="scoreline" style={{ textAlign: "center", fontSize: 34, margin: "4px 0 12px" }}>{curScore}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <button className={"btn btn-sm" + (pen ? " btn-primary" : "")} onClick={() => setPen(!pen)}>Penalty</button>
        <button className={"btn btn-sm" + (og ? " btn-primary" : "")} onClick={() => setOg(!og)}>Own goal</button>
      </div>
      <div className="eyebrow">Who scored?</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 260, overflowY: "auto" }}>
        {squad.map((p) => <button key={p.id} className="btn" onClick={() => commit(p.name, p.id)}>{p.number != null ? `${p.number} ` : ""}{p.name}</button>)}
      </div>
      {squad.length === 0 && <div style={{ color: "var(--faint)", fontSize: 13, margin: "6px 0" }}>No squad added for this team yet.</div>}
      <button className="btn" style={{ width: "100%", marginTop: 10, color: "var(--muted)" }} onClick={() => commit(null, null)}>Unknown scorer</button>
      <button className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={onCancel}>Cancel</button>
    </Modal>
  );
}
function PickPrompt({ title, team, squad, onCancel, onCommit }) {
  return (
    <Modal onCancel={onCancel}>
      <div style={{ textAlign: "center", fontWeight: 800, marginBottom: 12 }}>{title}, {team.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 280, overflowY: "auto" }}>
        {squad.map((p) => <button key={p.id} className="btn" onClick={() => onCommit(p.name, p.id)}>{p.number != null ? `${p.number} ` : ""}{p.name}</button>)}
      </div>
      {squad.length === 0 && <div style={{ color: "var(--faint)", fontSize: 13, margin: "6px 0" }}>No squad added yet.</div>}
      <button className="btn" style={{ width: "100%", marginTop: 10, color: "var(--muted)" }} onClick={() => onCommit(null, null)}>Unknown player</button>
      <button className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={onCancel}>Cancel</button>
    </Modal>
  );
}
function SubForm({ team, squad, onCancel, onCommit }) {
  const [on, setOn] = useState(""); const [off, setOff] = useState("");
  return (
    <Modal onCancel={onCancel}>
      <div style={{ fontWeight: 800, marginBottom: 12 }}>Substitution, {team.name}</div>
      <label className="field"><span>Player coming on</span><input list="son" value={on} onChange={(e) => setOn(e.target.value)} /></label>
      <label className="field"><span>Player going off</span><input list="soff" value={off} onChange={(e) => setOff(e.target.value)} /></label>
      <datalist id="son">{squad.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <datalist id="soff">{squad.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => on.trim() && off.trim() && onCommit(on.trim(), off.trim())}>Add</button>
      </div>
    </Modal>
  );
}
function EditEvent({ ev, onCancel, onSave }) {
  const [player, setPlayer] = useState(ev.player); const [assist, setAssist] = useState(ev.assist); const [minute, setMinute] = useState(ev.minute);
  return (
    <Modal onCancel={onCancel}>
      <div style={{ fontWeight: 800, marginBottom: 12 }}>Edit event</div>
      <label className="field"><span>Player</span><input value={player} onChange={(e) => setPlayer(e.target.value)} /></label>
      <label className="field"><span>Assist or player off</span><input value={assist} onChange={(e) => setAssist(e.target.value)} /></label>
      <label className="field"><span>Minute</span><input type="number" value={minute} onChange={(e) => setMinute(e.target.value)} /></label>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onSave({ player: player.trim() || null, assist: assist.trim() || null, minute: Number(minute) || 0 })}>Save</button>
      </div>
    </Modal>
  );
}
function Modal({ children, onCancel }) { return <div className="modalwrap" onClick={onCancel}><div className="modal" onClick={(e) => e.stopPropagation()}>{children}</div></div>; }
function Badge({ t, size = 44 }) { return <span style={{ width: size, height: size, borderRadius: "50%", background: t.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.34 }}>{t.short}</span>; }
const tag = { marginLeft: 6, fontSize: 10, fontWeight: 800, color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 4px" };
