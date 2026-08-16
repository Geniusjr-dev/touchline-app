"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getMatchRaw, getEvents, listTeams, listPlayers,
  transitionMatchStatus, reopenMatch, setMatchStoppageTime, recordMatchEvent, deleteMatchEvent,
  formatMatchClock, liveMinute, getMatchStats, upsertMatchStats, STAT_DEFS,
} from "@/lib/db";

const PERIOD = { 0: "Not started", 1: "First half", 2: "Second half", 3: "Extra time first half", 4: "Extra time second half" };
const STATUS_LABEL = { scheduled: "Not started", live: "Live", ht: "Half time", et_live: "Extra time", et_ht: "Extra-time break", ft: "Full time" };

export default function Scorer() {
  const { id } = useParams();
  const [m, setM] = useState(null);
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState({});
  const [squads, setSquads] = useState({});
  const [prompt, setPrompt] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [stopMin, setStopMin] = useState("");
  const [, setTick] = useState(0);

  const load = async () => {
    const mm = await getMatchRaw(id);
    const [ev, ts] = await Promise.all([getEvents(id), listTeams(mm?.organization_id)]);
    setM(mm); setEvents(ev);
    const map = {}; ts.forEach((t) => (map[t.id] = t)); setTeams(map);
    if (mm) { const [hp, ap] = await Promise.all([listPlayers(mm.home_id), listPlayers(mm.away_id)]); setSquads({ [mm.home_id]: hp, [mm.away_id]: ap }); }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(i); }, []);

  if (!m) return <div style={{ color: "#8E939B" }}>Loading.</div>;
  const home = teams[m.home_id] || { name: "Home", short: "H", color: "#18A558" };
  const away = teams[m.away_id] || { name: "Away", short: "A", color: "#2563EB" };
  const hs = m.home_score || 0, as = m.away_score || 0;
  const locked = m.status === "ft" && !!m.locked_at;
  const running = m.status === "live" || m.status === "et_live";
  const sideTeamId = (side) => (side === "home" ? m.home_id : m.away_id);

  async function callRpc(promise) {
    setBusy(true); setErr("");
    const { error } = await promise;
    if (error) setErr(error.message || "That action was not allowed.");
    await load(); setBusy(false);
    return !error;
  }
  const go = (status) => callRpc(transitionMatchStatus(id, status));
  async function doReopen() {
    const reason = window.prompt("Reason for reopening this match? (at least 5 characters)");
    if (!reason) return;
    await callRpc(reopenMatch(id, reason));
  }
  async function applyStoppage() { await callRpc(setMatchStoppageTime(id, Number(stopMin) || 0)); }
  async function commit(ev) { const ok = await callRpc(recordMatchEvent(id, ev)); if (ok) setPrompt(null); }
  function askDelete(eventId) { setConfirm({ body: "Delete this event? The score will be recalculated.", onYes: () => callRpc(deleteMatchEvent(eventId)) }); }

  const clock = (m.status === "scheduled") ? "" : formatMatchClock(m);
  const periodLabel = STATUS_LABEL[m.status] || m.status;

  return (
    <div>
      <Link href="/admin/matches" style={{ color: "#8E939B", fontSize: 13 }}>All matches</Link>

      <div style={{ ...card, textAlign: "center", marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <Badge t={home} />
          <div style={{ fontSize: 42, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{hs} <span style={{ color: "#5B6069" }}>-</span> {as}</div>
          <Badge t={away} />
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {running && <span style={{ width: 7, height: 7, borderRadius: 999, background: "#F04444" }} />}
          <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: running ? "#F04444" : "#8E939B" }}>{clock}</span>
          <span style={{ color: "#8E939B", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{periodLabel}</span>
        </div>
      </div>

      {err && <div style={{ color: "#F04444", background: "#301719", borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 14 }}>{err}</div>}

      <div style={card}>
        <div style={label}>MATCH CLOCK</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={busy} style={pill(m.status === "live")} onClick={() => go("live")}>{m.status === "scheduled" ? "Kick off" : "Live / Second half"}</button>
          <button disabled={busy} style={pill(m.status === "ht")} onClick={() => go("ht")}>Half time</button>
          <button disabled={busy} style={pill(false, "#EF4444")} onClick={() => setConfirm({ body: "End the match at full time? This locks the score.", onYes: () => go("ft") })}>Full time</button>
          <button disabled={busy} style={pill(m.status === "et_live")} onClick={() => go("et_live")}>Extra time</button>
          <button disabled={busy} style={pill(m.status === "et_ht")} onClick={() => go("et_ht")}>ET break</button>
          <button disabled={busy} style={pill(false)} onClick={() => setConfirm({ body: "Reset this match to not started? Only possible before any events.", onYes: () => go("scheduled") })}>Reset</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "end", marginTop: 14, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ color: "#8E939B", fontSize: 12, fontWeight: 600 }}>Stoppage minutes (this half)</span>
            <input type="number" min="0" value={stopMin} onChange={(e) => setStopMin(e.target.value)} style={{ ...finp, width: 150 }} /></label>
          <button disabled={busy} style={pill(false)} onClick={applyStoppage}>Set stoppage</button>
        </div>
      </div>

      {locked ? (
        <div style={{ ...card, borderColor: "#5a2323" }}>
          <div style={{ color: "#F04444", fontWeight: 800, marginBottom: 6 }}>Match locked, full time</div>
          <div style={{ color: "#8E939B", fontSize: 13, marginBottom: 12 }}>Scoring is closed. Only an administrator can reopen it, and the reason is recorded.</div>
          <button disabled={busy} style={pill(false, "#EF4444")} onClick={doReopen}>Reopen match</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          {[["home", home], ["away", away]].map(([side, team]) => (
            <div key={side} style={{ ...card, marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Badge t={team} size={24} /><span style={{ fontWeight: 700, fontSize: 14 }}>{team.display_name || team.name}</span></div>
              <button disabled={busy} style={{ width: "100%", padding: 16, borderRadius: 10, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, fontSize: 17, cursor: "pointer", marginBottom: 8 }} onClick={() => setPrompt({ kind: "goal", side })}>Goal</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={busy} style={{ ...ebtn, color: "#F5C518" }} onClick={() => setPrompt({ kind: "card", side, cardType: "yellow" })}>Yellow</button>
                <button disabled={busy} style={{ ...ebtn, color: "#F04444" }} onClick={() => setPrompt({ kind: "card", side, cardType: "red" })}>Red</button>
                <button disabled={busy} style={ebtn} onClick={() => setPrompt({ kind: "sub", side })}>Sub</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <StatsEditor matchId={id} home={home} away={away} />

      <div style={card}>
        <div style={label}>EVENT LOG</div>
        {events.length === 0 && <div style={{ color: "#8E939B", fontSize: 14, padding: "8px 0" }}>No events yet.</div>}
        {events.map((e) => {
          const emoji = e.type === "goal" ? "⚽" : e.type === "yellow" ? "🟨" : e.type === "red" ? "🟥" : "🔁";
          const team = teams[sideTeamId(e.side)] || {};
          return (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid #26282B" }}>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "#8E939B", width: 42, fontSize: 13 }}>{e.display_minute ?? e.minute}'</span>
              <span>{emoji}</span>
              <span style={{ flex: 1, fontSize: 14 }}>
                {e.type === "sub"
                  ? <><span style={{ color: "#3FC463" }}>{e.player}</span> <span style={{ color: "#5B6069" }}>for</span> <span style={{ color: "#F04444" }}>{e.assist}</span></>
                  : <>{e.player || <span style={{ color: "#5B6069" }}>Unknown</span>}
                      {e.type === "goal" && e.home_score_after != null && <span style={{ color: "#4FC263", fontVariantNumeric: "tabular-nums" }}> {e.home_score_after}-{e.away_score_after}</span>}</>}
                <span style={{ color: "#5B6069" }}> · {team.short || e.side}</span>
              </span>
              {!locked && <button onClick={() => askDelete(e.id)} style={{ background: "none", border: "none", color: "#8E939B", cursor: "pointer", fontSize: 12 }}>Delete</button>}
            </div>
          );
        })}
      </div>

      {prompt?.kind === "goal" && <PickPrompt title={`Goal, ${(prompt.side === "home" ? home : away).display_name || (prompt.side === "home" ? home : away).name}`} squad={squads[sideTeamId(prompt.side)] || []} requirePlayer
        onCancel={() => setPrompt(null)} onPick={(player, playerId) => commit({ type: "goal", side: prompt.side, player, player_id: playerId })} />}
      {prompt?.kind === "card" && <PickPrompt title={`${prompt.cardType === "yellow" ? "Yellow" : "Red"} card`} squad={squads[sideTeamId(prompt.side)] || []}
        onCancel={() => setPrompt(null)} onPick={(player, playerId) => commit({ type: prompt.cardType, side: prompt.side, player, player_id: playerId })} />}
      {prompt?.kind === "sub" && <SubForm squad={squads[sideTeamId(prompt.side)] || []} onCancel={() => setPrompt(null)}
        onCommit={(on, off) => commit({ type: "sub", side: prompt.side, player: on, assist: off })} />}

      {confirm && (
        <div style={modalWrap} onClick={() => setConfirm(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ color: "#8E939B", fontSize: 14, marginBottom: 16 }}>{confirm.body}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ flex: 1, padding: 11, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff", cursor: "pointer" }} onClick={() => setConfirm(null)}>Cancel</button>
              <button style={{ flex: 1, padding: 11, borderRadius: 9, border: "none", background: "#EF4444", color: "#fff", fontWeight: 800, cursor: "pointer" }} onClick={() => { const y = confirm.onYes; setConfirm(null); y(); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PickPrompt({ title, squad, requirePlayer, onCancel, onPick }) {
  return (
    <div style={modalWrap} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, marginBottom: 12, textAlign: "center" }}>{title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 280, overflowY: "auto" }}>
          {squad.map((p) => <button key={p.id} style={ebtn} onClick={() => onPick(p.name, p.id)}>{p.number != null ? `${p.number} ` : ""}{p.name}</button>)}
        </div>
        {squad.length === 0 && <div style={{ color: "#5B6069", fontSize: 13, margin: "6px 0" }}>No squad added for this team yet.</div>}
        <button style={{ ...ebtn, width: "100%", marginTop: 10, color: "#8E939B" }} onClick={() => onPick(requirePlayer ? "Unknown" : null, null)}>{requirePlayer ? "Unknown scorer" : "No player / unknown"}</button>
        <button style={{ ...ebtn, width: "100%", marginTop: 8, background: "transparent" }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
function SubForm({ squad, onCancel, onCommit }) {
  const [on, setOn] = useState(""); const [off, setOff] = useState("");
  return (
    <div style={modalWrap} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Substitution</div>
        <label style={flabel}>Player coming on</label>
        <input list="son" value={on} onChange={(e) => setOn(e.target.value)} style={finp} />
        <label style={flabel}>Player going off</label>
        <input list="soff" value={off} onChange={(e) => setOff(e.target.value)} style={finp} />
        <datalist id="son">{squad.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <datalist id="soff">{squad.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button style={{ flex: 1, padding: 11, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff", cursor: "pointer" }} onClick={onCancel}>Cancel</button>
          <button style={{ flex: 1, padding: 11, borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" }} onClick={() => on.trim() && off.trim() && onCommit(on.trim(), off.trim())}>Add</button>
        </div>
      </div>
    </div>
  );
}
function StatsEditor({ matchId, home, away }) {
  const [values, setValues] = useState({ home: {}, away: {} });
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { getMatchStats(matchId).then((r) => { if (r) setValues({ home: r.home || {}, away: r.away || {} }); }).catch(() => {}); }, [matchId]);
  function set(side, key, v) { setValues((cur) => ({ ...cur, [side]: { ...cur[side], [key]: v === "" ? undefined : Number(v) } })); }
  async function save() {
    setBusy(true); setSaved("");
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && !Number.isNaN(v)));
    const { error } = await upsertMatchStats(matchId, clean(values.home), clean(values.away));
    setBusy(false); setSaved(error ? error.message : "Saved. It updates live on the public page.");
  }
  return (
    <div style={card}>
      <div style={label}>MATCH STATISTICS</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#8E939B", fontSize: 12 }}>
        <span style={{ width: 64, textAlign: "center", fontWeight: 700, color: "#fff" }}>{home.short}</span>
        <span style={{ flex: 1 }} />
        <span style={{ width: 64, textAlign: "center", fontWeight: 700, color: "#fff" }}>{away.short}</span>
      </div>
      {STAT_DEFS.map((d) => (
        <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
          <input type="number" value={values.home[d.key] ?? ""} onChange={(e) => set("home", d.key, e.target.value)} style={{ ...finp, width: 64, textAlign: "center", fontVariantNumeric: "tabular-nums" }} />
          <span style={{ flex: 1, textAlign: "center", fontSize: 13, color: "#8E939B" }}>{d.label}{d.pct ? " (%)" : ""}</span>
          <input type="number" value={values.away[d.key] ?? ""} onChange={(e) => set("away", d.key, e.target.value)} style={{ ...finp, width: 64, textAlign: "center", fontVariantNumeric: "tabular-nums" }} />
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
        <button disabled={busy} style={pill(false)} onClick={save}>{busy ? "Saving." : "Save stats"}</button>
        {saved && <span style={{ color: /Saved/.test(saved) ? "#4FC263" : "#F04444", fontSize: 12 }}>{saved}</span>}
      </div>
    </div>
  );
}

function Badge({ t, size = 44 }) { return <span style={{ width: size, height: size, borderRadius: "50%", background: t.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.34 }}>{t.short}</span>; }
const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16, marginBottom: 14 };
const label = { color: "#8E939B", fontSize: 12, fontWeight: 700, marginBottom: 10 };
const pill = (on, danger) => ({ padding: "8px 14px", borderRadius: 9, border: "1px solid #2A2C30", background: on ? "#4FC263" : "#0E0F11", color: on ? "#062" : (danger || "#fff"), fontSize: 13, fontWeight: 700, cursor: "pointer" });
const ebtn = { flex: 1, padding: 10, borderRadius: 8, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const flabel = { display: "block", color: "#8E939B", fontSize: 12, fontWeight: 600, margin: "8px 0 4px" };
const finp = { width: "100%", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none" };
const modalWrap = { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 };
const modal = { background: "#161719", borderRadius: 14, padding: 18, width: "100%", maxWidth: 360, border: "1px solid #26282B" };
