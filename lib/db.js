"use client";
import { supabase } from "@/lib/supabase";
import { COMPETITIONS as SAMPLE_COMPS, TEAMS as SAMPLE_TEAMS, findMatch, detail as sampleDetail } from "@/lib/data";

// ---------- clock helpers ----------
export function elapsedSeconds(m, now = Date.now()) {
  if (!m) return 0;
  const legacyBase = m.clock_base == null ? null : m.clock_base * 60;
  const base = Number(m.clock_elapsed_seconds ?? m.clockElapsedSeconds ?? legacyBase ?? ((m.min || 0) * 60));
  const startedAt = m.clock_started_at ?? m.clockStartedAt;
  if ((m.status === "live" || m.status === "et_live") && startedAt) {
    const running = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
    return base + running;
  }
  return base;
}

export function formatMatchClock(m, now = Date.now()) {
  const total = elapsedSeconds(m, now);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function liveMinute(m, now = Date.now()) {
  return Math.max(1, Math.ceil(elapsedSeconds(m, now) / 60));
}

const goals = (events, side) => (events || []).filter((e) => e.type === "goal" && e.side === side).length;

function throwOnError(result) {
  if (result?.error) throw result.error;
  return result?.data;
}

function withOrganization(query, organizationId) {
  return organizationId ? query.eq("organization_id", organizationId) : query;
}

// ---------- public reads ----------
export async function getHome() {
  if (!supabase) return { competitions: SAMPLE_COMPS, teams: SAMPLE_TEAMS, sample: true };
  const [compResult, teamResult, matchResult, eventResult] = await Promise.all([
    supabase.from("competitions").select("*").order("created_at"),
    supabase.from("teams").select("*").order("name"),
    supabase.from("matches").select("*").order("created_at"),
    supabase.from("events").select("match_id,type,side"),
  ]);
  const comps = throwOnError(compResult) || [];
  const teams = throwOnError(teamResult) || [];
  const matches = throwOnError(matchResult) || [];
  const events = throwOnError(eventResult) || [];
  const teamsById = {};
  teams.forEach((t) => { teamsById[t.id] = { name: t.name, short: t.short, color: t.color }; });
  const evByMatch = {};
  events.forEach((e) => { (evByMatch[e.match_id] ||= []).push(e); });
  const competitions = comps.map((c) => ({
    id: c.id,
    name: c.name,
    sub: c.sub,
    flag: "🏆",
    matches: matches.filter((m) => m.competition_id === c.id).map((m) => shapeMatch(m, evByMatch[m.id])),
  })).filter((c) => c.matches.length);
  const orphan = matches.filter((m) => !m.competition_id);
  if (orphan.length) competitions.push({
    id: "_none", name: "Other matches", sub: null, flag: "🌍",
    matches: orphan.map((m) => shapeMatch(m, evByMatch[m.id])),
  });
  return { competitions, teams: teamsById };
}

function shapeMatch(m, events) {
  return {
    id: m.id,
    home: m.home_id,
    away: m.away_id,
    competitionId: m.competition_id,
    organizationId: m.organization_id,
    status: m.status,
    hs: m.home_score ?? goals(events, "home"),
    as: m.away_score ?? goals(events, "away"),
    time: m.kickoff,
    clock_elapsed_seconds: m.clock_elapsed_seconds ?? (m.clock_base || 0) * 60,
    clock_started_at: m.clock_started_at,
    current_period: m.current_period || 0,
    locked_at: m.locked_at,
    reopened_at: m.reopened_at,
  };
}

export async function getMatch(id) {
  if (!supabase) {
    const m = findMatch(id);
    return { match: m, teams: SAMPLE_TEAMS, detail: sampleDetail(id), sample: true };
  }
  const m = throwOnError(await supabase.from("matches").select("*").eq("id", id).single());
  if (!m) return { match: null };
  const [teamResult, eventResult, compResult] = await Promise.all([
    supabase.from("teams").select("*").in("id", [m.home_id, m.away_id]),
    supabase.from("events").select("*").eq("match_id", id).order("elapsed_seconds").order("created_at"),
    m.competition_id ? supabase.from("competitions").select("*").eq("id", m.competition_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const teams = throwOnError(teamResult) || [];
  const events = throwOnError(eventResult) || [];
  const competition = throwOnError(compResult);
  const teamsById = {};
  teams.forEach((t) => { teamsById[t.id] = { name: t.name, short: t.short, color: t.color }; });
  const shaped = shapeMatch(m, events);
  shaped.compName = competition?.name || "Match";
  shaped.matchDurationMinutes = competition?.match_duration_minutes || 90;
  shaped.extraTimeMinutes = competition?.extra_time_minutes || 30;
  const evs = events.map((e) => {
    const fallbackScore = runningScoreAt(events, e);
    return {
      id: e.id,
      m: e.display_minute ?? e.minute,
      min: `${e.display_minute ?? e.minute ?? 1}'`,
      type: e.type,
      side: e.side,
      player: e.player,
      playerId: e.player_id,
      assist: e.assist,
      score: e.type === "goal" ? `${e.home_score_after ?? fallbackScore.home} - ${e.away_score_after ?? fallbackScore.away}` : undefined,
      scored: e.type === "goal" ? e.side : undefined,
    };
  });
  const table = m.competition_id ? await buildCompetitionTable(m.competition_id) : [];
  return { match: shaped, teams: teamsById, detail: { events: evs, table } };
}

function runningScoreAt(events, upto) {
  let home = 0;
  let away = 0;
  for (const event of events) {
    if (event.type === "goal") {
      if (event.side === "home") home += 1;
      else away += 1;
    }
    if (event.id === upto.id) break;
  }
  return { home, away };
}

async function buildCompetitionTable(competitionId) {
  const matches = throwOnError(await supabase.from("matches").select("id,home_id,away_id,status,home_score,away_score,created_at").eq("competition_id", competitionId).order("created_at")) || [];
  const teamIds = [...new Set(matches.flatMap((match) => [match.home_id, match.away_id]).filter(Boolean))];
  if (!teamIds.length) return [];
  const teams = throwOnError(await supabase.from("teams").select("id,name,short,color").in("id", teamIds)) || [];
  const rows = {};
  teams.forEach((team) => {
    rows[team.id] = { id: team.id, name: team.name, short: team.short, color: team.color, pl: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
  });
  matches.filter((match) => match.status === "ft").forEach((match) => {
    const home = rows[match.home_id];
    const away = rows[match.away_id];
    if (!home || !away) return;
    const homeScore = match.home_score || 0;
    const awayScore = match.away_score || 0;
    home.pl += 1; away.pl += 1;
    home.gf += homeScore; home.ga += awayScore;
    away.gf += awayScore; away.ga += homeScore;
    if (homeScore > awayScore) {
      home.w += 1; home.pts += 3; home.form.push("W");
      away.l += 1; away.form.push("L");
    } else if (homeScore < awayScore) {
      away.w += 1; away.pts += 3; away.form.push("W");
      home.l += 1; home.form.push("L");
    } else {
      home.d += 1; home.pts += 1; home.form.push("D");
      away.d += 1; away.pts += 1; away.form.push("D");
    }
  });
  return Object.values(rows).sort((a, b) =>
    b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.name.localeCompare(b.name)
  );
}

// ---------- identity and organizations ----------
export async function getMyAccess(userId) {
  if (!supabase || !userId) return { profile: null, memberships: [] };
  const [profileResult, membershipResult] = await Promise.all([
    supabase.from("profiles").select("id,email,role,status").eq("id", userId).maybeSingle(),
    supabase.from("organization_members").select("organization_id,role,active,organization:organizations(id,name,slug)").eq("user_id", userId).eq("active", true),
  ]);
  return {
    profile: throwOnError(profileResult),
    memberships: throwOnError(membershipResult) || [],
  };
}

// ---------- organization-scoped admin reads ----------
export async function listTeams(organizationId) {
  const result = await withOrganization(supabase.from("teams").select("*").order("name"), organizationId);
  return throwOnError(result) || [];
}

export async function listCompetitions(organizationId) {
  const result = await withOrganization(supabase.from("competitions").select("*").order("created_at"), organizationId);
  return throwOnError(result) || [];
}

export async function listMatches(organizationId, role, userId) {
  let allowedIds = null;
  if (role === "scorer" && userId) {
    const assignments = throwOnError(await supabase.from("match_scorers").select("match_id").eq("user_id", userId)) || [];
    allowedIds = assignments.map((row) => row.match_id);
    if (!allowedIds.length) return [];
  }
  let query = supabase.from("matches").select("*, home:home_id(name,short,color), away:away_id(name,short,color)").order("created_at", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);
  if (allowedIds) query = query.in("id", allowedIds);
  return throwOnError(await query) || [];
}

export const addTeam = (organization_id, name, short, color) =>
  supabase.from("teams").insert({ organization_id, name, short, color });

export const addCompetition = (organization_id, name, sub, match_duration_minutes = 90) =>
  supabase.from("competitions").insert({ organization_id, name, sub, match_duration_minutes });

export const createMatch = (organization_id, competition_id, home_id, away_id, kickoff) =>
  supabase.from("matches").insert({ organization_id, competition_id, home_id, away_id, kickoff, status: "scheduled" });

export async function listScorers(organizationId) {
  if (!organizationId) return [];
  const members = throwOnError(await supabase.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("role", "scorer").eq("active", true)) || [];
  const ids = members.map((m) => m.user_id);
  if (!ids.length) return [];
  return throwOnError(await supabase.from("profiles").select("id,email,status").in("id", ids).eq("status", "active")) || [];
}

export async function listMatchScorers(matchIds) {
  if (!matchIds?.length) return {};
  const rows = throwOnError(await supabase.from("match_scorers").select("match_id,user_id").in("match_id", matchIds)) || [];
  return rows.reduce((map, row) => {
    (map[row.match_id] ||= []).push(row.user_id);
    return map;
  }, {});
}

export async function replaceMatchScorer(matchId, userId) {
  const removed = await supabase.from("match_scorers").delete().eq("match_id", matchId);
  if (removed.error) return removed;
  if (!userId) return removed;
  return supabase.from("match_scorers").insert({ match_id: matchId, user_id: userId });
}

// ---------- checked match mutations ----------
export const transitionMatchStatus = (matchId, status) =>
  supabase.rpc("transition_match_status", { p_match_id: matchId, p_status: status });

export const setStatus = transitionMatchStatus;

export const reopenMatch = (matchId, reason) =>
  supabase.rpc("reopen_match", { p_match_id: matchId, p_reason: reason });

export const recordMatchEvent = (matchId, event) =>
  supabase.rpc("record_match_event", {
    p_match_id: matchId,
    p_type: event.type,
    p_side: event.side,
    p_player_id: event.player_id || null,
    p_player: event.player || null,
    p_assist: event.assist || null,
  });

export const deleteMatchEvent = (eventId) =>
  supabase.rpc("delete_match_event", { p_event_id: eventId });

export async function getMatchRaw(id) {
  return throwOnError(await supabase.from("matches").select("*").eq("id", id).single());
}

export async function getEvents(id) {
  return throwOnError(await supabase.from("events").select("*").eq("match_id", id).order("elapsed_seconds").order("created_at")) || [];
}

// ---------- players (squads) ----------
export async function listPlayers(teamId) {
  return throwOnError(await supabase.from("players").select("*").eq("team_id", teamId).order("number", { nullsFirst: false })) || [];
}

export const addPlayer = (team_id, name, number, position) =>
  supabase.from("players").insert({ team_id, name, number: number || null, position: position || null });

export const deletePlayer = (id) => supabase.from("players").delete().eq("id", id);
