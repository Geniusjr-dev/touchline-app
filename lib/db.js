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

function matchDurationMinutes(m) {
  return Number(m?.matchDurationMinutes ?? m?.match_duration_minutes ?? m?.competition?.match_duration_minutes ?? 90);
}

function extraTimeMinutes(m) {
  return Number(m?.extraTimeMinutes ?? m?.extra_time_minutes ?? m?.competition?.extra_time_minutes ?? 30);
}

function periodEndMinute(m, period = Number(m?.current_period || 1)) {
  const duration = matchDurationMinutes(m);
  const extraTime = extraTimeMinutes(m);
  if (period === 1) return duration / 2;
  if (period === 2) return duration;
  if (period === 3) return duration + extraTime / 2;
  if (period === 4) return duration + extraTime;
  return null;
}

export function formatMatchClock(m, now = Date.now()) {
  const total = elapsedSeconds(m, now);
  const periodEnd = periodEndMinute(m);
  const periodEndSeconds = periodEnd == null ? null : periodEnd * 60;
  if (periodEndSeconds != null && total > periodEndSeconds) {
    const added = total - periodEndSeconds;
    return `${periodEnd}+${Math.floor(added / 60)}:${String(added % 60).padStart(2, "0")}`;
  }
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function liveMinute(m, now = Date.now()) {
  const total = elapsedSeconds(m, now);
  const periodEnd = periodEndMinute(m);
  const periodEndSeconds = periodEnd == null ? null : periodEnd * 60;
  if (periodEndSeconds != null && total > periodEndSeconds) {
    return `${periodEnd}+${Math.max(1, Math.ceil((total - periodEndSeconds) / 60))}`;
  }
  return Math.max(1, Math.ceil(total / 60));
}

export function announcedStoppageMinutes(m, period = Number(m?.current_period || 1)) {
  if (period === 1) return Number(m?.first_half_stoppage_minutes || 0);
  if (period === 2) return Number(m?.second_half_stoppage_minutes || 0);
  if (period === 3) return Number(m?.extra_time_first_half_stoppage_minutes || 0);
  if (period === 4) return Number(m?.extra_time_second_half_stoppage_minutes || 0);
  return 0;
}

const goals = (events, side) => (events || []).filter((e) => e.type === "goal" && e.side === side).length;

export const EMPTY_MATCH_STATS = Object.freeze({
  home_possession: 50,
  away_possession: 50,
  home_total_shots: 0,
  away_total_shots: 0,
  home_shots_on_target: 0,
  away_shots_on_target: 0,
  home_corners: 0,
  away_corners: 0,
  home_fouls: 0,
  away_fouls: 0,
  home_offsides: 0,
  away_offsides: 0,
  home_yellow_cards: 0,
  away_yellow_cards: 0,
  home_red_cards: 0,
  away_red_cards: 0,
});

function normalizeMatchStats(stats) {
  const normalized = {};
  Object.entries(EMPTY_MATCH_STATS).forEach(([key, fallback]) => {
    const value = Number(stats?.[key]);
    normalized[key] = Number.isFinite(value) ? value : fallback;
  });
  return normalized;
}

function publicTeam(team) {
  const displayName = team.display_name?.trim() || null;
  return {
    id: team.id,
    name: displayName || team.name,
    fullName: team.name,
    displayName,
    short: team.short,
    color: team.color,
    country: team.country || "Ghana",
    logoUrl: team.logo_url || null,
    coach: team.coach_name ? {
      name: team.coach_name,
      country: team.coach_country || null,
      dateOfBirth: team.coach_date_of_birth || null,
      photoUrl: team.coach_photo_url || null,
    } : null,
  };
}

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
    supabase.from("matches").select("*").order("match_date").order("kickoff").order("created_at"),
    supabase.from("events").select("match_id,type,side"),
  ]);
  const comps = throwOnError(compResult) || [];
  const teams = throwOnError(teamResult) || [];
  const matches = throwOnError(matchResult) || [];
  const events = throwOnError(eventResult) || [];
  const teamsById = {};
  teams.forEach((t) => { teamsById[t.id] = publicTeam(t); });
  const evByMatch = {};
  events.forEach((e) => { (evByMatch[e.match_id] ||= []).push(e); });
  const competitions = comps.map((c) => ({
    id: c.id,
    name: c.name,
    sub: c.sub,
    flag: "🏆",
    matches: matches.filter((m) => m.competition_id === c.id).map((m) => shapeMatch(m, evByMatch[m.id], c)),
  })).filter((c) => c.matches.length);
  const orphan = matches.filter((m) => !m.competition_id);
  if (orphan.length) competitions.push({
    id: "_none", name: "Other matches", sub: null, flag: "🌍",
    matches: orphan.map((m) => shapeMatch(m, evByMatch[m.id])),
  });
  return { competitions, teams: teamsById };
}

