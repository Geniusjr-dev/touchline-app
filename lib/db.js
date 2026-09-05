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

function shapeMatchLineups(rows = []) {
  const lineups = {};
  rows.forEach((row) => {
    if (!row.team_id || !row.player) return;
    const lineup = lineups[row.team_id] || {
      formation: row.formation || null,
      starters: [],
      substitutes: [],
    };
    if (!lineup.formation && row.formation) lineup.formation = row.formation;
    const player = {
      id: row.player.id,
      name: row.player.name,
      displayName: row.player.display_name?.trim() || null,
      number: row.player.number,
      position: row.player.position || null,
      country: row.player.country || null,
      photoUrl: row.player.photo_url || null,
      slotIndex: row.slot_index == null ? null : Number(row.slot_index),
    };
    if (row.role === "starter") lineup.starters.push(player);
    if (row.role === "substitute") lineup.substitutes.push(player);
    lineups[row.team_id] = lineup;
  });
  Object.values(lineups).forEach((lineup) => {
    lineup.starters.sort((left, right) => (left.slotIndex ?? 99) - (right.slotIndex ?? 99));
  });
  return lineups;
}

function matchLineupQuery(matchId) {
  return supabase
    .from("match_lineups")
    .select("match_id,team_id,player_id,role,formation,sort_order,slot_index,player:player_id(id,name,display_name,number,position,country,photo_url)")
    .eq("match_id", matchId)
    .order("role")
    .order("sort_order");
}

function throwOnError(result) {
  if (result?.error) throw result.error;
  return result?.data;
}

function withOrganization(query, organizationId) {
  return organizationId ? query.eq("organization_id", organizationId) : query;
}

// ---------- public reads ----------
async function loadHome() {
  if (!supabase) return { competitions: SAMPLE_COMPS, teams: SAMPLE_TEAMS, sample: true };
  const [compResult, teamResult, matchResult] = await Promise.all([
    supabase.from("competitions").select("*").order("created_at"),
    supabase.from("teams").select("*").order("name"),
    supabase.from("matches").select("*").order("match_date").order("kickoff").order("created_at"),
  ]);
  const comps = throwOnError(compResult) || [];
  const teams = throwOnError(teamResult) || [];
  const matches = throwOnError(matchResult) || [];
  const teamsById = {};
  teams.forEach((t) => { teamsById[t.id] = publicTeam(t); });
  const competitions = comps.map((c) => ({
    id: c.id,
    name: c.name,
    sub: c.sub,
    flag: "🏆",
    matches: matches.filter((m) => m.competition_id === c.id).map((m) => shapeMatch(m, [], c)),
  })).filter((c) => c.matches.length);
  const orphan = matches.filter((m) => !m.competition_id);
  if (orphan.length) competitions.push({
    id: "_none", name: "Other matches", sub: null, flag: "🌍",
    matches: orphan.map((m) => shapeMatch(m, [])),
  });
  return { competitions, teams: teamsById };
}

let homeReadCache = null;
let homeReadRequest = null;
const HOME_READ_CACHE_MS = 15000;

export async function getHome(options = {}) {
  const force = Boolean(options.force);
  if (!force && homeReadCache && Date.now() - homeReadCache.savedAt < HOME_READ_CACHE_MS) return homeReadCache.value;
  if (homeReadRequest) return homeReadRequest;
  homeReadRequest = loadHome()
    .then((value) => {
      homeReadCache = { value, savedAt: Date.now() };
      return value;
    })
    .finally(() => { homeReadRequest = null; });
  return homeReadRequest;
}

async function loadLeaguesHome() {
  if (!supabase) {
    const sampleLeagues = SAMPLE_COMPS
      .filter((competition) => !/friend(?:ly|lies)/i.test(competition.name || ""))
      .map((competition) => ({
        id: competition.id,
        name: competition.name,
        sub: competition.sub || null,
        country: "Ghana",
        logoUrl: null,
        themeColor: "#4B125F",
        competitionType: "league",
        teamCount: new Set(competition.matches.flatMap((match) => [match.home, match.away])).size,
        matchCount: competition.matches.length,
        completedCount: competition.matches.filter((match) => match.status === "ft").length,
        liveCount: competition.matches.filter((match) => ["live", "ht", "et_live", "et_ht"].includes(match.status)).length,
      }));
    return { competitions: sampleLeagues, sample: true };
  }

  const [competitionResult, matchResult, membershipResult] = await Promise.all([
    supabase.from("competitions").select("*").eq("competition_type", "league").order("name"),
    supabase.from("matches").select("id,competition_id,home_id,away_id,status,match_date,kickoff").order("match_date").order("kickoff"),
    supabase.from("competition_teams").select("competition_id,team_id"),
  ]);
  const competitions = throwOnError(competitionResult) || [];
  const matches = throwOnError(matchResult) || [];
  const memberships = membershipResult.error ? [] : membershipResult.data || [];

  return {
    competitions: competitions.map((competition) => {
      const competitionMatches = matches.filter((match) => match.competition_id === competition.id);
      const registeredTeamIds = memberships
        .filter((entry) => entry.competition_id === competition.id)
        .map((entry) => entry.team_id)
        .filter(Boolean);
      const fixtureTeamIds = competitionMatches.flatMap((match) => [match.home_id, match.away_id]).filter(Boolean);
      return {
        id: competition.id,
        name: competition.name,
        sub: competition.sub || null,
        country: competition.country || "Ghana",
        logoUrl: competition.logo_url || null,
        themeColor: competition.theme_color || "#4B125F",
        competitionType: competition.competition_type || "league",
        teamCount: new Set([...registeredTeamIds, ...fixtureTeamIds]).size,
        matchCount: competitionMatches.length,
        completedCount: competitionMatches.filter((match) => match.status === "ft").length,
        liveCount: competitionMatches.filter((match) => ["live", "ht", "et_live", "et_ht"].includes(match.status)).length,
      };
    }),
  };
}

