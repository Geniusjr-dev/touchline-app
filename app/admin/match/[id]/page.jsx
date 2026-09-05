"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { readAdminMatch } from "@/lib/matchCache";
import { DEFAULT_FORMATION, FORMATION_OPTIONS, getFormationSlots } from "@/lib/formations";
import { groupPlayersByPosition, playerPositionGroup } from "@/lib/playerPositions";
import { readableTextColor } from "@/lib/teamColors";
import {
  announcedStoppageMinutes,
  attributeMatchGoal,
  deleteMatchEvent,
  EMPTY_MATCH_STATS,
  formatMatchClock,
  getEvents,
  getMatchRaw,
  getMatchLineups,
  getMatchStats,
  listPlayers,
  listTeams,
  recordMatchEvent,
  reopenMatch,
  saveMatchStats,
  saveMatchLineup,
  setMatchStoppageTime,
  enableRetrospectiveRecording,
  startMatchWithKits,
  startRetrospectiveMatch,
  transitionMatchStatus,
  transitionRetrospectiveMatch,
  updateMatchPreviewDetails,
} from "@/lib/db";

const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const GOAL_TYPES = [
  { value: "normal_goal", label: "Normal Goal" },
  { value: "penalty", label: "Penalty Goal" },
  { value: "free_kick", label: "Direct Free-Kick Goal" },
  { value: "own_goal", label: "Own Goal" },
];

const YELLOW_CARD_REASONS = [
  { value: "none", label: "No reason recorded" },
  { value: "foul", label: "Foul" },
  { value: "reckless_challenge", label: "Reckless challenge" },
  { value: "dissent", label: "Dissent" },
  { value: "time_wasting", label: "Time-wasting" },
  { value: "simulation", label: "Simulation" },
  { value: "persistent_fouling", label: "Persistent fouling" },
  { value: "handball", label: "Handball" },
  { value: "stopping_promising_attack", label: "Stopping a promising attack" },
  { value: "delaying_restart", label: "Delaying the restart" },
  { value: "excessive_celebration", label: "Excessive celebration" },
];

const RED_CARD_REASONS = [
  { value: "none", label: "No reason recorded" },
  { value: "violent_conduct", label: "Violent conduct" },
  { value: "serious_foul_play", label: "Serious foul play" },
  { value: "denial_obvious_goal_scoring_opportunity", label: "Denial of an obvious goal-scoring opportunity" },
  { value: "spitting_or_biting", label: "Spitting or biting" },
  { value: "offensive_insulting_abusive_language", label: "Offensive, insulting or abusive language or action" },
];

const CARD_REASON_LABELS = Object.fromEntries(
  [...YELLOW_CARD_REASONS, ...RED_CARD_REASONS].map((reason) => [reason.value, reason.label]),
);

function goalTypeLabel(value) {
  const normalized = value === "direct_goal" ? "normal_goal" : value;
  return GOAL_TYPES.find((item) => item.value === normalized)?.label || "Normal Goal";
}

function normalizeKitColor(color, fallback) {
  const next = String(color || "").trim().toUpperCase();
  return HEX_COLOR.test(next) ? next : fallback;
}

function kitColorDistance(first, second) {
  const left = normalizeKitColor(first, "#000000").slice(1);
  const right = normalizeKitColor(second, "#000000").slice(1);
  const red = parseInt(left.slice(0, 2), 16) - parseInt(right.slice(0, 2), 16);
  const green = parseInt(left.slice(2, 4), 16) - parseInt(right.slice(2, 4), 16);
  const blue = parseInt(left.slice(4, 6), 16) - parseInt(right.slice(4, 6), 16);
  return Math.sqrt(red * red + green * green + blue * blue);
}

function kitsAreDistinct(homeColor, awayColor) {
  return HEX_COLOR.test(homeColor) && HEX_COLOR.test(awayColor) && kitColorDistance(homeColor, awayColor) >= 80;
}

function suggestedAwayKit(homeColor, preferredColor) {
  const choices = [preferredColor, "#FFFFFF", "#111111", "#F5C518", "#E53935", "#2563EB"];
  return choices.map((color) => normalizeKitColor(color, "#FFFFFF")).find((color) => kitsAreDistinct(homeColor, color)) || "#FFFFFF";
}

