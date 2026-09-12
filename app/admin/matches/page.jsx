"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createMatch, listCompetitionTeams, listCompetitions, listMatches, listTeams } from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";
import { Crest } from "@/components/ui";

export default function Matches() {
  const { user, role, activeOrganizationId } = useAuth();
  const [teams, setTeams] = useState([]);
  const [comps, setComps] = useState([]);
  const [matches, setMatches] = useState([]);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [comp, setComp] = useState("");
  const [groupNumber, setGroupNumber] = useState("");
  const [competitionTeams, setCompetitionTeams] = useState([]);
  const [matchDate, setMatchDate] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [matchRound, setMatchRound] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueLocation, setVenueLocation] = useState("");
  const [venueCapacity, setVenueCapacity] = useState("");
  const [venueSurface, setVenueSurface] = useState("Grass");
  const [weather, setWeather] = useState("");
  const [refereeName, setRefereeName] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      const [nextTeams, nextComps, nextMatches] = await Promise.all([
        listTeams(activeOrganizationId),
        listCompetitions(activeOrganizationId),
        listMatches(activeOrganizationId, role, user?.id),
      ]);
      setTeams(nextTeams);
      setComps(nextComps);
      setMatches(nextMatches);
    } catch (error) {
      setErr(error.message || "Could not load matches.");
    }
  }, [activeOrganizationId, role, user]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    if (!comp) { setCompetitionTeams([]); return undefined; }
    listCompetitionTeams(comp)
      .then((entries) => { if (alive) setCompetitionTeams(entries); })
      .catch((error) => { if (alive) setErr(error.message || "Could not load competition teams."); });
    return () => { alive = false; };
  }, [comp]);

  async function make(e) {
    e.preventDefault();
    setErr("");
    if (!comp) return setErr("Choose a friendly, league or tournament competition.");
    if (!home || !away || home === away) return setErr("Pick two different teams.");
    if (!matchDate) return setErr("Choose the match date.");
    if (!kickoff) return setErr("Choose the kick-off time.");
    if (selectedCompetition?.competition_type === "tournament" && !groupNumber) return setErr("Choose the tournament group for this match.");
    const { error } = await createMatch(
      activeOrganizationId,
      comp,
      home,
      away,
      kickoff,
      matchDate,
      groupNumber ? Number(groupNumber) : null,
      { round: matchRound, venueName, venueLocation, venueCapacity, venueSurface, weather, refereeName }
    );
    if (error) return setErr(error.message);
    setHome(""); setAway(""); setKickoff(""); setMatchRound(""); setVenueName(""); setVenueLocation(""); setVenueCapacity(""); setVenueSurface("Grass"); setWeather(""); setRefereeName(""); load();
  }
  const selectedCompetition = comps.find((competition) => competition.id === comp);
  const selectedHomeTeam = teams.find((team) => team.id === home) || null;
  const selectedAwayTeam = teams.find((team) => team.id === away) || null;
  const registeredTeamIds = new Set(competitionTeams
    .filter((entry) => selectedCompetition?.competition_type !== "tournament" || Number(entry.group_number) === Number(groupNumber))
    .map((entry) => entry.team_id));
  const eligibleTeams = selectedCompetition?.competition_type === "friendly"
    ? teams
    : teams.filter((team) => registeredTeamIds.has(team.id));
  const competitionGroups = useMemo(() => {
    const grouped = comps.map((competition) => ({
      ...competition,
      matches: matches.filter((match) => match.competition_id === competition.id),
    })).filter((competition) => competition.matches.length > 0);
    const unmatched = matches.filter((match) => !comps.some((competition) => competition.id === match.competition_id));
    if (unmatched.length) grouped.push({ id: "unassigned", name: "Unassigned matches", competition_type: "other", matches: unmatched });
    return grouped;
  }, [comps, matches]);

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>{role === "admin" ? "Matches" : "Assigned matches"}</h1>

      {role === "admin" && <div style={{ marginBottom: 20 }}>
        <form onSubmit={make} style={card}>
          <div className="admin-section-title" style={h3}>Create a new match</div>
          <div className="admin-match-form-grid">
          <Field label="Competition" className="admin-field-wide">
            <select value={comp} onChange={(e) => { setComp(e.target.value); setGroupNumber(""); setHome(""); setAway(""); }} style={inp}>
              <option value="">Choose format and competition</option>
              {comps.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.competition_type || "tournament"}{c.sub ? ` · ${c.sub}` : ""}</option>)}
            </select>
          </Field>
          {selectedCompetition?.competition_type === "tournament" && (
            <Field label="Tournament group">
              <select value={groupNumber} onChange={(e) => { setGroupNumber(e.target.value); setHome(""); setAway(""); }} style={inp}>
                <option value="">Choose group</option>
                {Array.from({ length: Number(selectedCompetition.group_count) || 0 }, (_, index) => index + 1).map((number) => <option key={number} value={number}>Group {String.fromCharCode(64 + number)}</option>)}
              </select>
            </Field>
          )}
          <Field label="Home team">
            <select value={home} onChange={(e) => setHome(e.target.value)} style={inp}>
              <option value="">Choose a home team</option>
              {eligibleTeams.map((t) => <option key={t.id} value={t.id}>{t.display_name || t.name}</option>)}
            </select>
          </Field>
          <Field label="Away team">
            <select value={away} onChange={(e) => setAway(e.target.value)} style={inp}>
              <option value="">Choose an away team</option>
              {eligibleTeams.filter((team) => team.id !== home).map((t) => <option key={t.id} value={t.id}>{t.display_name || t.name}</option>)}
            </select>
          </Field>
          {(selectedHomeTeam || selectedAwayTeam) && (
            <div className="grid items-center" style={{ gridTemplateColumns: "minmax(0, 1fr) 34px minmax(0, 1fr)", gap: 10, padding: "10px 0 16px", marginBottom: 10, borderBottom: "1px solid #26282B" }}>
              <SelectedMatchTeam team={selectedHomeTeam} fallback="Choose home team" />
              <span style={{ color: "#6F757E", fontSize: 12, textAlign: "center" }}>vs</span>
              <SelectedMatchTeam team={selectedAwayTeam} fallback="Choose away team" away />
            </div>
          )}
          <Field label="Match date">
            <input
              type="date"
              required
              value={matchDate}
              onChange={(event) => setMatchDate(event.target.value)}
              onClick={openNativePicker}
              onKeyDown={preventManualPickerEntry}
              aria-label="Choose match date"
              style={pickerInput}
            />
          </Field>
          <Field label="Kick-off time">
            <input
              type="time"
              required
              step="300"
              value={kickoff}
              onChange={(event) => setKickoff(event.target.value)}
              onClick={openNativePicker}
              onKeyDown={preventManualPickerEntry}
              aria-label="Choose kick-off time"
              style={pickerInput}
            />
          </Field>
          </div>
          <details className="admin-optional-details">
            <summary>Optional public match details</summary>
            <div className="admin-optional-grid">
              <Field label="Round or stage"><input value={matchRound} onChange={(event) => setMatchRound(event.target.value)} placeholder="Round 2" maxLength={80} style={inp} /></Field>
              <Field label="Venue name"><input value={venueName} onChange={(event) => setVenueName(event.target.value)} placeholder="Buya Community Park" maxLength={120} style={inp} /></Field>
              <Field label="Venue location"><input value={venueLocation} onChange={(event) => setVenueLocation(event.target.value)} placeholder="Buya, Kpandai District" maxLength={160} style={inp} /></Field>
              <Field label="Venue capacity"><input type="number" min="0" value={venueCapacity} onChange={(event) => setVenueCapacity(event.target.value)} placeholder="3000" style={inp} /></Field>
              <Field label="Playing surface"><input value={venueSurface} onChange={(event) => setVenueSurface(event.target.value)} placeholder="Grass" maxLength={60} style={inp} /></Field>
              <Field label="Weather"><input value={weather} onChange={(event) => setWeather(event.target.value)} placeholder="27°C · Clear" maxLength={100} style={inp} /></Field>
              <Field label="Referee"><input value={refereeName} onChange={(event) => setRefereeName(event.target.value)} placeholder="Referee's full name" maxLength={120} style={inp} /></Field>
            </div>
          </details>
          <button type="submit" style={btn}>Create match</button>
          {selectedCompetition && selectedCompetition.competition_type !== "friendly" && eligibleTeams.length === 0 && <div style={{ color: "#F5C518", fontSize: 12, marginTop: 8 }}>No teams are registered for {selectedCompetition.competition_type === "tournament" ? "this group" : "this league"}. Configure them under Competitions first.</div>}
          <div style={{ marginTop: 10 }}><Link href="/admin/competitions" style={{ color: "#4FC263", fontSize: 12, fontWeight: 700 }}>Manage competition formats and teams →</Link></div>
          {err && <div style={{ color: "#F04444", fontSize: 13, marginTop: 8 }}>{err}</div>}
        </form>
      </div>}

      {err && <div style={{ color: "#F04444", background: "#301719", borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div>
        <div className="admin-section-title" style={{ ...h3, marginBottom: 10 }}>{role === "admin" ? "Matches by competition" : "Assigned matches by competition"}</div>
        {matches.length === 0 && <div style={{ ...card, color: "#8E939B", fontSize: 14 }}>{role === "admin" ? "No matches yet." : "No matches have been assigned to you."}</div>}
        <div className="admin-competition-grid">
        {competitionGroups.map((competition) => {
          const scheduledCount = competition.matches.filter((match) => match.status === "scheduled").length;
          return (
            <Link key={competition.id} href={`/admin/matches/competition/${competition.id}`} className="admin-competition-card w-full flex items-center" style={{ ...card, padding: "16px 18px", gap: 14, color: "#FFFFFF", textAlign: "left", textDecoration: "none" }}>
                <span className="inline-flex items-center justify-center rounded-full" style={{ width: 36, height: 36, background: "#22252A", color: "#4FC263", fontSize: 16 }}>🏆</span>
                <span style={{ flex: 1, minWidth: 0 }}><span className="block truncate" style={{ fontSize: 16, fontWeight: 700 }}>{competition.name}</span><span className="block" style={{ color: "#8E939B", fontSize: 13, marginTop: 4 }}>{competition.matches.length} {competition.matches.length === 1 ? "match" : "matches"} · {scheduledCount} scheduled</span></span>
                <ChevronRight size={22} color="#8E939B" />
            </Link>
          );
        })}
        </div>
      </div>
    </div>
  );
}
function SelectedMatchTeam({ team, fallback, away = false }) {
  const name = team?.display_name || team?.name || fallback;
  return <span className="flex items-center min-w-0" style={{ gap: 8, justifyContent: away ? "flex-start" : "flex-end" }}>
    {!away && <span className="truncate" style={{ fontSize: 13, textAlign: "right" }}>{name}</span>}
    <Crest logo={team?.logo_url} label={name} size={36} ring="#32363C" />
    {away && <span className="truncate" style={{ fontSize: 13 }}>{name}</span>}
  </span>;
}
function openNativePicker(event) {
  if (typeof event.currentTarget.showPicker === "function") event.currentTarget.showPicker();
}
function preventManualPickerEntry(event) {
  if (["Tab", "Shift", "Escape"].includes(event.key)) return;
  event.preventDefault();
  if (["Enter", " "].includes(event.key) && typeof event.currentTarget.showPicker === "function") {
    event.currentTarget.showPicker();
  }
}
function Field({ label, children, className = "" }) { return <label className={className} style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}><span style={{ color: "#8E939B", fontSize: 13, fontWeight: 650 }}>{label}</span>{children}</label>; }
const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16 };
const h3 = { fontSize: 15, fontWeight: 700, marginBottom: 12 };
const inp = { width: "100%", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none" };
const pickerInput = { ...inp, colorScheme: "dark", cursor: "pointer" };
const btn = { padding: "10px 16px", borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" };
