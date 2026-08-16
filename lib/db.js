"use client";
import { supabase } from "@/lib/supabase";
import { COMPETITIONS as SAMPLE_COMPS, TEAMS as SAMPLE_TEAMS, findMatch, detail as sampleDetail } from "@/lib/data";

// ---------- clock ----------
export function clockSeconds(m) {
  const base = m.elapsed_seconds || 0;
  if (m.clock_running && m.clock_started_at) {
    return base + Math.floor((Date.now() - new Date(m.clock_started_at).getTime()) / 1000);
  }
  return base;
}
export function footballMinute(seconds) { return Math.max(1, Math.ceil(seconds / 60)); }
export function fmtClock(seconds) {
  const s = Math.max(0, seconds | 0);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}
// legacy helper used by home list — now returns the football minute
export function liveMinute(m) {
  if (m.status === "ht") return 45;
  if (m.status === "ft") return footballMinute(m.elapsed_seconds || 0);
  if (m.status === "live") return footballMinute(clockSeconds(m));
  return 0;
}
const goals = (events, side) => (events || []).filter((e) => e.type === "goal" && e.side === side).length;

// ---------- READS ----------
// Returns { competitions:[{id,name,sub,flag,matches:[...]}], teams:{ shortOrId:{name,short,color} } }
export async function getHome() {
  if (!supabase) return { competitions: SAMPLE_COMPS, teams: SAMPLE_TEAMS, sample: true };
  const [{ data: comps }, { data: teams }, { data: matches }, { data: events }] = await Promise.all([
    supabase.from("competitions").select("*").order("created_at"),
    supabase.from("teams").select("*").order("name"),
    supabase.from("matches").select("*").order("created_at"),
    supabase.from("events").select("match_id,type,side"),
  ]);
  const teamsById = {};
  (teams || []).forEach((t) => { teamsById[t.id] = { name: t.display_name || t.name, fullName: t.name, short: t.short, color: t.color }; });
  const evByMatch = {};
  (events || []).forEach((e) => { (evByMatch[e.match_id] ||= []).push(e); });
  const competitions = (comps || []).map((c) => ({
    id: c.id, name: c.name, sub: c.sub, format: c.format, flag: "🏆",
    matches: (matches || []).filter((m) => m.competition_id === c.id).map((m) => shapeMatch(m, teamsById, evByMatch[m.id])),
  })).filter((c) => c.matches.length);
  // matches with no competition
  const orphan = (matches || []).filter((m) => !m.competition_id);
  if (orphan.length) competitions.push({ id: "_none", name: "Other matches", sub: null, flag: "🌍", matches: orphan.map((m) => shapeMatch(m, teamsById, evByMatch[m.id])) });
  return { competitions, teams: teamsById };
}
function shapeMatch(m, teamsById, events) {
  return {
    id: m.id, home: m.home_id, away: m.away_id, status: m.status,
    min: liveMinute(m), hs: goals(events, "home"), as: goals(events, "away"), time: m.kickoff,
  };
}

// Returns { match, teams, detail:{events} }
export async function getMatch(id) {
  if (!supabase) {
    const m = findMatch(id);
    return { match: m, teams: SAMPLE_TEAMS, detail: sampleDetail(id), sample: true };
  }
  const { data: m } = await supabase.from("matches").select("*, competition:competition_id(format,name,sub)").eq("id", id).single();
  if (!m) return { match: null };
  const [{ data: teams }, { data: events }] = await Promise.all([
    supabase.from("teams").select("*"),
    supabase.from("events").select("*").eq("match_id", id).order("minute"),
  ]);
  const teamsById = {};
  (teams || []).forEach((t) => { teamsById[t.id] = { name: t.display_name || t.name, fullName: t.name, short: t.short, color: t.color }; });
  const shaped = shapeMatch(m, teamsById, events);
  shaped.compName = "Match";
  shaped.current_period = m.current_period;
  shaped.elapsed_seconds = m.elapsed_seconds;
  shaped.clock_running = m.clock_running;
  shaped.clock_started_at = m.clock_started_at;
  shaped.locked_at = m.locked_at;
  shaped.competition_id = m.competition_id;
  shaped.format = m.competition?.format || null;
  shaped.compName = m.competition?.name || "Match";
  shaped.compSub = m.competition?.sub || null;
  const sorted = [...(events || [])].sort((a, b) => (a.minute || 0) - (b.minute || 0));
  const evs = sorted.map((e) => ({
    m: e.minute, min: `${e.minute}'`, type: e.type, side: e.side, player: e.player, assist: e.assist,
    isPenalty: e.is_penalty, isOwnGoal: e.is_own_goal,
    score: e.type === "goal"
      ? (e.score_home_after != null ? `${e.score_home_after} - ${e.score_away_after}` : runScoreAt(sorted, e))
      : undefined,
    scored: e.type === "goal" ? e.side : undefined,
  }));
  const detail = { events: evs };
  if (m.referee || m.venue) detail.info = { referee: m.referee, venue: m.venue };
  return { match: shaped, teams: teamsById, detail };
}
function runScoreAt(events, upto) {
  let h = 0, a = 0;
  for (const e of events) {
    if (e.type === "goal") { if (e.side === "home") h++; else a++; }
    if (e.id === upto.id) break;
  }
  return `${h} - ${a}`;
}