function withDeadline(promise, milliseconds = 6000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("The match request timed out.")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

export default function Scorer() {
  const { id } = useParams();
  const { role } = useAuth();
  const [m, setM] = useState(null);
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState({});
  const [squads, setSquads] = useState({});
  const [busy, setBusy] = useState(false);
  const [subFor, setSubFor] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [stats, setStats] = useState({ ...EMPTY_MATCH_STATS });
  const [statsMessage, setStatsMessage] = useState("");
  const [lineups, setLineups] = useState({});
  const [savedLineups, setSavedLineups] = useState({});
  const [lineupBusy, setLineupBusy] = useState(null);
  const [lineupMessages, setLineupMessages] = useState({});
  const [homeKitColor, setHomeKitColor] = useState("");
  const [awayKitColor, setAwayKitColor] = useState("");
  const [previewDetails, setPreviewDetails] = useState({ round: "", venueName: "", venueLocation: "", venueCapacity: "", venueSurface: "Grass", weather: "", refereeName: "" });
  const [previewDetailsBusy, setPreviewDetailsBusy] = useState(false);
  const [previewDetailsMessage, setPreviewDetailsMessage] = useState("");
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const kitInitializedFor = useRef(null);
  const previewDetailsInitializedFor = useRef(null);

  const loadLineups = useCallback(async () => {
    try {
      const savedLineups = await getMatchLineups(id);
      const editable = {};
      Object.entries(savedLineups).forEach(([teamId, lineup]) => {
        const starters = Array(11).fill(null);
        lineup.starters.forEach((player, fallbackIndex) => {
          const slotIndex = Number.isInteger(player.slotIndex) ? player.slotIndex : fallbackIndex;
          if (slotIndex >= 0 && slotIndex < 11) starters[slotIndex] = player.id;
        });
        editable[teamId] = {
          formation: lineup.formation || DEFAULT_FORMATION,
          starters,
          substitutes: lineup.substitutes.map((player) => player.id),
        };
      });
      setSavedLineups(editable);
      setLineups(editable);
    } catch (lineupError) {
      setLineupMessages((current) => ({ ...current, general: lineupError.message || "Could not load the match lineups." }));
    }
  }, [id]);

  const load = useCallback(async () => {
    try {
      const mm = await withDeadline(getMatchRaw(id));
      if (!mm) throw new Error("This match was not found.");
      setM(mm);
      if (previewDetailsInitializedFor.current !== mm.id) {
        setPreviewDetails({
          round: mm.match_round || "",
          venueName: mm.venue_name || "",
          venueLocation: mm.venue_location || "",
          venueCapacity: mm.venue_capacity == null ? "" : String(mm.venue_capacity),
          venueSurface: mm.venue_surface || "Grass",
          weather: mm.weather || "",
          refereeName: mm.referee_name || "",
        });
        previewDetailsInitializedFor.current = mm.id;
      }
      setError("");

      const [eventsOutcome, teamsOutcome, statsOutcome] = await Promise.allSettled([
        getEvents(id),
        listTeams(mm.organization_id),
        getMatchStats(id),
      ]);
      if (eventsOutcome.status === "fulfilled") setEvents(eventsOutcome.value);
      if (statsOutcome.status === "fulfilled") setStats(statsOutcome.value);
      if (teamsOutcome.status === "fulfilled") {
        const map = {};
        teamsOutcome.value.forEach((team) => { map[team.id] = team; });
        setTeams(map);
      }

      const [homePlayersOutcome, awayPlayersOutcome] = await Promise.allSettled([
        listPlayers(mm.home_id),
        listPlayers(mm.away_id),
      ]);
      setSquads({
        [mm.home_id]: homePlayersOutcome.status === "fulfilled" ? homePlayersOutcome.value : [],
        [mm.away_id]: awayPlayersOutcome.status === "fulfilled" ? awayPlayersOutcome.value : [],
      });
    } catch (loadError) {
      setError(loadError.message || "Could not load this match.");
    }
  }, [id]);

  useEffect(() => {
    const cached = readAdminMatch(id);
    if (cached) {
      setM(cached);
      const cachedTeams = {};
      if (cached.home_id && cached.home) cachedTeams[cached.home_id] = cached.home;
      if (cached.away_id && cached.away) cachedTeams[cached.away_id] = cached.away;
      setTeams(cachedTeams);
    }
    load();
    loadLineups();
    const firstTick = window.setTimeout(() => setNow(Date.now()), 0);
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    let channel;
    if (supabase) {
      channel = supabase.channel(`scorer-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `match_id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_statistics", filter: `match_id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_lineups", filter: `match_id=eq.${id}` }, loadLineups)
        .subscribe();
    }
    return () => {
      window.clearInterval(ticker);
      window.clearTimeout(firstTick);
      if (channel) supabase.removeChannel(channel);
    };
  }, [id, load, loadLineups]);

  useEffect(() => {
    if (!m) return;
    const homeTeam = teams[m.home_id];
    const awayTeam = teams[m.away_id];
    if (!homeTeam || !awayTeam) return;
    const nextHome = normalizeKitColor(m.home_kit_color || homeTeam.color, "#18A558");
    const preferredAway = normalizeKitColor(m.away_kit_color || awayTeam.color, "#2563EB");
    if (m.status !== "scheduled") {
      setHomeKitColor(nextHome);
      setAwayKitColor(suggestedAwayKit(nextHome, preferredAway));
      kitInitializedFor.current = m.id;
      return;
    }
    if (kitInitializedFor.current === m.id) return;
    setHomeKitColor(nextHome);
    setAwayKitColor(suggestedAwayKit(nextHome, preferredAway));
    kitInitializedFor.current = m.id;
  }, [m, teams]);

  if (!m) return <AdminMatchShell error={error} onRetry={load} />;
  const homeTeam = teams[m.home_id] || { name: "Home", short: "H", color: "#18A558" };
  const awayTeam = teams[m.away_id] || { name: "Away", short: "A", color: "#2563EB" };
  const home = { ...homeTeam, color: homeKitColor || m.home_kit_color || homeTeam.color };
  const away = { ...awayTeam, color: awayKitColor || m.away_kit_color || awayTeam.color };
  const storedHome = m.home_score ?? events.filter((e) => e.type === "goal" && e.side === "home").length;
  const storedAway = m.away_score ?? events.filter((e) => e.type === "goal" && e.side === "away").length;
  const displayedHome = storedHome;
  const displayedAway = storedAway;
  const sideTeamId = (side) => (side === "home" ? m.home_id : m.away_id);
  const fullTimeLocked = m.status === "ft" && Boolean(m.locked_at);
  const isRetrospective = m.operation_mode === "retrospective";
  const canRecord = ["live", "et_live"].includes(m.status) || (m.status === "ft" && !m.locked_at);
  const canCorrect = m.status !== "scheduled" && !fullTimeLocked;

  async function run(operation, closePending = false) {
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      if (closePending) setPending(null);
      await load();
      return true;
    } catch (operationError) {
      setError(operationError.message || "The action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function changePreviewDetail(key, value) {
    setPreviewDetails((current) => ({ ...current, [key]: value }));
    setPreviewDetailsMessage("");
  }

  async function savePreviewDetails(event) {
    event.preventDefault();
    setPreviewDetailsBusy(true);
    setPreviewDetailsMessage("");
    try {
      const result = await updateMatchPreviewDetails(id, previewDetails);
      if (result.error) throw result.error;
      setM((current) => ({ ...current, ...result.data }));
      setPreviewDetailsMessage("Public match details saved.");
    } catch (previewError) {
      setPreviewDetailsMessage(previewError.message || "The public match details could not be saved.");
    } finally {
      setPreviewDetailsBusy(false);
    }
  }

  function beginEvent(type, side) {
    if (!canRecord || busy) return;
    setError("");
    if (isRetrospective) {
      setPending({ type: "event_time", eventType: type, side });
      return;
    }
    setPending({ type, side });
  }

  function continueTimedEvent(timing) {
    if (pending?.type !== "event_time") return;
    const { eventType, side } = pending;
    if (eventType === "goal") {
      setPending(null);
      void recordGoal(side, timing);
      return;
    }
    if (eventType === "sub") {
      setPending(null);
      setSubFor({ side, timing });
      return;
    }
    setPending({ type: eventType, side, timing });
  }

  async function commitPending(selection) {
    if (!pending) return;
    const player = selection?.player || null;
    const assist = selection?.assist || null;
    const event = {
      type: pending.type,
      side: pending.side,
      player_id: player?.id || null,
      player: player?.name || null,
      assist: assist?.name || null,
      goal_type: null,
      card_type: selection?.cardType || null,
      card_reason: selection?.cardReason || null,
      recipient_type: selection?.recipientType || null,
      timing: pending.timing || null,
    };
    let createdEvent = null;
    const saved = await run(async () => {
      const response = await recordMatchEvent(id, event);
      createdEvent = response?.data || null;
      return response;
    }, true);
    if (saved && createdEvent?.id && createdEvent.type === "red" && !isRetrospective) {
      await notifyFollowers({ kind: "event", eventId: createdEvent.id });
    }
  }

  async function recordGoal(side, timing = null) {
    if (!canRecord || busy) return;
    if (isRetrospective && !timing) {
      setError("");
      setPending({ type: "event_time", eventType: "goal", side });
      return;
    }
    setError("");
    let createdEvent = null;
    const saved = await run(async () => {
      const response = await recordMatchEvent(id, {
        type: "goal",
        side,
        player_id: null,
        player: null,
        assist: null,
        goal_type: "normal_goal",
        timing,
      });
      createdEvent = response?.data || null;
      return response;
    });
    if (!saved || !createdEvent?.id) return;
    setPending({
      type: "goal_attribution",
      side,
      event: createdEvent,
      recordedAt: createdEvent.created_at || new Date().toISOString(),
    });
    if (!isRetrospective) void notifyFollowers({ kind: "event", eventId: createdEvent.id });
  }

  function openGoalAttribution(event) {
    if (!canCorrect || busy) return;
    setError("");
    setPending({
      type: "goal_attribution",
      side: event.side,
      event,
      recordedAt: event.created_at || new Date().toISOString(),
    });
  }

  async function confirmGoalAttribution(selection) {
    const goalEvent = pending?.event;
    if (!goalEvent?.id) return;
    let updatedEvent = null;
    const saved = await run(async () => {
      const response = await attributeMatchGoal(goalEvent.id, {
        player_id: selection?.player?.id || null,
        assist_id: selection?.assist?.id || null,
        goal_type: selection?.goalType || "normal_goal",
      });
      updatedEvent = response?.data || null;
      return response;
    }, true);
    if (saved && updatedEvent?.id && updatedEvent.player && !goalEvent.player && !isRetrospective) {
      void notifyFollowers({ kind: "scorer", eventId: updatedEvent.id });
    }
  }

  async function undoLast(type, side) {
    const latest = events
      .filter((event) => event.type === type && event.side === side)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (latest) await run(() => deleteMatchEvent(latest.id));
  }

  async function changeStatus(status) {
    const previousStatus = m.status;
    if (m.status === "scheduled" && status === "live") {
      await startScheduledMatch("live");
      return;
    }
    const saved = await run(() => isRetrospective
      ? transitionRetrospectiveMatch(id, status)
      : transitionMatchStatus(id, status));
    if (saved && !isRetrospective) await notifyFollowers({ kind: "status", previousStatus });
  }

  async function startScheduledMatch(mode) {
    if (busy || m.status !== "scheduled") return;
    if (!kitsAreDistinct(homeKitColor, awayKitColor)) {
      setError("The home and away kits clash. Choose a clearly different away kit before kick-off.");
      return;
    }
    const retrospective = mode === "retrospective";
    const saved = await run(() => retrospective
      ? startRetrospectiveMatch(id, homeKitColor, awayKitColor)
      : startMatchWithKits(id, homeKitColor, awayKitColor));
    if (saved && !retrospective) await notifyFollowers({ kind: "status", previousStatus: "scheduled" });
  }

  async function switchToRetrospective() {
    if (busy || isRetrospective) return;
    await run(() => enableRetrospectiveRecording(id));
  }

  async function notifyFollowers(payload) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("The administrator session could not be verified.");
      const response = await fetch("/api/push/notify", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ matchId: id, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Please try again.");
      }
      return result;
    } catch (notificationError) {
      setError(`The match update was saved, but notifications were not delivered. ${notificationError.message || "Please try again."}`);
      return null;
    }
  }

  async function testNotifications() {
    if (notificationBusy) return;
    setNotificationBusy(true);
    setNotificationMessage("");
    setError("");
    try {
      const result = await notifyFollowers({ kind: "test" });
      if (result) {
        const deviceLabel = result.sent === 1 ? "device" : "devices";
        setNotificationMessage(`Test notification sent to ${result.sent} ${deviceLabel}.`);
      }
    } finally {
      setNotificationBusy(false);
    }
  }

  async function deliberatelyReopen() {
    const reason = window.prompt("Why are you reopening this full-time match? This is stored in the audit log.");
    if (reason === null) return;
    await run(() => reopenMatch(id, reason));
  }

  async function setStoppageTime(minutes) {
    await run(() => setMatchStoppageTime(id, minutes));
  }

  async function removeEvent(eventId) {
    await run(() => deleteMatchEvent(eventId));
  }

  async function saveSub(side, incomingPlayer, outgoingPlayer) {
    const saved = await run(() => recordMatchEvent(id, {
      type: "sub",
      side,
      player_id: incomingPlayer.id,
      player: incomingPlayer.name,
      assist: outgoingPlayer.name,
      timing: typeof subFor === "object" ? subFor.timing : null,
    }));
    if (saved) setSubFor(null);
  }

  function changeStat(key, value) {
    const parsed = Number(value);
    const nextValue = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setStats((current) => {
      if (key === "home_possession" || key === "away_possession") {
        const possession = Math.min(100, Math.round(nextValue));
        const oppositeKey = key === "home_possession" ? "away_possession" : "home_possession";
        return { ...current, [key]: possession, [oppositeKey]: 100 - possession };
      }
      return { ...current, [key]: nextValue };
    });
    setStatsMessage("");
  }

  async function saveStatistics() {
    if (Number(stats.home_possession) + Number(stats.away_possession) !== 100) {
      setStatsMessage("Possession must total 100%.");
      return;
    }
    const saved = await run(() => saveMatchStats(id, stats));
    setStatsMessage(saved ? "Stats saved." : "Stats were not saved.");
  }

  function currentLineup(teamId) {
    return lineups[teamId] || { formation: DEFAULT_FORMATION, starters: Array(11).fill(null), substitutes: [] };
  }

  function changeFormation(teamId, formation) {
    setLineups((current) => {
      const lineup = current[teamId] || { formation: DEFAULT_FORMATION, starters: Array(11).fill(null), substitutes: [] };
      return { ...current, [teamId]: { ...lineup, formation } };
    });
    setLineupMessages((current) => ({ ...current, [teamId]: "" }));
  }

  function assignStarter(teamId, slotIndex, playerId) {
    const lineup = currentLineup(teamId);
    const starters = [...lineup.starters];
    const selectedPlayerId = playerId || null;
    starters.forEach((assignedPlayerId, index) => {
      if (selectedPlayerId && assignedPlayerId === selectedPlayerId) starters[index] = null;
    });
    starters[slotIndex] = selectedPlayerId;
    setLineups((current) => ({
      ...current,
      [teamId]: {
        ...lineup,
        starters,
        substitutes: lineup.substitutes.filter((idValue) => idValue !== selectedPlayerId),
      },
    }));
    setLineupMessages((current) => ({ ...current, [teamId]: "" }));
  }

  function toggleSubstitute(teamId, playerId) {
    const lineup = currentLineup(teamId);
    const isSubstitute = lineup.substitutes.includes(playerId);
    const substitutes = isSubstitute
      ? lineup.substitutes.filter((idValue) => idValue !== playerId)
      : [...lineup.substitutes, playerId];
    const starters = lineup.starters.map((idValue) => idValue === playerId ? null : idValue);
    setLineups((current) => ({
      ...current,
      [teamId]: { ...lineup, starters, substitutes },
    }));
    setLineupMessages((current) => ({ ...current, [teamId]: "" }));
  }

  function swapStarterPositions(teamId, firstSlotIndex, secondSlotIndex) {
    if (firstSlotIndex === secondSlotIndex) return;
    if (firstSlotIndex === 0 || secondSlotIndex === 0) {
      setLineupMessages((current) => ({ ...current, [teamId]: "The goalkeeper position cannot be swapped with an outfield position." }));
      return;
    }
    const lineup = currentLineup(teamId);
    const starters = [...lineup.starters];
    [starters[firstSlotIndex], starters[secondSlotIndex]] = [starters[secondSlotIndex], starters[firstSlotIndex]];
    setLineups((current) => ({ ...current, [teamId]: { ...lineup, starters } }));
    setLineupMessages((current) => ({ ...current, [teamId]: "" }));
  }

  function resetTeamLineup(teamId) {
    const saved = savedLineups[teamId] || { formation: DEFAULT_FORMATION, starters: Array(11).fill(null), substitutes: [] };
    setLineups((current) => ({
      ...current,
      [teamId]: {
        formation: saved.formation || DEFAULT_FORMATION,
        starters: [...(saved.starters || Array(11).fill(null))],
        substitutes: [...(saved.substitutes || [])],
      },
    }));
    setLineupMessages((current) => ({ ...current, [teamId]: "Draft reset to the last published lineup." }));
  }

  async function saveTeamLineup(teamId) {
    const validationError = lineupValidationError(squads[teamId] || [], currentLineup(teamId));
    if (validationError) {
      setLineupMessages((current) => ({ ...current, [teamId]: validationError }));
      return;
    }
    setLineupBusy(teamId);
    setLineupMessages((current) => ({ ...current, [teamId]: "" }));
    try {
      const result = await saveMatchLineup(id, teamId, currentLineup(teamId));
      if (result?.error) throw result.error;
      await loadLineups();
      setLineupMessages((current) => ({ ...current, [teamId]: "Lineup saved and published." }));
    } catch (lineupError) {
      setLineupMessages((current) => ({ ...current, [teamId]: lineupError.message || "The lineup could not be saved." }));
    } finally {
      setLineupBusy(null);
    }
  }

  function substitutionPools(side, beforeEvent = null) {
    const teamId = sideTeamId(side);
    const squad = squads[teamId] || [];
    const lineup = currentLineup(teamId);
    const playerById = Object.fromEntries(squad.map((player) => [player.id, player]));
    const onFieldIds = new Set((lineup.starters || []).filter(Boolean));
    const availableSubstituteIds = new Set(lineup.substitutes || []);
    const substitutions = events
      .filter((event) => (
        event.type === "sub"
        && event.side === side
        && (!beforeEvent || eventOrder(event, beforeEvent) <= 0)
      ))
      .sort(eventOrder);

    substitutions.forEach((event) => {
      const outgoingPlayer = squad.find((player) => (
        onFieldIds.has(player.id)
        && player.name.trim().toLowerCase() === String(event.assist || "").trim().toLowerCase()
      ));
      const incomingPlayer = event.player_id && playerById[event.player_id]
        ? playerById[event.player_id]
        : squad.find((player) => (
          availableSubstituteIds.has(player.id)
          && player.name.trim().toLowerCase() === String(event.player || "").trim().toLowerCase()
        ));
      if (outgoingPlayer) onFieldIds.delete(outgoingPlayer.id);
      if (incomingPlayer && availableSubstituteIds.has(incomingPlayer.id)) {
        availableSubstituteIds.delete(incomingPlayer.id);
        onFieldIds.add(incomingPlayer.id);
      }
    });

    return {
      onFieldPlayers: squad.filter((player) => onFieldIds.has(player.id)),
      availableSubstitutes: squad.filter((player) => availableSubstituteIds.has(player.id)),
    };
  }

  function goalAttributionPools(goalEvent) {
    const scoringSide = goalEvent.side;
    const opponentSide = scoringSide === "home" ? "away" : "home";
    return {
      scoring: substitutionPools(scoringSide, goalEvent).onFieldPlayers,
      opponent: substitutionPools(opponentSide, goalEvent).onFieldPlayers,
    };
  }

  const actions = statusActions(m.status, fullTimeLocked, isRetrospective, m.current_period);
  const pendingGoalPools = pending?.type === "goal_attribution" && pending.event
    ? goalAttributionPools(pending.event)
    : null;

  return (
    <div>
      <Link href="/admin/matches" style={{ color: "#8E939B", fontSize: 13 }}>← All matches</Link>

      <div style={{ ...card, textAlign: "center", margin: "12px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <Badge t={home} />
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{displayedHome} <span style={{ color: "#5B6069" }}>-</span> {displayedAway}</div>
          <Badge t={away} />
        </div>
        <div style={{ marginTop: 8, color: ["live", "et_live"].includes(m.status) ? "#F04444" : "#8E939B", fontSize: 13, fontWeight: 700 }}>
          {clockStatus(m, now)}
        </div>
        {pending?.type === "goal_attribution" && <div style={{ color: "#4FC263", fontSize: 12, marginTop: 5 }}>Goal saved. Add the scorer while play continues.</div>}
      </div>

      {error && <div role="alert" style={{ color: "#F7B4B4", background: "#301719", border: "1px solid #5A2428", borderRadius: 10, padding: 10, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ color: "#FFFFFF", fontSize: 13 }}>Match notifications</div>
          <div style={{ color: notificationMessage ? "#4FC263" : "#8E939B", fontSize: 11.5, marginTop: 3 }}>
            {notificationMessage || "Send a test to every phone following this match."}
          </div>
        </div>
        <button
          type="button"
          onClick={testNotifications}
          disabled={notificationBusy}
          style={{ ...pill, flexShrink: 0, opacity: notificationBusy ? 0.55 : 1 }}
        >
          {notificationBusy ? "Testing..." : "Send test"}
        </button>
      </div>

      {role === "admin" && (
        <form onSubmit={savePreviewDetails} style={card}>
          <div style={label}>PUBLIC MATCH DETAILS</div>
          <div style={{ color: "#AAB0BA", fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>
            These details appear in the public Preview tab before and during the match.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <PreviewField label="Round or stage"><input value={previewDetails.round} onChange={(event) => changePreviewDetail("round", event.target.value)} placeholder="Round 2" maxLength={80} style={finp} /></PreviewField>
            <PreviewField label="Venue name"><input value={previewDetails.venueName} onChange={(event) => changePreviewDetail("venueName", event.target.value)} placeholder="Buya Community Park" maxLength={120} style={finp} /></PreviewField>
            <PreviewField label="Venue location"><input value={previewDetails.venueLocation} onChange={(event) => changePreviewDetail("venueLocation", event.target.value)} placeholder="Buya, Kpandai District" maxLength={160} style={finp} /></PreviewField>
            <PreviewField label="Venue capacity"><input type="number" min="0" value={previewDetails.venueCapacity} onChange={(event) => changePreviewDetail("venueCapacity", event.target.value)} placeholder="3000" style={finp} /></PreviewField>
            <PreviewField label="Playing surface"><input value={previewDetails.venueSurface} onChange={(event) => changePreviewDetail("venueSurface", event.target.value)} placeholder="Grass" maxLength={60} style={finp} /></PreviewField>
            <PreviewField label="Weather"><input value={previewDetails.weather} onChange={(event) => changePreviewDetail("weather", event.target.value)} placeholder="27°C · Clear" maxLength={100} style={finp} /></PreviewField>
            <PreviewField label="Referee"><input value={previewDetails.refereeName} onChange={(event) => changePreviewDetail("refereeName", event.target.value)} placeholder="Referee's full name" maxLength={120} style={finp} /></PreviewField>
          </div>
          <button type="submit" disabled={previewDetailsBusy} style={{ ...pill, marginTop: 12, background: "#4FC263", color: "#062", opacity: previewDetailsBusy ? 0.5 : 1 }}>{previewDetailsBusy ? "Saving…" : "Save public details"}</button>
          {previewDetailsMessage && <div style={{ color: /saved/i.test(previewDetailsMessage) ? "#4FC263" : "#F5C518", fontSize: 12, marginTop: 10 }}>{previewDetailsMessage}</div>}
        </form>
      )}

      {m.status === "scheduled" && (
        <>
        <div style={card}>
          <div style={label}>START OR RECORD THIS MATCH</div>
          <div style={{ color: "#AAB0BA", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            For a completed game, select the second option and enter the known events with their actual minutes. You can finish the entire record immediately.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            <RecordingModeAction
              title="Start live match"
              note="The match clock runs automatically and follower alerts are sent."
              onClick={() => startScheduledMatch("live")}
              disabled={busy}
            />
            <RecordingModeAction
              primary
              title="Record completed match"
              note="Manual event times. Finish the match in one short session without live alerts."
              onClick={() => startScheduledMatch("retrospective")}
              disabled={busy}
            />
          </div>
        </div>
        <div style={card}>
          <div style={label}>MATCH KITS</div>
          <div style={{ color: "#AAB0BA", fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>
            Confirm both match kits before kick-off. If the team colours clash, the away team must change kit.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <KitPicker label="Home kit" team={homeTeam} color={homeKitColor} onChange={setHomeKitColor} />
            <KitPicker label="Away kit" team={awayTeam} color={awayKitColor} onChange={setAwayKitColor} />
          </div>
          {!kitsAreDistinct(homeKitColor, awayKitColor) && (
            <div role="alert" style={{ color: "#F7B4B4", background: "#301719", border: "1px solid #5A2428", borderRadius: 9, padding: 10, fontSize: 12, marginTop: 12 }}>
              Kit clash detected. Select a different away kit to enable kick-off.
            </div>
          )}
        </div>
        </>
      )}

      {isRetrospective && (
        <>
          <div style={{ ...card, borderColor: "#4FC263" }}>
            <div style={label}>QUICK COMPLETED-MATCH RECORDING</div>
            <div style={{ color: "#70DB82", fontSize: 13, marginBottom: 4 }}>{clockStatus(m, now)}</div>
            <div style={{ color: "#AAB0BA", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
              Add only the events you know. Every event will ask for its actual match minute. You can finish immediately without waiting for the clock.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {actions.map((action) => (
                <button key={action.status} disabled={busy} onClick={() => changeStatus(action.status)}
                  style={{ ...pill, background: action.primary ? "#4FC263" : "#0E0F11", color: action.primary ? "#062" : "#fff" }}>{action.label}</button>
              ))}
              {role === "admin" && fullTimeLocked && (
                <button disabled={busy} onClick={deliberatelyReopen} style={{ ...pill, background: "#2B2110", color: "#F5C518" }}>Reopen for correction</button>
              )}
            </div>
            {fullTimeLocked && <div style={{ color: "#8E939B", fontSize: 12, marginTop: 10 }}>Full-time lock is active. Reopen the result only if a correction is necessary.</div>}
          </div>

          {!fullTimeLocked && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 14 }}>
              {[["home", home], ["away", away]].map(([side, team]) => (
                <div key={side} style={{ ...card, marginBottom: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Badge t={team} size={24} /><span style={{ fontWeight: 700, fontSize: 14 }}>{team.name}</span>
                  </div>
                  <button disabled={busy || !canRecord} onClick={() => recordGoal(side)} style={{ ...goalButton, opacity: canRecord ? 1 : 0.45 }}>⚽ + GOAL</button>
                  <button disabled={busy || !canCorrect} onClick={() => undoLast("goal", side)} style={{ ...undoButton, opacity: canCorrect ? 1 : 0.45 }}>Undo last goal</button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={busy || !canRecord} onClick={() => beginEvent("yellow", side)} style={{ ...half, background: "#3a3410", color: "#F5C518", opacity: canRecord ? 1 : 0.45 }}>+ Yellow</button>
                    <button disabled={busy || !canRecord} onClick={() => beginEvent("red", side)} style={{ ...half, background: "#3a1616", color: "#F04444", opacity: canRecord ? 1 : 0.45 }}>+ Red</button>
                  </div>
                  <button disabled={busy || !canRecord} onClick={() => beginEvent("miss", side)} style={{ ...half, width: "100%", marginTop: 8, background: "#2B2110", color: "#F5C518", opacity: canRecord ? 1 : 0.45 }}>Missed penalty</button>
                  <button disabled={busy || !canRecord} onClick={() => beginEvent("sub", side)} style={{ ...half, width: "100%", marginTop: 8, background: "#0E0F11", color: "#fff", opacity: canRecord ? 1 : 0.45 }}>Substitution</button>
                </div>
              ))}
            </div>
          )}

          <div style={card}>
            <div style={label}>RECORDED EVENTS</div>
            {events.length === 0 && <div style={{ color: "#8E939B", fontSize: 13, padding: "6px 0" }}>No events recorded. You may finish a match with no known events.</div>}
            {[...events].sort(eventOrder).map((event) => (
              <EventRow key={event.id} event={event} match={m} locked={!canCorrect} onRemove={removeEvent} onAttributeGoal={openGoalAttribution} />
            ))}
          </div>
        </>
      )}

      {!isRetrospective && ["live", "ht"].includes(m.status) && (
        <div style={{ ...card, borderColor: "#F5C518" }}>
          <div style={label}>IS THIS A MATCH THAT HAS ALREADY BEEN PLAYED?</div>
          <div style={{ color: "#AAB0BA", fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
            Stop the automatic clock and open manual event-time controls immediately.
          </div>
          <button disabled={busy} onClick={switchToRetrospective} style={{ ...pill, width: "100%", background: "#F5C518", color: "#241D00" }}>Switch to completed-match recording</button>
        </div>
      )}

      <div style={card}>
        <div style={label}>MATCH LINEUPS</div>
        <div style={{ color: "#AAB0BA", fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>
          Select each team’s starters and substitutes. Saving a team lineup publishes it immediately to the public match centre.
        </div>
        {lineupMessages.general && <div role="alert" style={{ color: "#F7B4B4", fontSize: 12, marginBottom: 12 }}>{lineupMessages.general}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <LineupTeamEditor
            team={home}
            squad={squads[m.home_id] || []}
            lineup={currentLineup(m.home_id)}
            busy={lineupBusy === m.home_id}
            disabled={Boolean(lineupBusy) || fullTimeLocked}
            message={lineupMessages[m.home_id]}
            onFormationChange={(formation) => changeFormation(m.home_id, formation)}
            onStarterChange={(slotIndex, playerId) => assignStarter(m.home_id, slotIndex, playerId)}
            onStarterSwap={(firstSlotIndex, secondSlotIndex) => swapStarterPositions(m.home_id, firstSlotIndex, secondSlotIndex)}
            onSubstituteChange={(playerId) => toggleSubstitute(m.home_id, playerId)}
            onReset={() => resetTeamLineup(m.home_id)}
            onSave={() => saveTeamLineup(m.home_id)}
          />
          <LineupTeamEditor
            team={away}
            squad={squads[m.away_id] || []}
            lineup={currentLineup(m.away_id)}
            busy={lineupBusy === m.away_id}
            disabled={Boolean(lineupBusy) || fullTimeLocked}
            message={lineupMessages[m.away_id]}
            onFormationChange={(formation) => changeFormation(m.away_id, formation)}
            onStarterChange={(slotIndex, playerId) => assignStarter(m.away_id, slotIndex, playerId)}
            onStarterSwap={(firstSlotIndex, secondSlotIndex) => swapStarterPositions(m.away_id, firstSlotIndex, secondSlotIndex)}
            onSubstituteChange={(playerId) => toggleSubstitute(m.away_id, playerId)}
            onReset={() => resetTeamLineup(m.away_id)}
            onSave={() => saveTeamLineup(m.away_id)}
          />
        </div>
      </div>

      {!isRetrospective && <div style={card}>
        <div style={label}>MATCH STATUS</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions.map((action) => (
            <button key={action.status} disabled={busy} onClick={() => changeStatus(action.status)}
              style={{ ...pill, background: action.primary ? "#4FC263" : "#0E0F11", color: action.primary ? "#062" : "#fff" }}>{action.label}</button>
          ))}
          {role === "admin" && fullTimeLocked && (
            <button disabled={busy} onClick={deliberatelyReopen} style={{ ...pill, background: "#2B2110", color: "#F5C518" }}>Reopen for correction</button>
          )}
        </div>
        {fullTimeLocked && <div style={{ color: "#8E939B", fontSize: 12, marginTop: 10 }}>Full-time lock is active. Events cannot be added, changed or deleted.</div>}
        {m.status === "ft" && !m.locked_at && <div style={{ color: "#F5C518", fontSize: 12, marginTop: 10 }}>This result is deliberately reopened. Make the correction, then lock full time again.</div>}
      </div>}

      {["live", "et_live"].includes(m.status) && !isRetrospective && (
        <div style={card}>
          <div style={label}>STOPPAGE TIME</div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            {periodName(m.current_period)} · {announcedStoppageMinutes(m) > 0 ? `+${announcedStoppageMinutes(m)} announced` : "none announced"}
          </div>
          <div style={{ color: "#8E939B", fontSize: 12, marginBottom: 12 }}>
            Tap the minimum added time indicated by the referee. The clock will continue until you end the period.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 7 }}>
            {Array.from({ length: 11 }, (_, minutes) => (
              <button
                key={minutes}
                disabled={busy}
                onClick={() => setStoppageTime(minutes)}
                style={{
                  ...stoppageButton,
                  background: announcedStoppageMinutes(m) === minutes ? "#4FC263" : "#0E0F11",
                  color: announcedStoppageMinutes(m) === minutes ? "#062" : "#fff",
                }}
              >
                {minutes === 0 ? "None" : `+${minutes}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isRetrospective && <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 14 }}>
        {[["home", home], ["away", away]].map(([side, team]) => (
          <div key={side} style={{ ...card, marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Badge t={team} size={24} /><span style={{ fontWeight: 700, fontSize: 14 }}>{team.name}</span>
            </div>
            <button disabled={busy || !canRecord} onClick={() => recordGoal(side)}
              style={{ ...goalButton, opacity: canRecord ? 1 : 0.45 }}>
              ⚽ + GOAL
            </button>
            <button disabled={busy || !canCorrect} onClick={() => undoLast("goal", side)}
              style={{ ...undoButton, opacity: canCorrect ? 1 : 0.45 }}>
              Undo last goal
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy || !canRecord} onClick={() => beginEvent("yellow", side)} style={{ ...half, background: "#3a3410", color: "#F5C518", opacity: canRecord ? 1 : 0.45 }}>+ Yellow</button>
              <button disabled={busy || !canRecord} onClick={() => beginEvent("red", side)} style={{ ...half, background: "#3a1616", color: "#F04444", opacity: canRecord ? 1 : 0.45 }}>+ Red</button>
            </div>
            <button disabled={busy || !canRecord} onClick={() => beginEvent("miss", side)} style={{ ...half, width: "100%", marginTop: 8, background: "#2B2110", color: "#F5C518", opacity: canRecord ? 1 : 0.45 }}>Missed penalty</button>
            <button disabled={busy || !canRecord} onClick={() => isRetrospective ? beginEvent("sub", side) : setSubFor(side)} style={{ ...half, width: "100%", marginTop: 8, background: "#0E0F11", color: "#fff", opacity: canRecord ? 1 : 0.45 }}>Substitution</button>
          </div>
        ))}
      </div>}

      <div style={card}>
        <MatchStatsBoard
          home={home}
          away={away}
          stats={stats}
          busy={busy}
          message={statsMessage}
          onChange={changeStat}
          onSave={saveStatistics}
        />
      </div>

      {!isRetrospective && <div style={card}>
        <div style={label}>EVENT LOG</div>
        {events.length === 0 && <div style={{ color: "#8E939B", fontSize: 14, padding: "8px 0" }}>No events yet.</div>}
        {[...events].sort(eventOrder).map((event) => (
          <EventRow key={event.id} event={event} match={m} locked={!canCorrect} onRemove={removeEvent} onAttributeGoal={openGoalAttribution} />
        ))}
      </div>}

      {pending?.type === "goal_attribution" && pendingGoalPools && (
        <GoalAttributionModal
          pending={pending}
          scoringTeam={pending.side === "home" ? home : away}
          opponentTeam={pending.side === "home" ? away : home}
          scoringPlayers={pendingGoalPools.scoring}
          opponentPlayers={pendingGoalPools.opponent}
          busy={busy}
          onCancel={() => !busy && setPending(null)}
          onSave={confirmGoalAttribution}
        />
      )}
      {pending?.type === "event_time" && (
        <EventTimeModal
          pending={pending}
          match={m}
          busy={busy}
          onCancel={() => !busy && setPending(null)}
          onContinue={continueTimedEvent}
        />
      )}
      {pending && !["goal_attribution", "event_time"].includes(pending.type) && (
        <AttributionModal
          pending={pending}
          scoringTeam={pending.side === "home" ? home : away}
          scoringSquad={pending.type === "miss"
            ? substitutionPools(pending.side, pending.timing ? { period: pending.timing.period, elapsed_seconds: pending.timing.elapsedSeconds, created_at: new Date().toISOString() } : null).onFieldPlayers
            : squads[sideTeamId(pending.side)] || []}
          opponentTeam={pending.side === "home" ? away : home}
          opponentSquad={squads[sideTeamId(pending.side === "home" ? "away" : "home")] || []}
          busy={busy}
          onCancel={() => !busy && setPending(null)}
          onChoose={commitPending}
        />
      )}
      {subFor && (
        <SubForm
          side={typeof subFor === "string" ? subFor : subFor.side}
          team={(typeof subFor === "string" ? subFor : subFor.side) === "home" ? home : away}
          pools={substitutionPools(typeof subFor === "string" ? subFor : subFor.side)}
          busy={busy}
          onCancel={() => !busy && setSubFor(null)}
          onSave={saveSub}
        />
      )}
    </div>
  );
}

function AdminMatchShell({ error, onRetry }) {
  return <div>
    <Link href="/admin/matches" style={{ color: "#8E939B", fontSize: 13 }}>← All matches</Link>
    <div style={{ ...card, textAlign: "center", margin: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 18 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#24262A" }} />
        <div style={{ width: 82, height: 24, borderRadius: 7, background: "#24262A" }} />
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#24262A" }} />
      </div>
    </div>
    {error && <div style={{ ...card, color: "#F7B4B4" }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{error}</div>
      <button onClick={onRetry} style={{ ...pill, marginTop: 12, background: "#4FC263", color: "#062" }}>Try again</button>
    </div>}
  </div>;
}

function lineupValidationError(squad, lineup) {
  const starters = lineup.starters || [];
  const starterIds = starters.filter(Boolean);
  if (starterIds.length !== 11) return `Select exactly 11 starters. ${starterIds.length} of 11 are currently selected.`;
  if (new Set(starterIds).size !== starterIds.length) return "A player cannot occupy more than one position.";
  const playerById = Object.fromEntries(squad.map((player) => [player.id, player]));
  const goalkeeper = playerById[starters[0]];
  if (!goalkeeper || playerPositionGroup(goalkeeper.position) !== "goalkeeper") {
    return "The goalkeeper position must contain a registered goalkeeper.";
  }
  const outfieldGoalkeeper = starters.slice(1).some((playerId) => playerPositionGroup(playerById[playerId]?.position) === "goalkeeper");
  if (outfieldGoalkeeper) return "Goalkeepers cannot be assigned to outfield positions.";
  return "";
}

function LineupTeamEditor({ team, squad, lineup, busy, disabled, message, onFormationChange, onStarterChange, onStarterSwap, onSubstituteChange, onReset, onSave }) {
  const [selectedSwapSlot, setSelectedSwapSlot] = useState(null);
  const [draggedSlot, setDraggedSlot] = useState(null);
  const starters = lineup.starters || Array(11).fill(null);
  const substitutes = lineup.substitutes || [];
  const formation = lineup.formation || DEFAULT_FORMATION;
  const slots = getFormationSlots(formation);
  const playerById = Object.fromEntries(squad.map((player) => [player.id, player]));
  const selectedStarterIds = starters.filter(Boolean);
  const selectedSubstitutes = squad.filter((player) => substitutes.includes(player.id));
  const reserves = squad.filter((player) => !selectedStarterIds.includes(player.id) && !substitutes.includes(player.id));
  const validationError = lineupValidationError(squad, lineup);
  const success = /saved|published|reset/i.test(message || "");

  function selectSwapSlot(slotIndex) {
    if (disabled || !starters[slotIndex]) return;
    if (selectedSwapSlot == null) {
      setSelectedSwapSlot(slotIndex);
      return;
    }
    if (selectedSwapSlot === slotIndex) {
      setSelectedSwapSlot(null);
      return;
    }
    onStarterSwap(selectedSwapSlot, slotIndex);
    setSelectedSwapSlot(null);
  }

  function dropOnSlot(slotIndex) {
    if (draggedSlot == null || draggedSlot === slotIndex || disabled) return;
    onStarterSwap(draggedSlot, slotIndex);
    setDraggedSlot(null);
    setSelectedSwapSlot(null);
  }

  return (
    <section style={{ background: "#0E0F11", border: "1px solid #2A2C30", borderRadius: 12, padding: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Badge t={team} size={28} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ display: "block", color: "#FFFFFF", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</strong>
          <span style={{ color: "#8E939B", fontSize: 11 }}>{selectedStarterIds.length} of 11 starters, {selectedSubstitutes.length} substitutes, {reserves.length} reserves</span>
        </div>
      </div>

      <label style={{ display: "block", color: "#8E939B", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>FORMATION</label>
      <select disabled={disabled} value={formation} onChange={(event) => onFormationChange(event.target.value)} style={{ ...finp, marginBottom: 12 }}>
        {FORMATION_OPTIONS.map((formationOption) => <option key={formationOption} value={formationOption}>{formationOption}</option>)}
      </select>

      <div style={{ color: "#8E939B", fontSize: 10.5, lineHeight: 1.45, marginBottom: 8 }}>
        Select any outfield player in any outfield position. Drag one starter onto another, or tap two starter circles, to swap them.
      </div>

      <div style={{ position: "relative", height: "clamp(410px, 98vw, 470px)", maxHeight: 470, overflow: "hidden", borderRadius: 12, background: "#171A1D", border: "1px solid #34383D" }}>
        <PitchMarkings />
        {slots.map((slot) => {
          const playerId = starters[slot.index] || "";
          const player = playerById[playerId];
          const options = squad.filter((candidate) => {
            const correctRole = slot.index === 0
              ? playerPositionGroup(candidate.position) === "goalkeeper"
              : playerPositionGroup(candidate.position) !== "goalkeeper";
            const available = candidate.id === playerId
              || (!selectedStarterIds.includes(candidate.id) && !substitutes.includes(candidate.id));
            return available && (correctRole || candidate.id === playerId);
          });
          return (
            <label
              key={`${formation}-${slot.index}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); dropOnSlot(slot.index); }}
              style={{
                position: "absolute",
                left: `${slot.x}%`,
                top: `${slot.y}%`,
                width: 88,
                transform: "translate(-50%, -50%)",
                textAlign: "center",
                zIndex: 2,
              }}
            >
              <span
                role={player ? "button" : undefined}
                tabIndex={player && !disabled ? 0 : undefined}
                draggable={Boolean(player && !disabled)}
                onDragStart={() => setDraggedSlot(slot.index)}
                onDragEnd={() => setDraggedSlot(null)}
                onClick={() => selectSwapSlot(slot.index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectSwapSlot(slot.index);
                  }
                }}
                className="inline-flex items-center justify-center rounded-full"
                style={{ width: 34, height: 34, background: player ? team.color : "#292D32", color: player ? readableAdminTextColor(team.color) : "#AAB0BA", border: selectedSwapSlot === slot.index ? "3px solid #4FC263" : "2px solid rgba(255,255,255,.35)", boxShadow: selectedSwapSlot === slot.index ? "0 0 0 3px rgba(79,194,99,.22)" : "0 2px 6px rgba(0,0,0,.45)", fontSize: 10.5, fontWeight: 850, cursor: player && !disabled ? "grab" : "default" }}
              >
                {player?.number ?? slot.label}
              </span>
              <select
                disabled={disabled}
                aria-label={`${slot.label} player`}
                value={playerId}
                onChange={(event) => onStarterChange(slot.index, event.target.value)}
                style={{ display: "block", width: "100%", height: 27, marginTop: 3, padding: "0 4px", border: "1px solid #3A3E44", borderRadius: 7, background: "rgba(14,15,17,.94)", color: player ? "#FFFFFF" : "#9BA1AA", fontSize: 10, fontWeight: 750, textAlign: "center", outline: "none" }}
              >
                <option value="">{slot.label}</option>
                {options.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.number != null ? `${candidate.number} ` : ""}{candidate.name}</option>)}
              </select>
            </label>
          );
        })}
      </div>

      <LineupRoleGroup
        title="SUBSTITUTES"
        count={selectedSubstitutes.length}
        players={selectedSubstitutes}
        disabled={disabled}
        actionLabel="Move to reserves"
        tone="substitute"
        emptyText="No substitutes selected. Add eligible players from the reserves below."
        onPlayerAction={onSubstituteChange}
      />
      <LineupRoleGroup
        title="RESERVES"
        count={reserves.length}
        players={reserves}
        disabled={disabled}
        actionLabel="Add to substitutes"
        tone="reserve"
        emptyText="No reserve players available."
        onPlayerAction={onSubstituteChange}
      />

      {squad.length === 0 && <div style={{ color: "#8E939B", fontSize: 12, padding: "12px 0" }}>Add players to this team’s squad before selecting a lineup.</div>}
      {validationError && <div role="alert" style={{ color: "#F5C518", fontSize: 11, lineHeight: 1.4, marginTop: 10 }}>{validationError}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, .8fr) minmax(0, 1.2fr)", gap: 8, marginTop: 12 }}>
        <button type="button" disabled={disabled || busy} onClick={onReset} style={{ ...pill, background: "transparent", color: "#C4C8CE", opacity: disabled || busy ? 0.45 : 1 }}>Reset draft</button>
        <button type="button" disabled={disabled || busy || Boolean(validationError)} onClick={onSave} style={{ ...pill, background: "#4FC263", color: "#062", opacity: disabled || busy || validationError ? 0.45 : 1 }}>{busy ? "Saving…" : "Save and publish"}</button>
      </div>
      {message && <div role="status" style={{ color: success ? "#4FC263" : "#F04444", fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>{message}</div>}
    </section>
  );
}

function LineupRoleGroup({ title, count, players, disabled, actionLabel, tone, emptyText, onPlayerAction }) {
  const groupedPlayers = groupPlayersByPosition(players);
  const isSubstitute = tone === "substitute";
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
        <span style={{ color: "#8E939B", fontSize: 10.5, fontWeight: 800 }}>{title}</span>
        <span style={{ color: "#6F757E", fontSize: 10.5, fontWeight: 750 }}>{count}</span>
      </div>
      {groupedPlayers.map((group) => (
        <div key={group.key} style={{ marginTop: 9 }}>
          <div style={{ color: "#737982", fontSize: 9.5, fontWeight: 800, marginBottom: 5 }}>{group.label.toUpperCase()}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {group.players.map((player) => (
              <button
                key={player.id}
                type="button"
                disabled={disabled}
                aria-label={`${actionLabel}: ${player.name}`}
                onClick={() => onPlayerAction(player.id)}
                style={{ minHeight: 34, padding: "6px 9px", borderRadius: 9, border: isSubstitute ? "1px solid #4FC263" : "1px solid #2E3136", background: isSubstitute ? "#14351D" : "#17191C", color: isSubstitute ? "#70DB82" : "#C4C8CE", fontSize: 10.5, fontWeight: 750, opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
              >
                {player.number != null ? `${player.number} ` : ""}{player.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      {players.length === 0 && <div style={{ color: "#737982", fontSize: 10.5, lineHeight: 1.45, padding: "4px 0" }}>{emptyText}</div>}
    </div>
  );
}

function PitchMarkings() {
  const line = "rgba(255,255,255,.12)";
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 10, border: `1px solid ${line}`, pointerEvents: "none" }}>
      <span style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: `1px solid ${line}` }} />
      <span style={{ position: "absolute", width: 76, height: 76, left: "50%", top: "50%", transform: "translate(-50%, -50%)", border: `1px solid ${line}`, borderRadius: "50%" }} />
      <span style={{ position: "absolute", width: 150, height: 62, left: "50%", top: 0, transform: "translateX(-50%)", border: `1px solid ${line}`, borderTop: 0 }} />
      <span style={{ position: "absolute", width: 70, height: 24, left: "50%", top: 0, transform: "translateX(-50%)", border: `1px solid ${line}`, borderTop: 0 }} />
      <span style={{ position: "absolute", width: 150, height: 62, left: "50%", bottom: 0, transform: "translateX(-50%)", border: `1px solid ${line}`, borderBottom: 0 }} />
      <span style={{ position: "absolute", width: 70, height: 24, left: "50%", bottom: 0, transform: "translateX(-50%)", border: `1px solid ${line}`, borderBottom: 0 }} />
    </div>
  );
}

function readableAdminTextColor(color) {
  const hex = String(color || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#FFFFFF";
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 155 ? "#07130B" : "#FFFFFF";
}

function MatchStatsBoard({ home, away, stats, busy, message, onChange, onSave }) {
  const rows = [
    ["Ball possession (%)", "home_possession", "away_possession"],
    ["Total shots", "home_total_shots", "away_total_shots"],
    ["Shots on target", "home_shots_on_target", "away_shots_on_target"],
    ["Corners", "home_corners", "away_corners"],
    ["Fouls", "home_fouls", "away_fouls"],
    ["Offsides", "home_offsides", "away_offsides"],
    ["Yellow cards", "home_yellow_cards", "away_yellow_cards"],
    ["Red cards", "home_red_cards", "away_red_cards"],
  ];
  return (
    <div>
      <div style={label}>MATCH STATISTICS</div>
      <div style={{ display: "grid", gridTemplateColumns: "80px minmax(140px, 1fr) 80px", gap: 12, alignItems: "center" }}>
        <strong style={{ textAlign: "center", fontSize: 13 }}>{home.short}</strong>
        <span />
        <strong style={{ textAlign: "center", fontSize: 13 }}>{away.short}</strong>
        {rows.map(([rowLabel, homeKey, awayKey]) => (
          <div key={rowLabel} style={{ display: "contents" }}>
            <input disabled={busy} type="number" min="0" max={rowLabel === "Ball possession (%)" ? 100 : undefined} value={stats[homeKey]} onChange={(event) => onChange(homeKey, event.target.value)} style={statInput} />
            <span style={{ color: "#AAB0BA", fontSize: 13, textAlign: "center" }}>{rowLabel}</span>
            <input disabled={busy} type="number" min="0" max={rowLabel === "Ball possession (%)" ? 100 : undefined} value={stats[awayKey]} onChange={(event) => onChange(awayKey, event.target.value)} style={statInput} />
          </div>
        ))}
      </div>
      <button disabled={busy} onClick={onSave} style={{ ...pill, marginTop: 14, background: "#0E0F11", color: "#fff" }}>{busy ? "Saving…" : "Save stats"}</button>
      {message && <div style={{ color: message === "Stats saved." ? "#4FC263" : "#F04444", fontSize: 12, marginTop: 8 }}>{message}</div>}
    </div>
  );
}

function KitPicker({ label: kitLabel, team, color, onChange }) {
  const selectedColor = normalizeKitColor(color, team.color || "#18A558");
  return (
    <label style={{ display: "block", background: "#0E0F11", border: "1px solid #2A2C30", borderRadius: 12, padding: 12, cursor: "pointer" }}>
      <span style={{ display: "block", color: "#8E939B", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>{kitLabel}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <KitShirt color={selectedColor} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ display: "block", color: "#FFFFFF", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</strong>
          <span style={{ color: "#8E939B", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{selectedColor}</span>
        </span>
        <input aria-label={`${team.name} ${kitLabel}`} type="color" value={selectedColor} onChange={(event) => onChange(event.target.value.toUpperCase())} style={{ width: 38, height: 38, padding: 2, border: "1px solid #3A3D42", borderRadius: 9, background: "#161719", cursor: "pointer" }} />
      </span>
    </label>
  );
}

function KitShirt({ color }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" width="46" height="46" style={{ flex: "0 0 auto", filter: "drop-shadow(0 3px 5px rgba(0,0,0,.35))" }}>
      <path d="M21 8 9 14 3 28l10 5 5-8v31h28V25l5 8 10-5-6-14-12-6c-2 5-6 8-11 8S23 13 21 8Z" fill={color} stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="2" strokeLinejoin="round" />
      <path d="M21 8c2 5 6 8 11 8s9-3 11-8" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="2" />
    </svg>
  );
}

function RecordingModeAction({ primary = false, title, note, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ minHeight: 100, padding: 12, borderRadius: 12, border: `1px solid ${primary ? "#4FC263" : "#2A2C30"}`, background: primary ? "#172C1C" : "#0E0F11", color: "#FFFFFF", textAlign: "left", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
    >
      <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: primary ? "#70DB82" : "#FFFFFF" }}>{title}</span>
      <span style={{ display: "block", color: "#8E939B", fontSize: 11, lineHeight: 1.45, marginTop: 5 }}>{note}</span>
      <span style={{ display: "block", color: primary ? "#70DB82" : "#C4C8CE", fontSize: 11, fontWeight: 800, marginTop: 8 }}>Open controls →</span>
    </button>
  );
}

function statusActions(status, locked, retrospective = false, period = 0) {
  if (status === "scheduled") return [{ status: "live", label: "Kick off", primary: true }];
  if (retrospective && status === "live" && Number(period) <= 1) return [{ status: "ht", label: "Go to half time" }, { status: "ft", label: "Finish recording now", primary: true }];
  if (retrospective && status === "live") return [{ status: "ft", label: "Finish match", primary: true }];
  if (retrospective && status === "ht") return [{ status: "live", label: "Start second half" }, { status: "ft", label: "Finish recording now", primary: true }];
  if (retrospective && status === "ft" && !locked) return [{ status: "ft", label: "Lock full time", primary: true }];
  if (retrospective) return [];
  if (status === "live") return [{ status: "ht", label: "Half time" }, { status: "ft", label: "Full time", primary: true }];
  if (status === "ht") return [{ status: "live", label: "Start second half", primary: true }, { status: "ft", label: "End match" }];
  if (status === "et_live") return [{ status: "et_ht", label: "Extra-time break" }, { status: "ft", label: "Full time", primary: true }];
  if (status === "et_ht") return [{ status: "et_live", label: "Resume extra time", primary: true }, { status: "ft", label: "End match" }];
  if (status === "ft" && !locked) return [{ status: "ft", label: "Lock full time", primary: true }];
  return [{ status: "et_live", label: "Start extra time" }];
}

function clockStatus(match, now) {
  if (match.operation_mode === "retrospective" && match.status === "live") return Number(match.current_period || 1) > 1 ? "RECORDING SECOND HALF" : "RECORDING FIRST HALF";
  if (match.operation_mode === "retrospective" && match.status === "ht") return "RECORDING · HALF TIME";
  if (match.status === "live") return `LIVE ${formatMatchClock(match, now)}`;
  if (match.status === "et_live") return `EXTRA TIME ${formatMatchClock(match, now)}`;
  if (match.status === "ht") return `HALF TIME · ${formatMatchClock(match, now)}`;
  if (match.status === "et_ht") return `EXTRA-TIME BREAK · ${formatMatchClock(match, now)}`;
  if (match.status === "ft" && !match.locked_at) return "FULL TIME · REOPENED";
  if (match.status === "ft") return "FULL TIME · LOCKED";
  return "SCHEDULED";
}

function periodName(period) {
  if (period === 1) return "First half";
  if (period === 2) return "Second half";
  if (period === 3) return "First half of extra time";
  if (period === 4) return "Second half of extra time";
  return "Current period";
}

function eventOrder(a, b) {
  const aSeconds = a.elapsed_seconds ?? (a.minute == null ? 0 : a.minute * 60);
  const bSeconds = b.elapsed_seconds ?? (b.minute == null ? 0 : b.minute * 60);
  return Number(a.period || 1) - Number(b.period || 1)
    || aSeconds - bSeconds
    || new Date(a.created_at) - new Date(b.created_at);
}

function scorerEventMinute(event, match) {
  const duration = Number(match.competition?.match_duration_minutes || 90);
  const extraTime = Number(match.competition?.extra_time_minutes || 30);
  const period = Number(event.period || 1);
  const minute = Number(event.display_minute ?? event.minute ?? 1);
  const periodEnd = period === 1 ? duration / 2
    : period === 2 ? duration
    : period === 3 ? duration + extraTime / 2
    : duration + extraTime;
  return minute > periodEnd ? `${periodEnd}+${minute - periodEnd}′` : `${minute}′`;
}

function EventRow({ event, match, locked, onRemove, onAttributeGoal }) {
  const emoji = event.type === "goal" ? "⚽" : event.type === "yellow" ? "🟨" : event.type === "red" ? "🟥" : event.type === "miss" ? "❌" : "🔁";
  const isCard = event.type === "yellow" || event.type === "red";
  const eventName = event.player
    || (event.recipient_type === "team_official" ? "Team official" : event.type === "goal" ? "Scorer not recorded" : event.type === "miss" ? "Penalty taker not recorded" : "Player not recorded");
  const cardLabel = event.card_type === "second_yellow" ? "Second yellow"
    : event.type === "red" ? "Straight red"
    : event.type === "yellow" ? "Yellow card"
    : null;
  const reasonLabel = event.card_reason ? CARD_REASON_LABELS[event.card_reason] : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid #26282B" }}>
      <span style={{ fontFamily: "monospace", color: "#8E939B", width: 46, fontSize: 13 }}>{scorerEventMinute(event, match)}</span>
      <span style={{ fontSize: 14 }}>{emoji}</span>
      {event.type === "sub" ? (
        <span style={{ flex: 1, fontSize: 14 }}><span style={{ color: "#3FC463" }}>{event.player}</span> <span style={{ color: "#5B6069" }}>for</span> <span style={{ color: "#F04444" }}>{event.assist}</span></span>
      ) : (
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "#fff" }}>
          <span style={{ display: "block" }}>{eventName}{event.type === "goal" ? ` · ${goalTypeLabel(event.goal_type)}` : event.type === "miss" ? " · Missed penalty" : isCard ? ` · ${cardLabel}` : ""}</span>
          {event.type === "goal" && event.assist && <span style={{ display: "block", color: "#8E939B", fontSize: 12, marginTop: 2 }}>Assist by {event.assist}</span>}
          {isCard && reasonLabel && <span style={{ display: "block", color: "#8E939B", fontSize: 12, marginTop: 2 }}>{reasonLabel}</span>}
        </span>
      )}
      <span style={{ color: "#5B6069", fontSize: 12, width: 42 }}>{event.side}</span>
      {event.type === "goal" && (
        <button disabled={locked} onClick={() => onAttributeGoal(event)} style={{ background: "none", border: "none", color: locked ? "#474A50" : "#4FC263", cursor: locked ? "not-allowed" : "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
          {event.player ? "Edit goal" : "Add scorer"}
        </button>
      )}
      <button disabled={locked} onClick={() => onRemove(event.id)} style={{ background: "none", border: "none", color: locked ? "#474A50" : "#8E939B", cursor: locked ? "not-allowed" : "pointer", fontSize: 12 }}>Delete</button>
    </div>
  );
}

function parseRetrospectiveTime(minuteValue, secondValue, match) {
  const minuteText = String(minuteValue || "").trim().replace(/['′\s]/g, "");
  const matchResult = minuteText.match(/^(\d{1,3})(?:\+(\d{1,2}))?$/);
  if (!matchResult) return { error: "Enter a minute such as 23, 45+2 or 90+4." };
  const duration = Number(match.competition?.match_duration_minutes || 90);
  const half = duration / 2;
  const baseMinute = Number(matchResult[1]);
  const addedMinute = Number(matchResult[2] || 0);
  const seconds = Number(secondValue || 0);
  if (!Number.isInteger(half) || baseMinute < 1 || baseMinute > duration + 45) {
    return { error: `The minute must be between 1 and ${duration}+45.` };
  }
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) {
    return { error: "Seconds must be between 0 and 59." };
  }
  if (addedMinute > 0 && ![half, duration].includes(baseMinute)) {
    return { error: `Added time must be entered as ${half}+n or ${duration}+n.` };
  }
  const displayMinute = baseMinute + addedMinute;
  const period = addedMinute > 0 ? (baseMinute === half ? 1 : 2) : (baseMinute <= half ? 1 : 2);
  return {
    displayMinute,
    elapsedSeconds: Math.max(0, (displayMinute - 1) * 60 + seconds),
    period,
  };
}

function eventTypeTitle(type) {
  if (type === "goal") return "goal";
  if (type === "yellow") return "yellow card";
  if (type === "red") return "red card";
  if (type === "miss") return "missed penalty";
  return "substitution";
}

function EventTimeModal({ pending, match, busy, onCancel, onContinue }) {
  const half = Number(match.competition?.match_duration_minutes || 90) / 2;
  const [minute, setMinute] = useState(Number(match.current_period || 1) > 1 ? String(half + 1) : "1");
  const [seconds, setSeconds] = useState("0");
  const [timeError, setTimeError] = useState("");

  function submit(event) {
    event.preventDefault();
    const timing = parseRetrospectiveTime(minute, seconds, match);
    if (timing.error) {
      setTimeError(timing.error);
      return;
    }
    onContinue(timing);
  }

  return (
    <div style={overlay} onClick={onCancel}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Enter event time" style={{ background: "#161719", border: "1px solid #2A2C30", borderRadius: 16, padding: 18, width: "100%", maxWidth: 390 }} onClick={(event) => event.stopPropagation()}>
        <strong style={{ display: "block", fontSize: 16 }}>When did the {eventTypeTitle(pending.eventType)} happen?</strong>
        <div style={{ color: "#8E939B", fontSize: 12, lineHeight: 1.45, marginTop: 5, marginBottom: 14 }}>
          Enter the official match minute. Added time can be written as {half}+2 or {half * 2}+4.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 110px", gap: 10 }}>
          <label style={flabel}>Minute
            <input autoFocus value={minute} onChange={(event) => { setMinute(event.target.value); setTimeError(""); }} placeholder={`${half}+2`} style={{ ...finp, display: "block", marginTop: 6 }} />
          </label>
          <label style={flabel}>Seconds
            <input type="number" min="0" max="59" value={seconds} onChange={(event) => { setSeconds(event.target.value); setTimeError(""); }} style={{ ...finp, display: "block", marginTop: 6 }} />
          </label>
        </div>
        {timeError && <div role="alert" style={{ color: "#F7B4B4", fontSize: 12, marginTop: 10 }}>{timeError}</div>}
        <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 14, padding: 11, borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, opacity: busy ? 0.45 : 1 }}>{busy ? "Saving…" : "Continue"}</button>
        <button type="button" disabled={busy} onClick={onCancel} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff" }}>Cancel</button>
      </form>
    </div>
  );
}

function GoalAttributionModal({ pending, scoringTeam, opponentTeam, scoringPlayers, opponentPlayers, busy, onCancel, onSave }) {
  const event = pending.event || {};
  const initialGoalType = event.goal_type === "direct_goal" ? "normal_goal" : event.goal_type || "normal_goal";
  const [goalType, setGoalType] = useState(initialGoalType);
  const [selectedPlayer, setSelectedPlayer] = useState(() => {
    const players = initialGoalType === "own_goal" ? opponentPlayers : scoringPlayers;
    return players.find((player) => player.id === event.player_id) || null;
  });
  const [selectedAssist, setSelectedAssist] = useState(() => scoringPlayers.find((player) => player.name === event.assist) || null);
  const [query, setQuery] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, 60 - Math.floor((Date.now() - new Date(pending.recordedAt).getTime()) / 1000)));
  const scorerTeam = goalType === "own_goal" ? opponentTeam : scoringTeam;
  const eligibleScorers = goalType === "own_goal" ? opponentPlayers : scoringPlayers;
  const filteredScorers = eligibleScorers.filter((player) => player.name.toLowerCase().includes(query.trim().toLowerCase()));
  const assistOptions = scoringPlayers.filter((player) => player.id !== selectedPlayer?.id);

  useEffect(() => {
    const updateTimer = () => setSecondsLeft(Math.max(0, 60 - Math.floor((Date.now() - new Date(pending.recordedAt).getTime()) / 1000)));
    const timer = window.setInterval(updateTimer, 1000);
    updateTimer();
    return () => window.clearInterval(timer);
  }, [pending.recordedAt]);

  function changeGoalType(nextGoalType) {
    setGoalType(nextGoalType);
    setSelectedPlayer(null);
    setSelectedAssist(null);
    setQuery("");
  }

  return (
    <div style={overlay} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Add goal details" style={{ background: "#161719", border: "1px solid #2A2C30", borderRadius: 16, padding: 18, width: "100%", maxWidth: 440, maxHeight: "90vh", overflow: "auto" }} onClick={(modalEvent) => modalEvent.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Badge t={scoringTeam} size={30} /><strong>Goal recorded</strong></div>
          <span style={{ color: secondsLeft > 0 ? "#4FC263" : "#F5C518", fontSize: 12, fontWeight: 750 }}>{secondsLeft > 0 ? `00:${String(secondsLeft).padStart(2, "0")}` : "Still editable"}</span>
        </div>
        <div style={{ color: "#8E939B", fontSize: 12, lineHeight: 1.45, marginBottom: 14 }}>
          The score and first alert are already live. Add the scorer now to send the separate player alert. Only players who were on the field at the time of the goal are shown.
        </div>

        <div style={{ ...flabel, marginTop: 0 }}>Goal type</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, marginBottom: 14 }}>
          {GOAL_TYPES.map((item) => {
            const selected = goalType === item.value;
            return <button type="button" key={item.value} disabled={busy} onClick={() => changeGoalType(item.value)} style={{ ...playerButton, justifyContent: "center", background: selected ? "#4FC263" : "#0E0F11", color: selected ? "#062" : "#fff", borderColor: selected ? "#4FC263" : "#2A2C30", fontWeight: 800 }}>{item.label}</button>;
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Badge t={scorerTeam} size={24} />
          <span style={{ color: "#FFFFFF", fontSize: 13 }}>{goalType === "own_goal" ? `Own-goal scorer from ${opponentTeam.name}` : `Scorer from ${scoringTeam.name}`}</span>
        </div>
        <input autoFocus value={query} onChange={(inputEvent) => setQuery(inputEvent.target.value)} placeholder="Search on-field players" style={{ ...finp, marginBottom: 8 }} />
        <div style={{ display: "grid", gap: 7 }}>
          {filteredScorers.map((player) => (
            <button type="button" key={player.id} disabled={busy} onClick={() => { setSelectedPlayer(player); if (selectedAssist?.id === player.id) setSelectedAssist(null); }} style={{ ...playerButton, borderColor: selectedPlayer?.id === player.id ? "#4FC263" : "#2A2C30", background: selectedPlayer?.id === player.id ? "#172C1C" : "#0E0F11" }}>
              <span style={{ color: "#8E939B", width: 28 }}>{player.number ?? ""}</span><span>{player.name}</span>
            </button>
          ))}
          {eligibleScorers.length === 0 && <div role="alert" style={{ color: "#F7B4B4", fontSize: 12, lineHeight: 1.45, padding: "8px 0" }}>No eligible on-field players were found. Publish a complete lineup before kick-off, or leave this goal without a player name.</div>}
          {eligibleScorers.length > 0 && filteredScorers.length === 0 && <div style={{ color: "#8E939B", fontSize: 12, padding: "8px 0" }}>No on-field player matches that search.</div>}
        </div>
        <button type="button" disabled={busy} onClick={() => { setSelectedPlayer(null); setSelectedAssist(null); }} style={{ ...playerButton, width: "100%", marginTop: 9, color: "#F5C518", borderColor: !selectedPlayer ? "#F5C518" : "#2A2C30" }}>Leave player name unconfirmed</button>

        {goalType === "normal_goal" && selectedPlayer && (
          <div style={{ marginTop: 14 }}>
            <label htmlFor="confirmed-goal-assist" style={flabel}>Assist, optional</label>
            <select id="confirmed-goal-assist" value={selectedAssist?.id || ""} onChange={(selectEvent) => setSelectedAssist(assistOptions.find((player) => player.id === selectEvent.target.value) || null)} style={finp}>
              <option value="">No assist</option>
              {assistOptions.map((player) => <option key={player.id} value={player.id}>{player.number != null ? `${player.number} ` : ""}{player.name}</option>)}
            </select>
          </div>
        )}

        <button type="button" disabled={busy} onClick={() => onSave({ player: selectedPlayer, assist: goalType === "normal_goal" ? selectedAssist : null, goalType })} style={{ width: "100%", marginTop: 14, padding: 11, borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.45 : 1 }}>{busy ? "Saving…" : selectedPlayer ? "Confirm scorer" : "Save without player name"}</button>
        <button type="button" disabled={busy} onClick={onCancel} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff", cursor: "pointer" }}>Close for now</button>
      </div>
    </div>
  );
}

function AttributionModal({ pending, scoringTeam, scoringSquad, opponentTeam, opponentSquad, busy, onCancel, onChoose }) {
  const [query, setQuery] = useState("");
  const [goalType, setGoalType] = useState(pending.goalType || "normal_goal");
  const [cardType, setCardType] = useState(pending.type === "yellow" ? "yellow" : "straight_red");
  const [cardReason, setCardReason] = useState("");
  const [recipientType, setRecipientType] = useState("player");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedAssist, setSelectedAssist] = useState(null);
  const [hasChosenRecipient, setHasChosenRecipient] = useState(false);
  const isGoal = pending.type === "goal";
  const isCard = pending.type === "yellow" || pending.type === "red";
  const isMissedPenalty = pending.type === "miss";
  const scorerTeam = isGoal && goalType === "own_goal" ? opponentTeam : scoringTeam;
  const scorerSquad = isGoal && goalType === "own_goal" ? opponentSquad : scoringSquad;
  const filtered = scorerSquad.filter((player) => player.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12);
  const assistOptions = scoringSquad.filter((player) => player.id !== selectedPlayer?.id);
  const title = pending.type === "goal" ? "Who scored?" : pending.type === "yellow" ? "Record yellow card" : pending.type === "red" ? "Record red card" : "Record missed penalty";
  const reasonOptions = pending.type === "yellow" ? YELLOW_CARD_REASONS : RED_CARD_REASONS;
  const canSubmitCard = isCard && hasChosenRecipient && (cardType === "second_yellow" || cardReason !== "");

  function chooseGoalType(nextGoalType) {
    setGoalType(nextGoalType);
    setSelectedPlayer(null);
    setSelectedAssist(null);
    setHasChosenRecipient(false);
    setQuery("");
  }

  function chooseScorer(player) {
    setSelectedPlayer(player);
    setHasChosenRecipient(true);
    if (player?.id === selectedAssist?.id) setSelectedAssist(null);
  }

  function chooseRecipientType(nextRecipientType) {
    setRecipientType(nextRecipientType);
    setSelectedPlayer(null);
    setHasChosenRecipient(nextRecipientType === "team_official");
    setQuery("");
  }

  function submitGoal() {
    if (!hasChosenRecipient || busy) return;
    onChoose({
      player: selectedPlayer,
      assist: goalType === "normal_goal" ? selectedAssist : null,
      goalType,
    });
  }

  function submitCard() {
    if (!canSubmitCard || busy) return;
    onChoose({
      player: recipientType === "player" ? selectedPlayer : null,
      cardType,
      cardReason: cardType === "second_yellow" || cardReason === "none" ? null : cardReason,
      recipientType,
    });
  }

  function submitMissedPenalty() {
    if (!hasChosenRecipient || busy) return;
    onChoose({ player: selectedPlayer });
  }

  return (
    <div style={overlay} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ background: "#161719", border: "1px solid #2A2C30", borderRadius: 16, padding: 18, width: "100%", maxWidth: 420, maxHeight: "88vh", overflow: "auto" }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}><Badge t={scorerTeam} size={30} /><strong>{title}</strong></div>
        <div style={{ color: "#8E939B", fontSize: 12, lineHeight: 1.45, marginBottom: 12 }}>
          {isGoal
            ? goalType === "own_goal"
              ? `The goal benefits ${scoringTeam.name}. Select the scorer from ${opponentTeam.name}.`
              : "The score is shown immediately and is saved after this confirmation."
            : isMissedPenalty
              ? "Select the penalty taker if the name is known. The score will not change."
              : "Select the recipient and the official booking reason. Choose no reason recorded only when the reason is unavailable."}
        </div>

        {isGoal && (
          <>
            <div style={{ ...flabel, marginTop: 0 }}>Goal type</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, marginBottom: 14 }}>
              {GOAL_TYPES.map((item) => {
                const selected = goalType === item.value;
                return <button key={item.value} disabled={busy} onClick={() => chooseGoalType(item.value)} style={{ ...playerButton, justifyContent: "center", background: selected ? "#4FC263" : "#0E0F11", color: selected ? "#062" : "#fff", borderColor: selected ? "#4FC263" : "#2A2C30", fontWeight: 800 }}>{item.label}</button>;
              })}
            </div>
            <div style={flabel}>Scorer</div>
          </>
        )}

        {pending.type === "red" && (
          <>
            <div style={{ ...flabel, marginTop: 0 }}>Dismissal type</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, marginBottom: 14 }}>
              {[
                { value: "straight_red", label: "Straight red" },
                { value: "second_yellow", label: "Second yellow" },
              ].map((item) => {
                const selected = cardType === item.value;
                return <button key={item.value} disabled={busy} onClick={() => { setCardType(item.value); setCardReason(""); }} style={{ ...playerButton, justifyContent: "center", background: selected ? "#F04444" : "#0E0F11", borderColor: selected ? "#F04444" : "#2A2C30", fontWeight: 800 }}>{item.label}</button>;
              })}
            </div>
          </>
        )}

        {isCard && (
          <>
            <div style={flabel}>Recipient</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, marginBottom: 14 }}>
              {[
                { value: "player", label: "Player" },
                { value: "team_official", label: "Team official" },
              ].map((item) => {
                const selected = recipientType === item.value;
                return <button key={item.value} disabled={busy} onClick={() => chooseRecipientType(item.value)} style={{ ...playerButton, justifyContent: "center", borderColor: selected ? "#4FC263" : "#2A2C30", background: selected ? "#172C1C" : "#0E0F11", fontWeight: 800 }}>{item.label}</button>;
              })}
            </div>
          </>
        )}

        {(!isCard || recipientType === "player") && (
          <>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isMissedPenalty ? "Search penalty taker" : "Search squad"} style={{ ...finp, marginBottom: 8 }} />
            <div style={{ display: "grid", gap: 7 }}>
              {filtered.map((player) => (
                <button key={player.id} disabled={busy} onClick={() => chooseScorer(player)} style={{ ...playerButton, borderColor: selectedPlayer?.id === player.id ? "#4FC263" : "#2A2C30" }}>
                  <span style={{ color: "#8E939B", width: 28 }}>{player.number ?? ""}</span><span>{player.name}</span>
                </button>
              ))}
              {scorerSquad.length === 0 && <div style={{ color: "#8E939B", fontSize: 13, padding: "8px 0" }}>No players are registered for this squad.</div>}
            </div>
            <button disabled={busy} onClick={() => chooseScorer(null)} style={{ ...playerButton, width: "100%", marginTop: 10, color: "#F5C518", borderColor: hasChosenRecipient && !selectedPlayer ? "#F5C518" : "#2A2C30" }}>{isGoal ? "Record without scorer name" : isMissedPenalty ? "Record without penalty taker" : "Record without player name"}</button>
          </>
        )}

        {isCard && cardType !== "second_yellow" && (
          <div style={{ marginTop: 14 }}>
            <label htmlFor="card-reason" style={flabel}>Reason</label>
            <select id="card-reason" value={cardReason} onChange={(event) => setCardReason(event.target.value)} style={finp}>
              <option value="" disabled>Select a reason</option>
              {reasonOptions.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
            </select>
          </div>
        )}

        {isCard && cardType === "second_yellow" && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: "#0E0F11", border: "1px solid #2A2C30", color: "#C9CDD3", fontSize: 13 }}>Reason: second booking</div>
        )}

        {isGoal && hasChosenRecipient && goalType === "normal_goal" && (
          <div style={{ marginTop: 14 }}>
            <label htmlFor="goal-assist" style={flabel}>Assist, optional</label>
            <select
              id="goal-assist"
              value={selectedAssist?.id || ""}
              onChange={(event) => setSelectedAssist(assistOptions.find((player) => player.id === event.target.value) || null)}
              style={finp}
            >
              <option value="">No assist</option>
              {assistOptions.map((player) => <option key={player.id} value={player.id}>{player.number ? `${player.number} ` : ""}{player.name}</option>)}
            </select>
          </div>
        )}

        {isGoal && (
          <button disabled={busy || !hasChosenRecipient} onClick={submitGoal} style={{ width: "100%", marginTop: 14, padding: 11, borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: busy || !hasChosenRecipient ? "not-allowed" : "pointer", opacity: busy || !hasChosenRecipient ? 0.45 : 1 }}>Record goal</button>
        )}
        {isCard && (
          <button disabled={busy || !canSubmitCard} onClick={submitCard} style={{ width: "100%", marginTop: 14, padding: 11, borderRadius: 9, border: "none", background: pending.type === "yellow" ? "#F5C518" : "#F04444", color: pending.type === "yellow" ? "#241D00" : "#fff", fontWeight: 800, cursor: busy || !canSubmitCard ? "not-allowed" : "pointer", opacity: busy || !canSubmitCard ? 0.45 : 1 }}>Record {pending.type === "yellow" ? "yellow card" : "red card"}</button>
        )}
        {isMissedPenalty && (
          <button disabled={busy || !hasChosenRecipient} onClick={submitMissedPenalty} style={{ width: "100%", marginTop: 14, padding: 11, borderRadius: 9, border: "none", background: "#F5C518", color: "#241D00", fontWeight: 800, cursor: busy || !hasChosenRecipient ? "not-allowed" : "pointer", opacity: busy || !hasChosenRecipient ? 0.45 : 1 }}>Record missed penalty</button>
        )}
        <button disabled={busy} onClick={onCancel} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff", cursor: "pointer" }}>Cancel and roll back</button>
      </div>
    </div>
  );
}

