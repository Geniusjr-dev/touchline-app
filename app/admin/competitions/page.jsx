"use client";
import { useCallback, useEffect, useState } from "react";
import {
  addCompetition,
  deleteCompetition,
  listCompetitions,
  listCompetitionTeams,
  listTeams,
  removeCompetitionTeam,
  setCompetitionTeam,
  updateCompetition,
} from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";

const groupName = (number) => `Group ${String.fromCharCode(64 + Number(number))}`;

export default function CompetitionsPage() {
  const { activeOrganizationId } = useAuth();
  const [competitions, setCompetitions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [name, setName] = useState("");
  const [sub, setSub] = useState("");
  const [format, setFormat] = useState("friendly");
  const [duration, setDuration] = useState("90");
  const [groupCount, setGroupCount] = useState("4");
  const [teamsPerGroup, setTeamsPerGroup] = useState("4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      const [nextCompetitions, nextTeams] = await Promise.all([
        listCompetitions(activeOrganizationId),
        listTeams(activeOrganizationId),
      ]);
      setCompetitions(nextCompetitions);
      setTeams(nextTeams);
    } catch (loadError) {
      setError(loadError.message || "Could not load competitions.");
    }
  }, [activeOrganizationId]);

  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setError("");
    const groups = format === "tournament" ? Number(groupCount) : 0;
    const perGroup = format === "tournament" ? Number(teamsPerGroup) : 0;
    const { error: createError } = await addCompetition(
      activeOrganizationId,
      name.trim(),
      sub.trim() || null,
      Number(duration),
      format,
      groups,
      perGroup
    );
    setBusy(false);
    if (createError) return setError(createError.message);
    setName(""); setSub(""); setFormat("friendly"); setDuration("90"); setGroupCount("4"); setTeamsPerGroup("4");
    load();
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Competitions</h1>

      <form onSubmit={create} style={{ ...card, marginTop: 16, marginBottom: 18 }}>
        <div style={h3}>New competition</div>
        <div style={grid}>
          <Field label="Competition name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Community Premier League" style={inp} /></Field>
          <Field label="Sub-label (optional)"><input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="2026 season" style={inp} /></Field>
          <Field label="Format">
            <select value={format} onChange={(e) => setFormat(e.target.value)} style={inp}>
              <option value="friendly">Friendly</option>
              <option value="league">League</option>
              <option value="tournament">Tournament</option>
            </select>
          </Field>
          <Field label="Match duration">
            <select value={duration} onChange={(e) => setDuration(e.target.value)} style={inp}>
              {[60, 70, 80, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
            </select>
          </Field>
          {format === "tournament" && <>
            <Field label="Number of groups"><input type="number" min="1" max="26" value={groupCount} onChange={(e) => setGroupCount(e.target.value)} style={inp} /></Field>
            <Field label="Teams in each group"><input type="number" min="2" max="32" value={teamsPerGroup} onChange={(e) => setTeamsPerGroup(e.target.value)} style={inp} /></Field>
          </>}
        </div>
        <button type="submit" disabled={busy} style={btn}>{busy ? "Creating…" : "Create competition"}</button>
      </form>

      {error && <div style={errorBox}>{error}</div>}
      {competitions.length === 0 && <div style={{ ...card, color: "#8E939B", fontSize: 14 }}>No competitions yet.</div>}
      {competitions.map((competition) => (
        <CompetitionEditor key={competition.id} competition={competition} teams={teams} onSaved={load} />
      ))}
    </div>
  );
}