// ---------- MUTATIONS (admin/scorer) ----------
export async function listTeams() { const { data } = await supabase.from("teams").select("*").order("name"); return data || []; }
export async function listCompetitions() { const { data } = await supabase.from("competitions").select("*").order("created_at"); return data || []; }
export async function listMatches() {
  const { data } = await supabase.from("matches").select("*, home:home_id(name,short,color), away:away_id(name,short,color)").order("created_at", { ascending: false });
  return data || [];
}
export const addTeam = (name, short, color, display_name) => supabase.from("teams").insert({ name, short, color, display_name: display_name || null });
export const addCompetition = (name, sub, format) => supabase.from("competitions").insert({ name, sub, format: format || "tournament" });
export const createMatch = (competition_id, home_id, away_id, kickoff) =>
  supabase.from("matches").insert({ competition_id, home_id, away_id, kickoff, status: "scheduled" });
export const addEvent = (match_id, e) => supabase.from("events").insert({ match_id, ...e });
export const deleteEvent = (id) => supabase.from("events").delete().eq("id", id);
export async function getMatchRaw(id) { const { data } = await supabase.from("matches").select("*").eq("id", id).single(); return data; }
export async function getEvents(id) { const { data } = await supabase.from("events").select("*").eq("match_id", id).order("minute"); return data || []; }

// ---------- clock lifecycle ----------
export const kickOff = (id) => supabase.from("matches").update({ status: "live", current_period: "first", elapsed_seconds: 0, clock_started_at: new Date().toISOString(), clock_running: true, locked_at: null }).eq("id", id);
export const halfTime = (id, elapsed) => supabase.from("matches").update({ status: "ht", current_period: "ht", clock_running: false, elapsed_seconds: elapsed, clock_started_at: null }).eq("id", id);
export const secondHalf = (id) => supabase.from("matches").update({ status: "live", current_period: "second", clock_started_at: new Date().toISOString(), clock_running: true }).eq("id", id);
export const fullTime = (id, elapsed) => supabase.from("matches").update({ status: "ft", current_period: "ft", clock_running: false, elapsed_seconds: elapsed, clock_started_at: null, locked_at: new Date().toISOString() }).eq("id", id);
export const startExtraTime = (id) => supabase.from("matches").update({ status: "live", current_period: "et", clock_started_at: new Date().toISOString(), clock_running: true, locked_at: null }).eq("id", id);
export const resetMatch = (id) => supabase.from("matches").update({ status: "scheduled", current_period: "pre", elapsed_seconds: 0, clock_started_at: null, clock_running: false, locked_at: null }).eq("id", id);
export async function reopenMatch(id, reason, by) {
  await supabase.from("audit_logs").insert({ action: "reopen", match_id: id, reason, by: by || null });
  return supabase.from("matches").update({ status: "live", clock_running: false, locked_at: null, reopened_at: new Date().toISOString(), reopened_by: by || null }).eq("id", id);
}
export const setMatchDetails = (id, patch) => supabase.from("matches").update(patch).eq("id", id);