function SubForm({ side, team, pools, busy, onCancel, onSave }) {
  const [incomingId, setIncomingId] = useState("");
  const [outgoingId, setOutgoingId] = useState("");
  const incomingPlayer = pools.availableSubstitutes.find((player) => player.id === incomingId);
  const outgoingPlayer = pools.onFieldPlayers.find((player) => player.id === outgoingId);
  const canSubmit = Boolean(incomingPlayer && outgoingPlayer);
  return (
    <div style={overlay} onClick={onCancel}>
      <div role="dialog" aria-modal="true" style={{ background: "#161719", borderRadius: 14, padding: 18, width: "100%", maxWidth: 340 }} onClick={(event) => event.stopPropagation()}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Substitution · {team.name}</div>
        <div style={{ color: "#8E939B", fontSize: 11, lineHeight: 1.45, marginBottom: 10 }}>
          Only current on-field players can leave. Only announced substitutes can enter.
        </div>
        <label style={flabel}>Player going off</label>
        <select value={outgoingId} onChange={(event) => setOutgoingId(event.target.value)} style={finp}>
          <option value="">Select an on-field player</option>
          {groupPlayersByPosition(pools.onFieldPlayers).map((group) => (
            <optgroup key={group.key} label={group.label}>
              {group.players.map((player) => <option key={player.id} value={player.id}>{player.number != null ? `${player.number} ` : ""}{player.name}</option>)}
            </optgroup>
          ))}
        </select>
        <label style={flabel}>Player coming on</label>
        <select value={incomingId} onChange={(event) => setIncomingId(event.target.value)} style={finp}>
          <option value="">Select an announced substitute</option>
          {groupPlayersByPosition(pools.availableSubstitutes).map((group) => (
            <optgroup key={group.key} label={group.label}>
              {group.players.map((player) => <option key={player.id} value={player.id}>{player.number != null ? `${player.number} ` : ""}{player.name}</option>)}
            </optgroup>
          ))}
        </select>
        {pools.onFieldPlayers.length === 0 && <div role="alert" style={{ color: "#F7B4B4", fontSize: 11, marginTop: 8 }}>Save the starting eleven before recording a substitution.</div>}
        {pools.onFieldPlayers.length > 0 && pools.availableSubstitutes.length === 0 && <div role="alert" style={{ color: "#F7B4B4", fontSize: 11, marginTop: 8 }}>No announced substitutes are available for this team.</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button disabled={busy} onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 9, border: "1px solid #2A2C30", background: "transparent", color: "#fff", cursor: "pointer" }}>Cancel</button>
          <button disabled={busy || !canSubmit} onClick={() => onSave(side, incomingPlayer, outgoingPlayer)} style={{ flex: 1, padding: 11, borderRadius: 9, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: busy || !canSubmit ? "not-allowed" : "pointer", opacity: busy || !canSubmit ? 0.45 : 1 }}>Add</button>
        </div>
      </div>
    </div>
  );
}

