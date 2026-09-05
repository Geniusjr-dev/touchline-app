"use client";
import { useCallback, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Share2, MapPin, Calendar, Disc3, ArrowUp, ArrowDown } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { announcedStoppageMinutes, EMPTY_MATCH_STATS, formatMatchClock, getMatch, getMatchTable } from "@/lib/db";
import { cachePublicMatch, readPublicMatch } from "@/lib/matchCache";
import { DEFAULT_FORMATION, getFormationSlots } from "@/lib/formations";
import { supabase } from "@/lib/supabase";
import { Crest, BottomNav } from "@/components/ui";
import MatchNotificationButton from "@/components/MatchNotificationButton";

const TABS_PRE = ["Preview", "Lineup", "Table", "Stats", "H2H"];
const TABS_LIVE = ["Facts", "Commentary", "Lineup", "Table", "Stats", "H2H"];

function withDeadline(promise, milliseconds = 6000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("The match request timed out.")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function goalsBySide(events, side) {
  return (events || []).filter((e) => e.type === "goal" && e.side === side).length;
}

function hasKnownScorer(player) {
  const name = player?.trim().toLowerCase();
  return Boolean(name && !["unknown", "unknown scorer", "unknown player", "n/a", "na"].includes(name));
}

function readableTextColor(color) {
  const hex = String(color || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#FFFFFF";
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 155 ? "#07130B" : "#FFFFFF";
}

function MonoFootball({ size = 14, color = "#FFFFFF" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 512 512" width={size} height={size} style={{ display: "inline-block", flex: "0 0 auto", color }}>
      {/* Font Awesome Free futbol icon, used as a fixed monochrome match symbol. */}
      <path fill="currentColor" d="M417.3 360.1l-71.6-4.8c-5.2-.3-10.3 1.1-14.5 4.2s-7.2 7.4-8.4 12.5l-17.6 69.6C289.5 445.8 273 448 256 448s-33.5-2.2-49.2-6.4L189.2 372c-1.3-5-4.3-9.4-8.4-12.5s-9.3-4.5-14.5-4.2l-71.6 4.8c-17.6-27.2-28.5-59.2-30.4-93.6L125 228.3c4.4-2.8 7.6-7 9.2-11.9s1.4-10.2-.5-15l-26.7-66.6C128 109.2 155.3 89 186.7 76.9l55.2 46c4 3.3 9 5.1 14.1 5.1s10.2-1.8 14.1-5.1l55.2-46c31.3 12.1 58.7 32.3 79.6 57.9l-26.7 66.6c-1.9 4.8-2.1 10.1-.5 15s4.9 9.1 9.2 11.9l60.7 38.2c-1.9 34.4-12.8 66.4-30.4 93.6zM256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm14.1-325.7c-8.4-6.1-19.8-6.1-28.2 0L194 221c-8.4 6.1-11.9 16.9-8.7 26.8l18.3 56.3c3.2 9.9 12.4 16.6 22.8 16.6h59.2c10.4 0 19.6-6.7 22.8-16.6l18.3-56.3c3.2-9.9-.3-20.7-8.7-26.8l-47.9-34.8z" />
    </svg>
  );
}

function goalTypeSuffix(goalType) {
  if (goalType === "penalty") return " (Pen)";
  if (goalType === "own_goal") return " (OG)";
  if (goalType === "free_kick") return " (FK)";
  return "";
}

function goalTypeName(goalType) {
  if (goalType === "penalty") return "Penalty";
  if (goalType === "own_goal") return "Own goal";
  if (goalType === "free_kick") return "Free kick";
  return null;
}

function breakClock(match) {
  const duration = Number(match.matchDurationMinutes || 90);
  const extraTime = Number(match.extraTimeMinutes || 30);
  const minute = match.status === "et_ht" ? duration + extraTime / 2 : duration / 2;
  return `${minute}:00`;
}

function matchDateLabel(dateKey, kickoff) {
  if (!dateKey) return kickoff || "Date to be confirmed";
  const matchDate = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(matchDate.getTime())) return [dateKey, kickoff].filter(Boolean).join(" · ");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const difference = Math.round((matchDate.getTime() - today.getTime()) / 86400000);
  const day = difference === 0
    ? "Today"
    : difference === 1
      ? "Tomorrow"
      : difference === -1
        ? "Yesterday"
        : matchDate.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: matchDate.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  return [day, kickoff].filter(Boolean).join(" · ");
}

function matchStageLabel(match) {
  if (match.round) return match.round;
  if (match.competitionType === "tournament" && match.groupNumber) {
    return `Group ${String.fromCharCode(64 + Number(match.groupNumber))}`;
  }
  return "";
}

function statsAvailableForMatch(match, now) {
  if (!match) return false;
  if (["live", "ht", "et_live", "et_ht", "ft"].includes(match.status)) return true;
  if (match.status !== "scheduled" || !match.date || !match.time || !now) return false;
  const kickoffTime = new Date(`${match.date}T${match.time}`).getTime();
  if (!Number.isFinite(kickoffTime)) return false;
  return now >= kickoffTime - 30 * 60 * 1000;
}

function LiveMatchClock({ match, theme, announcedStoppage }) {
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const ticker = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, []);
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: theme.red, fontSize: 11, fontWeight: 700, marginTop: 3 }}>
      <span className="inline-block rounded-full animate-pulse" style={{ width: 6, height: 6, background: theme.red }} />
      {match.status === "et_live" ? "ET " : ""}{formatMatchClock(match, clockNow)}{announcedStoppage ? ` · +${announcedStoppage} added` : ""}
    </span>
  );
}

function scorerSummary(events, side) {
  const grouped = new Map();
  (events || []).filter((event) => event.type === "goal" && event.side === side && hasKnownScorer(event.player)).forEach((event) => {
    const player = event.player.trim();
    const minute = `${fotMobMinuteLabel(event.min || `${event.displayMinute || 1}'`)}${goalTypeSuffix(event.goalType)}`;
    if (!grouped.has(player)) grouped.set(player, []);
    grouped.get(player).push(minute);
  });
  return [...grouped.entries()].map(([player, minutes]) => `${player} ${minutes.join(", ")}`);
}