// distinct minute: if an event already carries this football minute, step to the next free one
function nextMinute(events, seconds) {
  let minute = footballMinute(seconds);
  const used = new Set(events.map((e) => e.minute));
  while (used.has(minute)) minute++;
  return minute;
}
// atomic goal — everything committed in one insert
export async function recordGoal(id, side, events, seconds, opts, by) {
  const minute = nextMinute(events, seconds);
  const h = events.filter((e) => e.type === "goal" && e.side === "home").length + (side === "home" ? 1 : 0);
  const a = events.filter((e) => e.type === "goal" && e.side === "away").length + (side === "away" ? 1 : 0);
  return supabase.from("events").insert({
    match_id: id, type: "goal", side, minute, elapsed_seconds: seconds,
    player: opts.player || null, player_id: opts.playerId || null, assist: opts.assist || null,
    is_penalty: !!opts.isPenalty, is_own_goal: !!opts.isOwnGoal,
    score_home_after: h, score_away_after: a, recorded_by: by || null,
  });
}
export async function recordCard(id, side, type, events, seconds, opts, by) {
  const minute = nextMinute(events, seconds);
  return supabase.from("events").insert({ match_id: id, type, side, minute, elapsed_seconds: seconds, player: opts.player || null, player_id: opts.playerId || null, recorded_by: by || null });
}
export async function recordSub(id, side, events, seconds, on, off, by) {
  const minute = nextMinute(events, seconds);
  return supabase.from("events").insert({ match_id: id, type: "sub", side, minute, elapsed_seconds: seconds, player: on, assist: off, recorded_by: by || null });
}

// ---------- players (squads) ----------
export async function listPlayers(teamId) {
  const { data } = await supabase.from("players").select("*").eq("team_id", teamId).order("number", { nullsFirst: false });
  return data || [];
}
export const addPlayer = (team_id, name, number, position) =>
  supabase.from("players").insert({ team_id, name, number: number || null, position: position || null });
export const deletePlayer = (id) => supabase.from("players").delete().eq("id", id);

// update an event (e.g. attribute a scorer after the goal is recorded)
export const updateEvent = (id, patch) => supabase.from("events").update(patch).eq("id", id);

// ---------- standings ----------
// Compute a league/group table from finished matches in a competition.
export async function getStandings(competitionId) {
  if (!supabase || !competitionId) return null;
  const [{ data: comp }, { data: teams }, { data: matches }] = await Promise.all([
    supabase.from("competitions").select("*").eq("id", competitionId).single(),
    supabase.from("teams").select("*"),
    supabase.from("matches").select("*").eq("competition_id", competitionId),
  ]);
  if (!comp || comp.format === "friendly") return { format: comp?.format || "friendly", rows: [] };
  const ids = (matches || []).map((m) => m.id);
  let events = [];
  if (ids.length) { const { data: ev } = await supabase.from("events").select("match_id,type,side").in("match_id", ids); events = ev || []; }
  const goalsFor = (mid, side) => events.filter((e) => e.match_id === mid && e.type === "goal" && e.side === side).length;

  const table = {};
  const ensure = (tid) => (table[tid] ||= { id: tid, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, PTS: 0 });
  (matches || []).filter((m) => m.status === "ft").forEach((m) => {
    if (!m.home_id || !m.away_id) return;
    const hg = goalsFor(m.id, "home"), ag = goalsFor(m.id, "away");
    const H = ensure(m.home_id), A = ensure(m.away_id);
    H.P++; A.P++; H.GF += hg; H.GA += ag; A.GF += ag; A.GA += hg;
    if (hg > ag) { H.W++; H.PTS += 3; A.L++; }
    else if (hg < ag) { A.W++; A.PTS += 3; H.L++; }
    else { H.D++; A.D++; H.PTS++; A.PTS++; }
  });
  const tmap = {}; (teams || []).forEach((t) => (tmap[t.id] = t));
  const rows = Object.values(table).map((r) => {
    const t = tmap[r.id] || {};
    return { ...r, GD: r.GF - r.GA, name: t.display_name || t.name || "?", short: t.short || "?", color: t.color || "#555" };
  }).sort((a, b) => b.PTS - a.PTS || b.GD - a.GD || b.GF - a.GF || a.name.localeCompare(b.name));
  return { format: comp.format, name: comp.name, sub: comp.sub, rows };
}
