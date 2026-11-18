"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import CompetitionTable from "@/components/CompetitionTable";
import { BottomNav, Crest, StatusChip } from "@/components/ui";
import { getLeagueCentre } from "@/lib/db";
import { cachePublicMatch } from "@/lib/matchCache";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

const TABS = ["Table", "Fixtures", "Player stats", "Team stats", "Transfers", "TOTW", "Seasons"];

function withDeadline(promise, milliseconds = 9000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("The competition request timed out.")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function dateLabel(date, includeYear = true) {
  if (!date) return "Date to be confirmed";
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(value);
}

export default function LeagueCentre({ id }) {
  const { t } = useTheme();
  const router = useRouter();
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("Table");
  const [loadError, setLoadError] = useState("");
  const [following, setFollowing] = useState(false);
  const [now, setNow] = useState(0);
  const tabRefs = useRef({});

  const load = useCallback(() => {
    withDeadline(getLeagueCentre(id))
      .then((result) => {
        setState(result);
        setLoadError(result ? "" : "This competition is unavailable.");
      })
      .catch(() => setLoadError("This competition could not be loaded."));
  }, [id]);

  useEffect(() => {
    let refreshTimer;
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(load, 160);
    };
    load();
    setNow(Date.now());
    const ticker = window.setInterval(() => setNow(Date.now()), 15000);
    let channel;
    if (supabase) {
      channel = supabase.channel(`touchline-competition-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "competitions", filter: `id=eq.${id}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "competition_teams", filter: `competition_id=eq.${id}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `competition_id=eq.${id}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_statistics" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_lineups" }, scheduleRefresh)
        .subscribe();
    }
    return () => {
      window.clearTimeout(refreshTimer);
      window.clearInterval(ticker);
      if (channel) supabase.removeChannel(channel);
    };
  }, [id, load]);

  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [tab]);

  if (!state) return <LeagueShell t={t} error={loadError} onRetry={load} />;
  const themeColor = state.competition.themeColor || "#4B125F";

  return (
    <div className="touchline-public-shell league-web" style={{ "--league-card": t.card, "--league-text": t.text, "--league-muted": t.dim, "--league-divider": t.divider, "--league-inset": t.seg, background: t.bg, color: t.text, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 82 }}>
      <nav className="league-web-bar" aria-label="Touchline">
        <Link href="/">Touchline</Link>
        <div><Link href="/">Matches</Link><Link href="/leagues">Leagues</Link></div>
      </nav>
      <header className="touchline-public-header sticky top-0 z-30" style={{ background: themeColor, color: "#FFFFFF", boxShadow: "0 6px 18px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center px-3" style={{ height: 48, gap: 8 }}>
          <Link href="/leagues" aria-label="Back to leagues" className="flex items-center justify-center rounded-full" style={heroButton}>
            <ChevronLeft size={21} color="#FFFFFF" />
          </Link>
          <select aria-label="Season" value={id} onChange={(event) => router.push(`/league/${event.target.value}`)} style={{ ...heroPill, width: 104, marginLeft: "auto" }}>
            {state.seasons.map((season) => <option key={season.id} value={season.id}>{season.label}</option>)}
          </select>
          <button type="button" aria-label={following ? "Turn off competition notifications" : "Turn on competition notifications"} aria-pressed={following} onClick={() => setFollowing((value) => !value)} className="flex items-center justify-center gap-1.5 rounded-full" style={{ ...heroPill, minWidth: 86, padding: "0 10px", background: following ? "#FFFFFF" : heroPill.background, color: following ? themeColor : "#FFFFFF" }}>
            <Bell size={15} fill={following ? "currentColor" : "none"} />
            <span>{following ? "Following" : "Follow"}</span>
          </button>
        </div>

        <div className="flex items-center px-4" style={{ height: 54, gap: 11 }}>
          <CompetitionLogo competition={state.competition} size={40} />
          <div className="min-w-0" style={{ flex: 1 }}>
            <h1 className="truncate" style={{ fontSize: "var(--type-emphasis)", lineHeight: 1.15, margin: 0 }}>{state.competition.name}</h1>
            <div className="truncate" style={{ color: "rgba(255,255,255,0.78)", fontSize: "var(--type-caption)", marginTop: 3 }}>{state.competition.country}</div>
          </div>
        </div>

        <nav className="league-web-tabs flex overflow-x-auto" style={{ scrollbarWidth: "none", borderTop: "1px solid rgba(255,255,255,0.16)" }}>
          {TABS.map((item) => (
            <button
              ref={(node) => { tabRefs.current[item] = node; }}
              type="button"
              key={item}
              onClick={() => setTab(item)}
              aria-pressed={tab === item}
              className="relative shrink-0"
              style={{ minWidth: item.length > 8 ? 98 : 72, height: 42, padding: "0 11px", color: tab === item ? "#FFFFFF" : "rgba(255,255,255,0.7)", fontSize: "var(--type-label)" }}
            >
              {item}
              {tab === item && <span className="absolute left-4 right-4 bottom-0 rounded-full" style={{ height: 4, background: "#FFFFFF" }} />}
            </button>
          ))}
        </nav>
      </header>

      <main className="touchline-public-content" style={{ paddingTop: 6 }}>
        {tab === "Table" && <CompetitionTable t={t} competition={state.competition} rows={state.table} />}
        {tab === "Fixtures" && <Fixtures matches={state.matches} teams={state.teams} t={t} now={now} />}
        {tab === "Player stats" && <PlayerStatistics records={state.playerStats} t={t} competition={state.competition} seasons={state.seasons} seasonId={id} themeColor={themeColor} onSeasonChange={(seasonId) => router.push(`/league/${seasonId}`)} />}
        {tab === "Team stats" && <TeamStatistics records={state.teamStats} t={t} competition={state.competition} seasons={state.seasons} seasonId={id} themeColor={themeColor} onSeasonChange={(seasonId) => router.push(`/league/${seasonId}`)} />}
        {tab === "Transfers" && <div style={{ minHeight: "64vh" }} />}
        {tab === "TOTW" && <TeamOfWeek rounds={state.teamOfWeek} t={t} />}
        {tab === "Seasons" && <Seasons seasons={state.seasons} competition={state.competition} t={t} />}
      </main>

      <div className="league-mobile-navigation"><BottomNav t={t} active="Leagues" showNews={false} /></div>
    </div>
  );
}

function CompetitionLogo({ competition, size = 64 }) {
  return (
    <span className="inline-flex items-center justify-center rounded-xl overflow-hidden shrink-0" style={{ width: size, height: size, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.2)" }}>
      {competition.logoUrl ? (
        <img src={competition.logoUrl} alt="" style={{ width: size * 0.78, height: size * 0.78, objectFit: "contain" }} />
      ) : <Trophy size={size * 0.46} color="#FFFFFF" />}
    </span>
  );
}

function Fixtures({ matches, teams, t, now }) {
  const [grouping, setGrouping] = useState("date");
  const [teamId, setTeamId] = useState("all");
  const [period, setPeriod] = useState(null);
  const filtered = useMemo(() => matches.filter((match) => teamId === "all" || match.home === teamId || match.away === teamId), [matches, teamId]);
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((match) => {
      const key = grouping === "round" ? match.round || "Other fixtures" : match.date || "Date to be confirmed";
      const group = map.get(key) || [];
      group.push(match);
      map.set(key, group);
    });
    return [...map.entries()];
  }, [filtered, grouping]);
  const teamOptions = Object.values(teams).sort((left, right) => left.name.localeCompare(right.name));
  const windows = [...new Set(groups.map(([key]) => {
    const day = Date.parse(key) / 86400000;
    return /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(day) ? Math.floor(day / 15) : null;
  }).filter((value) => value !== null))].sort((a, b) => a - b);
  const today = Math.floor(now / (86400000 * 15));
  const activePeriod = windows.includes(period) ? period : windows.find((value) => value >= today) ?? windows.at(-1);
  const periodIndex = windows.indexOf(activePeriod);
  const formatDay = (day) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(day * 86400000);

  return (
    <div className="league-fixture-panel">
      <div className="league-fixture-controls flex items-center gap-2 px-2 pt-1">
        <div className="league-fixture-modes grid grid-cols-2 flex-1 rounded-full p-1" style={{ background: t.seg }}>
          {["date", "round"].map((option) => (
            <button key={option} type="button" aria-pressed={grouping === option} onClick={() => { setGrouping(option); if (window.matchMedia("(min-width: 900px)").matches) setTeamId("all"); setPeriod(null); }} className="rounded-full" style={segmentStyle(t, grouping === option)}>By {option}</button>
          ))}
          <button type="button" className="league-team-mode rounded-full" aria-pressed={grouping === "team"} onClick={() => { setGrouping("team"); setPeriod(null); }} style={segmentStyle(t, grouping === "team")}>By team</button>
        </div>
        <select className={grouping === "team" ? "" : "league-mobile-team-filter"} aria-label="Filter fixtures by team" value={teamId} onChange={(event) => { setTeamId(event.target.value); setPeriod(null); }} style={filterSelect(t)}>
          <option value="all">All teams</option>
          {teamOptions.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </div>

      {grouping === "date" && periodIndex >= 0 && <div className="league-fixture-period">
        <button type="button" aria-label="Previous fixture period" disabled={periodIndex === 0} onClick={() => setPeriod(windows[periodIndex - 1])}><ChevronLeft size={20} /></button>
        <span>{formatDay(activePeriod * 15)} - {formatDay(activePeriod * 15 + 14)}</span>
        <button type="button" aria-label="Next fixture period" disabled={periodIndex === windows.length - 1} onClick={() => setPeriod(windows[periodIndex + 1])}><ChevronRight size={20} /></button>
      </div>}
      {!groups.length && <EmptyCard t={t}>No fixtures match this filter.</EmptyCard>}
      {groups.map(([key, group]) => (
        <section key={key} className={`league-fixture-group mx-2 my-3 rounded-2xl overflow-hidden${grouping === "date" && Number.isFinite(Date.parse(key)) && Math.floor(Date.parse(key) / (86400000 * 15)) !== activePeriod ? " league-outside-period" : ""}`} style={{ background: t.card }}>
          <div className="league-fixture-date flex items-center px-4 py-3" style={{ borderBottom: `1px solid ${t.divider}` }}>
            <span style={{ color: t.text, fontSize: "var(--type-body)", fontWeight: 850 }}>{grouping !== "round" && key !== "Date to be confirmed" ? dateLabel(key) : key}</span>
          </div>
          {group.map((match, index) => <LeagueMatchRow key={match.id} match={match} teams={teams} t={t} now={now} first={index === 0} />)}
        </section>
      ))}
    </div>
  );
}

function LeagueMatchRow({ match, teams, t, now, first }) {
  const home = teams[match.home] || { name: "TBD", color: "#555" };
  const away = teams[match.away] || { name: "TBD", color: "#555" };
  const cancelled = match.status === "cancelled";
  const showScore = ["live", "ht", "et_live", "et_ht", "ft", "awarded"].includes(match.status);
  const rememberMatch = () => cachePublicMatch(match, teams);
  return (
    <Link href={`/match/${match.id}`} onPointerDown={rememberMatch} onClick={rememberMatch} className="league-fixture-row block active:opacity-70" style={{ padding: "12px 13px", borderTop: first ? "none" : `1px solid ${t.divider}` }}>
      <div className="league-fixture-status flex items-center justify-between" style={{ color: t.dim, fontSize: "var(--type-badge)", fontWeight: 700, marginBottom: 10 }}>
        <span className="league-fixture-mobile-detail">{match.round || dateLabel(match.date, false)}</span>
        {match.status !== "ft" && <StatusChip m={match} t={t} now={now} />}
      </div>
      <div className="grid items-center" style={{ gridTemplateColumns: "minmax(0, 1fr) 50px minmax(0, 1fr)", gap: 8 }}>
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className="truncate" style={{ fontSize: "var(--type-body)", fontWeight: 700, textDecoration: cancelled ? "line-through" : "none" }}>{home.name}</span>
          <Crest color={home.color} logo={home.logoUrl} label={home.name} size={25} ring={t.divider} />
        </div>
        <span style={{ textAlign: "center", color: showScore ? t.text : t.dim, fontSize: "var(--type-emphasis)", fontWeight: 850, whiteSpace: "nowrap", textDecoration: cancelled ? "line-through" : "none" }}>{showScore ? `${match.hs} - ${match.as}` : match.time || "TBD"}</span>
        <div className="flex items-center gap-2 min-w-0">
          <Crest color={away.color} logo={away.logoUrl} label={away.name} size={25} ring={t.divider} />
          <span className="truncate" style={{ fontSize: "var(--type-body)", fontWeight: 700, textDecoration: cancelled ? "line-through" : "none" }}>{away.name}</span>
        </div>
      </div>
    </Link>
  );
}

function PlayerStatistics({ records, t, competition, seasons, seasonId, themeColor, onSeasonChange }) {
  const [selected, setSelected] = useState(null);
  const enriched = records.map((record) => ({ ...record, goalContributions: record.goals + record.assists }));
  const sections = [
    { title: "Top stats", cards: [["Top scorer", "goals", "#D81018"], ["Assists", "assists", "#64A9DD"], ["Goals + Assists", "goalContributions", "#D81018"]] },
    { title: "Goalkeeping", cards: [["Clean sheets", "cleanSheets", "#F29B05"]] },
    { title: "Discipline", cards: [["Yellow cards", "yellowCards", "#D91C3D"], ["Red cards", "redCards", "#8D115F"]] },
  ];
  return <>
    <div style={{ padding: "2px 8px 8px" }}>{sections.map((section) => (
      <StatSection key={section.title} title={section.title} t={t}>
        {section.cards.map(([title, key, accent]) => {
          const rankedRecords = rank(enriched.filter((record) => record.appearances > 0 && Number(record[key]) > 0), key);
          return <RankingCard key={key} title={title} records={rankedRecords} valueKey={key} accent={accent} kind="player" t={t} onOpen={() => setSelected({ title, records: rankedRecords, valueKey: key, accent, kind: "player" })} />;
        })}
      </StatSection>
    ))}</div>
    {selected && <StatRankingSheet {...selected} t={t} competition={competition} seasons={seasons} seasonId={seasonId} themeColor={themeColor} onSeasonChange={onSeasonChange} onClose={() => setSelected(null)} />}
  </>;
}

function TeamStatistics({ records, t, competition, seasons, seasonId, themeColor, onSeasonChange }) {
  const [selected, setSelected] = useState(null);
  const sections = [
    { title: "Top stats", cards: [["Goals per match", "goalsPerMatch", "Goals", "desc"], ["Goals conceded per match", "concededPerMatch", "Conceded", "asc"], ["Average possession", "averagePossession", "Possession", "desc", "%"]] },
    { title: "Attack", cards: [["Total goals", "goals", "Goals", "desc"], ["Shots on target per match", "shotsOnTargetPerMatch", "On target", "desc"], ["Corners per match", "cornersPerMatch", "Corners", "desc"], ["Penalties scored", "penaltyGoals", "Penalties", "desc"], ["Set piece goals", "setPieceGoals", "Set pieces", "desc"]] },
    { title: "Defence", cards: [["Clean sheets", "cleanSheets", "Clean sheets", "desc"]] },
    { title: "Discipline", cards: [["Fouls per match", "foulsPerMatch", "Fouls", "desc"], ["Yellow cards", "yellowCards", "Yellow cards", "desc"], ["Red cards", "redCards", "Red cards", "desc"]] },
  ];
  return <>
    <div style={{ padding: "2px 8px 8px" }}>{sections.map((section) => (
      <StatSection key={section.title} title={section.title} t={t}>
        {section.cards.map(([title, key, , direction, suffix]) => {
          const needsRecordedStatistics = ["averagePossession", "shotsOnTargetPerMatch", "cornersPerMatch", "foulsPerMatch"].includes(key);
          const rankedRecords = rank(records.filter((record) => record.played > 0 && (!needsRecordedStatistics || record.statMatches > 0)), key, direction);
          return <RankingCard key={key} title={title} records={rankedRecords} valueKey={key} suffix={suffix} accent={t.blue} kind="team" t={t} onOpen={() => setSelected({ title, records: rankedRecords, valueKey: key, suffix, accent: t.blue, kind: "team" })} />;
        })}
      </StatSection>
    ))}</div>
    {selected && <StatRankingSheet {...selected} t={t} competition={competition} seasons={seasons} seasonId={seasonId} themeColor={themeColor} onSeasonChange={onSeasonChange} onClose={() => setSelected(null)} />}
  </>;
}

function StatSection({ title, t, children }) {
  return <section style={{ marginTop: 18 }}><h2 style={{ fontSize: "var(--type-subheading)", margin: "0 8px 11px" }}>{title}</h2><div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>{children}</div></section>;
}

function RankingCard({ title, records, valueKey, suffix = "", accent, kind, t, onOpen }) {
  const visible = records.slice(0, 3);
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-2xl overflow-hidden text-left active:opacity-75" style={{ background: t.card, border: `1px solid ${t.divider}`, minHeight: visible.length ? 174 : 56, paddingBottom: visible.length ? 7 : 0 }} aria-label={`View all ${title.toLowerCase()}`}>
      <div className="flex items-center justify-between" style={{ padding: "13px 16px 10px" }}>
        <h3 style={{ fontSize: "var(--type-emphasis)", margin: 0 }}>{title}</h3>
        <span style={{ color: t.faint, fontSize: "var(--type-title)", lineHeight: 1 }}>›</span>
      </div>
      {visible.map((record, index) => (
        <div key={record.id} className="flex items-center gap-3" style={{ minHeight: 43, padding: "4px 16px" }}>
          {kind === "player" ? <span className="relative shrink-0"><PlayerPhoto player={record} size={35} t={t} />{record.team && <span className="absolute" style={{ right: -5, bottom: -2 }}><Crest color={record.team.color} logo={record.team.logoUrl} label={record.team.name} size={15} ring={t.card} /></span>}</span> : <Crest color={record.color} logo={record.logoUrl} label={record.name} size={35} ring={t.divider} />}
          <span className="min-w-0" style={{ flex: 1 }}>
            <span className="block truncate" style={{ fontSize: "var(--type-body)" }}>{record.name}</span>
          </span>
          <span className={index === 0 ? "rounded-full" : ""} style={{ minWidth: 40, textAlign: "center", background: index === 0 ? accent : "transparent", color: index === 0 ? "#FFFFFF" : t.text, padding: index === 0 ? "5px 8px" : "5px 2px", fontSize: "var(--type-body)" }}>{formatMetric(record[valueKey], valueKey)}{suffix}</span>
        </div>
      ))}
    </button>
  );
}

