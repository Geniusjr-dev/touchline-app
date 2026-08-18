"use client";
import { supabase } from "@/lib/supabase";
import { COMPETITIONS as SAMPLE_COMPS, TEAMS as SAMPLE_TEAMS, findMatch, detail as sampleDetail } from "@/lib/data";

// ---------- helpers ----------
export function liveMinute(m) {
  if (m.status === "ht") return 45;
  if (m.status === "ft") return 90;
  if (m.status === "live" && m.clock_started_at) {
    const base = m.clock_base || 0;
    return base + Math.floor((Date.now() - new Date(m.clock_started_at).getTime()) / 60000);
  }
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
  (teams || []).forEach((t) => { teamsById[t.id] = { name: t.name, short: t.short, color: t.color }; });
  const evByMatch = {};
  (events || []).forEach((e) => { (evByMatch[e.match_id] ||= []).push(e); });
  const competitions = (comps || []).map((c) => ({
    id: c.id, name: c.name, sub: c.sub, flag: "🏆",
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
    // Per-match kit colours (fall back to the team's identity colour when unset)
    homeKit: m.home_kit || teamsById[m.home_id]?.color || null,
    awayKit: m.away_kit || teamsById[m.away_id]?.color || null,
  };
}

// Returns { match, teams, detail:{events} }
export async function getMatch(id) {
  if (!supabase) {
    const m = findMatch(id);
    return { match: m, teams: SAMPLE_TEAMS, detail: sampleDetail(id), sample: true };
  }
  const { data: m } = await supabase.from("matches").select("*").eq("id", id).single();
  if (!m) return { match: null };
  const [{ data: teams }, { data: events }] = await Promise.all([
    supabase.from("teams").select("*"),
    supabase.from("events").select("*").eq("match_id", id).order("minute"),
  ]);
  const teamsById = {};
  (teams || []).forEach((t) => { teamsById[t.id] = { name: t.name, short: t.short, color: t.color }; });
  const shaped = shapeMatch(m, teamsById, events);
  shaped.compName = "Match";
  const evs = (events || []).map((e) => ({
    m: e.minute, min: `${e.minute}'`, type: e.type, side: e.side, player: e.player, assist: e.assist,
    score: e.type === "goal" ? runScoreAt(events, e) : undefined,
    scored: e.type === "goal" ? e.side : undefined,
  }));
  return { match: shaped, teams: teamsById, detail: { events: evs } };
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
export const addTeam = (name, short, color) => supabase.from("teams").insert({ name, short, color });
export const addCompetition = (name, sub) => supabase.from("competitions").insert({ name, sub });
export const createMatch = (competition_id, home_id, away_id, kickoff) =>
  supabase.from("matches").insert({ competition_id, home_id, away_id, kickoff, status: "scheduled" });
export const setKits = (id, home_kit, away_kit) => supabase.from("matches").update({ home_kit, away_kit }).eq("id", id);
export async function setStatus(id, status) {
  const patch = { status };
  if (status === "live") { patch.clock_base = 0; patch.clock_started_at = new Date().toISOString(); }
  if (status === "ft") { patch.clock_started_at = null; }
  return supabase.from("matches").update(patch).eq("id", id);
}
export const addEvent = (match_id, e) => supabase.from("events").insert({ match_id, ...e });
export const deleteEvent = (id) => supabase.from("events").delete().eq("id", id);
export async function getMatchRaw(id) { const { data } = await supabase.from("matches").select("*").eq("id", id).single(); return data; }
export async function getEvents(id) { const { data } = await supabase.from("events").select("*").eq("match_id", id).order("minute"); return data || []; }