export default function MatchCentre({ id }) {
  const { t, mode } = useTheme();
  const router = useRouter();
  const [state, setState] = useState(null);
  const [tab, setTab] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [availabilityNow, setAvailabilityNow] = useState(0);
  const refreshTimerRef = useRef(null);
  const tableRequestRef = useRef("");
  const tableRowsRef = useRef(new Map());
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  const load = useCallback(async (force = false) => {
    try {
      const next = await withDeadline(getMatch(id, { force }));
      if (!next?.match) {
        setLoadError("This match is unavailable.");
        return;
      }
      const table = tableRowsRef.current.get(next.match.id) || [];
      const updated = { ...next, detail: { ...(next.detail || {}), table } };
      setState(updated);
      setLoadError("");
      cachePublicMatch(updated.match, updated.teams, updated.detail);
    } catch {
      setLoadError("The match could not be refreshed. Check your connection and try again.");
    }
  }, [id]);

  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => load(true), 140);
  }, [load]);

  async function shareMatch() {
    const shareData = { title: "Touchline match", url: window.location.href };
    if (navigator.share) {
      await navigator.share(shareData).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(window.location.href).catch(() => {});
  }

  useEffect(() => {
    const cached = readPublicMatch(id);
    if (cached?.match) setState(cached);
    load();
    let ch;
    if (supabase) {
      ch = supabase.channel("m-" + id)
        .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `match_id=eq.${id}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${id}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_statistics", filter: `match_id=eq.${id}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_lineups", filter: `match_id=eq.${id}` }, scheduleRefresh)
        .subscribe();
    }
    return () => {
      window.clearTimeout(refreshTimerRef.current);
      if (ch) supabase.removeChannel(ch);
    };
  }, [id, load, scheduleRefresh]);

  useEffect(() => {
    const updateAvailability = () => setAvailabilityNow(Date.now());
    updateAvailability();
    const ticker = window.setInterval(updateAvailability, 30000);
    return () => window.clearInterval(ticker);
  }, []);

  useEffect(() => {
    const match = state?.match;
    if (!match || match.competitionType === "friendly") return;
    const signature = `${match.id}:${match.status}:${match.hs}:${match.as}`;
    if (tableRequestRef.current === signature) return;
    tableRequestRef.current = signature;
    getMatchTable(match).then((table) => {
      tableRowsRef.current.set(match.id, table);
      setState((current) => {
        if (current?.match?.id !== match.id) return current;
        const updated = { ...current, detail: { ...(current.detail || {}), table } };
        cachePublicMatch(updated.match, updated.teams, updated.detail);
        return updated;
      });
    }).catch(() => {
      tableRequestRef.current = "";
    });
  }, [state?.match]);

  if (!state) return <MatchPageShell t={t} onBack={goBack} error={loadError} onRetry={load} />;
  const { match: m, teams, detail: d } = state;
  if (!m) return <MatchPageShell t={t} onBack={goBack} error="Match not found." onRetry={load} />;

  const h = teams[m.home] || { name: "TBD", short: "?", color: "#555" };
  const a = teams[m.away] || { name: "TBD", short: "?", color: "#555" };
  const homeKitColor = m.homeKitColor || h.color || "#18A558";
  const awayKitColor = m.awayKitColor || a.color || "#2563EB";
  const live = ["live", "ht", "et_live", "et_ht"].includes(m.status);
  const ended = m.status === "ft";
  const started = live || ended;
  const statsAvailable = statsAvailableForMatch(m, availabilityNow);
  const hasLineups = Object.values(d?.lineups || {}).some((lineup) => lineup.starters?.length || lineup.substitutes?.length);
  const availableTabs = (started ? TABS_LIVE : TABS_PRE)
    .filter((item) => item !== "Table" || m.competitionType !== "friendly")
    .filter((item) => item !== "Stats" || statsAvailable);
  const tabs = availableTabs.filter((item) => item !== "Lineup" || hasLineups);
  const defaultTab = started ? "Facts" : "Preview";
  const activeTab = tab && tabs.includes(tab) ? tab : defaultTab;
  const hs = m.hs != null ? m.hs : 0, as = m.as != null ? m.as : 0;
  const announcedStoppage = announcedStoppageMinutes(m);
  const homeScorers = scorerSummary(d?.events, "home");
  const awayScorers = scorerSummary(d?.events, "away");
  const hasScorerSummary = homeScorers.length > 0 || awayScorers.length > 0;

  return (
    <div style={{ background: t.bg, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 74 }}>
      {/* The complete match identity, score and tabs remain visible while content scrolls. */}
      <div style={{ position: "sticky", top: 0, zIndex: 70, background: t.bg, boxShadow: `0 1px 0 ${t.divider}`, transform: "translateZ(0)", isolation: "isolate" }}>
        <div className="flex items-center justify-between px-3" style={{ height: 46 }}>
          <button aria-label="Return to matches" onClick={goBack} className="flex items-center justify-center rounded-full" style={{ width: 36, height: 36, background: t.pill, border: `1px solid ${t.divider}` }}>
            <ChevronLeft size={21} color={t.text} />
          </button>
          <div className="flex items-center rounded-full" style={{ height: 36, background: t.pill, border: `1px solid ${t.divider}` }}>
            <button aria-label="Share match" onClick={shareMatch} className="flex items-center justify-center" style={{ width: 38, height: 34 }}>
              <Share2 size={16} color={t.text} />
            </button>
            <span style={{ width: 1, height: 20, background: t.divider }} />
            <MatchNotificationButton matchId={m.id} status={m.status} color={t.text} />
          </div>
        </div>

        <div className="grid items-start px-7 pb-2" style={{ gridTemplateColumns: "minmax(0, 1fr) 96px minmax(0, 1fr)", minHeight: 66 }}>
          <Link aria-label={h.name} href={`/team/${m.home}`} className="flex flex-col items-center min-w-0">
            <Crest short={h.short} color={homeKitColor} logo={h.logoUrl} size={40} ring={t.divider} />
            <span className="text-center mt-1" style={{ color: t.text, fontSize: 10.5, fontWeight: 650, lineHeight: 1.15, maxWidth: 116 }}>{h.name}</span>
          </Link>
          <div className="flex flex-col items-center pt-0.5 min-w-0">
            {m.status === "scheduled"
              ? <span style={{ color: t.text, fontSize: 22, fontWeight: 750, whiteSpace: "nowrap" }}>{m.time || "TBD"}</span>
              : <span className="flex items-center gap-2" style={{ color: t.text, fontSize: 25, fontWeight: 750, whiteSpace: "nowrap" }}>{hs} <span style={{ color: t.dim }}>-</span> {as}</span>}
            {m.status === "ht" && <span style={{ color: t.dim, fontSize: 10, fontWeight: 650, marginTop: 2 }}>Half time · {breakClock(m)}</span>}
            {m.status === "et_ht" && <span style={{ color: t.dim, fontSize: 10, fontWeight: 650, marginTop: 2 }}>ET break · {breakClock(m)}</span>}
            {(m.status === "live" || m.status === "et_live") && <LiveMatchClock match={m} theme={t} announcedStoppage={announcedStoppage} />}
            {ended && <span style={{ color: t.dim, fontSize: 10, fontWeight: 650, marginTop: 2 }}>Full time</span>}
          </div>
          <Link aria-label={a.name} href={`/team/${m.away}`} className="flex flex-col items-center min-w-0">
            <Crest short={a.short} color={awayKitColor} logo={a.logoUrl} size={40} ring={t.divider} />
            <span className="text-center mt-1" style={{ color: t.text, fontSize: 10.5, fontWeight: 650, lineHeight: 1.15, maxWidth: 116 }}>{a.name}</span>
          </Link>
        </div>

        {hasScorerSummary && (
          <div className="grid px-7 pb-2" style={{ gridTemplateColumns: "minmax(0, 1fr) 16px minmax(0, 1fr)", columnGap: 6, alignItems: "start" }}>
            <div style={{ color: t.dim, fontSize: 10, lineHeight: 1.3, textAlign: "right", minWidth: 0 }}>
              {homeScorers.map((scorer) => <div key={scorer}>{scorer}</div>)}
            </div>
            <span className="inline-flex justify-center" style={{ paddingTop: 1 }}><MonoFootball size={10} color={t.text} /></span>
            <div style={{ color: t.dim, fontSize: 10, lineHeight: 1.3, textAlign: "left", minWidth: 0 }}>
              {awayScorers.map((scorer) => <div key={scorer}>{scorer}</div>)}
            </div>
          </div>
        )}

        <div className="flex items-center gap-5 px-4 overflow-x-auto no-scrollbar" style={{ height: 42, borderBottom: `1px solid ${t.divider}`, borderTop: `1px solid ${t.divider}` }}>
          {tabs.map((tb) => {
            const on = tb === activeTab;
            return (
              <button key={tb} onClick={() => setTab(tb)} className="shrink-0 relative h-full" style={{ color: on ? t.text : t.tab, fontSize: 13, fontWeight: on ? 750 : 600 }}>
                {tb}{on && <span className="absolute left-0 right-0" style={{ bottom: 0, height: 3, background: t.text, borderRadius: 3 }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* content */}
      {(activeTab === "Preview" || activeTab === "Facts") && <FactsPreview t={t} m={m} d={d} started={started} />}
      {activeTab === "Commentary" && <Commentary t={t} m={m} d={d} h={h} a={a} />}
      {activeTab === "Lineup" && <LineupTab t={t} mode={mode} m={m} h={h} a={a} lineups={d?.lineups || {}} events={d?.events || []} homeColor={homeKitColor} awayColor={awayKitColor} />}
      {activeTab === "Stats" && <StatsTab t={t} stats={d?.stats} homeColor={homeKitColor} awayColor={awayKitColor} />}
      {activeTab === "Table" && <TableTab t={t} m={m} rows={d?.table || []} />}
      {activeTab === "H2H" && <H2H t={t} h={h} a={a} homeId={m.home} awayId={m.away} meetings={d?.h2h || []} />}

      <BottomNav t={t} active="Matches" />
    </div>
  );
}

function MatchPageShell({ t, onBack, error, onRetry }) {
  return (
    <div style={{ background: t.bg, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 74 }}>
      <div className="flex items-center justify-between px-3" style={{ height: 48 }}>
        <button onClick={onBack} aria-label="Return to matches" className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: t.pill }}>
          <ChevronLeft size={22} color={t.text} />
        </button>
        <div className="rounded-full" style={{ width: 82, height: 38, background: t.pill }} />
      </div>
      <div className="grid items-center px-8" style={{ height: 104, gridTemplateColumns: "1fr 90px 1fr" }}>
        <div className="rounded-full mx-auto" style={{ width: 44, height: 44, background: t.card }} />
        <div className="rounded-lg mx-auto" style={{ width: 54, height: 24, background: t.card }} />
        <div className="rounded-full mx-auto" style={{ width: 44, height: 44, background: t.card }} />
      </div>
      <div style={{ height: 46, borderBottom: `1px solid ${t.divider}`, borderTop: `1px solid ${t.divider}` }} />
      {error && (
        <div className="mx-3 mt-4 rounded-2xl" style={{ padding: 18, background: t.card, color: t.text }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{error}</div>
          <button onClick={onRetry} style={{ marginTop: 12, padding: "8px 14px", borderRadius: 9, background: t.accent, color: "#07130B", fontSize: 13, fontWeight: 800 }}>Try again</button>
        </div>
      )}
      <BottomNav t={t} active="Matches" />
    </div>
  );
}

function Card({ t, children, style }) { return <div className="mx-3 my-2 rounded-2xl" style={{ background: t.card, ...style }}>{children}</div>; }
function Empty({ t, title, note }) {
  return <Card t={t} style={{ padding: "40px 16px" }}>
    <div className="text-center">
      <div style={{ color: t.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ color: t.dim, fontSize: 13 }}>{note}</div>
    </div>
  </Card>;
}

function StatsTab({ t, stats, homeColor, awayColor }) {
  const s = { ...EMPTY_MATCH_STATS, ...(stats || {}) };
  const homeTextColor = readableTextColor(homeColor);
  const awayTextColor = readableTextColor(awayColor);
  const rows = [
    ["Total shots", s.home_total_shots, s.away_total_shots],
    ["Shots on target", s.home_shots_on_target, s.away_shots_on_target],
    ["Corners", s.home_corners, s.away_corners],
    ["Fouls", s.home_fouls, s.away_fouls],
    ["Offsides", s.home_offsides, s.away_offsides],
    ["Yellow cards", s.home_yellow_cards, s.away_yellow_cards],
    ["Red cards", s.home_red_cards, s.away_red_cards],
  ];
  return (
    <Card t={t} style={{ padding: "18px 16px 16px" }}>
      <div className="text-center" style={{ color: t.text, fontSize: 13, marginBottom: 8 }}>Ball possession</div>
      <div className="flex overflow-hidden" style={{ height: 34, borderRadius: 18, marginBottom: 14 }}>
        <div className="flex items-center px-3" style={{ width: `${s.home_possession}%`, background: homeColor, color: homeTextColor, fontSize: 15, fontWeight: 850 }}>{s.home_possession}%</div>
        <div className="flex items-center justify-end px-3" style={{ width: `${s.away_possession}%`, background: awayColor, color: awayTextColor, fontSize: 15, fontWeight: 850 }}>{s.away_possession}%</div>
      </div>
      {rows.map(([label, home, away]) => {
        const homeLeads = Number(home) > Number(away);
        const awayLeads = Number(away) > Number(home);
        return (
          <div key={label} className="grid items-center py-2" style={{ gridTemplateColumns: "44px 1fr 44px" }}>
            <StatValue value={home} leading={homeLeads} color={homeColor} textColor={homeTextColor} side="home" theme={t} />
            <span className="text-center" style={{ color: t.text, fontSize: 13 }}>{label}</span>
            <StatValue value={away} leading={awayLeads} color={awayColor} textColor={awayTextColor} side="away" theme={t} />
          </div>
        );
      })}
    </Card>
  );
}

function StatValue({ value, leading, color, textColor, side, theme }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        justifySelf: side === "home" ? "start" : "end",
        minWidth: 30,
        height: 24,
        padding: "0 7px",
        background: leading ? color : "transparent",
        color: leading ? textColor : theme.text,
        fontSize: 13,
        fontWeight: leading ? 800 : 700,
      }}
    >
      {value}
    </span>
  );
}

function LineupTab({ t, mode, m, h, a, lineups, events, homeColor, awayColor }) {
  const homeLineup = lineups[m.home] || { formation: null, starters: [], substitutes: [] };
  const awayLineup = lineups[m.away] || { formation: null, starters: [], substitutes: [] };
  const hasStarters = homeLineup.starters.length || awayLineup.starters.length;
  const hasSubstitutes = homeLineup.substitutes.length || awayLineup.substitutes.length;
  const pitchHeader = "#078F59";
  const pitchBackground = "linear-gradient(180deg, #0AA466 0%, #07975E 52%, #0AA466 100%)";
  if (!hasStarters && !hasSubstitutes) return null;
  return (
    <div style={{ paddingTop: 8 }}>
      {hasStarters ? (
        <div style={{ overflow: "hidden", background: pitchHeader }}>
          <LineupTeamHeading team={h} formation={homeLineup.formation} color={homeColor} background={pitchHeader} side="home" />
          <div style={{ position: "relative", height: "clamp(600px, 152vw, 720px)", background: pitchBackground, overflow: "hidden" }}>
            <PublicPitchMarkings line={t.pitchLine} />
            {homeLineup.starters.map((player, fallbackIndex) => (
              <TacticalLineupPlayer
                key={`home-${player.id}`}
                player={player}
                fallbackIndex={fallbackIndex}
                formation={homeLineup.formation}
                side="home"
                mode={mode}
                events={events}
              />
            ))}
            {awayLineup.starters.map((player, fallbackIndex) => (
              <TacticalLineupPlayer
                key={`away-${player.id}`}
                player={player}
                fallbackIndex={fallbackIndex}
                formation={awayLineup.formation}
                side="away"
                mode={mode}
                events={events}
              />
            ))}
          </div>
          <LineupTeamHeading team={a} formation={awayLineup.formation} color={awayColor} background={pitchHeader} side="away" />
        </div>
      ) : null}

      {hasSubstitutes ? (
        <Card t={t} style={{ overflow: "hidden", borderRadius: 13 }}>
          <div className="px-3 py-2.5" style={{ color: t.text, fontSize: 12, fontWeight: 800, background: t.groupHead, borderBottom: `1px solid ${t.divider}` }}>Substitutes</div>
          <div className="grid grid-cols-2" style={{ minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <SubstituteTeamHeading team={h} color={homeColor} t={t} />
              <SubstituteList players={homeLineup.substitutes} side="home" events={events} t={t} />
            </div>
            <div style={{ minWidth: 0, borderLeft: `1px solid ${t.divider}` }}>
              <SubstituteTeamHeading team={a} color={awayColor} t={t} away />
              <SubstituteList players={awayLineup.substitutes} side="away" events={events} t={t} away />
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function LineupTeamHeading({ team, formation, color, background, side }) {
  const away = side === "away";
  return (
    <div className={`flex items-center gap-2.5 px-4 ${away ? "flex-row-reverse text-right" : ""}`} style={{ minHeight: 46, background }}>
      <Crest short={team.short} color={color} logo={team.logoUrl} size={24} ring="rgba(255,255,255,.22)" />
      <strong className="truncate" style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 750 }}>{team.name}</strong>
      <span style={{ color: "rgba(255,255,255,.72)", fontSize: 12.5, fontWeight: 650 }}>{formation || DEFAULT_FORMATION}</span>
    </div>
  );
}

function PublicPitchMarkings({ line }) {
  const pitchBorder = `3px solid ${line}`;
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: "12px 8px", border: pitchBorder, pointerEvents: "none" }}>
      <span style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: pitchBorder }} />
      <span style={{ position: "absolute", width: 112, height: 112, left: "50%", top: "50%", transform: "translate(-50%, -50%)", border: pitchBorder, borderRadius: "50%" }} />
      <span style={{ position: "absolute", width: 7, height: 7, left: "50%", top: "50%", transform: "translate(-50%, -50%)", background: line, borderRadius: "50%" }} />
      <span style={{ position: "absolute", width: "48%", height: 100, left: "50%", top: -3, transform: "translateX(-50%)", border: pitchBorder, borderTop: 0 }} />
      <span style={{ position: "absolute", width: "23%", height: 42, left: "50%", top: -3, transform: "translateX(-50%)", border: pitchBorder, borderTop: 0 }} />
      <span style={{ position: "absolute", width: 112, height: 56, left: "50%", top: 98, transform: "translateX(-50%)", border: pitchBorder, borderTop: 0, borderRadius: "0 0 60px 60px" }} />
      <span style={{ position: "absolute", width: 6, height: 6, left: "50%", top: 76, transform: "translateX(-50%)", background: line, borderRadius: "50%" }} />
      <span style={{ position: "absolute", width: "48%", height: 100, left: "50%", bottom: -3, transform: "translateX(-50%)", border: pitchBorder, borderBottom: 0 }} />
      <span style={{ position: "absolute", width: "23%", height: 42, left: "50%", bottom: -3, transform: "translateX(-50%)", border: pitchBorder, borderBottom: 0 }} />
      <span style={{ position: "absolute", width: 112, height: 56, left: "50%", bottom: 98, transform: "translateX(-50%)", border: pitchBorder, borderBottom: 0, borderRadius: "60px 60px 0 0" }} />
      <span style={{ position: "absolute", width: 6, height: 6, left: "50%", bottom: 76, transform: "translateX(-50%)", background: line, borderRadius: "50%" }} />
    </div>
  );
}