function StatRankingSheet({ title, records, valueKey, suffix = "", kind, t, competition, seasons, seasonId, themeColor, onSeasonChange, onClose }) {
  const [positionFilter, setPositionFilter] = useState("all");
  const positionOptions = [["all", "All"], ["goalkeeper", "Goalkeeper"], ["defender", "Defender"], ["midfielder", "Midfielder"], ["forward", "Forward"]];
  const visibleRecords = kind === "player" && positionFilter !== "all"
    ? records.filter((record) => record.positionGroup === positionFilter)
    : records;
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="touchline-public-shell fixed inset-0 overflow-y-auto" style={{ zIndex: 70, maxWidth: 480, margin: "0 auto", paddingBottom: 82, background: t.bg, color: t.text }}>
      <header style={{ minHeight: 132, background: themeColor, color: "#FFFFFF" }}>
        <div className="relative flex items-center justify-center px-14" style={{ height: 68 }}>
          <button type="button" onClick={onClose} aria-label="Back to statistics" className="absolute left-3 flex items-center justify-center rounded-full" style={heroButton}>
            <ChevronLeft size={21} color="#FFFFFF" />
          </button>
          <h2 className="truncate" style={{ margin: 0, maxWidth: "100%", fontSize: "var(--type-subheading)" }}>{competition.name}</h2>
        </div>
        <div className="flex justify-center" style={{ paddingBottom: 18 }}>
          <select aria-label="Season" value={seasonId} onChange={(event) => onSeasonChange(event.target.value)} style={{ ...heroPill, width: 116, background: "rgba(0,0,0,0.18)" }}>
            {seasons.map((season) => <option key={season.id} value={season.id}>{season.label}</option>)}
          </select>
        </div>
      </header>

      <div className="flex items-center justify-between px-4" style={{ minHeight: 52, background: t.card, borderBottom: `1px solid ${t.divider}` }}>
        <h3 style={{ margin: 0, fontSize: "var(--type-subheading)" }}>{title}</h3>
        <ChevronDown size={19} color={t.text} />
      </div>

      {kind === "player" && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar" style={{ padding: "10px 12px", background: t.card, borderBottom: `1px solid ${t.divider}` }}>
          {positionOptions.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setPositionFilter(value)} className="shrink-0 rounded-full" style={{ minHeight: 34, padding: "0 14px", border: `1px solid ${positionFilter === value ? t.text : t.pillBorder}`, background: positionFilter === value ? t.text : t.card, color: positionFilter === value ? t.bg : t.text, fontSize: "var(--type-label)" }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="mx-2 my-3 rounded-2xl overflow-hidden" style={{ background: t.card }}>
        {visibleRecords.map((record, index) => (
          <div key={record.id} className="flex items-center gap-3" style={{ minHeight: 70, padding: "8px 14px", borderTop: index ? `1px solid ${t.divider}` : "none" }}>
            <span className="shrink-0" style={{ width: 22, color: t.text, textAlign: "center", fontSize: "var(--type-body)" }}>{index + 1}</span>
            {kind === "player" ? <span className="relative shrink-0"><PlayerPhoto player={record} size={42} t={t} />{record.team && <span className="absolute" style={{ right: -5, bottom: -2 }}><Crest color={record.team.color} logo={record.team.logoUrl} label={record.team.name} size={17} ring={t.card} /></span>}</span> : <Crest color={record.color} logo={record.logoUrl} label={record.name} size={42} ring={t.divider} />}
            <span className="min-w-0" style={{ flex: 1 }}>
              <span className="block truncate" style={{ fontSize: "var(--type-emphasis)" }}>{record.name}</span>
              <span className="block truncate" style={{ color: t.dim, fontSize: "var(--type-label)", marginTop: 3 }}>{rankingDetail(record, valueKey, kind)}</span>
            </span>
            <span style={{ minWidth: 48, textAlign: "right", color: t.text, fontSize: "var(--type-emphasis)" }}>{formatMetric(record[valueKey], valueKey)}{suffix}</span>
          </div>
        ))}
      </div>
      <BottomNav t={t} active="Leagues" />
    </div>
  );
}

function rankingDetail(record, valueKey, kind) {
  if (kind === "player") {
    if (valueKey === "goals") return `Penalty goals: ${record.penaltyGoals || 0}`;
    if (valueKey === "goalContributions") return `Goals: ${record.goals || 0}  Assists: ${record.assists || 0}`;
    return `Appearances: ${record.appearances || 0}`;
  }
  if (valueKey === "goalsPerMatch" || valueKey === "goals") return `Total goals scored: ${record.goals || 0}`;
  if (valueKey === "concededPerMatch") return `Total goals conceded: ${record.conceded || 0}`;
  if (["averagePossession", "shotsOnTargetPerMatch", "cornersPerMatch", "foulsPerMatch"].includes(valueKey)) return `Matches recorded: ${record.statMatches || 0}`;
  return `Matches played: ${record.played || 0}`;
}

function TeamOfWeek({ rounds, t }) {
  const [roundLabel, setRoundLabel] = useState(rounds.at(-1)?.label || "");
  useEffect(() => {
    if (!rounds.some((round) => round.label === roundLabel)) setRoundLabel(rounds.at(-1)?.label || "");
  }, [roundLabel, rounds]);
  if (!rounds.length) return <EmptyCard t={t}>Team of the Week will appear after completed matches with recorded lineups.</EmptyCard>;
  const selectedRound = rounds.find((round) => round.label === roundLabel) || rounds.at(-1);
  const groups = {
    forward: selectedRound.players.filter((player) => player.positionGroup === "forward"),
    midfielder: selectedRound.players.filter((player) => player.positionGroup === "midfielder"),
    defender: selectedRound.players.filter((player) => player.positionGroup === "defender"),
    goalkeeper: selectedRound.players.filter((player) => player.positionGroup === "goalkeeper"),
  };

  return (
    <div style={{ padding: "7px 8px 10px" }}>
      <div className="flex items-center justify-between" style={{ margin: "0 4px 9px" }}>
        <div><h2 style={{ margin: 0, fontSize: "var(--type-subheading)" }}>Team of the Week</h2><div style={{ color: t.dim, fontSize: "var(--type-caption)", marginTop: 3 }}>Touchline rating</div></div>
        <select value={selectedRound.label} onChange={(event) => setRoundLabel(event.target.value)} style={filterSelect(t)}>{rounds.map((round) => <option key={round.label} value={round.label}>{round.label}</option>)}</select>
      </div>
      <div className="relative overflow-hidden rounded-2xl" style={{ minHeight: 610, padding: "30px 10px 24px", background: "linear-gradient(90deg, #087447 0 50%, #0A7D4C 50% 100%)", border: "1px solid rgba(255,255,255,0.18)" }}>
        <PitchLines />
        <TotwRow players={groups.forward} t={t} />
        <TotwRow players={groups.midfielder} t={t} />
        <TotwRow players={groups.defender} t={t} />
        <TotwRow players={groups.goalkeeper} t={t} />
      </div>
      <p style={{ color: t.dim, fontSize: "var(--type-caption)", lineHeight: 1.5, margin: "10px 5px 0" }}>Ratings use recorded lineups, goals, assists, cards, clean sheets and match results.</p>
    </div>
  );
}

function TotwRow({ players, t }) {
  if (!players.length) return <div style={{ minHeight: 132 }} />;
  return <div className="relative flex items-start justify-around" style={{ minHeight: 132, zIndex: 2 }}>{players.map((player) => (
    <div key={player.id} className="flex flex-col items-center" style={{ width: `${Math.min(30, 94 / players.length)}%`, minWidth: 62 }}>
      <div className="relative">
        <PlayerPhoto player={player} size={54} t={t} light />
        <span className="absolute rounded-full" style={{ right: -9, top: -5, background: player.rating >= 8 ? "#1275DF" : player.rating >= 7 ? "#20A867" : "#E08B21", color: "#FFFFFF", padding: "4px 6px", fontSize: "var(--type-badge)", fontWeight: 900, border: "2px solid rgba(255,255,255,0.8)" }}>{player.rating.toFixed(1)}</span>
      </div>
      <div className="flex items-center gap-1 rounded-full" style={{ marginTop: 5, padding: "4px 7px", background: "rgba(0,0,0,0.62)", maxWidth: "100%" }}>
        {player.team && <Crest color={player.team.color} logo={player.team.logoUrl} label={player.team.name} size={15} ring="rgba(255,255,255,0.3)" />}
        <span className="truncate" style={{ color: "#FFFFFF", fontSize: "var(--type-badge)", fontWeight: 800 }}>{player.name}</span>
      </div>
    </div>
  ))}</div>;
}

function PitchLines() {
  return <div aria-hidden="true" className="absolute inset-3" style={{ border: "2px solid rgba(255,255,255,0.27)", borderRadius: 2 }}><span className="absolute left-0 right-0" style={{ top: "50%", height: 2, background: "rgba(255,255,255,0.27)" }} /><span className="absolute rounded-full" style={{ left: "50%", top: "50%", width: 84, height: 84, transform: "translate(-50%,-50%)", border: "2px solid rgba(255,255,255,0.27)" }} /><span className="absolute" style={{ left: "25%", right: "25%", top: 0, height: 72, border: "2px solid rgba(255,255,255,0.27)", borderTop: 0 }} /><span className="absolute" style={{ left: "25%", right: "25%", bottom: 0, height: 72, border: "2px solid rgba(255,255,255,0.27)", borderBottom: 0 }} /></div>;
}

function Seasons({ seasons, t }) {
  if (!seasons.length) return <EmptyCard t={t}>No seasons recorded yet.</EmptyCard>;

  return (
    <div className="league-seasons-grid">
      {seasons.map((season) => (
        <Link
          key={season.id}
          href={`/league/${season.id}`}
          className="league-season-card block rounded-2xl active:opacity-70"
          style={{ background: t.card, border: `1px solid ${t.divider}` }}
        >
          <h2 style={{ margin: 0, fontSize: "var(--type-emphasis)", fontWeight: 700 }}>
            {season.label}
          </h2>
          {season.winner ? (
            <div className="league-season-teams">
              <SeasonTeam row={season.winner} label={season.completed ? "Winner" : "Current leader"} t={t} />
              <SeasonTeam row={season.runnerUp} label={season.completed ? "Runner-up" : "Second place"} t={t} />
            </div>
          ) : (
            <p style={{ margin: "24px 0 0", color: t.dim, fontSize: "var(--type-label)" }}>
              No standings recorded yet.
            </p>
          )}
        </Link>
      ))}
      <style jsx global>{`
        .league-seasons-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 14px;
          padding: 12px 8px;
        }
        .league-season-card { min-width: 0; padding: 20px 16px; }
        .league-season-teams { display: grid; gap: 20px; margin-top: 26px; }
        @media (min-width: 900px) {
          .league-seasons-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            padding-inline: 0;
          }
        }
      `}</style>
    </div>
  );
}

function SeasonTeam({ row, label, t }) {
  if (!row) return null;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Crest logo={row.logoUrl} label={row.name} size={32} ring={t.divider} />
      <span className="min-w-0" style={{ overflowWrap: "anywhere" }}>
        <span className="block" style={{ fontSize: "var(--type-body)" }}>{row.name}</span>
        <span className="block" style={{ color: t.dim, fontSize: "var(--type-caption)" }}>{label}</span>
      </span>
    </div>
  );
}