function Badge({ t, size = 40 }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", background: t.color, color: readableTextColor(t.color), border: "1px solid rgba(127,127,127,.28)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.36 }}>{t.short}</span>;
}

function PreviewField({ label: fieldLabel, children }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={{ color: "#8E939B", fontSize: 11.5, fontWeight: 650 }}>{fieldLabel}</span>{children}</label>;
}

const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16, marginBottom: 14 };
const label = { color: "#8E939B", fontSize: 12, fontWeight: 700, marginBottom: 10 };
const pill = { padding: "8px 14px", borderRadius: 9, border: "1px solid #2A2C30", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const half = { flex: 1, padding: 10, borderRadius: 8, border: "1px solid #2A2C30", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const goalButton = { width: "100%", padding: 16, borderRadius: 10, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, fontSize: 18, cursor: "pointer", marginBottom: 8 };
const undoButton = { width: "100%", padding: 8, borderRadius: 8, border: "1px solid #2A2C30", background: "transparent", color: "#8E939B", fontSize: 12, cursor: "pointer", marginBottom: 10 };
const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 };
const flabel = { display: "block", color: "#8E939B", fontSize: 12, fontWeight: 600, margin: "8px 0 4px" };
const finp = { width: "100%", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none" };
const playerButton = { display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "10px 11px", borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", cursor: "pointer", fontSize: 14 };
const stoppageButton = { padding: "9px 4px", borderRadius: 8, border: "1px solid #2A2C30", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const statInput = { width: "100%", minWidth: 0, padding: "10px 6px", borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, textAlign: "center", outline: "none" };