function shapeMatch(m, events, competition = null) {
  return {
    id: m.id,
    home: m.home_id,
    away: m.away_id,
    competitionId: m.competition_id,
    organizationId: m.organization_id,
    status: m.status,
    hs: m.home_score ?? goals(events, "home"),
    as: m.away_score ?? goals(events, "away"),
    date: m.match_date || null,
    time: m.kickoff,
    clock_elapsed_seconds: m.clock_elapsed_seconds ?? (m.clock_base || 0) * 60,
    clock_started_at: m.clock_started_at,
    current_period: m.current_period || 0,
    competitionType: competition?.competition_type || (/friend(?:ly|lies)/i.test(competition?.name || "") ? "friendly" : "tournament"),
    matchDurationMinutes: competition?.match_duration_minutes || 90,
    extraTimeMinutes: competition?.extra_time_minutes || 30,
    first_half_stoppage_minutes: m.first_half_stoppage_minutes || 0,
    second_half_stoppage_minutes: m.second_half_stoppage_minutes || 0,
    extra_time_first_half_stoppage_minutes: m.extra_time_first_half_stoppage_minutes || 0,
    extra_time_second_half_stoppage_minutes: m.extra_time_second_half_stoppage_minutes || 0,
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
  const [teamResult, eventResult, compResult, statsResult] = await Promise.all([
    supabase.from("teams").select("*").in("id", [m.home_id, m.away_id]),
    supabase.from("events").select("*").eq("match_id", id).order("period").order("elapsed_seconds").order("created_at"),
    m.competition_id ? supabase.from("competitions").select("*").eq("id", m.competition_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("match_statistics").select("*").eq("match_id", id).maybeSingle(),
  ]);
  const teams = throwOnError(teamResult) || [];
  const events = throwOnError(eventResult) || [];
  const competition = throwOnError(compResult);
  const stats = normalizeMatchStats(throwOnError(statsResult));
  const teamsById = {};
  teams.forEach((t) => { teamsById[t.id] = publicTeam(t); });
  const shaped = shapeMatch(m, events, competition);
  shaped.compName = competition?.name || "Match";
  shaped.matchDurationMinutes = competition?.match_duration_minutes || 90;
  shaped.extraTimeMinutes = competition?.extra_time_minutes || 30;
  const evs = events.map((e) => {
    const fallbackScore = runningScoreAt(events, e);
    const displayMinute = e.display_minute ?? e.minute ?? Math.max(1, Math.ceil((e.elapsed_seconds || 0) / 60));
    const eventPeriodEnd = periodEndMinute({
      current_period: e.period || 1,
      matchDurationMinutes: shaped.matchDurationMinutes,
      extraTimeMinutes: shaped.extraTimeMinutes,
    });
    const minuteLabel = eventPeriodEnd != null && displayMinute > eventPeriodEnd
      ? `${eventPeriodEnd}+${displayMinute - eventPeriodEnd}'`
      : `${displayMinute}'`;
    return {
      id: e.id,
      m: Number(e.period || 1) * 100000 + Number(e.elapsed_seconds ?? displayMinute * 60),
      min: minuteLabel,
      displayMinute,
      elapsedSeconds: e.elapsed_seconds ?? displayMinute * 60,
      period: e.period || 1,
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
  return { match: shaped, teams: teamsById, detail: { events: evs, table, stats } };
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
  const teams = throwOnError(await supabase.from("teams").select("id,name,display_name,short,color,logo_url").in("id", teamIds)) || [];
  const rows = {};
  teams.forEach((team) => {
    rows[team.id] = { id: team.id, name: team.display_name?.trim() || team.name, short: team.short, color: team.color, logoUrl: team.logo_url || null, pl: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
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

function completedTeamResult(match, teamId) {
  if (match.status !== "ft") return null;
  const teamIsHome = match.home_id === teamId;
  const teamScore = Number(teamIsHome ? match.home_score : match.away_score) || 0;
  const opponentScore = Number(teamIsHome ? match.away_score : match.home_score) || 0;
  return teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "D";
}

function teamMatchSortValue(match) {
  return `${match.match_date || "0000-00-00"}T${match.kickoff || "00:00"}`;
}

function aggregateTeamStats(matches, statistics, teamId) {
  const completed = matches.filter((match) => match.status === "ft");
  const totals = {
    played: completed.length, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, cleanSheets: 0,
    possession: 0, totalShots: 0, shotsOnTarget: 0, corners: 0,
  };
  completed.forEach((match) => {
    const isHome = match.home_id === teamId;
    const scored = Number(isHome ? match.home_score : match.away_score) || 0;
    const conceded = Number(isHome ? match.away_score : match.home_score) || 0;
    totals.goalsFor += scored;
    totals.goalsAgainst += conceded;
    if (conceded === 0) totals.cleanSheets += 1;
    if (scored > conceded) totals.wins += 1;
    else if (scored < conceded) totals.losses += 1;
    else totals.draws += 1;
  });
  statistics.forEach((stat) => {
    const match = matches.find((item) => item.id === stat.match_id);
    if (!match) return;
    const prefix = match.home_id === teamId ? "home" : "away";
    totals.possession += Number(stat[`${prefix}_possession`]) || 0;
    totals.totalShots += Number(stat[`${prefix}_total_shots`]) || 0;
    totals.shotsOnTarget += Number(stat[`${prefix}_shots_on_target`]) || 0;
    totals.corners += Number(stat[`${prefix}_corners`]) || 0;
  });
  const statMatches = statistics.length;
  return {
    ...totals,
    averagePossession: statMatches ? Math.round(totals.possession / statMatches) : 50,
    averageShots: statMatches ? Number((totals.totalShots / statMatches).toFixed(1)) : 0,
    averageShotsOnTarget: statMatches ? Number((totals.shotsOnTarget / statMatches).toFixed(1)) : 0,
    averageCorners: statMatches ? Number((totals.corners / statMatches).toFixed(1)) : 0,
  };
}

export async function getTeamCentre(teamId) {
  if (!supabase || !teamId) return null;
  const team = throwOnError(await supabase.from("teams").select("*").eq("id", teamId).maybeSingle());
  if (!team) return null;

  const matches = throwOnError(await supabase
    .from("matches")
    .select("*")
    .or(`home_id.eq.${teamId},away_id.eq.${teamId}`)
    .order("match_date")
    .order("kickoff")) || [];
  const teamIds = [...new Set(matches.flatMap((match) => [match.home_id, match.away_id]).filter(Boolean))];
  const competitionIds = [...new Set(matches.map((match) => match.competition_id).filter(Boolean))];
  const matchIds = matches.map((match) => match.id);
  const [teamsResult, competitionsResult, playersResult, trophiesResult, statisticsResult] = await Promise.all([
    teamIds.length ? supabase.from("teams").select("*").in("id", teamIds) : Promise.resolve({ data: [], error: null }),
    competitionIds.length ? supabase.from("competitions").select("*").in("id", competitionIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("players").select("*").eq("team_id", teamId).order("number", { nullsFirst: false }),
    supabase.from("team_trophies").select("*").eq("team_id", teamId).order("won_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    matchIds.length ? supabase.from("match_statistics").select("*").in("match_id", matchIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const allTeams = throwOnError(teamsResult) || [];
  const competitions = throwOnError(competitionsResult) || [];
  const players = throwOnError(playersResult) || [];
  const trophies = throwOnError(trophiesResult) || [];
  const statistics = throwOnError(statisticsResult) || [];
  const teamsById = {};
  allTeams.forEach((item) => { teamsById[item.id] = publicTeam(item); });
  const competitionsById = {};
  competitions.forEach((competition) => { competitionsById[competition.id] = competition; });

  const shapedMatches = matches.map((match) => ({
    ...shapeMatch(match, [], competitionsById[match.competition_id]),
    competitionName: competitionsById[match.competition_id]?.name || "Match",
    result: completedTeamResult(match, teamId),
  }));
  const competitiveMatches = [...matches]
    .filter((match) => {
      const competition = competitionsById[match.competition_id];
      return competition && competition.competition_type !== "friendly" && !/friend(?:ly|lies)/i.test(competition.name || "");
    })
    .sort((a, b) => teamMatchSortValue(b).localeCompare(teamMatchSortValue(a)));
  const tableCompetition = competitiveMatches.length ? competitionsById[competitiveMatches[0].competition_id] : null;
  const table = tableCompetition ? await buildCompetitionTable(tableCompetition.id) : [];

  return {
    team: publicTeam(team),
    teams: teamsById,
    matches: shapedMatches,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      number: player.number,
      position: player.position,
      country: player.country || null,
      dateOfBirth: player.date_of_birth || null,
      photoUrl: player.photo_url || null,
    })),
    trophies: trophies.map((trophy) => ({
      id: trophy.id,
      name: trophy.name,
      season: trophy.season,
      wonOn: trophy.won_on,
      imageUrl: trophy.image_url,
    })),
    table,
    tableCompetition: tableCompetition ? { id: tableCompetition.id, name: tableCompetition.name, sub: tableCompetition.sub } : null,
    stats: aggregateTeamStats(matches, statistics, teamId),
  };
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
  let query = supabase.from("matches").select("*, home:home_id(name,display_name,short,color,logo_url), away:away_id(name,display_name,short,color,logo_url)").order("created_at", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);
  if (allowedIds) query = query.in("id", allowedIds);
  return throwOnError(await query) || [];
}

export const addTeam = (organization_id, name, display_name, short, color) =>
  supabase.from("teams").insert({ organization_id, name, display_name: display_name?.trim() || null, short, color });

export const updateTeam = (id, name, display_name, short, color) =>
  supabase.from("teams").update({ name, display_name: display_name?.trim() || null, short, color }).eq("id", id);

export const updateTeamProfile = (id, values) =>
  supabase.from("teams").update({
    name: values.name,
    display_name: values.display_name?.trim() || null,
    short: values.short,
    color: values.color,
    country: values.country?.trim() || "Ghana",
    logo_url: values.logo_url || null,
    coach_name: values.coach_name?.trim() || null,
    coach_country: values.coach_country?.trim() || null,
    coach_date_of_birth: values.coach_date_of_birth || null,
    coach_photo_url: values.coach_photo_url || null,
  }).eq("id", id);

export const addCompetition = (organization_id, name, sub, match_duration_minutes = 90, competition_type = "tournament") =>
  supabase.from("competitions").insert({ organization_id, name, sub, match_duration_minutes, competition_type });

export const createMatch = (organization_id, competition_id, home_id, away_id, kickoff, match_date) =>
  supabase.from("matches").insert({ organization_id, competition_id, home_id, away_id, kickoff, match_date, status: "scheduled" });

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

export const setMatchStoppageTime = (matchId, minutes) =>
  supabase.rpc("set_match_stoppage_time", { p_match_id: matchId, p_minutes: minutes });

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
  return throwOnError(await supabase.from("matches").select("*, competition:competition_id(name,competition_type,match_duration_minutes,extra_time_minutes)").eq("id", id).single());
}

export async function getEvents(id) {
  return throwOnError(await supabase.from("events").select("*").eq("match_id", id).order("period").order("elapsed_seconds").order("created_at")) || [];
}

export async function getMatchStats(matchId) {
  const result = await supabase.from("match_statistics").select("*").eq("match_id", matchId).maybeSingle();
  return normalizeMatchStats(throwOnError(result));
}

export function saveMatchStats(matchId, stats) {
  const values = normalizeMatchStats(stats);
  return supabase
    .from("match_statistics")
    .upsert({
      match_id: matchId,
      ...values,
      updated_at: new Date().toISOString(),
    }, { onConflict: "match_id" })
    .select("*")
    .single();
}

// ---------- players (squads) ----------
export async function listPlayers(teamId) {
  return throwOnError(await supabase.from("players").select("*").eq("team_id", teamId).order("number", { nullsFirst: false })) || [];
}

export const addPlayer = (team_id, name, number, position, details = {}) =>
  supabase.from("players").insert({
    team_id,
    name,
    number: number || null,
    position: position || null,
    country: details.country?.trim() || "Ghana",
    date_of_birth: details.date_of_birth || null,
    photo_url: details.photo_url || null,
  });

export const updatePlayer = (id, values) => supabase.from("players").update({
  name: values.name,
  number: values.number || null,
  position: values.position || null,
  country: values.country?.trim() || "Ghana",
  date_of_birth: values.date_of_birth || null,
  photo_url: values.photo_url || null,
}).eq("id", id);

export const deletePlayer = (id) => supabase.from("players").delete().eq("id", id);

export async function listTeamTrophies(teamId) {
  return throwOnError(await supabase.from("team_trophies").select("*").eq("team_id", teamId).order("won_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })) || [];
}

export const addTeamTrophy = (team_id, values) => supabase.from("team_trophies").insert({
  team_id,
  name: values.name,
  season: values.season?.trim() || null,
  won_on: values.won_on || null,
  image_url: values.image_url || null,
});

export const updateTeamTrophy = (id, values) => supabase.from("team_trophies").update({
  name: values.name,
  season: values.season?.trim() || null,
  won_on: values.won_on || null,
  image_url: values.image_url || null,
}).eq("id", id);

export const deleteTeamTrophy = (id) => supabase.from("team_trophies").delete().eq("id", id);

export async function uploadTeamMedia(file, teamId, kind) {
  if (!file) return null;
  if (!file.type?.match(/^image\/(jpeg|png|webp)$/)) throw new Error("Use a JPG, PNG or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const randomPart = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${teamId}/${kind}/${randomPart}.${extension}`;
  const uploaded = await supabase.storage.from("team-media").upload(path, file, { cacheControl: "3600", upsert: false });
  if (uploaded.error) throw uploaded.error;
  return supabase.storage.from("team-media").getPublicUrl(path).data.publicUrl;
}