function PlayerPhoto({ player, size, t, light = false }) {
  const initials = player.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className="inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden" style={{ width: size, height: size, background: light ? "rgba(255,255,255,0.9)" : t.chip, color: light ? "#173227" : t.text, border: `1px solid ${light ? "rgba(255,255,255,0.72)" : t.divider}`, fontSize: size * 0.28, fontWeight: 900 }}>{player.photoUrl ? <img src={player.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}</span>;
}

function rank(records, key, direction = "desc") {
  return [...records].sort((left, right) => direction === "asc" ? Number(left[key]) - Number(right[key]) || left.name.localeCompare(right.name) : Number(right[key]) - Number(left[key]) || left.name.localeCompare(right.name));
}

function formatMetric(value, valueKey = "") {
  const number = Number(value) || 0;
  if (["goalsPerMatch", "concededPerMatch"].includes(valueKey)) return number.toFixed(2);
  if (["averagePossession", "shotsOnTargetPerMatch", "cornersPerMatch", "foulsPerMatch"].includes(valueKey)) return number.toFixed(1);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function segmentStyle(t, active) {
  return { minHeight: 38, border: 0, background: active ? t.segActive : "transparent", color: active ? t.text : t.dim, fontSize: "var(--type-body)", fontWeight: 800, cursor: "pointer", textTransform: "capitalize" };
}

function filterSelect(t) {
  return { maxWidth: 138, minHeight: 43, borderRadius: 999, border: `1px solid ${t.pillBorder}`, background: t.pill, color: t.text, padding: "0 12px", fontSize: "var(--type-label)", fontWeight: 800, outline: "none" };
}

function EmptyCard({ t, children }) {
  return <div className="mx-2 my-3 rounded-2xl text-center" style={{ padding: "30px 20px", background: t.card, color: t.dim, fontSize: "var(--type-body)", lineHeight: 1.5 }}>{children}</div>;
}

function LeagueShell({ t, error, onRetry }) {
  return (
    <div className="touchline-public-shell" style={{ background: t.bg, color: t.text, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 82 }}>
      <header style={{ height: 144, background: "#4B125F" }}>
        <div className="flex items-center px-3" style={{ height: 48, gap: 8 }}>
          <span className="touchline-skeleton rounded-full" style={{ width: 34, height: 34, background: "rgba(255,255,255,0.18)" }} />
          <span className="touchline-skeleton rounded-full" style={{ width: 104, height: 34, marginLeft: "auto", background: "rgba(255,255,255,0.18)" }} />
          <span className="touchline-skeleton rounded-full" style={{ width: 86, height: 34, background: "rgba(255,255,255,0.18)" }} />
        </div>
        <div className="flex items-center px-4" style={{ height: 54, gap: 11 }}>
          <span className="touchline-skeleton rounded-xl" style={{ width: 40, height: 40, background: "rgba(255,255,255,0.18)" }} />
          <span style={{ flex: 1 }}>
            <span className="touchline-skeleton block rounded" style={{ width: "58%", height: 13, background: "rgba(255,255,255,0.2)" }} />
            <span className="touchline-skeleton block rounded" style={{ width: 62, height: 9, marginTop: 7, background: "rgba(255,255,255,0.14)" }} />
          </span>
        </div>
        <div className="flex items-center" style={{ height: 42, borderTop: "1px solid rgba(255,255,255,0.16)", padding: "0 14px", gap: 26 }}>
          {[52, 62, 48, 74].map((width, index) => <span key={index} className="touchline-skeleton rounded" style={{ width, height: 10, background: "rgba(255,255,255,0.16)" }} />)}
        </div>
      </header>

      {error ? (
        <div className="mx-3 mt-4 rounded-2xl text-center" style={{ padding: 22, background: t.card }}>
          <div style={{ fontSize: "var(--type-emphasis)" }}>{error}</div>
          <button type="button" onClick={onRetry} className="rounded-full" style={{ marginTop: 12, padding: "9px 16px", background: t.accent, color: "#07130B", fontSize: "var(--type-body)" }}>Try again</button>
        </div>
      ) : (
        <div aria-hidden="true">
          <div className="flex gap-2 px-2 pt-2">
            <span className="touchline-skeleton rounded-full" style={{ flex: 1, height: 42, background: t.pill }} />
            <span className="touchline-skeleton rounded-full" style={{ width: 112, height: 42, background: t.pill }} />
          </div>
          <div className="mx-2 my-2 rounded-2xl overflow-hidden" style={{ background: t.card }}>
            <div style={{ height: 44, borderBottom: `1px solid ${t.divider}` }} />
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="flex items-center px-3" style={{ height: 50, borderTop: row ? `1px solid ${t.divider}` : "none" }}>
                <span className="touchline-skeleton rounded" style={{ width: 14, height: 11, background: t.chip }} />
                <span className="touchline-skeleton rounded-full" style={{ width: 24, height: 24, marginLeft: 12, background: t.chip }} />
                <span className="touchline-skeleton rounded" style={{ width: 112, height: 11, marginLeft: 9, background: t.chip }} />
                <span className="touchline-skeleton rounded" style={{ width: 96, height: 11, marginLeft: "auto", background: t.chip }} />
              </div>
            ))}
          </div>
        </div>
      )}
      <BottomNav t={t} active="Leagues" />
    </div>
  );
}

const heroButton = { width: 34, height: 34, background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.2)", color: "#FFFFFF" };
const heroPill = { height: 34, borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.13)", color: "#FFFFFF", padding: "0 10px", fontSize: "var(--type-caption)", outline: "none" };