function CompetitionEditor({ competition, teams, onSaved }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [name, setName] = useState(competition.name || "");
  const [sub, setSub] = useState(competition.sub || "");
  const [format, setFormat] = useState(competition.competition_type || "tournament");
  const [duration, setDuration] = useState(String(competition.match_duration_minutes || 90));
  const [groupCount, setGroupCount] = useState(String(competition.group_count || 1));
  const [teamsPerGroup, setTeamsPerGroup] = useState(String(competition.teams_per_group || 4));
  const [message, setMessage] = useState("");

  const loadEntries = useCallback(async () => {
    try { setEntries(await listCompetitionTeams(competition.id)); }
    catch (loadError) { setMessage(loadError.message || "Could not load registered teams."); }
  }, [competition.id]);
  useEffect(() => { if (open) loadEntries(); }, [open, loadEntries]);

  async function saveSettings(e) {
    e.preventDefault();
    const groups = format === "tournament" ? Number(groupCount) : 0;
    const perGroup = format === "tournament" ? Number(teamsPerGroup) : 0;
    if (format === "tournament" && entries.some((entry) => Number(entry.group_number) > groups)) {
      return setMessage("Move teams out of groups above the new group limit first.");
    }
    const { error } = await updateCompetition(competition.id, name.trim(), sub.trim() || null, Number(duration), format, groups, perGroup);
    if (error) return setMessage(error.message);
    if (format !== "tournament") {
      await Promise.all(entries.filter((entry) => entry.group_number).map((entry) => setCompetitionTeam(competition.id, entry.team_id, null)));
    }
    setMessage("Competition settings saved.");
    await loadEntries();
    onSaved();
  }

  async function changeRegistration(teamId, value) {
    setMessage("");
    const current = entries.find((entry) => entry.team_id === teamId);
    if (!value) {
      const { error } = await removeCompetitionTeam(competition.id, teamId);
      if (error) return setMessage(error.message);
    } else {
      const groupNumber = format === "tournament" ? Number(value) : null;
      if (format === "tournament") {
        const inGroup = entries.filter((entry) => Number(entry.group_number) === groupNumber && entry.team_id !== teamId).length;
        if (inGroup >= Number(teamsPerGroup)) return setMessage(`${groupName(groupNumber)} already has ${teamsPerGroup} teams.`);
      }
      const { error } = await setCompetitionTeam(competition.id, teamId, groupNumber);
      if (error) return setMessage(error.message);
    }
    await loadEntries();
    if (!current && value) setMessage("Team registered.");
  }

  async function removeCompetition() {
    const confirmed = window.confirm(`Delete ${competition.name}? Its existing matches will remain in Touchline without this competition label.`);
    if (!confirmed) return;
    setMessage("");
    const { error } = await deleteCompetition(competition.id);
    if (error) return setMessage(error.message);
    onSaved();
  }

  const entryByTeam = Object.fromEntries(entries.map((entry) => [entry.team_id, entry]));
  return (
    <div style={{ ...card, padding: 0, marginBottom: 12, overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, border: 0, background: "transparent", color: "#fff", cursor: "pointer" }}>
        <span style={{ fontSize: 15, fontWeight: 750, textAlign: "left", flex: 1 }}>{competition.name}</span>
        <span style={formatPill(competition.competition_type)}>{competition.competition_type || "tournament"}</span>
        <span style={{ color: "#8E939B" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding: 16, borderTop: "1px solid #26282B" }}>
        <form onSubmit={saveSettings}>
          <div style={grid}>
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} /></Field>
            <Field label="Sub-label"><input value={sub} onChange={(e) => setSub(e.target.value)} style={inp} /></Field>
            <Field label="Format"><select value={format} onChange={(e) => setFormat(e.target.value)} style={inp}><option value="friendly">Friendly</option><option value="league">League</option><option value="tournament">Tournament</option></select></Field>
            <Field label="Duration"><select value={duration} onChange={(e) => setDuration(e.target.value)} style={inp}>{[60, 70, 80, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></Field>
            {format === "tournament" && <><Field label="Groups"><input type="number" min="1" max="26" value={groupCount} onChange={(e) => setGroupCount(e.target.value)} style={inp} /></Field><Field label="Teams per group"><input type="number" min="2" max="32" value={teamsPerGroup} onChange={(e) => setTeamsPerGroup(e.target.value)} style={inp} /></Field></>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={btn}>Save settings</button>
            <button type="button" onClick={removeCompetition} style={dangerBtn}>Delete competition</button>
          </div>
        </form>

        <div style={{ fontSize: 14, fontWeight: 750, margin: "18px 0 4px" }}>{format === "tournament" ? "Assign teams to groups" : "Register teams"}</div>
        <div style={{ color: "#8E939B", fontSize: 12, marginBottom: 8 }}>{format === "friendly" ? "Registration is optional for friendly competitions." : format === "league" ? "All registered teams appear in the overall table, including teams that have not played yet." : "A group cannot exceed the configured teams-per-group limit."}</div>
        <div style={{ border: "1px solid #26282B", borderRadius: 10, overflow: "hidden" }}>
          {teams.map((team) => {
            const entry = entryByTeam[team.id];
            return <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderTop: "1px solid #26282B" }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: team.color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{team.short}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{team.display_name || team.name}</span>
              {format === "tournament" ? (
                <select value={entry?.group_number || ""} onChange={(e) => changeRegistration(team.id, e.target.value)} style={{ ...inp, width: 140, padding: "7px 8px" }}>
                  <option value="">Not registered</option>
                  {Array.from({ length: Number(groupCount) || 0 }, (_, index) => index + 1).map((number) => <option key={number} value={number}>{groupName(number)}</option>)}
                </select>
              ) : (
                <input type="checkbox" checked={Boolean(entry)} onChange={(e) => changeRegistration(team.id, e.target.checked ? "registered" : "")} style={{ width: 18, height: 18 }} />
              )}
            </div>;
          })}
        </div>
        {message && <div style={{ color: /saved|registered/i.test(message) ? "#4FC263" : "#F5C518", fontSize: 12, marginTop: 10 }}>{message}</div>}
      </div>}
    </div>
  );
}

function formatPill(format) {
  const colors = { friendly: "#58708A", league: "#2563EB", tournament: "#7C3AED" };
  return { color: "#fff", background: colors[format] || colors.tournament, borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 800, textTransform: "uppercase" };
}
function Field({ label, children }) { return <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ color: "#8E939B", fontSize: 12, fontWeight: 650 }}>{label}</span>{children}</label>; }
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 };
const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16 };
const h3 = { fontSize: 15, fontWeight: 750, marginBottom: 12 };
const inp = { width: "100%", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none" };
const btn = { padding: "10px 16px", borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" };
const dangerBtn = { padding: "10px 16px", borderRadius: 9, border: "1px solid #5A2929", background: "#2A1A1A", color: "#F87070", fontWeight: 800, cursor: "pointer" };
const errorBox = { color: "#F04444", background: "#301719", borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 12 };
