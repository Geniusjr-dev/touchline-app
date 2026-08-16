"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listTeams, listCompetitions, listMatches, addCompetition, createMatch, updateMatch, deleteMatch } from "@/lib/db";

export default function Matches() {
  const [teams, setTeams] = useState([]);
  const [comps, setComps] = useState([]);
  const [matches, setMatches] = useState([]);
  const [home, setHome] = useState(""); const [away, setAway] = useState("");
  const [comp, setComp] = useState(""); const [kickoff, setKickoff] = useState("");
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  // competition builder
  const [cName, setCName] = useState(""); const [cFormat, setCFormat] = useState("league");
  const [cSub, setCSub] = useState(""); const [cTeams, setCTeams] = useState(""); const [cGroups, setCGroups] = useState("");

  const load = () => {
    listTeams().then(setTeams).catch(() => {});
    listCompetitions().then(setComps).catch(() => {});
    listMatches().then(setMatches).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function addComp(e) {
    e.preventDefault(); setErr("");
    if (!cName.trim()) return;
    const numTeams = cFormat === "friendly" ? null : (cTeams ? Number(cTeams) : null);
    const numGroups = cFormat === "tournament" ? (cGroups ? Number(cGroups) : null) : null;
    const { error } = await addCompetition(cName.trim(), cSub.trim() || null, cFormat, numTeams, numGroups);
    if (error) return setErr(error.message);
    setCName(""); setCSub(""); setCTeams(""); setCGroups(""); listCompetitions().then(setComps);
  }
  async function make(e) {
    e.preventDefault(); setErr("");
    if (!home || !away || home === away) return setErr("Pick two different teams.");
    const { error } = await createMatch(comp || null, home, away, kickoff.trim() || null);
    if (error) return setErr(error.message);
    setHome(""); setAway(""); setKickoff(""); load();
  }
  async function saveEdit() {
    const { id, ...patch } = edit;
    await updateMatch(id, { competition_id: patch.competition_id || null, home_id: patch.home_id, away_id: patch.away_id, kickoff: patch.kickoff || null });
    setEdit(null); load();
  }
  async function doDelete(id) { await deleteMatch(id); setConfirmDel(null); load(); }

  const nm = (id) => teams.find((t) => t.id === id)?.display_name || teams.find((t) => t.id === id)?.name || "TBD";
  const statusChip = (s) => {
    const map = { live: ["LIVE", "rgba(34,197,94,.15)", "var(--accent)"], ft: ["FT", "rgba(138,146,158,.15)", "var(--muted)"], ht: ["HT", "rgba(245,158,11,.15)", "var(--warning)"], scheduled: ["SCHED", "rgba(59,130,246,.15)", "#60A5FA"] };
    const [txt, bg, col] = map[s] || map.scheduled;
    return <span className="chip" style={{ background: bg, color: col }}>{txt}</span>;
  };

  return (
    <div>
      <h1>Matches and competitions</h1>
      <p className="sub">Build a league or tournament, schedule fixtures, and manage every game.</p>

      <div className="grid2">
        {/* New match */}
        <form onSubmit={make} className="panel">
          <div className="eyebrow">New match</div>
          <label className="field"><span>Competition</span>
            <select value={comp} onChange={(e) => setComp(e.target.value)}>
              <option value="">None (friendly one-off)</option>
              {comps.map((c) => <option key={c.id} value={c.id}>{c.name}{c.sub ? `, ${c.sub}` : ""} ({c.format})</option>)}
            </select>
          </label>
          <label className="field"><span>Home team</span>
            <select value={home} onChange={(e) => setHome(e.target.value)}>
              <option value="">Pick a team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Away team</span>
            <select value={away} onChange={(e) => setAway(e.target.value)}>
              <option value="">Pick a team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Kick-off label (e.g. 16:00)</span><input value={kickoff} onChange={(e) => setKickoff(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary">Create match</button>
          {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{err}</div>}
        </form>

        {/* New competition builder */}
        <form onSubmit={addComp} className="panel">
          <div className="eyebrow">New competition</div>
          <label className="field"><span>Name</span><input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Ijon Memorial Championship" /></label>
          <label className="field"><span>Format</span>
            <select value={cFormat} onChange={(e) => setCFormat(e.target.value)}>
              <option value="friendly">Friendly (no table)</option>
              <option value="league">League (one full table)</option>
              <option value="tournament">Tournament (groups)</option>
            </select>
          </label>
          {cFormat === "league" && (
            <label className="field"><span>Number of teams</span><input type="number" min="2" value={cTeams} onChange={(e) => setCTeams(e.target.value)} placeholder="e.g. 16" /></label>
          )}
          {cFormat === "tournament" && (
            <>
              <label className="field"><span>Group label (create one competition per group)</span><input value={cSub} onChange={(e) => setCSub(e.target.value)} placeholder="Group A" /></label>
              <div className="grid2" style={{ gap: 12 }}>
                <label className="field"><span>Teams in this group</span><input type="number" min="2" value={cTeams} onChange={(e) => setCTeams(e.target.value)} placeholder="e.g. 4" /></label>
                <label className="field"><span>Total groups</span><input type="number" min="1" value={cGroups} onChange={(e) => setCGroups(e.target.value)} placeholder="e.g. 4" /></label>
              </div>
            </>
          )}
          <button type="submit" className="btn btn-primary">Add competition</button>
          <p style={{ color: "var(--faint)", fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            {cFormat === "friendly" ? "Friendlies show no table." : cFormat === "league" ? "League shows one table of all teams." : "Each group is its own competition entry with its own table."}
          </p>
        </form>
      </div>

      {/* All matches */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="eyebrow">All matches</div>
        {matches.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14 }}>No matches yet.</div>}
        {matches.map((m) => (
          <div key={m.id} className="row" style={{ borderTop: "1px solid var(--border)" }}>
            {statusChip(m.status)}
            <span style={{ flex: 1, fontSize: 14.5 }}>{m.home?.name || nm(m.home_id)} <span style={{ color: "var(--faint)" }}>v</span> {m.away?.name || nm(m.away_id)}</span>
            <Link href={`/admin/match/${m.id}`} className="btn btn-primary btn-sm">Score</Link>
            <button className="btn btn-sm" onClick={() => setEdit({ id: m.id, competition_id: m.competition_id || "", home_id: m.home_id, away_id: m.away_id, kickoff: m.kickoff || "" })}>Edit</button>
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(m)}>Delete</button>
          </div>
        ))}
      </div>

      {/* edit modal */}
      {edit && (
        <div className="modalwrap" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Edit match</div>
            <label className="field"><span>Competition</span>
              <select value={edit.competition_id} onChange={(e) => setEdit({ ...edit, competition_id: e.target.value })}>
                <option value="">None</option>
                {comps.map((c) => <option key={c.id} value={c.id}>{c.name}{c.sub ? `, ${c.sub}` : ""}</option>)}
              </select>
            </label>
            <label className="field"><span>Home team</span>
              <select value={edit.home_id} onChange={(e) => setEdit({ ...edit, home_id: e.target.value })}>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Away team</span>
              <select value={edit.away_id} onChange={(e) => setEdit({ ...edit, away_id: e.target.value })}>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Kick-off label</span><input value={edit.kickoff} onChange={(e) => setEdit({ ...edit, kickoff: e.target.value })} /></label>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveEdit}>Save changes</button>
            </div>
          </div>
        </div>
      )}

      {/* delete confirm (double confirm) */}
      {confirmDel && (
        <div className="modalwrap" onClick={() => setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Delete this match?</div>
            <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 16 }}>{nm(confirmDel.home_id)} v {nm(confirmDel.away_id)} and all its events will be permanently removed. This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDel(null)}>Keep it</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => doDelete(confirmDel.id)}>Delete permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
