"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { createMatch, deleteScheduledMatch, listCompetitionTeams, listCompetitions, listMatches, listMatchScorers, listScorers, listTeams, replaceMatchScorer } from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";
import { cacheAdminMatch } from "@/lib/matchCache";

export default function Matches() {
  const { user, role, activeOrganizationId } = useAuth();
  const [teams, setTeams] = useState([]);
  const [comps, setComps] = useState([]);
  const [matches, setMatches] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [assignments, setAssignments] = useState({});
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
  const [openCompetition, setOpenCompetition] = useState("");

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
      if (role === "admin") {
        const [nextScorers, nextAssignments] = await Promise.all([
          listScorers(activeOrganizationId),
          listMatchScorers(nextMatches.map((match) => match.id)),
        ]);
        setScorers(nextScorers);
        setAssignments(nextAssignments);
      }
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
  async function assignScorer(matchId, scorerId) {
    setErr("");
    const { error } = await replaceMatchScorer(matchId, scorerId || null);
    if (error) return setErr(error.message);
    setAssignments((current) => ({ ...current, [matchId]: scorerId ? [scorerId] : [] }));
  }
  async function removeScheduledMatch(match) {
    const homeName = match.home?.display_name || match.home?.name || teamName(match.home_id);
    const awayName = match.away?.display_name || match.away?.name || teamName(match.away_id);
    if (!window.confirm(`Delete the scheduled match between ${homeName} and ${awayName}?`)) return;
    setErr("");
    const { error } = await deleteScheduledMatch(match.id);
    if (error) { setErr(error.message); return; }
    await load();
  }
  const teamName = (id) => teams.find((t) => t.id === id)?.name || "Team not found";
  const selectedCompetition = comps.find((competition) => competition.id === comp);
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
          <div style={h3}>New match</div>
          <Field label="Competition">
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
          <div style={{ ...h3, marginTop: 18 }}>Public preview details</div>
          <Field label="Round or stage (optional)"><input value={matchRound} onChange={(event) => setMatchRound(event.target.value)} placeholder="Round 2" maxLength={80} style={inp} /></Field>
          <Field label="Venue name (optional)"><input value={venueName} onChange={(event) => setVenueName(event.target.value)} placeholder="Buya Community Park" maxLength={120} style={inp} /></Field>
          <Field label="Venue location (optional)"><input value={venueLocation} onChange={(event) => setVenueLocation(event.target.value)} placeholder="Buya, Kpandai District" maxLength={160} style={inp} /></Field>
          <Field label="Venue capacity (optional)"><input type="number" min="0" value={venueCapacity} onChange={(event) => setVenueCapacity(event.target.value)} placeholder="3000" style={inp} /></Field>
          <Field label="Playing surface (optional)"><input value={venueSurface} onChange={(event) => setVenueSurface(event.target.value)} placeholder="Grass" maxLength={60} style={inp} /></Field>
          <Field label="Weather (optional)"><input value={weather} onChange={(event) => setWeather(event.target.value)} placeholder="27°C · Clear" maxLength={100} style={inp} /></Field>
          <Field label="Referee (optional)"><input value={refereeName} onChange={(event) => setRefereeName(event.target.value)} placeholder="Referee's full name" maxLength={120} style={inp} /></Field>
          <button type="submit" style={btn}>Create match</button>
          {selectedCompetition && selectedCompetition.competition_type !== "friendly" && eligibleTeams.length === 0 && <div style={{ color: "#F5C518", fontSize: 12, marginTop: 8 }}>No teams are registered for {selectedCompetition.competition_type === "tournament" ? "this group" : "this league"}. Configure them under Competitions first.</div>}
          <div style={{ marginTop: 10 }}><Link href="/admin/competitions" style={{ color: "#4FC263", fontSize: 12, fontWeight: 700 }}>Manage competition formats and teams →</Link></div>
          {err && <div style={{ color: "#F04444", fontSize: 13, marginTop: 8 }}>{err}</div>}
        </form>
      </div>}

      {err && <div style={{ color: "#F04444", background: "var(--admin-soft-danger)", borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div>
        <div style={{ ...h3, marginBottom: 10 }}>{role === "admin" ? "Matches by competition" : "Assigned matches by competition"}</div>
        {matches.length === 0 && <div style={{ ...card, color: "var(--admin-dim)", fontSize: 14 }}>{role === "admin" ? "No matches yet." : "No matches have been assigned to you."}</div>}
        {competitionGroups.map((competition) => {
          const open = openCompetition === competition.id;
          const scheduledCount = competition.matches.filter((match) => match.status === "scheduled").length;
          return (
            <section key={competition.id} style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 12 }}>
              <button type="button" onClick={() => setOpenCompetition(open ? "" : competition.id)} className="w-full flex items-center" style={{ minHeight: 62, gap: 12, padding: "12px 16px", background: "transparent", color: "var(--admin-text)", border: 0, textAlign: "left", cursor: "pointer" }}>
                <span className="inline-flex items-center justify-center rounded-full" style={{ width: 36, height: 36, background: "var(--admin-elevated)", color: "#4FC263", fontSize: 16 }}>🏆</span>
                <span style={{ flex: 1, minWidth: 0 }}><span className="block truncate" style={{ fontSize: 14 }}>{competition.name}</span><span className="block" style={{ color: "var(--admin-dim)", fontSize: 11, marginTop: 3 }}>{competition.matches.length} {competition.matches.length === 1 ? "match" : "matches"} · {scheduledCount} scheduled</span></span>
                {open ? <ChevronDown size={19} color="var(--admin-dim)" /> : <ChevronRight size={19} color="var(--admin-dim)" />}
              </button>
              {open && <div style={{ borderTop: "1px solid var(--admin-divider)" }}>
                {competition.matches.map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--admin-divider)", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, textTransform: "uppercase", color: statusColor(m.status), width: 58 }}>{m.status}</span>
                    <span style={{ flex: 1, minWidth: 190, fontSize: 13 }}><span style={{ display: "block", color: "var(--admin-dim)", fontSize: 11.5, marginBottom: 3 }}>{m.match_date} · {m.kickoff || "TBD"}{m.group_number ? ` · Group ${String.fromCharCode(64 + Number(m.group_number))}` : ""}</span>{m.home?.display_name || m.home?.name || teamName(m.home_id)} <span style={{ color: "var(--admin-faint)" }}>vs</span> {m.away?.display_name || m.away?.name || teamName(m.away_id)}</span>
                    {role === "admin" && <select value={assignments[m.id]?.[0] || ""} onChange={(event) => assignScorer(m.id, event.target.value)} aria-label={`Scorer for ${m.home?.name || teamName(m.home_id)} vs ${m.away?.name || teamName(m.away_id)}`} style={{ ...inp, width: 178, padding: "7px 9px", fontSize: 12 }}><option value="">No scorer assigned</option>{scorers.map((scorer) => <option key={scorer.id} value={scorer.id}>{scorer.email}</option>)}</select>}
                    <div className="flex items-center" style={{ gap: 7 }}>
                      {role === "admin" && m.status === "scheduled" && <><Link href={`/admin/matches/${m.id}`} style={{ ...secondaryBtn, textDecoration: "none" }}>Edit</Link><button type="button" onClick={() => removeScheduledMatch(m)} style={dangerBtn}>Delete</button></>}
                      <Link href={`/admin/match/${m.id}`} onPointerDown={() => cacheAdminMatch(m)} onClick={() => cacheAdminMatch(m)} style={{ ...btn, textDecoration: "none", padding: "7px 12px" }}>{m.status === "scheduled" ? "Open" : "Score"}</Link>
                    </div>
                  </div>
                ))}
              </div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
function statusColor(s) { return s === "live" ? "#F04444" : s === "ft" ? "var(--admin-dim)" : s === "ht" ? "#F5C518" : "#4FC263"; }
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
function Field({ label, children }) { return <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}><span style={{ color: "var(--admin-dim)", fontSize: 12, fontWeight: 600 }}>{label}</span>{children}</label>; }
const card = { background: "var(--admin-card)", border: "1px solid var(--admin-divider)", borderRadius: 14, padding: 16 };
const h3 = { fontSize: 15, fontWeight: 700, marginBottom: 12 };
const inp = { width: "100%", padding: 10, borderRadius: 9, border: "1px solid var(--admin-control-border)", background: "var(--admin-input)", color: "var(--admin-text)", fontSize: 14, outline: "none" };
const pickerInput = { ...inp, colorScheme: "inherit", cursor: "pointer" };
const btn = { padding: "10px 16px", borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" };
const secondaryBtn = { padding: "7px 11px", borderRadius: 8, border: "1px solid var(--admin-control-border)", background: "var(--admin-elevated)", color: "var(--admin-text)", cursor: "pointer", fontSize: 12 };
const dangerBtn = { padding: "7px 11px", borderRadius: 8, border: "1px solid #5A2929", background: "var(--admin-soft-danger)", color: "var(--admin-danger-text)", cursor: "pointer", fontSize: 12 };