function TacticalLineupPlayer({ player, fallbackIndex, formation, side, mode, events }) {
  const slots = getFormationSlots(formation || DEFAULT_FORMATION);
  const slotIndex = Number.isInteger(player.slotIndex) ? player.slotIndex : fallbackIndex;
  const slot = slots[slotIndex] || slots[fallbackIndex] || slots[0];
  const naturalLeft = Math.max(9, Math.min(91, slot.x));
  const left = side === "away" ? 100 - naturalLeft : naturalLeft;
  const halfPosition = Math.max(12.5, Math.min(46, 50 - slot.y * 0.4));
  const top = side === "away" ? 100 - halfPosition : halfPosition;
  return (
    <div style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: 68, transform: "translate(-50%, -50%)", textAlign: "center", zIndex: 2 }}>
      <span className="inline-flex relative">
        {player.photoUrl ? (
          <span className="inline-flex rounded-full overflow-hidden" style={{ width: 42, height: 42, background: mode === "light" ? "rgba(255,255,255,.22)" : "#414141", border: "2px solid rgba(255,255,255,.48)", boxShadow: "0 3px 8px rgba(0,0,0,.40)" }}>
            {/* Supabase public media URLs are administrator controlled player assets. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={player.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </span>
        ) : (
          <NeutralPlayerAvatar size={42} />
        )}
        <LineupEventBadges player={player} side={side} events={events} />
      </span>
      <strong style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", marginTop: 3, color: "#FFFFFF", fontSize: 9.5, lineHeight: 1.15, fontWeight: 700, textShadow: "0 1px 4px rgba(0,0,0,.95)" }}>
        {player.number != null ? `${player.number} ` : ""}{player.displayName || player.name}
      </strong>
    </div>
  );
}

function NeutralPlayerAvatar({ size = 50 }) {
  return (
    <span className="inline-flex rounded-full overflow-hidden" style={{ width: size, height: size, background: "#E5E6E8", border: "1px solid rgba(255,255,255,.50)", boxShadow: "0 3px 8px rgba(0,0,0,.28)" }}>
      <svg aria-hidden="true" viewBox="0 0 50 50" width={size} height={size}>
        <circle cx="25" cy="25" r="25" fill="#E5E6E8" />
        <circle cx="25" cy="18" r="9" fill="#C9CBCE" />
        <path d="M8 48c1.5-11 8-17 17-17s15.5 6 17 17H8z" fill="#C9CBCE" />
      </svg>
    </span>
  );
}

function normalizedLineupName(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function lineupEventCounts(events, player, side) {
  const playerName = normalizedLineupName(player.name);
  return (events || []).reduce((counts, event) => {
    if (event.type !== "goal") return counts;
    const scorerSide = event.goalType === "own_goal"
      ? (event.side === "home" ? "away" : "home")
      : event.side;
    const scorerMatches = event.playerId
      ? event.playerId === player.id
      : scorerSide === side && normalizedLineupName(event.player) === playerName;
    if (scorerMatches && scorerSide === side) {
      if (event.goalType === "own_goal") counts.ownGoals += 1;
      else counts.goals += 1;
    }
    if (event.side === side && normalizedLineupName(event.assist) === playerName) counts.assists += 1;
    return counts;
  }, { goals: 0, ownGoals: 0, assists: 0 });
}

function FootballBoot({ size = 12 }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size}>
      <path fill="currentColor" d="M5.2 3.2h6.1l1.1 6.1c.2 1 1 1.8 2 2.1l5.1 1.7c1 .3 1.7 1.3 1.7 2.4v2.1H4.8c-1.1 0-2-.9-2-2v-1.8c0-.8.5-1.5 1.2-1.8l2.6-1.1-1.4-7.7Zm2.4 8.5 4.1-1.8-.5-2.2-4.1 1.8.5 2.2Zm4.9 6.9h2.2v2.2h-2.2v-2.2Zm-5 0h2.2v2.2H7.5v-2.2Zm10 0h2.2v2.2h-2.2v-2.2Z" />
    </svg>
  );
}

function LineupEventBadges({ player, side, events, compact = false }) {
  const counts = lineupEventCounts(events, player, side);
  const markers = [
    ...Array.from({ length: counts.assists }, (_, index) => ({ type: "assist", key: `assist-${index}` })),
    ...Array.from({ length: counts.goals }, (_, index) => ({ type: "goal", key: `goal-${index}` })),
    ...Array.from({ length: counts.ownGoals }, (_, index) => ({ type: "own_goal", key: `own-goal-${index}` })),
  ];
  if (!markers.length) return null;
  const markerSize = compact ? 15 : 19;
  return (
    <span className="absolute inline-flex items-center" style={{ right: compact ? -5 : -7, bottom: compact ? -4 : -5, zIndex: 3 }}>
      {markers.map((marker, index) => (
        <span
          key={marker.key}
          className="inline-flex items-center justify-center rounded-full"
          title={marker.type === "assist" ? "Assist" : marker.type === "own_goal" ? "Own goal" : "Goal"}
          style={{
            width: markerSize,
            height: markerSize,
            marginLeft: index ? -3 : 0,
            background: "#FFFFFF",
            border: marker.type === "own_goal" ? "1px solid #F05D66" : "1px solid rgba(0,0,0,.22)",
            color: marker.type === "own_goal" ? "#F05D66" : "#151515",
            boxShadow: "0 1px 3px rgba(0,0,0,.34)",
          }}
        >
          {marker.type === "assist"
            ? <FootballBoot size={compact ? 10 : 12} />
            : <MonoFootball size={compact ? 9 : 11} color="currentColor" />}
        </span>
      ))}
    </span>
  );
}

function SubstituteTeamHeading({ team, color, t, away = false }) {
  return (
    <div className={`flex items-center gap-2 px-3 ${away ? "flex-row-reverse text-right" : ""}`} style={{ height: 36, background: t.chip, borderBottom: `1px solid ${t.divider}` }}>
      <Crest short={team.short} color={color} logo={team.logoUrl} size={20} ring={t.divider} />
      <span className="truncate" style={{ color: t.text, fontSize: 10.5, fontWeight: 700 }}>{team.name}</span>
    </div>
  );
}

function SubstituteList({ players, side, events, t, away = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      {players.map((player, index) => (
        <div key={player.id} className={`flex items-center gap-2 px-3 py-2 ${away ? "flex-row-reverse text-right" : ""}`} style={{ minHeight: 46, borderBottom: index === players.length - 1 ? "none" : `1px solid ${t.divider}` }}>
          <span className="inline-flex relative" style={{ flex: "0 0 auto" }}>
            {player.photoUrl ? (
              <span className="inline-flex rounded-full overflow-hidden" style={{ width: 30, height: 30, background: t.chip }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={player.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </span>
            ) : (
              <NeutralPlayerAvatar size={30} />
            )}
            <LineupEventBadges player={player} side={side} events={events} compact />
          </span>
          <span style={{ minWidth: 0 }}>
            <strong className="block truncate" style={{ color: t.text, fontSize: 11 }}>{player.displayName || player.name}</strong>
            <span className="block truncate" style={{ color: t.dim, fontSize: 9.5 }}>{player.position || "Substitute"}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- Facts / Preview ----------
function FactsPreview({ t, m, d, started }) {
  const hasVenue = Boolean(m.venueName || m.venueLocation || m.venueCapacity || m.venueSurface || m.weather);
  const stage = matchStageLabel(m);
  const competition = [m.compName || "Match", stage].filter(Boolean).join(" · ");
  const capacity = Number(m.venueCapacity);
  return (
    <div>
      {hasVenue && (
        <Card t={t}>
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <Disc3 size={20} color={t.dim} />
              <div className="min-w-0">
                <div className="truncate" style={{ color: t.text, fontSize: 16, fontWeight: 750 }}>{m.venueName || "Match venue"}</div>
                {m.venueLocation && <div className="truncate" style={{ color: t.dim, fontSize: 13 }}>{m.venueLocation}</div>}
              </div>
            </div>
            <span className="inline-flex items-center justify-center rounded-full shrink-0" style={{ width: 34, height: 34, background: t.chip }}><MapPin size={16} color={t.accent} /></span>
          </div>
          {(m.venueCapacity || m.venueSurface) && <div style={{ height: 1, background: t.divider }} />}
          {(m.venueCapacity || m.venueSurface) && (
            <div className="flex items-center gap-8 px-4 py-3">
              {m.venueCapacity && <span style={{ color: t.text, fontSize: 14 }}><b>Capacity</b> <span style={{ color: t.dim }}>{Number.isFinite(capacity) ? capacity.toLocaleString() : m.venueCapacity}</span></span>}
              {m.venueSurface && <span style={{ color: t.text, fontSize: 14 }}><b>Surface</b> <span style={{ color: t.dim }}>{m.venueSurface}</span></span>}
            </div>
          )}
          {m.weather && <div style={{ height: 1, background: t.divider }} />}
          {m.weather && <div className="px-4 py-3" style={{ color: t.text, fontSize: 14 }}><b>Weather</b> <span style={{ color: t.dim }}>{m.weather}</span></div>}
        </Card>
      )}

      <Card t={t}>
        <div className="px-4 py-3 flex items-center gap-3"><Calendar size={17} color={t.dim} /><span style={{ color: t.text, fontSize: 14, fontWeight: 650 }}>{matchDateLabel(m.date, m.time)}</span></div>
        <div style={{ height: 1, background: t.divider }} />
        <div className="px-4 py-3 flex items-center gap-3"><span className="rounded-full px-3 py-1" style={{ background: t.chip, color: t.text, fontSize: 13, fontWeight: 650 }}>{competition}</span></div>
        {m.refereeName && <div style={{ height: 1, background: t.divider }} />}
        {m.refereeName && <div className="px-4 py-3 flex items-center gap-3"><Disc3 size={17} color={t.dim} /><span style={{ color: t.text, fontSize: 14 }}>Referee <b>{m.refereeName}</b></span></div>}
      </Card>

      {started && d ? <Timeline t={t} events={d.events} match={m} /> : null}
    </div>
  );
}

function Timeline({ t, events = [], match }) {
  const timelineEvents = [...events];
  const currentPeriod = Number(match.current_period || 0);
  const showHalfTime = match.status === "ht" || match.status === "ft" || currentPeriod >= 2;
  const hasHalfTime = timelineEvents.some((event) => event.type === "half");
  const hasFullTime = timelineEvents.some((event) => event.type === "full");

  if (showHalfTime && !hasHalfTime) {
    const firstHalfEvents = events.filter((event) => Number(event.period || 1) === 1);
    timelineEvents.push({
      type: "half",
      label: "HT",
      score: `${goalsBySide(firstHalfEvents, "home")} - ${goalsBySide(firstHalfEvents, "away")}`,
      m: 199999,
    });
  }
  if (match.status === "ft" && !hasFullTime) {
    timelineEvents.push({ type: "full", label: "FT", score: `${match.hs} - ${match.as}`, m: 999999 });
  }
  if (!timelineEvents.length) return null;
  const sorted = timelineEvents.sort((x, y) => x.m - y.m);
  return (
    <Card t={t} style={{ paddingTop: 4, paddingBottom: 8 }}>
      <div className="px-3">{sorted.map((e, i) => <Ev key={i} e={e} t={t} />)}</div>
    </Card>
  );
}
function RunScore({ score, scored, t }) {
  const [x, y] = String(score || "0 - 0").split(" - ");
  return <span style={{ color: t.dim, fontSize: 13 }}>(<span style={{ color: scored === "home" ? t.green : t.dim, fontWeight: 700 }}>{x}</span> - <span style={{ color: scored === "away" ? t.green : t.dim, fontWeight: 700 }}>{y}</span>)</span>;
}

function GoalEvent({ e, t }) {
  const knownScorer = hasKnownScorer(e.player);
  const knownAssist = hasKnownScorer(e.assist);
  const typeName = goalTypeName(e.goalType);
  const primaryText = knownScorer ? `${e.player}${goalTypeSuffix(e.goalType)}` : typeName;
  const align = e.side === "home" ? "left" : "right";
  const justify = e.side === "home" ? "flex-start" : "flex-end";
  const content = (
    <div style={{ minWidth: 0, textAlign: align }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: justify, gap: 5, minHeight: 16, lineHeight: "16px" }}>
        {primaryText && <span style={{ color: t.text, fontSize: 13.5, fontWeight: 700 }}>{primaryText}</span>}
        <RunScore score={e.score} scored={e.scored} t={t} />
      </div>
      {knownAssist && <div style={{ color: t.dim, fontSize: 11.5, lineHeight: 1.25, marginTop: 3 }}>Assist by {e.assist}</div>}
    </div>
  );
  const minute = <span style={{ color: t.text, fontSize: 13, fontWeight: 700, lineHeight: "16px", whiteSpace: "nowrap" }}>{fotMobMinuteLabel(e.min)}</span>;
  const ball = <span className="inline-flex items-center justify-center" style={{ width: 16, height: 16 }}><MonoFootball size={15} color={t.text} /></span>;

  if (e.side === "home") {
    return <div className="py-2.5" style={{ display: "grid", gridTemplateColumns: "38px 16px minmax(0, 1fr)", columnGap: 8, alignItems: "start", paddingRight: 12 }}>{minute}{ball}{content}</div>;
  }
  return <div className="py-2.5" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 16px 38px", columnGap: 8, alignItems: "start", paddingLeft: 12 }}>{content}{ball}<span style={{ textAlign: "right" }}>{minute}</span></div>;
}

function Ev({ e, t }) {
  if (e.type === "half" || e.type === "full") {
    return <div className="flex items-center gap-3 py-3">
      <div className="flex-1" style={{ height: 1, background: t.divider }} />
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center rounded-full" style={{ width: 26, height: 26, border: `1.5px solid ${t.faint}`, color: t.dim, fontSize: 10, fontWeight: 800 }}>{e.label}</span>
        <span style={{ color: t.dim, fontSize: 13, fontWeight: 700 }}>{e.score}</span>
      </div>
      <div className="flex-1" style={{ height: 1, background: t.divider }} />
    </div>;
  }
  if (e.type === "goal") return <GoalEvent e={e} t={t} />;
  const icon = e.type === "yellow" ? <span className="rounded-sm" style={{ width: 11, height: 15, background: t.yellow, display: "inline-block" }} />
    : e.type === "red" ? <span className="rounded-sm" style={{ width: 11, height: 15, background: t.red, display: "inline-block" }} />
    : <span className="inline-flex flex-col items-center" style={{ gap: 2 }}>
        <span className="inline-flex items-center justify-center rounded-full" style={{ width: 15, height: 15, background: t.green }}><ArrowUp size={10} color="#fff" strokeWidth={3} /></span>
        <span className="inline-flex items-center justify-center rounded-full" style={{ width: 15, height: 15, background: t.red }}><ArrowDown size={10} color="#fff" strokeWidth={3} /></span>
      </span>;
  const body = (align) => {
    if (e.type === "sub") {
      const playerOn = hasKnownScorer(e.player) ? e.player : null;
      const playerOff = hasKnownScorer(e.assist) ? e.assist : null;
      return <div style={{ textAlign: align }}>
        {playerOn && <div style={{ color: t.green, fontSize: 14, fontWeight: 600 }}>{playerOn}</div>}
        {playerOff && <div style={{ color: t.red, fontSize: 14, fontWeight: 600 }}>{playerOff}</div>}
      </div>;
    }
    const cardRecipient = hasKnownScorer(e.player) ? e.player : e.recipientType === "team_official" ? "Team official" : null;
    const cardReason = e.cardType === "second_yellow" ? "Second booking" : CARD_REASON_PHRASES[e.cardReason];
    return cardRecipient || cardReason ? <div style={{ textAlign: align }}>
      {cardRecipient && <div style={{ color: t.text, fontSize: 14, fontWeight: 600 }}>{cardRecipient}</div>}
      {cardReason && <div style={{ color: t.dim, fontSize: 11.5, lineHeight: 1.25, marginTop: cardRecipient ? 2 : 0 }}>{cardReason}</div>}
    </div> : null;
  };
  const minute = <div className="flex flex-col items-center shrink-0" style={{ minWidth: 34 }}><span style={{ color: t.text, fontSize: 13, fontWeight: 700 }}>{fotMobMinuteLabel(e.min)}</span></div>;
  if (e.side === "home") return <div className="flex items-start gap-2 py-2.5" style={{ paddingRight: 12 }}>{minute}<span className="shrink-0 mt-0.5">{icon}</span><div className="flex-1">{body("left")}</div></div>;
  return <div className="flex items-start gap-2 py-2.5 justify-end" style={{ paddingLeft: 12 }}><div className="flex-1">{body("right")}</div><span className="shrink-0 mt-0.5">{icon}</span>{minute}</div>;
}

// ---------- Commentary (from events) ----------
function rawEventSeconds(event) {
  const elapsed = event.elapsedSeconds == null ? Number.NaN : Number(event.elapsedSeconds);
  if (Number.isFinite(elapsed)) return elapsed;
  const minute = Number(event.displayMinute ?? event.m ?? 0);
  return Number.isFinite(minute) ? minute * 60 : 0;
}

function eventSortSeconds(event, match) {
  const duration = Number(match?.matchDurationMinutes || 90);
  const displayedMinute = Number(event.displayMinute ?? event.m ?? 0);
  const period = Number(event.period || (displayedMinute > duration / 2 ? 2 : 1));
  return period * 100000 + rawEventSeconds(event);
}

function fotMobMinuteLabel(value) {
  const label = String(value || "").trim();
  const addedTime = label.match(/^(\d+)\+(\d+)'?$/);
  return addedTime ? `${addedTime[1]}'+${addedTime[2]}` : label;
}

function finalWhistleMinute(match) {
  const duration = Number(match.matchDurationMinutes || 90);
  const extraTime = Number(match.extraTimeMinutes || 30);
  const period = Number(match.current_period || 2);
  const extraTimePlayed = period >= 3;
  const endMinute = extraTimePlayed ? duration + extraTime : duration;
  const announced = extraTimePlayed
    ? Number(match.extra_time_second_half_stoppage_minutes || 0)
    : Number(match.second_half_stoppage_minutes || 0);
  const elapsedSeconds = Number(match.clock_elapsed_seconds || 0);
  const elapsedMinute = elapsedSeconds > 0 ? Math.ceil(elapsedSeconds / 60) : endMinute;
  const added = Math.max(0, announced, elapsedMinute - endMinute);
  return added > 0 ? `${endMinute}'+${added}` : `${endMinute}'`;
}

function commentaryVariant(event) {
  const match = String(event.commentaryVariantKey || "").match(/_(\d+)$/);
  return Math.max(0, Number(match?.[1] || 1) - 1);
}

function selectedDescription(event, descriptions) {
  return descriptions[commentaryVariant(event) % descriptions.length];
}

function goalCommentary(event, home, away) {
  const [homeScore = "0", awayScore = "0"] = (event.score || "0 - 0").split(" - ").map((score) => score.trim());
  const scoringTeam = event.side === "away" ? away : home;
  const scoreline = `${home.name} ${homeScore}-${awayScore} ${away.name}.`;
  const knownScorer = hasKnownScorer(event.player);
  const goalType = event.goalType === "direct_goal" ? "normal_goal" : event.goalType || "normal_goal";
  const heading = goalType === "own_goal" ? "OWN GOAL!" : "GOAL!";
  if (!knownScorer) return `${heading} ${scoreline}`;

  let descriptions;
  if (goalType === "penalty") {
    descriptions = [
      `${event.player} converts the penalty.`,
      `${event.player} scores from the penalty spot.`,
      `${event.player} makes no mistake from the spot.`,
      `The penalty is converted by ${event.player}.`,
    ];
  } else if (goalType === "free_kick") {
    descriptions = [
      `${event.player} scores directly from the free kick.`,
      `${event.player} finds the net from the free kick.`,
      `The free kick is converted by ${event.player}.`,
      `${event.player} turns the free kick into a goal.`,
    ];
  } else if (goalType === "own_goal") {
    descriptions = [
      `${event.player} turns the ball into their own net.`,
      `${event.player} puts through their own goal.`,
      `The goal goes down against ${event.player}.`,
      `${event.player} is credited with the own goal.`,
    ];
  } else if (String(event.commentaryVariantKey || "").startsWith("normal_lead_")) {
    descriptions = [
      `${event.player} puts ${scoringTeam.name} ahead.`,
      `${event.player} gives ${scoringTeam.name} the lead.`,
      `${event.player} moves ${scoringTeam.name} in front.`,
      `${event.player} scores to put ${scoringTeam.name} ahead.`,
    ];
  } else if (String(event.commentaryVariantKey || "").startsWith("normal_equaliser_")) {
    descriptions = [
      `${event.player} brings ${scoringTeam.name} level.`,
      `${event.player} equalises for ${scoringTeam.name}.`,
      `${event.player} restores parity for ${scoringTeam.name}.`,
      `${event.player} scores the equaliser for ${scoringTeam.name}.`,
    ];
  } else if (String(event.commentaryVariantKey || "").startsWith("normal_extend_")) {
    descriptions = [
      `${event.player} extends ${scoringTeam.name}'s lead.`,
      `${event.player} adds another for ${scoringTeam.name}.`,
      `${event.player} increases ${scoringTeam.name}'s advantage.`,
      `${event.player} scores again for ${scoringTeam.name}.`,
    ];
  } else if (String(event.commentaryVariantKey || "").startsWith("normal_pullback_")) {
    descriptions = [
      `${event.player} pulls one back for ${scoringTeam.name}.`,
      `${event.player} reduces the deficit for ${scoringTeam.name}.`,
      `${event.player} gets ${scoringTeam.name} back into the match.`,
      `${event.player} closes the gap for ${scoringTeam.name}.`,
    ];
  } else {
    descriptions = [
      `${event.player} scores for ${scoringTeam.name}.`,
      `${event.player} finds the net.`,
      `The goal belongs to ${event.player}.`,
      `${event.player} gets the goal for ${scoringTeam.name}.`,
    ];
  }

  const assist = goalType === "normal_goal" && hasKnownScorer(event.assist) ? ` Assisted by ${event.assist}.` : "";
  return `${heading} ${scoreline} ${selectedDescription(event, descriptions)}${assist}`;
}

const CARD_REASON_PHRASES = {
  foul: "a foul",
  reckless_challenge: "a reckless challenge",
  dissent: "dissent",
  time_wasting: "time-wasting",
  simulation: "simulation",
  persistent_fouling: "persistent fouling",
  handball: "handball",
  stopping_promising_attack: "stopping a promising attack",
  delaying_restart: "delaying the restart",
  excessive_celebration: "excessive celebration",
  violent_conduct: "violent conduct",
  serious_foul_play: "serious foul play",
  denial_obvious_goal_scoring_opportunity: "denying an obvious goal-scoring opportunity",
  spitting_or_biting: "spitting or biting",
  offensive_insulting_abusive_language: "offensive, insulting or abusive language or actions",
};

function cardCommentary(event, team) {
  const playerKnown = hasKnownScorer(event.player);
  const subject = event.recipientType === "team_official"
    ? `A ${team.name} official`
    : playerKnown ? `${event.player} (${team.name})`
    : `A ${team.name} player`;
  const reason = CARD_REASON_PHRASES[event.cardReason];

  if (event.type === "yellow") {
    const descriptions = reason ? [
      `${subject} is booked for ${reason}.`,
      `${subject} goes into the referee's book for ${reason}.`,
      `${subject} is shown a yellow card for ${reason}.`,
      `${subject} receives a booking for ${reason}.`,
    ] : [
      `${subject} is booked.`,
      `${subject} goes into the referee's book.`,
      `${subject} is shown a yellow card.`,
      `A booking for ${subject}.`,
    ];
    return `YELLOW CARD! ${selectedDescription(event, descriptions)}`;
  }

  if (event.cardType === "second_yellow") {
    const descriptions = [
      `${subject} is sent off after a second booking.`,
      `${subject} receives another booking and is sent off.`,
      `${subject} is dismissed after receiving a second yellow.`,
      `A second yellow card ends the match for ${subject}.`,
    ];
    return `RED CARD! ${selectedDescription(event, descriptions)}`;
  }

  const descriptions = reason ? [
    `${subject} is sent off for ${reason}.`,
    `${subject} is dismissed for ${reason}.`,
    `${subject} is shown a straight red for ${reason}.`,
    `${subject} receives a red card for ${reason}.`,
  ] : [
    `${subject} is sent off.`,
    `${subject} is dismissed.`,
    `${subject} is shown a straight red.`,
    `${subject} receives a red card.`,
  ];
  return `RED CARD! ${selectedDescription(event, descriptions)}`;
}

function addedTimeWords(minutes) {
  const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  return words[minutes] || String(minutes);
}

function commentaryMilestones(match, home, away, halfScore, includeHalfTime = true) {
  const duration = Number(match.matchDurationMinutes || 90);
  const extraTime = Number(match.extraTimeMinutes || 30);
  const half = duration / 2;
  const currentPeriod = Number(match.current_period || 1);
  const lines = [{ sort: 100000, m: "1'", text: "First half begins." }];
  const addStoppage = (minutes, endMinute, period) => {
    if (minutes > 0) lines.push({
      sort: period * 100000 + endMinute * 60,
      m: `${endMinute}'`,
      text: `${addedTimeWords(minutes)} minute${minutes === 1 ? "" : "s"} of added time.`,
    });
  };

  addStoppage(Number(match.first_half_stoppage_minutes || 0), half, 1);
  if (includeHalfTime && (match.status === "ht" || currentPeriod >= 2 || match.status === "ft")) {
    lines.push({ sort: 100000 + (half + Number(match.first_half_stoppage_minutes || 0)) * 60 + 1, m: `${half}'`, text: `Half-time: ${home.name} ${halfScore.home}-${halfScore.away} ${away.name}.` });
  }
  if (currentPeriod >= 2) lines.push({ sort: 200000 + half * 60 + 1, m: `${half + 1}'`, text: "Second half begins." });
  addStoppage(Number(match.second_half_stoppage_minutes || 0), duration, 2);
  if (currentPeriod >= 3) lines.push({ sort: 300000 + duration * 60 + 1, m: `${duration + 1}'`, text: "First half of extra time begins." });
  addStoppage(Number(match.extra_time_first_half_stoppage_minutes || 0), duration + extraTime / 2, 3);
  if (currentPeriod >= 4) lines.push({ sort: 400000 + (duration + extraTime / 2) * 60 + 1, m: `${duration + extraTime / 2 + 1}'`, text: "Second half of extra time begins." });
  addStoppage(Number(match.extra_time_second_half_stoppage_minutes || 0), duration + extraTime, 4);
  return lines;
}

function Commentary({ t, m, d, h, a }) {
  if (!d) return <Empty t={t} title="Commentary" note="Commentary is generated from match events as they are recorded." />;
  const firstHalfEvents = d.events.filter((event) => Number(event.period || 1) === 1);
  const halfScore = {
    home: goalsBySide(firstHalfEvents, "home"),
    away: goalsBySide(firstHalfEvents, "away"),
  };
  const eventLines = [...d.events].map((e) => {
    const sort = eventSortSeconds(e, m);
    if (e.type === "half") return { sort, m: e.min || `${Number(m.matchDurationMinutes || 90) / 2}'`, text: `Half-time: ${h.name} ${halfScore.home}-${halfScore.away} ${a.name}.` };
    if (e.type === "goal") return { sort, m: e.min, text: goalCommentary(e, h, a) };
    if (e.type === "yellow" || e.type === "red") {
      const team = e.side === "away" ? a : h;
      return { sort, m: e.min, text: cardCommentary(e, team) };
    }
    if (e.type === "sub") {
      const team = e.side === "away" ? a : h;
      const playerOn = hasKnownScorer(e.player) ? e.player : null;
      const playerOff = hasKnownScorer(e.assist) ? e.assist : null;
      const text = playerOn && playerOff ? `SUBSTITUTION! ${team.name}. ${selectedDescription(e, [
        `${playerOn} replaces ${playerOff}.`,
        `${playerOn} comes on for ${playerOff}.`,
        `${playerOff} makes way for ${playerOn}.`,
        `${team.name} bring on ${playerOn} for ${playerOff}.`,
      ])}` : playerOn ? `SUBSTITUTION! ${team.name}. ${playerOn} comes on.`
        : playerOff ? `SUBSTITUTION! ${team.name}. ${playerOff} leaves the field.`
        : `SUBSTITUTION! ${team.name}.`;
      return { sort, m: e.min, text };
    }
    return { sort, m: e.min, text: "" };
  });
  const fullTimeLines = m.status === "ft" ? [{
    sort: 900000001,
    m: finalWhistleMinute(m),
    text: `Full-time: ${h.name} ${m.hs}-${m.as} ${a.name}.`,
  }] : [];
  const lines = [...eventLines, ...commentaryMilestones(m, h, a, halfScore, !d.events.some((event) => event.type === "half")), ...fullTimeLines]
    .filter((line) => line.text)
    .sort((x, y) => y.sort - x.sort);
  return <div className="px-2 py-1">
    {lines.map((line, index) => (
      <div key={`${line.sort}-${index}`} className="rounded-2xl px-4 py-4" style={{ background: t.card, marginBottom: 8 }}>
        {line.m && (
          <div style={{ color: t.text, fontSize: 14, lineHeight: 1.2, fontWeight: 800, marginBottom: 12 }}>
            {fotMobMinuteLabel(line.m)}
          </div>
        )}
        <div style={{ color: t.text, fontSize: 15, lineHeight: 1.55, fontWeight: 600 }}>{line.text}</div>
      </div>
    ))}
  </div>;
}

// ---------- Table ----------
function TableTab({ t, m, rows }) {
  const [view, setView] = useState("full");
  const [scope, setScope] = useState("overall");
  if (!rows.length) return <Empty t={t} title="Competition table" note="The table will appear when this competition has fixtures." />;

  const hi = [m.home, m.away];
  const isLive = ["live", "ht", "et_live", "et_ht"].includes(m.status);
  const scopedRows = rows
    .map((team) => {
      const record = scope === "home"
        ? team.homeRecord || team
        : scope === "away"
          ? team.awayRecord || team
          : team;
      return { ...team, ...record };
    })
    .sort((a, b) => b.pts - a.pts
      || (b.gf - b.ga) - (a.gf - a.ga)
      || b.gf - a.gf
      || a.name.localeCompare(b.name));

  return (
    <>
      <div className="flex items-center gap-2 px-2 pt-2">
        <div className="grid grid-cols-3 flex-1 rounded-full p-1" style={{ background: t.seg }}>
          {["short", "full", "form"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className="rounded-full"
              style={{
                minHeight: 38,
                border: 0,
                background: view === option ? t.segActive : "transparent",
                color: view === option ? t.text : t.dim,
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <select
          aria-label="Table scope"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          style={{
            width: 112,
            minHeight: 46,
            borderRadius: 999,
            border: `1px solid ${t.pillBorder}`,
            background: t.pill,
            color: t.text,
            padding: "0 12px",
            fontSize: 13,
            fontWeight: 800,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="overall">Overall</option>
          <option value="home">Home</option>
          <option value="away">Away</option>
        </select>
      </div>

      <div className="mx-2 my-2 rounded-2xl overflow-hidden" style={{ background: t.card }}>
        <div className="flex items-center gap-2 px-4 py-4" style={{ borderBottom: `1px solid ${t.divider}` }}>
          <span aria-hidden="true" style={{ fontSize: 18 }}>🏆</span>
          <span className="truncate" style={{ color: t.text, fontSize: 15, fontWeight: 850 }}>{m.compName || "Competition table"}</span>
          {isLive && (
            <span className="inline-flex items-center gap-1" style={{ color: t.accent, fontSize: 10, fontWeight: 850, marginLeft: "auto", textTransform: "uppercase" }}>
              <span className="rounded-full" style={{ width: 7, height: 7, background: t.accent }} />
              Live
            </span>
          )}
        </div>

        <div className="flex items-center px-3 py-3" style={{ color: t.dim, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>
          <span style={{ width: 28 }} />
          <span className="flex-1 pl-1">Team</span>
          {view === "form" ? (
            <span style={{ width: 126, textAlign: "right", paddingRight: 3 }}>Last matches</span>
          ) : view === "short" ? (
            <>
              <TableHeading width={28}>PL</TableHeading>
              <TableHeading width={38}>GD</TableHeading>
              <TableHeading width={38}>PTS</TableHeading>
            </>
          ) : (
            <>
              <TableHeading width={26}>PL</TableHeading>
              <TableHeading width={22}>W</TableHeading>
              <TableHeading width={22}>D</TableHeading>
              <TableHeading width={22}>L</TableHeading>
              <TableHeading width={42}>+/-</TableHeading>
              <TableHeading width={34}>GD</TableHeading>
              <TableHeading width={34}>PTS</TableHeading>
            </>
          )}
        </div>
        <div style={{ height: 1, background: t.divider }} />

        {scopedRows.map((tm, index) => {
          const goalDifference = tm.gf - tm.ga;
          const highlighted = hi.includes(tm.id);
          const qualifies = m.competitionType === "tournament" && index < Math.min(4, scopedRows.length);
          const championPosition = m.competitionType === "league" && index === 0;
          const form = (tm.form || []).slice(-5);
          return (
            <div key={tm.id} className="flex items-center px-3" style={{ minHeight: 54, background: highlighted ? t.hl : "transparent", borderBottom: `1px solid ${t.divider}` }}>
              <div className="flex items-center" style={{ width: 28, alignSelf: "stretch" }}>
                <span style={{ width: 3, height: "100%", maxHeight: 46, borderRadius: 2, background: championPosition ? t.yellow : qualifies ? t.accent : "transparent", marginRight: 6 }} />
                <span className="league-table-number" style={{ color: t.dim, fontSize: 13 }}>{index + 1}</span>
              </div>
              <div className="flex-1 flex items-center gap-2 min-w-0 pl-1">
                <Crest short={tm.short} color={tm.color} logo={tm.logoUrl} size={24} ring={t.divider} />
                <span className="truncate" style={{ color: t.text, fontSize: 13.5, fontWeight: 700 }}>{tm.name}</span>
                {isLive && highlighted && <span className="rounded-full" title="Playing now" style={{ width: 7, height: 7, background: t.accent, flex: "0 0 auto" }} />}
              </div>

              {view === "form" ? (
                <span style={{ width: 126 }} className="flex gap-1.5 justify-end">
                  {form.length ? form.map((result, resultIndex) => (
                    <span
                      key={`${result}-${resultIndex}`}
                      title={result === "W" ? "Win" : result === "D" ? "Draw" : "Loss"}
                      className="inline-flex items-center justify-center rounded-md"
                      style={{
                        width: 20,
                        height: 22,
                        background: result === "W" ? t.win : result === "D" ? t.drawPill : t.loss,
                        color: "#FFFFFF",
                        fontSize: 10,
                        fontWeight: 850,
                        boxShadow: resultIndex === form.length - 1 ? `inset 0 -2px 0 ${t.accent}` : "none",
                      }}
                    >
                      {result}
                    </span>
                  )) : <span style={{ color: t.faint, fontSize: 12 }}>No results</span>}
                </span>
              ) : view === "short" ? (
                <>
                  <TableValue width={28} color={t.text}>{tm.pl}</TableValue>
                  <TableValue width={38} color={t.dim}>{signedNumber(goalDifference)}</TableValue>
                  <TableValue width={38} color={t.text}>{tm.pts}</TableValue>
                </>
              ) : (
                <>
                  <TableValue width={26} color={t.text}>{tm.pl}</TableValue>
                  <TableValue width={22} color={t.dim}>{tm.w}</TableValue>
                  <TableValue width={22} color={t.dim}>{tm.d}</TableValue>
                  <TableValue width={22} color={t.dim}>{tm.l}</TableValue>
                  <TableValue width={42} color={t.dim}>{tm.gf}-{tm.ga}</TableValue>
                  <TableValue width={34} color={t.dim}>{signedNumber(goalDifference)}</TableValue>
                  <TableValue width={34} color={t.text}>{tm.pts}</TableValue>
                </>
              )}
            </div>
          );
        })}
      </div>
      {m.competitionType === "tournament" && (
        <div className="flex items-center gap-2 px-4 py-2">
          <span style={{ width: 10, height: 10, borderRadius: 2, background: t.accent }} />
          <span style={{ color: t.dim, fontSize: 12 }}>Advances to the knockout stage</span>
        </div>
      )}
      {m.competitionType === "league" && (
        <div className="flex items-center gap-2 px-4 py-2">
          <span style={{ width: 10, height: 10, borderRadius: 2, background: t.yellow }} />
          <span style={{ color: t.dim, fontSize: 12 }}>Champion position</span>
        </div>
      )}
    </>
  );
}

function TableHeading({ width, children }) {
  return <span style={{ width, textAlign: "center", flex: "0 0 auto" }}>{children}</span>;
}

function TableValue({ width, color, children }) {
  return <span className="league-table-number" style={{ width, textAlign: "center", color, fontSize: 12.5, flex: "0 0 auto" }}>{children}</span>;
}

function signedNumber(value) {
  return value > 0 ? `+${value}` : String(value);
}

// ---------- H2H ----------
function H2H({ t, h, a, homeId, awayId, meetings }) {
  if (!meetings.length) return null;
  const record = meetings.reduce((summary, meeting) => {
    const homeTeamScore = meeting.homeId === homeId ? meeting.homeScore : meeting.awayScore;
    const awayTeamScore = meeting.homeId === awayId ? meeting.homeScore : meeting.awayScore;
    if (homeTeamScore > awayTeamScore) summary.homeWins += 1;
    else if (homeTeamScore < awayTeamScore) summary.awayWins += 1;
    else summary.draws += 1;
    return summary;
  }, { homeWins: 0, draws: 0, awayWins: 0 });
  const total = meetings.length;
  return (
    <div>
      <Card t={t} style={{ overflow: "hidden", padding: "18px 14px 16px" }}>
        <div className="grid grid-cols-3" style={{ gap: 8 }}>
          <H2HCount value={record.homeWins} label="Won" color={h.color} textColor={readableTextColor(h.color)} t={t} />
          <H2HCount value={record.draws} label="Drawn" color={t.drawPill} textColor="#FFFFFF" t={t} />
          <H2HCount value={record.awayWins} label="Won" color={a.color} textColor={readableTextColor(a.color)} t={t} />
        </div>
        <div className="flex overflow-hidden" style={{ height: 5, borderRadius: 99, marginTop: 16, background: t.track }}>
          {record.homeWins > 0 && <span style={{ width: `${record.homeWins / total * 100}%`, background: h.color }} />}
          {record.draws > 0 && <span style={{ width: `${record.draws / total * 100}%`, background: t.drawPill }} />}
          {record.awayWins > 0 && <span style={{ width: `${record.awayWins / total * 100}%`, background: a.color }} />}
        </div>
      </Card>

      <Card t={t} style={{ overflow: "hidden" }}>
        {meetings.map((meeting, index) => {
          const historicalHome = meeting.homeId === homeId ? h : a;
          const historicalAway = meeting.awayId === awayId ? a : h;
          return (
            <Link key={meeting.id} href={`/match/${meeting.id}`} style={{ display: "block", padding: "13px 12px", borderBottom: index === meetings.length - 1 ? "none" : `1px solid ${t.divider}` }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <span style={{ color: t.dim, fontSize: 10.5, fontWeight: 650 }}>{formatH2HDate(meeting.date)}</span>
                <span style={{ color: t.dim, background: t.chip, borderRadius: 99, padding: "4px 8px", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase" }}>{meeting.competitionName}</span>
              </div>
              <div className="grid items-center" style={{ gridTemplateColumns: "32px minmax(0, 1fr)", columnGap: 5 }}>
                <span className="inline-flex items-center justify-center rounded-full" style={{ width: 30, height: 22, background: t.chip, color: t.dim, fontSize: 10, fontWeight: 800 }}>FT</span>
                <div className="flex items-center justify-center" style={{ gap: 7, minWidth: 0 }}>
                  <span className="truncate" style={{ flex: 1, color: t.text, textAlign: "right", fontSize: 12.5, fontWeight: 700 }}>{historicalHome.name}</span>
                  <Crest short={historicalHome.short} color={historicalHome.color} logo={historicalHome.logoUrl} size={27} ring={t.divider} />
                  <strong style={{ color: t.text, fontSize: 14, minWidth: 39, textAlign: "center", whiteSpace: "nowrap" }}>{meeting.homeScore} - {meeting.awayScore}</strong>
                  <Crest short={historicalAway.short} color={historicalAway.color} logo={historicalAway.logoUrl} size={27} ring={t.divider} />
                  <span className="truncate" style={{ flex: 1, color: t.text, textAlign: "left", fontSize: 12.5, fontWeight: 700 }}>{historicalAway.name}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </Card>
    </div>
  );
}

function H2HCount({ value, label, color, textColor, t }) {
  return (
    <div className="flex flex-col items-center">
      <span className="inline-flex items-center justify-center rounded-full" style={{ minWidth: 46, height: 32, padding: "0 11px", background: color, color: textColor, fontSize: 15 }}>{value}</span>
      <span style={{ color: t.text, fontSize: 12, fontWeight: 650, marginTop: 7 }}>{label}</span>
    </div>
  );
}

function formatH2HDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
