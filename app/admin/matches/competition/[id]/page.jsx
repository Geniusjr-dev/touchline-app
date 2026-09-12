"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Crest } from "@/components/ui";
import { cacheAdminMatch } from "@/lib/matchCache";
import {
  deleteScheduledMatch,
  listCompetitions,
  listMatches,
  listMatchScorers,
  listScorers,
  replaceMatchScorer,
} from "@/lib/db";

export default function CompetitionMatchesPage() {
  const params = useParams();
  const competitionId = params.id;
  const { user, role, activeOrganizationId } = useAuth();
  const [competitions, setCompetitions] = useState([]);
  const [matches, setMatches] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    setError("");
    try {
      const [nextCompetitions, allMatches] = await Promise.all([
        listCompetitions(activeOrganizationId),
        listMatches(activeOrganizationId, role, user?.id),
      ]);
      const nextMatches = competitionId === "unassigned"
        ? allMatches.filter((match) => !nextCompetitions.some((competition) => competition.id === match.competition_id))
        : allMatches.filter((match) => match.competition_id === competitionId);
      setCompetitions(nextCompetitions);
      setMatches(nextMatches);
      if (role === "admin") {
        const [nextScorers, nextAssignments] = await Promise.all([
          listScorers(activeOrganizationId),
          listMatchScorers(nextMatches.map((match) => match.id)),
        ]);
        setScorers(nextScorers);
        setAssignments(nextAssignments);
      }
    } catch (loadError) {
      setError(loadError.message || "Could not load competition matches.");
    }
  }, [activeOrganizationId, competitionId, role, user]);

  useEffect(() => { load(); }, [load]);

  const competition = useMemo(
    () => competitions.find((item) => item.id === competitionId),
    [competitionId, competitions]
  );
  const competitionName = competition?.name || (competitionId === "unassigned" ? "Unassigned matches" : "Competition matches");

  async function assignScorer(matchId, scorerId) {
    setError("");
    const { error: assignmentError } = await replaceMatchScorer(matchId, scorerId || null);
    if (assignmentError) return setError(assignmentError.message);
    setAssignments((current) => ({ ...current, [matchId]: scorerId ? [scorerId] : [] }));
  }

  async function removeScheduledMatch(match) {
    const homeName = teamName(match.home, "Home team");
    const awayName = teamName(match.away, "Away team");
    if (!window.confirm(`Delete the scheduled match between ${homeName} and ${awayName}?`)) return;
    setError("");
    const { error: deleteError } = await deleteScheduledMatch(match.id);
    if (deleteError) return setError(deleteError.message);
    await load();
  }

  return (
    <div>
      <Link href="/admin/matches" className="inline-flex items-center" style={{ minHeight: 42, gap: 7, color: "#8E939B", marginBottom: 10 }}>
        <ArrowLeft size={18} /> All competitions
      </Link>

      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{competitionName}</h1>
          <p style={{ color: "#8E939B", fontSize: 15, margin: "7px 0 0" }}>
            {matches.length} {matches.length === 1 ? "match" : "matches"}. Open a match to score it or use its controls to edit a scheduled fixture.
          </p>
        </div>
        {role === "admin" && <Link href="/admin/matches" style={primaryButton}>Create another match</Link>}
      </div>

      {error && <div role="alert" style={{ color: "#F7B4B4", background: "#301719", border: "1px solid #5A2428", borderRadius: 12, padding: 13, fontSize: 14, marginBottom: 14 }}>{error}</div>}

      {matches.length === 0 ? (
        <div style={card}>No matches are available in this competition.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {matches.map((match) => {
            const homeName = teamName(match.home, "Home team");
            const awayName = teamName(match.away, "Away team");
            return (
              <article key={match.id} className="admin-match-list-row" style={card}>
                <span style={{ color: statusColor(match.status), fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>{match.status}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="flex items-center flex-wrap" style={{ gap: 9, fontSize: 15 }}>
                    <span className="inline-flex items-center" style={{ gap: 7 }}><Crest logo={match.home?.logo_url} color={match.home?.color} label={homeName} size={30} ring="#32363C" /><span>{homeName}</span></span>
                    <span style={{ color: "#6F757E" }}>vs</span>
                    <span className="inline-flex items-center" style={{ gap: 7 }}><Crest logo={match.away?.logo_url} color={match.away?.color} label={awayName} size={30} ring="#32363C" /><span>{awayName}</span></span>
                  </div>
                  <div className="flex items-center" style={{ gap: 6, color: "#8E939B", fontSize: 13, marginTop: 8 }}>
                    <CalendarDays size={15} /> {match.match_date} · {match.kickoff || "TBD"}{match.group_number ? ` · Group ${String.fromCharCode(64 + Number(match.group_number))}` : ""}
                  </div>
                </div>
                {role === "admin" ? (
                  <label style={{ display: "grid", gap: 5, color: "#8E939B", fontSize: 12 }}>
                    Assigned scorer
                    <select value={assignments[match.id]?.[0] || ""} onChange={(event) => assignScorer(match.id, event.target.value)} aria-label={`Scorer for ${homeName} vs ${awayName}`} style={inputStyle}>
                      <option value="">No scorer assigned</option>
                      {scorers.map((scorer) => <option key={scorer.id} value={scorer.id}>{scorer.email}</option>)}
                    </select>
                  </label>
                ) : <span />}
                <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
                  {role === "admin" && match.status === "scheduled" && (
                    <>
                      <Link href={`/admin/matches/${match.id}`} style={secondaryButton}>Edit</Link>
                      <button type="button" onClick={() => removeScheduledMatch(match)} style={dangerButton}>Delete</button>
                    </>
                  )}
                  <Link href={`/admin/match/${match.id}`} onPointerDown={() => cacheAdminMatch(match)} onClick={() => cacheAdminMatch(match)} style={primaryButton}>
                    {match.status === "scheduled" ? "Open match" : "Score match"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function teamName(team, fallback) {
  return team?.display_name || team?.name || fallback;
}

function statusColor(status) {
  return status === "live" ? "#F04444" : status === "ft" ? "#8E939B" : status === "ht" ? "#F5C518" : "#4FC263";
}

const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16 };
const inputStyle = { width: "100%", minWidth: 190, padding: "9px 11px", borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff" };
const primaryButton = { minHeight: 42, padding: "0 15px", borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const secondaryButton = { ...primaryButton, background: "#22252A", color: "#FFFFFF", border: "1px solid #384049" };
const dangerButton = { minHeight: 42, padding: "0 13px", borderRadius: 9, border: "1px solid #5A2929", background: "#2A1A1A", color: "#F87070", cursor: "pointer" };
