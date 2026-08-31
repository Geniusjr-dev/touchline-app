"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Star, Trophy } from "lucide-react";
import CompetitionTable from "@/components/CompetitionTable";
import { BottomNav, Crest, StatusChip } from "@/components/ui";
import { getLeagueCentre } from "@/lib/db";
import { cachePublicMatch } from "@/lib/matchCache";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

const TABS = ["Table", "Fixtures", "News", "Player stats", "Team stats", "Transfers", "TOTW", "Seasons"];

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
    <div style={{ background: t.bg, color: t.text, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 82 }}>
      <header className="sticky top-0 z-30" style={{ background: themeColor, color: "#FFFFFF", boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
        <div className="flex items-center px-3" style={{ height: 72, gap: 9 }}>
          <Link href="/leagues" aria-label="Back to leagues" className="flex items-center justify-center rounded-full" style={heroButton}>
            <ChevronLeft size={23} color="#FFFFFF" />
          </Link>
          <CompetitionLogo competition={state.competition} size={39} />
          <div className="min-w-0" style={{ flex: 1 }}>
            <h1 className="truncate" style={{ fontSize: 15, lineHeight: 1.15, fontWeight: 900, margin: 0, letterSpacing: -0.15 }}>{state.competition.name}</h1>
            <div className="truncate" style={{ color: "rgba(255,255,255,0.76)", fontSize: 11.5, fontWeight: 650, marginTop: 4 }}>{state.competition.country}</div>
          </div>
          <select aria-label="Season" value={id} onChange={(event) => router.push(`/league/${event.target.value}`)} style={{ ...heroPill, width: 102 }}>
            {state.seasons.map((season) => <option key={season.id} value={season.id}>{season.label}</option>)}
          </select>
          <button type="button" aria-label={following ? "Unfollow competition" : "Follow competition"} aria-pressed={following} onClick={() => setFollowing((value) => !value)} className="flex items-center justify-center rounded-full" style={{ ...heroButton, background: following ? "#FFFFFF" : heroButton.background, color: following ? themeColor : "#FFFFFF" }}>
            <Star size={18} fill={following ? "currentColor" : "none"} />
          </button>
        </div>

        <nav className="flex overflow-x-auto" style={{ scrollbarWidth: "none", borderTop: "1px solid rgba(255,255,255,0.16)" }}>
          {TABS.map((item) => (
            <button
              ref={(node) => { tabRefs.current[item] = node; }}
              type="button"
              key={item}
              onClick={() => setTab(item)}
              className="relative shrink-0"
              style={{ minWidth: item.length > 8 ? 104 : 78, height: 46, padding: "0 12px", color: tab === item ? "#FFFFFF" : "rgba(255,255,255,0.68)", fontSize: 13, fontWeight: tab === item ? 850 : 700 }}
            >
              {item}
              {tab === item && <span className="absolute left-4 right-4 bottom-0 rounded-full" style={{ height: 4, background: "#FFFFFF" }} />}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ paddingTop: 6 }}>
        {tab === "Table" && <CompetitionTable t={t} competition={state.competition} rows={state.table} />}
        {tab === "Fixtures" && <Fixtures matches={state.matches} teams={state.teams} t={t} now={now} />}
        {tab === "News" && <div style={{ minHeight: "64vh" }} />}
        {tab === "Player stats" && <PlayerStatistics records={state.playerStats} t={t} />}
        {tab === "Team stats" && <TeamStatistics records={state.teamStats} t={t} />}
        {tab === "Transfers" && <div style={{ minHeight: "64vh" }} />}
        {tab === "TOTW" && <TeamOfWeek rounds={state.teamOfWeek} t={t} />}
        {tab === "Seasons" && <Seasons seasons={state.seasons} competition={state.competition} t={t} />}
      </main>

      <BottomNav t={t} active="Leagues" />
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

  return (
    <>
      <div className="flex items-center gap-2 px-2 pt-1">
        <div className="grid grid-cols-2 flex-1 rounded-full p-1" style={{ background: t.seg }}>
          {["date", "round"].map((option) => (
            <button key={option} type="button" onClick={() => setGrouping(option)} className="rounded-full" style={segmentStyle(t, grouping === option)}>{option === "date" ? "Date" : "Round"}</button>
          ))}
        </div>
        <select aria-label="Filter fixtures by team" value={teamId} onChange={(event) => setTeamId(event.target.value)} style={filterSelect(t)}>
          <option value="all">All teams</option>
          {teamOptions.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </div>

      {!groups.length && <EmptyCard t={t}>No fixtures match this filter.</EmptyCard>}
      {groups.map(([key, group]) => (
        <section key={key} className="mx-2 my-3 rounded-2xl overflow-hidden" style={{ background: t.card }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${t.divider}` }}>
            <span style={{ color: t.text, fontSize: 13.5, fontWeight: 850 }}>{grouping === "date" && key !== "Date to be confirmed" ? dateLabel(key) : key}</span>
            <span style={{ color: t.dim, fontSize: 11.5 }}>{group.length} {group.length === 1 ? "match" : "matches"}</span>
          </div>
          {group.map((match, index) => <LeagueMatchRow key={match.id} match={match} teams={teams} t={t} now={now} first={index === 0} />)}
        </section>
      ))}
    </>
  );
}

function LeagueMatchRow({ match, teams, t, now, first }) {
  const home = teams[match.home] || { name: "TBD", short: "?", color: "#555" };
  const away = teams[match.away] || { name: "TBD", short: "?", color: "#555" };
  const showScore = ["live", "ht", "et_live", "et_ht", "ft"].includes(match.status);
  const rememberMatch = () => cachePublicMatch(match, teams);
  return (
    <Link href={`/match/${match.id}`} onPointerDown={rememberMatch} onClick={rememberMatch} className="block active:opacity-70" style={{ padding: "12px 13px", borderTop: first ? "none" : `1px solid ${t.divider}` }}>
      <div className="flex items-center justify-between" style={{ color: t.dim, fontSize: 10.5, fontWeight: 700, marginBottom: 10 }}>
        <span>{match.round || dateLabel(match.date, false)}</span>
        <StatusChip m={match} t={t} now={now} />
      </div>
      <div className="grid items-center" style={{ gridTemplateColumns: "minmax(0, 1fr) 50px minmax(0, 1fr)", gap: 8 }}>
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className="truncate" style={{ fontSize: 13, fontWeight: 700 }}>{home.name}</span>
          <Crest short={home.short} color={home.color} logo={home.logoUrl} size={25} ring={t.divider} />
        </div>
        <span style={{ textAlign: "center", color: showScore ? t.text : t.dim, fontSize: 14, fontWeight: 850, whiteSpace: "nowrap" }}>{showScore ? `${match.hs} - ${match.as}` : match.time || "TBD"}</span>
        <div className="flex items-center gap-2 min-w-0">
          <Crest short={away.short} color={away.color} logo={away.logoUrl} size={25} ring={t.divider} />
          <span className="truncate" style={{ fontSize: 13, fontWeight: 700 }}>{away.name}</span>
        </div>
      </div>
    </Link>
  );
}

function PlayerStatistics({ records, t }) {
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
    {selected && <StatRankingSheet {...selected} t={t} onClose={() => setSelected(null)} />}
  </>;
}

function TeamStatistics({ records, t }) {
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
    {selected && <StatRankingSheet {...selected} t={t} onClose={() => setSelected(null)} />}
  </>;
}

function StatSection({ title, t, children }) {
  return <section style={{ marginTop: 22 }}><h2 style={{ fontSize: 21, fontWeight: 900, margin: "0 8px 14px" }}>{title}</h2><div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>{children}</div></section>;
}

function RankingCard({ title, records, valueKey, suffix = "", accent, kind, t, onOpen }) {
  const visible = records.slice(0, 3);
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-2xl overflow-hidden text-left active:opacity-75" style={{ background: t.card, border: `1px solid ${t.divider}`, minHeight: visible.length ? 192 : 62, paddingBottom: visible.length ? 8 : 0 }} aria-label={`View all ${title.toLowerCase()}`}>
      <div className="flex items-center justify-between" style={{ padding: "16px 18px 12px" }}>
        <h3 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}>{title}</h3>
        <span style={{ color: t.faint, fontSize: 23, lineHeight: 1 }}>›</span>
      </div>
      {visible.map((record, index) => (
        <div key={record.id} className="flex items-center gap-3" style={{ minHeight: 47, padding: "5px 18px" }}>
          {kind === "player" ? <span className="relative shrink-0"><PlayerPhoto player={record} size={38} t={t} />{record.team && <span className="absolute" style={{ right: -5, bottom: -2 }}><Crest short={record.team.short} color={record.team.color} logo={record.team.logoUrl} size={16} ring={t.card} /></span>}</span> : <Crest short={record.short} color={record.color} logo={record.logoUrl} size={38} ring={t.divider} />}
          <span className="min-w-0" style={{ flex: 1 }}>
            <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 750 }}>{record.name}</span>
          </span>
          <span className={index === 0 ? "rounded-full" : ""} style={{ minWidth: 42, textAlign: "center", background: index === 0 ? accent : "transparent", color: index === 0 ? "#FFFFFF" : t.text, padding: index === 0 ? "6px 9px" : "6px 2px", fontSize: 14, fontWeight: index === 0 ? 900 : 700 }}>{formatMetric(record[valueKey])}{suffix}</span>
        </div>
      ))}
    </button>
  );
}

function StatRankingSheet({ title, records, valueKey, suffix = "", accent, kind, t, onClose }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 overflow-y-auto" style={{ zIndex: 70, maxWidth: 480, margin: "0 auto", background: t.bg, color: t.text }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-3" style={{ height: 62, background: t.card, borderBottom: `1px solid ${t.divider}` }}>
        <button type="button" onClick={onClose} aria-label="Back to statistics" className="flex items-center justify-center rounded-full" style={{ width: 40, height: 40, background: t.pill, border: `1px solid ${t.pillBorder}` }}>
          <ChevronLeft size={23} color={t.text} />
        </button>
        <div className="min-w-0">
          <h2 className="truncate" style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{title}</h2>
          <div style={{ color: t.dim, fontSize: 11.5, marginTop: 2 }}>{kind === "player" ? "Player rankings" : "Team rankings"}</div>
        </div>
      </div>
      <div className="mx-2 my-3 rounded-2xl overflow-hidden" style={{ background: t.card }}>
        {records.map((record, index) => (
          <div key={record.id} className="flex items-center gap-3" style={{ minHeight: 62, padding: "8px 14px", borderTop: index ? `1px solid ${t.divider}` : "none" }}>
            <span className="shrink-0" style={{ width: 22, color: t.dim, textAlign: "center", fontSize: 13, fontWeight: 800 }}>{index + 1}</span>
            {kind === "player" ? <span className="relative shrink-0"><PlayerPhoto player={record} size={40} t={t} />{record.team && <span className="absolute" style={{ right: -5, bottom: -2 }}><Crest short={record.team.short} color={record.team.color} logo={record.team.logoUrl} size={16} ring={t.card} /></span>}</span> : <Crest short={record.short} color={record.color} logo={record.logoUrl} size={40} ring={t.divider} />}
            <span className="min-w-0" style={{ flex: 1 }}>
              <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 800 }}>{record.name}</span>
              {kind === "player" && record.team && <span className="block truncate" style={{ color: t.dim, fontSize: 11.5, marginTop: 3 }}>{record.team.name}</span>}
            </span>
            <span className={index === 0 ? "rounded-full" : ""} style={{ minWidth: 46, textAlign: "center", background: index === 0 ? accent : "transparent", color: index === 0 ? "#FFFFFF" : t.text, padding: "7px 8px", fontSize: 14, fontWeight: 900 }}>{formatMetric(record[valueKey])}{suffix}</span>
          </div>
        ))}
      </div>
    </div>
  );
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
        <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Team of the Week</h2><div style={{ color: t.dim, fontSize: 11, marginTop: 3 }}>Touchline rating</div></div>
        <select value={selectedRound.label} onChange={(event) => setRoundLabel(event.target.value)} style={filterSelect(t)}>{rounds.map((round) => <option key={round.label} value={round.label}>{round.label}</option>)}</select>
      </div>
      <div className="relative overflow-hidden rounded-2xl" style={{ minHeight: 610, padding: "30px 10px 24px", background: "linear-gradient(90deg, #087447 0 50%, #0A7D4C 50% 100%)", border: "1px solid rgba(255,255,255,0.18)" }}>
        <PitchLines />
        <TotwRow players={groups.forward} t={t} />
        <TotwRow players={groups.midfielder} t={t} />
        <TotwRow players={groups.defender} t={t} />
        <TotwRow players={groups.goalkeeper} t={t} />
      </div>
      <p style={{ color: t.dim, fontSize: 11.5, lineHeight: 1.5, margin: "10px 5px 0" }}>Ratings use recorded lineups, goals, assists, cards, clean sheets and match results.</p>
    </div>
  );
}

function TotwRow({ players, t }) {
  if (!players.length) return <div style={{ minHeight: 132 }} />;
  return <div className="relative flex items-start justify-around" style={{ minHeight: 132, zIndex: 2 }}>{players.map((player) => (
    <div key={player.id} className="flex flex-col items-center" style={{ width: `${Math.min(30, 94 / players.length)}%`, minWidth: 62 }}>
      <div className="relative">
        <PlayerPhoto player={player} size={54} t={t} light />
        <span className="absolute rounded-full" style={{ right: -9, top: -5, background: player.rating >= 8 ? "#1275DF" : player.rating >= 7 ? "#20A867" : "#E08B21", color: "#FFFFFF", padding: "4px 6px", fontSize: 10, fontWeight: 900, border: "2px solid rgba(255,255,255,0.8)" }}>{player.rating.toFixed(1)}</span>
      </div>
      <div className="flex items-center gap-1 rounded-full" style={{ marginTop: 5, padding: "4px 7px", background: "rgba(0,0,0,0.62)", maxWidth: "100%" }}>
        {player.team && <Crest short={player.team.short} color={player.team.color} logo={player.team.logoUrl} size={15} ring="rgba(255,255,255,0.3)" />}
        <span className="truncate" style={{ color: "#FFFFFF", fontSize: 9.5, fontWeight: 800 }}>{player.name}</span>
      </div>
    </div>
  ))}</div>;
}

function PitchLines() {
  return <div aria-hidden="true" className="absolute inset-3" style={{ border: "2px solid rgba(255,255,255,0.27)", borderRadius: 2 }}><span className="absolute left-0 right-0" style={{ top: "50%", height: 2, background: "rgba(255,255,255,0.27)" }} /><span className="absolute rounded-full" style={{ left: "50%", top: "50%", width: 84, height: 84, transform: "translate(-50%,-50%)", border: "2px solid rgba(255,255,255,0.27)" }} /><span className="absolute" style={{ left: "25%", right: "25%", top: 0, height: 72, border: "2px solid rgba(255,255,255,0.27)", borderTop: 0 }} /><span className="absolute" style={{ left: "25%", right: "25%", bottom: 0, height: 72, border: "2px solid rgba(255,255,255,0.27)", borderBottom: 0 }} /></div>;
}

function Seasons({ seasons, competition, t }) {
  return (
    <div style={{ padding: "6px 8px 12px" }}>
      <div style={{ margin: "0 5px 12px" }}><h2 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>Seasons</h2><p style={{ color: t.dim, fontSize: 12.5, lineHeight: 1.5, margin: "5px 0 0" }}>Champions and runners-up from each {competition.name} season.</p></div>
      {seasons.map((season) => (
        <Link href={`/league/${season.id}`} key={season.id} className="block rounded-2xl active:opacity-70" style={{ background: t.card, border: `1px solid ${season.current ? t.accent : t.divider}`, marginBottom: 10, overflow: "hidden" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${t.divider}` }}><span style={{ fontSize: 15, fontWeight: 850 }}>{season.label}</span>{season.current && <span className="rounded-full" style={{ color: "#07130B", background: t.accent, padding: "4px 8px", fontSize: 9.5, fontWeight: 900 }}>CURRENT</span>}</div>
          {season.winner ? <div style={{ padding: "8px 13px 11px" }}><SeasonTeam row={season.winner} label={season.completed ? "Winner" : "Current leader"} t={t} winner /><SeasonTeam row={season.runnerUp} label={season.completed ? "Runner-up" : "Second place"} t={t} /></div> : <div style={{ color: t.dim, fontSize: 12.5, padding: "20px 14px" }}>No standings recorded for this season.</div>}
        </Link>
      ))}
    </div>
  );
}

function SeasonTeam({ row, label, t, winner = false }) {
  if (!row) return null;
  return <div className="flex items-center gap-3" style={{ padding: "8px 2px" }}><span className="inline-flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: winner ? t.disc : t.chip }}>{winner ? <Trophy size={16} color={t.yellow} /> : <span style={{ color: t.dim, fontSize: 12, fontWeight: 900 }}>2</span>}</span><Crest short={row.short} color={row.color} logo={row.logoUrl} size={34} ring={t.divider} /><span className="min-w-0" style={{ flex: 1 }}><span className="block" style={{ color: t.dim, fontSize: 10.5 }}>{label}</span><span className="block truncate" style={{ fontSize: 13.5, fontWeight: 800, marginTop: 2 }}>{row.name}</span></span><span style={{ color: t.dim, fontSize: 11.5, fontWeight: 750 }}>{row.pts} pts</span></div>;
}

function PlayerPhoto({ player, size, t, light = false }) {
  const initials = player.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className="inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden" style={{ width: size, height: size, background: light ? "rgba(255,255,255,0.9)" : t.chip, color: light ? "#173227" : t.text, border: `1px solid ${light ? "rgba(255,255,255,0.72)" : t.divider}`, fontSize: size * 0.28, fontWeight: 900 }}>{player.photoUrl ? <img src={player.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}</span>;
}

function rank(records, key, direction = "desc") {
  return [...records].sort((left, right) => direction === "asc" ? Number(left[key]) - Number(right[key]) || left.name.localeCompare(right.name) : Number(right[key]) - Number(left[key]) || left.name.localeCompare(right.name));
}

function formatMetric(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function segmentStyle(t, active) {
  return { minHeight: 38, border: 0, background: active ? t.segActive : "transparent", color: active ? t.text : t.dim, fontSize: 13, fontWeight: 800, cursor: "pointer", textTransform: "capitalize" };
}

function filterSelect(t) {
  return { maxWidth: 138, minHeight: 43, borderRadius: 999, border: `1px solid ${t.pillBorder}`, background: t.pill, color: t.text, padding: "0 12px", fontSize: 12.5, fontWeight: 800, outline: "none" };
}

function EmptyCard({ t, children }) {
  return <div className="mx-2 my-3 rounded-2xl text-center" style={{ padding: "30px 20px", background: t.card, color: t.dim, fontSize: 13, lineHeight: 1.5 }}>{children}</div>;
}

function LeagueShell({ t, error, onRetry }) {
  return <div style={{ background: t.bg, color: t.text, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 82 }}><div style={{ height: 118, background: "#4B125F" }} />{error ? <div className="mx-3 mt-4 rounded-2xl text-center" style={{ padding: 22, background: t.card }}><div style={{ fontSize: 14, fontWeight: 750 }}>{error}</div><button type="button" onClick={onRetry} className="rounded-full" style={{ marginTop: 12, padding: "9px 16px", background: t.accent, color: "#07130B", fontSize: 13, fontWeight: 800 }}>Try again</button></div> : <div className="mx-2 mt-3 rounded-2xl" style={{ height: 360, background: t.card }} />}<BottomNav t={t} active="Leagues" /></div>;
}

const heroButton = { width: 39, height: 39, background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.18)", color: "#FFFFFF" };
const heroPill = { height: 39, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.13)", color: "#FFFFFF", padding: "0 11px", fontSize: 11.5, fontWeight: 800, outline: "none" };