let leaguesHomeCache = null;
let leaguesHomeRequest = null;
const LEAGUES_HOME_CACHE_MS = 15000;

export async function getLeaguesHome(options = {}) {
  const force = Boolean(options.force);
  if (!force && leaguesHomeCache && Date.now() - leaguesHomeCache.savedAt < LEAGUES_HOME_CACHE_MS) return leaguesHomeCache.value;
  if (leaguesHomeRequest) return leaguesHomeRequest;
  leaguesHomeRequest = loadLeaguesHome()
    .then((value) => {
      leaguesHomeCache = { value, savedAt: Date.now() };
      return value;
    })
    .finally(() => { leaguesHomeRequest = null; });
  return leaguesHomeRequest;
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
    operationMode: m.operation_mode || "live",
    competitionType: competition?.competition_type || (/friend(?:ly|lies)/i.test(competition?.name || "") ? "friendly" : "tournament"),
    matchDurationMinutes: competition?.match_duration_minutes || 90,
    extraTimeMinutes: competition?.extra_time_minutes || 30,
    groupNumber: m.group_number || null,
    compName: competition?.name || "Match",
    competitionSub: competition?.sub || null,
    round: m.match_round || null,
    venueName: m.venue_name || null,
    venueLocation: m.venue_location || null,
    venueCapacity: m.venue_capacity || null,
    venueSurface: m.venue_surface || null,
    weather: m.weather || null,
    refereeName: m.referee_name || null,
    homeKitColor: m.home_kit_color || null,
    awayKitColor: m.away_kit_color || null,
    first_half_stoppage_minutes: m.first_half_stoppage_minutes || 0,
    second_half_stoppage_minutes: m.second_half_stoppage_minutes || 0,
    extra_time_first_half_stoppage_minutes: m.extra_time_first_half_stoppage_minutes || 0,
    extra_time_second_half_stoppage_minutes: m.extra_time_second_half_stoppage_minutes || 0,
    locked_at: m.locked_at,
    reopened_at: m.reopened_at,
  };
}

const matchReadCache = new Map();
const matchReadRequests = new Map();
const MATCH_READ_CACHE_MS = 15000;

async function loadMatch(id) {
  if (!supabase) {
    const m = findMatch(id);
    return { match: m, teams: SAMPLE_TEAMS, detail: sampleDetail(id), sample: true };
  }
  const m = throwOnError(await supabase.from("matches").select("*").eq("id", id).maybeSingle());
  if (!m) return { match: null };
  const h2hQuery = supabase
    .from("matches")
    .select("id,home_id,away_id,status,home_score,away_score,match_date,kickoff,competition_id")
    .eq("status", "ft")
    .neq("id", id)
    .in("home_id", [m.home_id, m.away_id])
    .order("match_date", { ascending: false })
    .order("kickoff", { ascending: false })
    .limit(100);
  const [teamResult, eventResult, compResult, statsResult, lineupResult, h2hResult] = await Promise.all([
    supabase.from("teams").select("*").in("id", [m.home_id, m.away_id]),
    supabase.from("events").select("*").eq("match_id", id).order("period").order("elapsed_seconds").order("created_at"),
    m.competition_id ? supabase.from("competitions").select("*").eq("id", m.competition_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("match_statistics").select("*").eq("match_id", id).maybeSingle(),
    matchLineupQuery(id),
    h2hQuery,
  ]);
  const teams = throwOnError(teamResult) || [];
  const events = throwOnError(eventResult) || [];
  const competition = throwOnError(compResult) || null;
  const stats = normalizeMatchStats(throwOnError(statsResult));
  const lineups = shapeMatchLineups(throwOnError(lineupResult) || []);
  const pairedTeamIds = new Set([m.home_id, m.away_id]);
  const h2h = (h2hResult.error ? [] : h2hResult.data || [])
    .filter((meeting) => (
      pairedTeamIds.has(meeting.home_id)
      && pairedTeamIds.has(meeting.away_id)
      && meeting.home_id !== meeting.away_id
    ))
    .slice(0, 20)
    .map((meeting) => ({
      id: meeting.id,
      homeId: meeting.home_id,
      awayId: meeting.away_id,
      homeScore: Number(meeting.home_score) || 0,
      awayScore: Number(meeting.away_score) || 0,
      date: meeting.match_date || null,
      time: meeting.kickoff || null,
      competitionName: meeting.competition_id === m.competition_id
        ? (competition?.name || "Match")
        : "Match",
    }));
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
      goalType: e.type === "goal"
        ? (e.goal_type === "direct_goal" ? "normal_goal" : e.goal_type || "normal_goal")
        : null,
      cardType: e.card_type || (e.type === "yellow" ? "yellow" : e.type === "red" ? "straight_red" : null),
      cardReason: e.card_reason || null,
      recipientType: e.recipient_type || (["yellow", "red"].includes(e.type) ? "player" : null),
      commentaryVariantKey: e.commentary_variant_key || null,
      score: e.type === "goal" ? `${e.home_score_after ?? fallbackScore.home} - ${e.away_score_after ?? fallbackScore.away}` : undefined,
      scored: e.type === "goal" ? e.side : undefined,
    };
  });
  return { match: shaped, teams: teamsById, detail: { events: evs, table: [], stats, lineups, h2h } };
}

