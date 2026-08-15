"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import {
  deleteMatchEvent,
  formatMatchClock,
  getEvents,
  getMatchRaw,
  listPlayers,
  listTeams,
  recordMatchEvent,
  reopenMatch,
  transitionMatchStatus,
} from "@/lib/db";

export default function Scorer() {
  const { id } = useParams();
  const { role } = useAuth();
  const [m, setM] = useState(null);
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState({});
  const [squads, setSquads] = useState({});
  const [busy, setBusy] = useState(false);
  const [subFor, setSubFor] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const mm = await getMatchRaw(id);
      const [ev, ts] = await Promise.all([getEvents(id), listTeams(mm.organization_id)]);
      setM(mm);
      setEvents(ev);
      const map = {};
      ts.forEach((team) => { map[team.id] = team; });
      setTeams(map);
      const [homePlayers, awayPlayers] = await Promise.all([listPlayers(mm.home_id), listPlayers(mm.away_id)]);
      setSquads({ [mm.home_id]: homePlayers, [mm.away_id]: awayPlayers });
    } catch (loadError) {
      setError(loadError.message || "Could not load this match.");
    }
  }, [id]);

  useEffect(() => {
    load();
    const firstTick = window.setTimeout(() => setNow(Date.now()), 0);
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    let channel;
    if (supabase) {
      channel = supabase.channel(`scorer-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `match_id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${id}` }, load)
        .subscribe();
    }
    return () => {
      window.clearInterval(ticker);
      window.clearTimeout(firstTick);
      if (channel) supabase.removeChannel(channel);
    };
  }, [id, load]);

  if (!m) return <div style={{ color: error ? "#F04444" : "#8E939B" }}>{error || "Loading…"}</div>;
  const home = teams[m.home_id] || { name: "Home", short: "H", color: "#18A558" };
  const away = teams[m.away_id] || { name: "Away", short: "A", color: "#2563EB" };
  const storedHome = m.home_score ?? events.filter((e) => e.type === "goal" && e.side === "home").length;
  const storedAway = m.away_score ?? events.filter((e) => e.type === "goal" && e.side === "away").length;
  const displayedHome = storedHome + (pending?.type === "goal" && pending.side === "home" ? 1 : 0);
  const displayedAway = storedAway + (pending?.type === "goal" && pending.side === "away" ? 1 : 0);
  const sideTeamId = (side) => (side === "home" ? m.home_id : m.away_id);
  const fullTimeLocked = m.status === "ft" && Boolean(m.locked_at);
  const canRecord = ["live", "et_live"].includes(m.status) || (m.status === "ft" && !m.locked_at);
  const canCorrect = m.status !== "scheduled" && !fullTimeLocked;

  async function run(operation, closePending = false) {
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      if (closePending) setPending(null);
      await load();
      return true;
    } catch (operationError) {
      setError(operationError.message || "The action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function beginEvent(type, side) {
    if (!canRecord || busy) return;
    setError("");
    setPending({ type, side });
  }

  async function commitPending(player) {
    if (!pending) return;
    const event = {
      type: pending.type,
      side: pending.side,
      player_id: player?.id || null,
      player: player?.name || (pending.type === "goal" ? "Unknown scorer" : "Unknown player"),
    };
    await run(() => recordMatchEvent(id, event), true);
  }

  async function undoLast(type, side) {
    const latest = events
      .filter((event) => event.type === type && event.side === side)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (latest) await run(() => deleteMatchEvent(latest.id));
  }

  async function changeStatus(status) {
    await run(() => transitionMatchStatus(id, status));
  }

  async function deliberatelyReopen() {
    const reason = window.prompt("Why are you reopening this full-time match? This is stored in the audit log.");
    if (reason === null) return;
    await run(() => reopenMatch(id, reason));
  }

  async function removeEvent(eventId) {
    await run(() => deleteMatchEvent(eventId));
  }

  async function saveSub(side, on, off) {
    const saved = await run(() => recordMatchEvent(id, { type: "sub", side, player: on, assist: off }));
    if (saved) setSubFor(null);
  }

  const actions = statusActions(m.status, fullTimeLocked);

  return (
    <div>
      <Link href="/admin/matches" style={{ color: "#8E939B", fontSize: 13 }}>← All matches</Link>

      <div style={{ ...card, textAlign: "center", margin: "12px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <Badge t={home} />
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{displayedHome} <span style={{ color: "#5B6069" }}>-</span> {displayedAway}</div>
          <Badge t={away} />
        </div>
        <div style={{ marginTop: 8, color: ["live", "et_live"].includes(m.status) ? "#F04444" : "#8E939B", fontSize: 13, fontWeight: 700 }}>
          {clockStatus(m, now)}
        </div>
        {pending?.type === "goal" && <div style={{ color: "#4FC263", fontSize: 12, marginTop: 5 }}>Score pending scorer confirmation</div>}
      </div>

      {error && <div role="alert" style={{ color: "#F7B4B4", background: "#301719", border: "1px solid #5A2428", borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={card}>
        <div style={label}>MATCH STATUS</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions.map((action) => (
            <button key={action.status} disabled={busy} onClick={() => changeStatus(action.status)}
              style={{ ...pill, background: action.primary ? "#4FC263" : "#0E0F11", color: action.primary ? "#062" : "#fff" }}>{action.label}</button>
          ))}
          {role === "admin" && fullTimeLocked && (
            <button disabled={busy} onClick={deliberatelyReopen} style={{ ...pill, background: "#2B2110", color: "#F5C518" }}>Reopen for correction</button>
          )}
        </div>
        {fullTimeLocked && <div style={{ color: "#8E939B", fontSize: 12, marginTop: 10 }}>Full-time lock is active. Events cannot be added, changed or deleted.</div>}
        {m.status === "ft" && !m.locked_at && <div style={{ color: "#F5C518", fontSize: 12, marginTop: 10 }}>This result is deliberately reopened. Make the correction, then lock full time again.</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 14 }}>
        {[["home", home], ["away", away]].map(([side, team]) => (
          <div key={side} style={{ ...card, marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Badge t={team} size={24} /><span style={{ fontWeight: 700, fontSize: 14 }}>{team.name}</span>
            </div>
            <button disabled={busy || !canRecord} onClick={() => beginEvent("goal", side)}
              style={{ ...goalButton, opacity: canRecord ? 1 : 0.45 }}>
              ⚽ + GOAL
            </button>
            <button disabled={busy || !canCorrect} onClick={() => undoLast("goal", side)}
              style={{ ...undoButton, opacity: canCorrect ? 1 : 0.45 }}>
              Undo last goal
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy || !canRecord} onClick={() => beginEvent("yellow", side)} style={{ ...half, background: "#3a3410", color: "#F5C518", opacity: canRecord ? 1 : 0.45 }}>+ Yellow</button>
              <button disabled={busy || !canRecord} onClick={() => beginEvent("red", side)} style={{ ...half, background: "#3a1616", color: "#F04444", opacity: canRecord ? 1 : 0.45 }}>+ Red</button>
            </div>
            <button disabled={busy || !canRecord} onClick={() => setSubFor(side)} style={{ ...half, width: "100%", marginTop: 8, background: "#0E0F11", color: "#fff", opacity: canRecord ? 1 : 0.45 }}>Substitution</button>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={label}>EVENT LOG</div>
        {events.length === 0 && <div style={{ color: "#8E939B", fontSize: 14, padding: "8px 0" }}>No events yet.</div>}
        {[...events].sort(eventOrder).map((event) => (
          <EventRow key={event.id} event={event} locked={!canCorrect} onRemove={removeEvent} />
        ))}
      </div>

      {pending && (
        <AttributionModal
          pending={pending}
          team={pending.side === "home" ? home : away}
          squad={squads[sideTeamId(pending.side)] || []}
          busy={busy}
          onCancel={() => !busy && setPending(null)}
          onChoose={commitPending}
        />
      )}
      {subFor && <SubForm side={subFor} team={subFor === "home" ? home : away} squad={squads[sideTeamId(subFor)] || []} busy={busy} onCancel={() => !busy && setSubFor(null)} onSave={saveSub} />}
    </div>
  );
}

function statusActions(status, locked) {
  if (status === "scheduled") return [{ status: "live", label: "Kick off", primary: true }];
  if (status === "live") return [{ status: "ht", label: "Half time" }, { status: "ft", label: "Full time", primary: true }];
  if (status === "ht") return [{ status: "live", label: "Start second half", primary: true }, { status: "ft", label: "End match" }];
  if (status === "et_live") return [{ status: "et_ht", label: "Extra-time break" }, { status: "ft", label: "Full time", primary: true }];
  if (status === "et_ht") return [{ status: "et_live", label: "Resume extra time", primary: true }, { status: "ft", label: "End match" }];
  if (status === "ft" && !locked) return [{ status: "ft", label: "Lock full time", primary: true }];
  return [{ status: "et_live", label: "Start extra time" }];
}

function clockStatus(match, now) {
  if (match.status === "live") return `LIVE ${formatMatchClock(match, now)}`;
  if (match.status === "et_live") return `EXTRA TIME ${formatMatchClock(match, now)}`;
  if (match.status === "ht") return `HALF TIME · ${formatMatchClock(match, now)}`;
  if (match.status === "et_ht") return `EXTRA-TIME BREAK · ${formatMatchClock(match, now)}`;
  if (match.status === "ft" && !match.locked_at) return "FULL TIME · REOPENED";
  if (match.status === "ft") return "FULL TIME · LOCKED";
  return "SCHEDULED";
}

function eventOrder(a, b) {
  const aSeconds = a.elapsed_seconds ?? (a.minute == null ? 0 : a.minute * 60);
  const bSeconds = b.elapsed_seconds ?? (b.minute == null ? 0 : b.minute * 60);
  return aSeconds - bSeconds
    || new Date(a.created_at) - new Date(b.created_at);
}

function EventRow({ event, locked, onRemove }) {
  const emoji = event.type === "goal" ? "⚽" : event.type === "yellow" ? "🟨" : event.type === "red" ? "🟥" : event.type === "miss" ? "❌" : "🔁";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid #26282B" }}>
      <span style={{ fontFamily: "monospace", color: "#8E939B", width: 34, fontSize: 13 }}>{event.display_minute ?? event.minute ?? 1}′</span>
      <span style={{ fontSize: 14 }}>{emoji}</span>
      {event.type === "sub" ? (
        <span style={{ flex: 1, fontSize: 14 }}><span style={{ color: "#3FC463" }}>{event.player}</span> <span style={{ color: "#5B6069" }}>for</span> <span style={{ color: "#F04444" }}>{event.assist}</span></span>
      ) : (
        <span style={{ flex: 1, fontSize: 14, color: "#fff" }}>{event.player || (event.type === "goal" ? "Unknown scorer" : "Unknown player")}</span>
      )}
      <span style={{ color: "#5B6069", fontSize: 12, width: 42 }}>{event.side}</span>
      <button disabled={locked} onClick={() => onRemove(event.id)} style={{ background: "none", border: "none", color: locked ? "#474A50" : "#8E939B", cursor: locked ? "not-allowed" : "pointer", fontSize: 12 }}>Delete</button>
    </div>
  );
}

function AttributionModal({ pending, team, squad, busy, onCancel, onChoose }) {
  const [query, setQuery] = useState("");
  const filtered = squad.filter((player) => player.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12);
  const title = pending.type === "goal" ? "Who scored?" : pending.type === "yellow" ? "Who received the yellow card?" : "Who received the red card?";
  return (
    <div style={overlay} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ background: "#161719", border: "1px solid #2A2C30", borderRadius: 16, padding: 18, width: "100%", maxWidth: 380, maxHeight: "82vh", overflow: "auto" }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}><Badge t={team} size={30} /><strong>{title}</strong></div>
        <div style={{ color: "#8E939B", fontSize: 12, marginBottom: 12 }}>{pending.type === "goal" ? "The score is shown immediately and saved only after this confirmation." : "Choose a squad player or use the unknown option."}</div>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search squad" style={{ ...finp, marginBottom: 8 }} />
        <div style={{ display: "grid", gap: 7 }}>
          {filtered.map((player) => (
            <button key={player.id} disabled={busy} onClick={() => onChoose(player)} style={playerButton}>
              <span style={{ color: "#8E939B", width: 28 }}>{player.number ?? "–"}</span><span>{player.name}</span>
            </button>
          ))}
          {squad.length === 0 && <div style={{ color: "#8E939B", fontSize: 13, padding: "8px 0" }}>No players are registered for this squad.</div>}
        </div>
        <button disabled={busy} onClick={() => onChoose(null)} style={{ ...playerButton, width: "100%", marginTop: 10, color: "#F5C518" }}>{pending.type === "goal" ? "Use Unknown scorer" : "Use Unknown player"}</button>
        <button disabled={busy} onClick={onCancel} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff", cursor: "pointer" }}>Cancel and roll back</button>
      </div>
    </div>
  );
}

function SubForm({ side, team, squad, busy, onCancel, onSave }) {
  const [on, setOn] = useState("");
  const [off, setOff] = useState("");
  return (
    <div style={overlay} onClick={onCancel}>
      <div role="dialog" aria-modal="true" style={{ background: "#161719", borderRadius: 14, padding: 18, width: "100%", maxWidth: 340 }} onClick={(event) => event.stopPropagation()}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Substitution · {team.name}</div>
        <label style={flabel}>Player coming ON</label>
        <input list="sub-on" value={on} onChange={(event) => setOn(event.target.value)} style={finp} />
        <label style={flabel}>Player going OFF</label>
        <input list="sub-off" value={off} onChange={(event) => setOff(event.target.value)} style={finp} />
        <datalist id="sub-on">{squad.map((player) => <option key={player.id} value={player.name} />)}</datalist>
        <datalist id="sub-off">{squad.map((player) => <option key={player.id} value={player.name} />)}</datalist>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button disabled={busy} onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff", cursor: "pointer" }}>Cancel</button>
          <button disabled={busy || !on.trim() || !off.trim()} onClick={() => onSave(side, on.trim(), off.trim())} style={{ flex: 1, padding: 11, borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" }}>Add</button>
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
const goalButton = { width: "100%", padding: 16, borderRadius: 10, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, fontSize: 18, cursor: "pointer", marginBottom: 8 };
const undoButton = { width: "100%", padding: 8, borderRadius: 8, border: "1px solid #2A2C30", background: "transparent", color: "#8E939B", fontSize: 12, cursor: "pointer", marginBottom: 10 };
const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 };
const flabel = { display: "block", color: "#8E939B", fontSize: 12, fontWeight: 600, margin: "8px 0 4px" };
const finp = { width: "100%", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none" };
const playerButton = { display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "10px 11px", borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", cursor: "pointer", fontSize: 14 };
