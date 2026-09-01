"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { deleteScheduledMatch, getMatchRaw, listCompetitionTeams, listCompetitions, listTeams, updateScheduledMatch } from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";

function formValues(match) {
  return {
    competitionId: match?.competition_id || "",
    homeId: match?.home_id || "",
    awayId: match?.away_id || "",
    matchDate: match?.match_date || "",
    kickoff: match?.kickoff || "",
    groupNumber: match?.group_number ? String(match.group_number) : "",
    round: match?.match_round || "",
    venueName: match?.venue_name || "",
    venueLocation: match?.venue_location || "",
    venueCapacity: match?.venue_capacity ?? "",
    venueSurface: match?.venue_surface || "Grass",
    weather: match?.weather || "",
    refereeName: match?.referee_name || "",
  };
}

export default function ScheduledMatchEditor({ id }) {
  const router = useRouter();
  const { activeOrganizationId, role } = useAuth();
  const [match, setMatch] = useState(null);
  const [teams, setTeams] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [competitionTeams, setCompetitionTeams] = useState([]);
  const [values, setValues] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      const [nextMatch, nextTeams, nextCompetitions] = await Promise.all([
        getMatchRaw(id),
        listTeams(activeOrganizationId),
        listCompetitions(activeOrganizationId),
      ]);
      if (!nextMatch || nextMatch.organization_id !== activeOrganizationId) {
        setError("This match could not be found in your organization.");
        return;
      }
      setMatch(nextMatch);
      setTeams(nextTeams);
      setCompetitions(nextCompetitions);
      setValues(formValues(nextMatch));
      setError("");
    } catch (loadError) {
      setError(loadError.message || "The match could not be loaded.");
    }
  }, [activeOrganizationId, id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let alive = true;
    if (!values?.competitionId) { setCompetitionTeams([]); return undefined; }
    listCompetitionTeams(values.competitionId).then((entries) => { if (alive) setCompetitionTeams(entries); }).catch(() => { if (alive) setCompetitionTeams([]); });
    return () => { alive = false; };
  }, [values?.competitionId]);

  const selectedCompetition = competitions.find((competition) => competition.id === values?.competitionId);
  const eligibleTeams = useMemo(() => {
    if (!selectedCompetition || selectedCompetition.competition_type === "friendly") return teams;
    const registered = new Set(competitionTeams.filter((entry) => selectedCompetition.competition_type !== "tournament" || Number(entry.group_number) === Number(values?.groupNumber)).map((entry) => entry.team_id));
    return teams.filter((team) => registered.has(team.id));
  }, [competitionTeams, selectedCompetition, teams, values?.groupNumber]);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  async function save(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (role !== "admin") { setError("Only an administrator can edit a scheduled match."); return; }
    if (!values.competitionId || !values.homeId || !values.awayId || values.homeId === values.awayId) { setError("Choose a competition and two different teams."); return; }
    if (!values.matchDate || !values.kickoff) { setError("Choose the date and kick-off time."); return; }
    if (selectedCompetition?.competition_type === "tournament" && !values.groupNumber) { setError("Choose the tournament group."); return; }
    setBusy(true);
    const { data, error: saveError } = await updateScheduledMatch(id, values);
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setMatch((current) => ({ ...current, ...data }));
    setMessage("Scheduled match updated.");
  }

  async function remove() {
    if (!window.confirm("Delete this scheduled match permanently?")) return;
    setBusy(true);
    const { error: deleteError } = await deleteScheduledMatch(id);
    setBusy(false);
    if (deleteError) { setError(deleteError.message); return; }
    router.push("/admin/matches");
  }

  return (
    <div>
      <div className="flex items-center gap-3" style={{ marginBottom: 18 }}>
        <Link href="/admin/matches" aria-label="Back to matches" className="inline-flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--admin-elevated)", border: "1px solid var(--admin-control-border)" }}><ChevronLeft size={20} /></Link>
        <span><h1 style={{ fontSize: 20, margin: 0 }}>Edit scheduled match</h1><span className="block" style={{ color: "var(--admin-dim)", fontSize: 12, marginTop: 3 }}>Changes are allowed only before kick-off.</span></span>
      </div>

      {!values && !error && <div className="touchline-skeleton" style={{ ...card, height: 260 }} />}
      {error && !values && <div style={{ ...card, color: "#F04444" }}>{error}</div>}
      {match && match.status !== "scheduled" && <div style={{ ...card, color: "#F5C518" }}>This match has already started and can no longer be edited or deleted from scheduling.</div>}
      {values && match?.status === "scheduled" && (
        <form onSubmit={save} style={card}>
          <div style={formGrid}>
            <Field label="Competition"><select value={values.competitionId} onChange={(event) => setValues((current) => ({ ...current, competitionId: event.target.value, groupNumber: "", homeId: "", awayId: "" }))} style={inp}><option value="">Choose competition</option>{competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name} · {competition.competition_type}</option>)}</select></Field>
            {selectedCompetition?.competition_type === "tournament" && <Field label="Tournament group"><select value={values.groupNumber} onChange={(event) => setValues((current) => ({ ...current, groupNumber: event.target.value, homeId: "", awayId: "" }))} style={inp}><option value="">Choose group</option>{Array.from({ length: Number(selectedCompetition.group_count) || 0 }, (_, index) => index + 1).map((number) => <option key={number} value={number}>Group {String.fromCharCode(64 + number)}</option>)}</select></Field>}
            <Field label="Home team"><select value={values.homeId} onChange={(event) => set("homeId", event.target.value)} style={inp}><option value="">Choose home team</option>{eligibleTeams.map((team) => <option key={team.id} value={team.id}>{team.display_name || team.name}</option>)}</select></Field>
            <Field label="Away team"><select value={values.awayId} onChange={(event) => set("awayId", event.target.value)} style={inp}><option value="">Choose away team</option>{eligibleTeams.filter((team) => team.id !== values.homeId).map((team) => <option key={team.id} value={team.id}>{team.display_name || team.name}</option>)}</select></Field>
            <Field label="Match date"><input type="date" required value={values.matchDate} onChange={(event) => set("matchDate", event.target.value)} style={pickerInput} /></Field>
            <Field label="Kick-off time"><input type="time" required step="300" value={values.kickoff} onChange={(event) => set("kickoff", event.target.value)} style={pickerInput} /></Field>
            <Field label="Round or stage"><input value={values.round} onChange={(event) => set("round", event.target.value)} placeholder="Round 2" style={inp} /></Field>
            <Field label="Venue name"><input value={values.venueName} onChange={(event) => set("venueName", event.target.value)} placeholder="Buya Community Park" style={inp} /></Field>
            <Field label="Venue location"><input value={values.venueLocation} onChange={(event) => set("venueLocation", event.target.value)} placeholder="Buya, Kpandai District" style={inp} /></Field>
            <Field label="Venue capacity"><input type="number" min="0" value={values.venueCapacity} onChange={(event) => set("venueCapacity", event.target.value)} style={inp} /></Field>
            <Field label="Playing surface"><input value={values.venueSurface} onChange={(event) => set("venueSurface", event.target.value)} style={inp} /></Field>
            <Field label="Weather"><input value={values.weather} onChange={(event) => set("weather", event.target.value)} placeholder="27°C · Clear" style={inp} /></Field>
            <Field label="Referee"><input value={values.refereeName} onChange={(event) => set("refereeName", event.target.value)} style={inp} /></Field>
          </div>
          {message && <div style={{ color: "#4FC263", fontSize: 12, marginTop: 12 }}>{message}</div>}
          {error && <div style={{ color: "#F04444", fontSize: 12, marginTop: 12 }}>{error}</div>}
          <div className="flex items-center flex-wrap" style={{ gap: 10, marginTop: 16 }}><button type="submit" disabled={busy} style={btn}>{busy ? "Saving..." : "Save changes"}</button><button type="button" disabled={busy} onClick={remove} style={dangerBtn}>Delete scheduled match</button></div>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }) { return <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}><span style={{ color: "var(--admin-dim)", fontSize: 12 }}>{label}</span>{children}</label>; }

const card = { background: "var(--admin-card)", border: "1px solid var(--admin-divider)", borderRadius: 14, padding: 16 };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, alignItems: "end" };
const inp = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: 10, borderRadius: 9, border: "1px solid var(--admin-control-border)", background: "var(--admin-input)", color: "var(--admin-text)", fontSize: 14, outline: "none" };
const pickerInput = { ...inp, colorScheme: "inherit", cursor: "pointer" };
const btn = { padding: "10px 16px", borderRadius: 9, border: 0, background: "#4FC263", color: "#07130B", cursor: "pointer" };
const dangerBtn = { padding: "10px 16px", borderRadius: 9, border: "1px solid #5A2929", background: "var(--admin-soft-danger)", color: "var(--admin-danger-text)", cursor: "pointer" };