export async function getMatch(id, options = {}) {
  const force = Boolean(options.force);
  const cached = matchReadCache.get(id);
  if (!force && cached && Date.now() - cached.savedAt < MATCH_READ_CACHE_MS) return cached.value;
  if (matchReadRequests.has(id)) {
    const pending = matchReadRequests.get(id);
    return force ? pending.then(() => getMatch(id, { force: true })) : pending;
  }
  const request = loadMatch(id)
    .then((value) => {
      matchReadCache.set(id, { value, savedAt: Date.now() });
      return value;
    })
    .finally(() => matchReadRequests.delete(id));
  matchReadRequests.set(id, request);
  return request;
}

export async function getMatchTable(match) {
  if (!supabase || !match?.competitionId || match.competitionType === "friendly") return [];
  try {
    return await buildCompetitionTable(match.competitionId, match.groupNumber, match.home);
  } catch {
    return [];
  }
}

function normalizedPersonName(value) {
  return String(value || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function playerPositionGroup(position) {
  const value = String(position || "").toLocaleLowerCase();
  if (/goal|keeper|\bgk\b/.test(value)) return "goalkeeper";
  if (/def|back/.test(value)) return "defender";
  if (/mid/.test(value)) return "midfielder";
  if (/forward|striker|wing|attack/.test(value)) return "forward";
  return "midfielder";
}

function buildPlayerLookups(players) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const byTeamAndName = new Map();
  players.forEach((player) => {
    [player.name, player.display_name].filter(Boolean).forEach((name) => {
      byTeamAndName.set(`${player.team_id}:${normalizedPersonName(name)}`, player);
    });
  });
  return { byId, byTeamAndName };
}

function playerForEvent(event, matchesById, lookups, field = "player") {
  if (field === "player" && event.player_id && lookups.byId.has(event.player_id)) return lookups.byId.get(event.player_id);
  const match = matchesById.get(event.match_id);
  if (!match) return null;
  const teamId = event.side === "home" ? match.home_id : match.away_id;
  return lookups.byTeamAndName.get(`${teamId}:${normalizedPersonName(event[field])}`) || null;
}

function buildCompetitionPlayerStats(players, matches, events, lineups, teamsById) {
  const startedStatuses = new Set(["live", "ht", "et_live", "et_ht", "ft"]);
  const startedMatches = matches.filter((match) => startedStatuses.has(match.status));
  const startedIds = new Set(startedMatches.map((match) => match.id));
  const completedMatches = matches.filter((match) => match.status === "ft");
  const matchesById = new Map(matches.map((match) => [match.id, match]));
  const lookups = buildPlayerLookups(players);
  const stats = new Map(players.map((player) => [player.id, {
    id: player.id,
    teamId: player.team_id,
    name: player.display_name?.trim() || player.name,
    fullName: player.name,
    position: player.position || null,
    positionGroup: playerPositionGroup(player.position),
    photoUrl: player.photo_url || null,
    team: teamsById[player.team_id] || null,
    appearances: new Set(),
    goals: 0,
    penaltyGoals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    cleanSheets: 0,
  }]));

  lineups.forEach((lineup) => {
    if (startedIds.has(lineup.match_id)) stats.get(lineup.player_id)?.appearances.add(lineup.match_id);
  });
  events.filter((event) => startedIds.has(event.match_id)).forEach((event) => {
    const player = playerForEvent(event, matchesById, lookups);
    if (player) {
      const record = stats.get(player.id);
      record.appearances.add(event.match_id);
      if (event.type === "goal" && event.goal_type !== "own_goal") {
        record.goals += 1;
        if (event.goal_type === "penalty") record.penaltyGoals += 1;
      }
      if (event.type === "yellow") record.yellowCards += 1;
      if (event.type === "red") record.redCards += 1;
    }
    if (event.type === "goal" && event.assist) {
      const assistingPlayer = playerForEvent(event, matchesById, lookups, "assist");
      if (assistingPlayer) {
        stats.get(assistingPlayer.id).assists += 1;
        stats.get(assistingPlayer.id).appearances.add(event.match_id);
      }
    }
  });

  completedMatches.forEach((match) => {
    const cleanSheetTeamIds = [];
    if ((Number(match.away_score) || 0) === 0) cleanSheetTeamIds.push(match.home_id);
    if ((Number(match.home_score) || 0) === 0) cleanSheetTeamIds.push(match.away_id);
    cleanSheetTeamIds.forEach((teamId) => {
      lineups
        .filter((lineup) => lineup.match_id === match.id && lineup.team_id === teamId && lineup.role === "starter")
        .forEach((lineup) => {
          const record = stats.get(lineup.player_id);
          if (record?.positionGroup === "goalkeeper") record.cleanSheets += 1;
        });
    });
  });

  return [...stats.values()].map((record) => ({ ...record, appearances: record.appearances.size }));
}

function buildCompetitionTeamStats(teamsById, matches, events, statistics) {
  const startedStatuses = new Set(["live", "ht", "et_live", "et_ht", "ft"]);
  const startedMatches = matches.filter((match) => startedStatuses.has(match.status));
  const matchesById = new Map(matches.map((match) => [match.id, match]));
  const records = new Map(Object.values(teamsById).map((team) => [team.id, {
    id: team.id,
    name: team.name,
    short: team.short,
    color: team.color,
    logoUrl: team.logoUrl,
    played: 0,
    goals: 0,
    conceded: 0,
    cleanSheets: 0,
    penaltyGoals: 0,
    setPieceGoals: 0,
    yellowCards: 0,
    redCards: 0,
    possession: 0,
    shots: 0,
    shotsOnTarget: 0,
    corners: 0,
    fouls: 0,
    statMatches: 0,
  }]));

  startedMatches.forEach((match) => {
    const home = records.get(match.home_id);
    const away = records.get(match.away_id);
    if (!home || !away) return;
    const homeScore = Number(match.home_score) || 0;
    const awayScore = Number(match.away_score) || 0;
    home.played += 1;
    away.played += 1;
    home.goals += homeScore;
    home.conceded += awayScore;
    away.goals += awayScore;
    away.conceded += homeScore;
    if (match.status === "ft" && awayScore === 0) home.cleanSheets += 1;
    if (match.status === "ft" && homeScore === 0) away.cleanSheets += 1;
  });

  events.forEach((event) => {
    const match = matchesById.get(event.match_id);
    if (!match || !startedStatuses.has(match.status)) return;
    const teamId = event.side === "home" ? match.home_id : match.away_id;
    const record = records.get(teamId);
    if (!record) return;
    if (event.type === "goal" && event.goal_type === "penalty") record.penaltyGoals += 1;
    if (event.type === "goal" && ["penalty", "free_kick"].includes(event.goal_type)) record.setPieceGoals += 1;
    if (event.type === "yellow") record.yellowCards += 1;
    if (event.type === "red") record.redCards += 1;
  });

  statistics.forEach((statistic) => {
    const match = matchesById.get(statistic.match_id);
    if (!match || !startedStatuses.has(match.status)) return;
    [[match.home_id, "home"], [match.away_id, "away"]].forEach(([teamId, prefix]) => {
      const record = records.get(teamId);
      if (!record) return;
      record.statMatches += 1;
      record.possession += Number(statistic[`${prefix}_possession`]) || 0;
      record.shots += Number(statistic[`${prefix}_total_shots`]) || 0;
      record.shotsOnTarget += Number(statistic[`${prefix}_shots_on_target`]) || 0;
      record.corners += Number(statistic[`${prefix}_corners`]) || 0;
      record.fouls += Number(statistic[`${prefix}_fouls`]) || 0;
    });
  });

  return [...records.values()].map((record) => {
    const played = record.played || 0;
    const statMatches = record.statMatches || 0;
    return {
      ...record,
      goalsPerMatch: played ? Number((record.goals / played).toFixed(2)) : 0,
      concededPerMatch: played ? Number((record.conceded / played).toFixed(2)) : 0,
      averagePossession: statMatches ? Number((record.possession / statMatches).toFixed(1)) : 0,
      shotsPerMatch: statMatches ? Number((record.shots / statMatches).toFixed(1)) : 0,
      shotsOnTargetPerMatch: statMatches ? Number((record.shotsOnTarget / statMatches).toFixed(1)) : 0,
      cornersPerMatch: statMatches ? Number((record.corners / statMatches).toFixed(1)) : 0,
      foulsPerMatch: statMatches ? Number((record.fouls / statMatches).toFixed(1)) : 0,
    };
  });
}

function buildTeamOfWeek(matches, events, lineups, players, teamsById) {
  const completed = matches.filter((match) => match.status === "ft");
  const lookups = buildPlayerLookups(players);
  const matchesById = new Map(matches.map((match) => [match.id, match]));
  const rounds = new Map();
  completed.forEach((match) => {
    const label = match.match_round?.trim() || "Completed matches";
    const entry = rounds.get(label) || { label, matches: [], sort: `${match.match_date || "9999-99-99"}T${match.kickoff || "00:00"}` };
    entry.matches.push(match);
    rounds.set(label, entry);
  });

  return [...rounds.values()].sort((left, right) => left.sort.localeCompare(right.sort)).map((round) => {
    const matchIds = new Set(round.matches.map((match) => match.id));
    const performance = new Map();
    const getPerformance = (player) => {
      if (!player) return null;
      if (!performance.has(player.id)) performance.set(player.id, {
        id: player.id,
        teamId: player.team_id,
        name: player.display_name?.trim() || player.name,
        positionGroup: playerPositionGroup(player.position),
        photoUrl: player.photo_url || null,
        team: teamsById[player.team_id] || null,
        rating: 6.5,
      });
      return performance.get(player.id);
    };

    lineups.filter((lineup) => matchIds.has(lineup.match_id) && lineup.role === "starter").forEach((lineup) => {
      const record = getPerformance(lookups.byId.get(lineup.player_id));
      if (record) record.rating += 0.2;
    });
    events.filter((event) => matchIds.has(event.match_id)).forEach((event) => {
      const record = getPerformance(playerForEvent(event, matchesById, lookups));
      if (record) {
        if (event.type === "goal" && event.goal_type !== "own_goal") record.rating += 1.4;
        if (event.type === "yellow") record.rating -= 0.3;
        if (event.type === "red") record.rating -= 1.2;
      }
      if (event.type === "goal" && event.assist) {
        const assistingRecord = getPerformance(playerForEvent(event, matchesById, lookups, "assist"));
        if (assistingRecord) assistingRecord.rating += 0.9;
      }
    });
    round.matches.forEach((match) => {
      const homeScore = Number(match.home_score) || 0;
      const awayScore = Number(match.away_score) || 0;
      lineups.filter((lineup) => lineup.match_id === match.id && lineup.role === "starter").forEach((lineup) => {
        const record = getPerformance(lookups.byId.get(lineup.player_id));
        if (!record) return;
        const teamWon = (lineup.team_id === match.home_id && homeScore > awayScore) || (lineup.team_id === match.away_id && awayScore > homeScore);
        const teamDrew = homeScore === awayScore;
        const cleanSheet = (lineup.team_id === match.home_id && awayScore === 0) || (lineup.team_id === match.away_id && homeScore === 0);
        if (teamWon) record.rating += 0.3;
        else if (teamDrew) record.rating += 0.1;
        if (cleanSheet && record.positionGroup === "goalkeeper") record.rating += 0.8;
        if (cleanSheet && record.positionGroup === "defender") record.rating += 0.5;
      });
    });

    const available = [...performance.values()]
      .map((record) => ({ ...record, rating: Math.max(4, Math.min(10, Number(record.rating.toFixed(1)))) }))
      .sort((left, right) => right.rating - left.rating || left.name.localeCompare(right.name));
    const selected = [];
    const take = (group, count) => available.filter((player) => player.positionGroup === group && !selected.some((item) => item.id === player.id)).slice(0, count).forEach((player) => selected.push(player));
    take("goalkeeper", 1);
    take("defender", 4);
    take("midfielder", 4);
    take("forward", 2);
    available.filter((player) => !selected.some((item) => item.id === player.id)).slice(0, Math.max(0, 11 - selected.length)).forEach((player) => selected.push(player));
    return { label: round.label, players: selected.slice(0, 11) };
  });
}

export async function getLeagueCentre(competitionId) {
  if (!supabase || !competitionId) return null;
  const [competitionResult, matchResult, membershipResult] = await Promise.all([
    supabase.from("competitions").select("*").eq("id", competitionId).maybeSingle(),
    supabase.from("matches").select("*").eq("competition_id", competitionId).order("match_date").order("kickoff").order("created_at"),
    supabase.from("competition_teams").select("team_id").eq("competition_id", competitionId),
  ]);
  const competition = throwOnError(competitionResult);
  if (!competition || competition.competition_type !== "league") return null;
  const matches = throwOnError(matchResult) || [];
  const memberships = membershipResult.error ? [] : membershipResult.data || [];
  const teamIds = [...new Set([
    ...memberships.map((entry) => entry.team_id),
    ...matches.flatMap((match) => [match.home_id, match.away_id]),
  ].filter(Boolean))];
  const teams = teamIds.length
    ? throwOnError(await supabase.from("teams").select("*").in("id", teamIds)) || []
    : [];
  const teamsById = Object.fromEntries(teams.map((team) => [team.id, publicTeam(team)]));
  const matchIds = matches.map((match) => match.id);
  let siblingQuery = supabase.from("competitions").select("*").eq("name", competition.name).eq("competition_type", "league").order("created_at", { ascending: false });
  if (competition.organization_id) siblingQuery = siblingQuery.eq("organization_id", competition.organization_id);
  const [table, eventResult, statisticResult, lineupResult, playerResult, siblingResult] = await Promise.all([
    buildCompetitionTable(competitionId),
    matchIds.length ? supabase.from("events").select("id,match_id,type,side,player_id,player,assist,goal_type,card_type").in("match_id", matchIds) : Promise.resolve({ data: [], error: null }),
    matchIds.length ? supabase.from("match_statistics").select("*").in("match_id", matchIds) : Promise.resolve({ data: [], error: null }),
    matchIds.length ? supabase.from("match_lineups").select("match_id,team_id,player_id,role,slot_index").in("match_id", matchIds) : Promise.resolve({ data: [], error: null }),
    teamIds.length ? supabase.from("players").select("id,team_id,name,display_name,position,photo_url,number").in("team_id", teamIds) : Promise.resolve({ data: [], error: null }),
    siblingQuery,
  ]);
  const events = throwOnError(eventResult) || [];
  const statistics = throwOnError(statisticResult) || [];
  const lineups = throwOnError(lineupResult) || [];
  const players = throwOnError(playerResult) || [];
  const siblingCompetitions = siblingResult.error ? [competition] : siblingResult.data || [competition];
  const siblingIds = siblingCompetitions.map((item) => item.id);
  const seasonMatchesResult = siblingIds.length
    ? await supabase.from("matches").select("competition_id,status").in("competition_id", siblingIds)
    : { data: [], error: null };
  const seasonMatches = seasonMatchesResult.error ? [] : seasonMatchesResult.data || [];
  const seasonTables = await Promise.all(siblingCompetitions.map((item) => item.id === competitionId ? Promise.resolve(table) : buildCompetitionTable(item.id)));
  const seasons = siblingCompetitions.map((item, index) => {
    const itemMatches = seasonMatches.filter((match) => match.competition_id === item.id);
    const itemTable = seasonTables[index] || [];
    const completed = itemMatches.length > 0 && itemMatches.every((match) => ["ft", "cancelled"].includes(match.status));
    return {
      id: item.id,
      label: item.sub || "Season",
      current: item.id === competitionId,
      completed,
      winner: itemTable[0] || null,
      runnerUp: itemTable[1] || null,
    };
  });
  const playerStats = buildCompetitionPlayerStats(players, matches, events, lineups, teamsById);
  const teamStats = buildCompetitionTeamStats(teamsById, matches, events, statistics);
  const teamOfWeek = buildTeamOfWeek(matches, events, lineups, players, teamsById);
  return {
    competition: {
      id: competition.id,
      name: competition.name,
      sub: competition.sub || null,
      country: competition.country || "Ghana",
      logoUrl: competition.logo_url || null,
      themeColor: competition.theme_color || "#4B125F",
      competitionType: competition.competition_type || "league",
    },
    teams: teamsById,
    matches: matches.map((match) => shapeMatch(match, [], competition)),
    table,
    playerStats,
    teamStats,
    teamOfWeek,
    seasons,
  };
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

async function buildCompetitionTable(competitionId, requestedGroupNumber = null, teamId = null) {
  const competition = throwOnError(await supabase.from("competitions").select("id,competition_type").eq("id", competitionId).maybeSingle());
  const format = competition?.competition_type || "tournament";
  const memberships = throwOnError(await supabase
    .from("competition_teams")
    .select("team_id,group_number")
    .eq("competition_id", competitionId)) || [];
  let groupNumber = requestedGroupNumber ? Number(requestedGroupNumber) : null;
  if (format === "tournament" && !groupNumber && teamId) {
    groupNumber = Number(memberships.find((entry) => entry.team_id === teamId)?.group_number || 0) || null;
  }
  const eligibleMemberships = format === "tournament" && groupNumber
    ? memberships.filter((entry) => Number(entry.group_number) === groupNumber)
    : memberships;
  let matchQuery = supabase.from("matches")
    .select("id,home_id,away_id,status,home_score,away_score,group_number,match_date,kickoff,created_at")
    .eq("competition_id", competitionId)
    .order("match_date", { ascending: true, nullsFirst: true })
    .order("kickoff", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });
  if (format === "tournament" && groupNumber) matchQuery = matchQuery.eq("group_number", groupNumber);
  const matches = throwOnError(await matchQuery) || [];
  let teamIds = [...new Set(eligibleMemberships.map((entry) => entry.team_id).filter(Boolean))];
  if (!teamIds.length) teamIds = [...new Set(matches.flatMap((match) => [match.home_id, match.away_id]).filter(Boolean))];
  if (!teamIds.length) return [];
  const teams = throwOnError(await supabase.from("teams").select("id,name,display_name,short,color,logo_url").in("id", teamIds)) || [];
  const rows = {};
  teams.forEach((team) => {
    rows[team.id] = {
      id: team.id,
      name: team.display_name?.trim() || team.name,
      short: team.short,
      color: team.color,
      logoUrl: team.logo_url || null,
      overallRecord: emptyTableRecord(),
      homeRecord: emptyTableRecord(),
      awayRecord: emptyTableRecord(),
    };
  });
  matches.filter((match) => ["live", "ht", "et_live", "et_ht", "ft"].includes(match.status)).forEach((match) => {
    const home = rows[match.home_id];
    const away = rows[match.away_id];
    if (!home || !away) return;
    const homeScore = Number(match.home_score) || 0;
    const awayScore = Number(match.away_score) || 0;
    const includeInForm = match.status === "ft";
    applyTableResult(home.overallRecord, homeScore, awayScore, includeInForm);
    applyTableResult(home.homeRecord, homeScore, awayScore, includeInForm);
    applyTableResult(away.overallRecord, awayScore, homeScore, includeInForm);
    applyTableResult(away.awayRecord, awayScore, homeScore, includeInForm);
  });
  return Object.values(rows)
    .map((row) => ({
      id: row.id,
      name: row.name,
      short: row.short,
      color: row.color,
      logoUrl: row.logoUrl,
      ...row.overallRecord,
      homeRecord: row.homeRecord,
      awayRecord: row.awayRecord,
    }))
    .sort(tableRecordSort);
}

function emptyTableRecord() {
  return { pl: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
}

function applyTableResult(record, goalsFor, goalsAgainst, includeInForm) {
  record.pl += 1;
  record.gf += goalsFor;
  record.ga += goalsAgainst;
  if (goalsFor > goalsAgainst) {
    record.w += 1;
    record.pts += 3;
    if (includeInForm) record.form.push("W");
  } else if (goalsFor < goalsAgainst) {
    record.l += 1;
    if (includeInForm) record.form.push("L");
  } else {
    record.d += 1;
    record.pts += 1;
    if (includeInForm) record.form.push("D");
  }
}

function tableRecordSort(a, b) {
  return b.pts - a.pts
    || (b.gf - b.ga) - (a.gf - a.ga)
    || b.gf - a.gf
    || a.name.localeCompare(b.name);
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
  const table = tableCompetition ? await buildCompetitionTable(tableCompetition.id, null, teamId) : [];

  return {
    team: publicTeam(team),
    teams: teamsById,
    matches: shapedMatches,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      displayName: player.display_name?.trim() || null,
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
    supabase.from("organization_members").select("organization_id,role,active").eq("user_id", userId).eq("active", true),
  ]);
  const memberships = throwOnError(membershipResult) || [];
  const organizationIds = memberships.map((membership) => membership.organization_id).filter(Boolean);
  let organizations = [];
  if (organizationIds.length) {
    const organizationResult = await supabase.from("organizations").select("id,name,slug").in("id", organizationIds);
    if (!organizationResult.error) organizations = organizationResult.data || [];
  }
  const organizationsById = Object.fromEntries(organizations.map((organization) => [organization.id, organization]));
  return {
    profile: profileResult.error ? null : profileResult.data,
    memberships: memberships.map((membership) => ({
      ...membership,
      organization: organizationsById[membership.organization_id] || null,
    })),
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

export async function listCompetitionTeams(competitionId) {
  if (!competitionId) return [];
  return throwOnError(await supabase
    .from("competition_teams")
    .select("competition_id,team_id,group_number,team:team_id(id,name,display_name,short,color,logo_url)")
    .eq("competition_id", competitionId)
    .order("group_number", { ascending: true, nullsFirst: true })) || [];
}

export async function listMatches(organizationId, role, userId) {
  let allowedIds = null;
  if (role === "scorer" && userId) {
    const assignments = throwOnError(await supabase.from("match_scorers").select("match_id").eq("user_id", userId)) || [];
    allowedIds = assignments.map((row) => row.match_id);
    if (!allowedIds.length) return [];
  }
  let query = supabase.from("matches").select("*, competition:competition_id(id,name,sub,competition_type), home:home_id(name,display_name,short,color,logo_url), away:away_id(name,display_name,short,color,logo_url)").order("match_date", { ascending: true }).order("kickoff", { ascending: true }).order("created_at", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);
  if (allowedIds) query = query.in("id", allowedIds);
  return throwOnError(await query) || [];
}

export const addTeam = (organization_id, name, display_name, short, color) =>
  supabase.from("teams")
    .insert({ organization_id, name, display_name: display_name?.trim() || null, short, color })
    .select("*")
    .single();

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

function competitionIdentity(details = {}) {
  const themeColor = /^#[0-9a-f]{6}$/i.test(details.themeColor || "") ? details.themeColor : "#4B125F";
  return {
    country: details.country?.trim() || "Ghana",
    logo_url: details.logoUrl?.trim() || null,
    theme_color: themeColor.toUpperCase(),
  };
}

export const addCompetition = (organization_id, name, sub, match_duration_minutes = 90, competition_type = "tournament", group_count = 0, teams_per_group = 0, details = {}) =>
  supabase.from("competitions").insert({ organization_id, name, sub, match_duration_minutes, competition_type, group_count, teams_per_group, ...competitionIdentity(details) });

export const updateCompetition = (id, name, sub, match_duration_minutes, competition_type, group_count, teams_per_group, details = {}) =>
  supabase.from("competitions").update({ name, sub: sub?.trim() || null, match_duration_minutes, competition_type, group_count, teams_per_group, ...competitionIdentity(details) }).eq("id", id);

export const deleteCompetition = (id) => supabase.from("competitions").delete().eq("id", id);

export const setCompetitionTeam = (competition_id, team_id, group_number = null) =>
  supabase.from("competition_teams").upsert({ competition_id, team_id, group_number }, { onConflict: "competition_id,team_id" });

export const removeCompetitionTeam = (competition_id, team_id) =>
  supabase.from("competition_teams").delete().eq("competition_id", competition_id).eq("team_id", team_id);

export const createMatch = (organization_id, competition_id, home_id, away_id, kickoff, match_date, group_number = null, details = {}) =>
  supabase.from("matches").insert({
    organization_id,
    competition_id,
    home_id,
    away_id,
    kickoff,
    match_date,
    group_number,
    status: "scheduled",
    match_round: details.round?.trim() || null,
    venue_name: details.venueName?.trim() || null,
    venue_location: details.venueLocation?.trim() || null,
    venue_capacity: details.venueCapacity ? Number(details.venueCapacity) : null,
    venue_surface: details.venueSurface?.trim() || null,
    weather: details.weather?.trim() || null,
    referee_name: details.refereeName?.trim() || null,
  });

export const updateMatchPreviewDetails = (id, details) =>
  supabase.from("matches").update({
    match_round: details.round?.trim() || null,
    venue_name: details.venueName?.trim() || null,
    venue_location: details.venueLocation?.trim() || null,
    venue_capacity: details.venueCapacity ? Number(details.venueCapacity) : null,
    venue_surface: details.venueSurface?.trim() || null,
    weather: details.weather?.trim() || null,
    referee_name: details.refereeName?.trim() || null,
  }).eq("id", id).select("*").single();

export const updateScheduledMatch = (id, values) =>
  supabase.from("matches").update({
    competition_id: values.competitionId,
    home_id: values.homeId,
    away_id: values.awayId,
    kickoff: values.kickoff,
    match_date: values.matchDate,
    group_number: values.groupNumber ? Number(values.groupNumber) : null,
    match_round: values.round?.trim() || null,
    venue_name: values.venueName?.trim() || null,
    venue_location: values.venueLocation?.trim() || null,
    venue_capacity: values.venueCapacity ? Number(values.venueCapacity) : null,
    venue_surface: values.venueSurface?.trim() || null,
    weather: values.weather?.trim() || null,
    referee_name: values.refereeName?.trim() || null,
  }).eq("id", id).eq("status", "scheduled").select("*").single();

export const deleteScheduledMatch = (id) =>
  supabase.from("matches").delete().eq("id", id).eq("status", "scheduled");

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

export const startMatchWithKits = (matchId, homeKitColor, awayKitColor) =>
  supabase.rpc("start_match_with_kits", {
    p_match_id: matchId,
    p_home_kit_color: homeKitColor,
    p_away_kit_color: awayKitColor,
  });

export const startRetrospectiveMatch = (matchId, homeKitColor, awayKitColor) =>
  supabase.rpc("start_retrospective_match", {
    p_match_id: matchId,
    p_home_kit_color: homeKitColor,
    p_away_kit_color: awayKitColor,
  });

export const transitionRetrospectiveMatch = (matchId, status) =>
  supabase.rpc("transition_retrospective_match", {
    p_match_id: matchId,
    p_status: status,
  });

export const enableRetrospectiveRecording = (matchId) =>
  supabase.rpc("enable_retrospective_recording", { p_match_id: matchId });

export const setStatus = transitionMatchStatus;

export const reopenMatch = (matchId, reason) =>
  supabase.rpc("reopen_match", { p_match_id: matchId, p_reason: reason });

export const setMatchStoppageTime = (matchId, minutes) =>
  supabase.rpc("set_match_stoppage_time", { p_match_id: matchId, p_minutes: minutes });

export const recordMatchEvent = (matchId, event) => {
  const timing = event.timing;
  if (timing) {
    return supabase.rpc("record_match_event_at", {
      p_match_id: matchId,
      p_type: event.type,
      p_side: event.side,
      p_player_id: event.player_id || null,
      p_player: event.player || null,
      p_assist: event.assist || null,
      p_goal_type: event.type === "goal" ? (event.goal_type || "normal_goal") : null,
      p_card_type: event.card_type || null,
      p_card_reason: event.card_reason || null,
      p_recipient_type: event.recipient_type || null,
      p_display_minute: timing.displayMinute,
      p_elapsed_seconds: timing.elapsedSeconds,
      p_period: timing.period,
    });
  }
  return supabase.rpc("record_match_event", {
    p_match_id: matchId,
    p_type: event.type,
    p_side: event.side,
    p_player_id: event.player_id || null,
    p_player: event.player || null,
    p_assist: event.assist || null,
    p_goal_type: event.type === "goal" ? (event.goal_type || "normal_goal") : null,
    p_card_type: event.card_type || null,
    p_card_reason: event.card_reason || null,
    p_recipient_type: event.recipient_type || null,
  });
};

export const attributeMatchGoal = (eventId, details = {}) =>
  supabase.rpc("attribute_match_goal", {
    p_event_id: eventId,
    p_player_id: details.player_id || null,
    p_assist_id: details.assist_id || null,
    p_goal_type: details.goal_type || "normal_goal",
  });

export const deleteMatchEvent = (eventId) =>
  supabase.rpc("delete_match_event", { p_event_id: eventId });

export async function getMatchRaw(id) {
  return throwOnError(await supabase.from("matches").select("*, competition:competition_id(*)").eq("id", id).maybeSingle());
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

export async function getMatchLineups(matchId) {
  if (!supabase) return {};
  return shapeMatchLineups(throwOnError(await matchLineupQuery(matchId)) || []);
}

export async function saveMatchLineup(matchId, teamId, lineup) {
  const starters = [];
  const starterSlots = [];
  (lineup.starters || []).forEach((playerId, slotIndex) => {
    if (!playerId) return;
    starters.push(playerId);
    starterSlots.push(slotIndex);
  });
  const result = await supabase.rpc("save_match_lineup_positions", {
    p_match_id: matchId,
    p_team_id: teamId,
    p_formation: lineup.formation || null,
    p_starters: starters,
    p_starter_slots: starterSlots,
    p_substitutes: lineup.substitutes || [],
  });
  if (!result.error) matchReadCache.delete(matchId);
  return result;
}

// ---------- players (squads) ----------
export async function listPlayers(teamId) {
  return throwOnError(await supabase.from("players").select("*").eq("team_id", teamId).order("number", { nullsFirst: false })) || [];
}

export const addPlayer = (team_id, name, number, position, details = {}) =>
  supabase.from("players").insert({
    team_id,
    name,
    display_name: details.display_name?.trim() || null,
    number: number || null,
    position: position || null,
    country: details.country?.trim() || "Ghana",
    date_of_birth: details.date_of_birth || null,
    photo_url: details.photo_url || null,
  });

export const updatePlayer = (id, values) => supabase.from("players").update({
  name: values.name,
  display_name: values.display_name?.trim() || null,
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
