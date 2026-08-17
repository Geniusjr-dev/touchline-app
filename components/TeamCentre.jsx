"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronLeft, ChevronRight, ShieldCheck, Trophy } from "lucide-react";
import { getTeamCentre, liveMinute } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import { BottomNav, Crest } from "@/components/ui";

const TABS = ["Overview", "Matches", "Table", "Stats", "Squad", "Trophies"];
const COUNTRY_CODES = {
  ghana: "GH", nigeria: "NG", england: "GB", scotland: "GB", wales: "GB", spain: "ES",
  france: "FR", brazil: "BR", belgium: "BE", usa: "US", "united states": "US",
  germany: "DE", italy: "IT", portugal: "PT", netherlands: "NL", croatia: "HR",
  senegal: "SN", cameroon: "CM", "ivory coast": "CI", "côte d’ivoire": "CI",
  kenya: "KE", uganda: "UG", "south africa": "ZA", togo: "TG", benin: "BJ",
};

function flagFor(country) {
  const code = COUNTRY_CODES[country?.trim().toLowerCase()];
  if (!code) return "🌍";
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}

function ageFromDate(date) {
  if (!date) return null;
  const birth = new Date(`${date}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function matchSortValue(match) {
  return `${match.date || "0000-00-00"}T${match.time || "00:00"}`;
}

function dayLabel(date, includeRelative = true) {
  if (!date) return "Date TBC";
  const target = new Date(`${date}T12:00:00`);
  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetKey = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const difference = Math.round((targetKey - todayKey) / 86400000);
  if (includeRelative && difference === 0) return "Today";
  if (includeRelative && difference === 1) return "Tomorrow";
  if (includeRelative && difference === -1) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(target);
}

function scoreForTeam(match, teamId) {
  return match.home === teamId ? [match.hs, match.as] : [match.as, match.hs];
}

function Photo({ src, name, size = 40, color = "#30343A" }) {
  const initials = name?.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <span className="inline-flex items-center justify-center rounded-full overflow-hidden shrink-0" style={{ width: size, height: size, background: color, color: "#fff", fontSize: size * 0.3, fontWeight: 800 }}>
      {src ? (
        // Supabase public media URLs are administrator-controlled team assets.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : initials}
    </span>
  );
}

export default function TeamCentre({ id }) {
  const { t } = useTheme();
  const router = useRouter();
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [following, setFollowing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    getTeamCentre(id)
      .then((result) => { setState(result); setLoadError(!result); })
      .catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => {
    let active = true;
    getTeamCentre(id).then((result) => { if (active) { setState(result); setLoadError(!result); } }).catch(() => { if (active) setLoadError(true); });
    let channel;
    if (supabase) {
      channel = supabase.channel(`team-centre-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `team_id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "team_trophies", filter: `team_id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_statistics" }, load)
        .subscribe();
    }
    return () => { active = false; if (channel) supabase.removeChannel(channel); };
  }, [id, load]);

  if (!state) {
    return <div style={{ minHeight: "100vh", background: t.bg, color: t.dim, display: "flex", alignItems: "center", justifyContent: "center" }}>{loadError ? "Team not found." : "Loading…"}</div>;
  }

  const { team } = state;
  return (
    <div style={{ minHeight: "100vh", maxWidth: 480, margin: "0 auto", background: t.bg, color: t.text, paddingBottom: 82 }}>
      <header style={{ background: t.card }}>
        <div className="flex items-center justify-between px-3" style={{ height: 56 }}>
          <button onClick={() => router.back()} aria-label="Go back" className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: t.pill, border: `1px solid ${t.pillBorder}` }}>
            <ChevronLeft size={22} />
          </button>
          <div className="flex items-center rounded-full" style={{ height: 40, padding: 3, background: t.pill, border: `1px solid ${t.pillBorder}` }}>
            <span className="flex items-center justify-center" style={{ width: 34 }}><ShieldCheck size={19} /></span>
            <span className="flex items-center justify-center" style={{ width: 34 }}><Bell size={18} /></span>
            <button onClick={() => setFollowing((value) => !value)} className="rounded-full" style={{ height: 32, padding: "0 15px", background: following ? t.accent : t.text, color: following ? "#07130B" : t.bg, fontWeight: 850, fontSize: 12.5 }}>
              {following ? "Following" : "Follow"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4 px-5" style={{ minHeight: 132, paddingBottom: 18 }}>
          <Crest short={team.short} color={team.color} logo={team.logoUrl} size={64} ring={t.divider} />
          <div className="min-w-0">
            <h1 style={{ fontSize: 24, lineHeight: 1.08, fontWeight: 850, margin: 0 }}>{team.fullName}</h1>
            <div style={{ color: t.dim, fontSize: 14, fontWeight: 650, marginTop: 6 }}>{team.country}</div>
          </div>
        </div>
        <nav className="flex items-center overflow-x-auto no-scrollbar" style={{ height: 48, borderTop: `1px solid ${t.divider}` }}>
          {TABS.map((item) => (
            <button key={item} onClick={() => setTab(item)} className="relative h-full shrink-0" style={{ padding: "0 14px", color: tab === item ? t.text : t.tab, fontSize: 14, fontWeight: tab === item ? 800 : 650 }}>
              {item}
              {tab === item && <span className="absolute left-3 right-3 bottom-0 rounded-full" style={{ height: 3, background: t.accent }} />}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ paddingTop: 10 }}>
        {tab === "Overview" && <Overview state={state} t={t} onMatches={() => setTab("Matches")} />}
        {tab === "Matches" && <Matches state={state} t={t} />}
        {tab === "Table" && <Table state={state} t={t} />}
        {tab === "Stats" && <Stats state={state} t={t} />}
        {tab === "Squad" && <Squad state={state} t={t} />}
        {tab === "Trophies" && <Trophies state={state} t={t} />}
      </main>

      <BottomNav t={t} active="Matches" />
    </div>
  );
}

function Card({ t, children, style }) {
  return <section className="mx-3 mb-3 overflow-hidden" style={{ background: t.card, borderRadius: 14, ...style }}>{children}</section>;
}

function SectionTitle({ children, action, t }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "15px 16px 10px" }}>
      <h2 style={{ margin: 0, color: t.text, fontSize: 16, fontWeight: 800 }}>{children}</h2>
      {action && <button onClick={action} aria-label="Open section"><ChevronRight size={19} color={t.dim} /></button>}
    </div>
  );
}

function Overview({ state, t, onMatches }) {
  const { team, matches, teams } = state;
  const ordered = useMemo(() => [...matches].sort((a, b) => matchSortValue(a).localeCompare(matchSortValue(b))), [matches]);
  const nextMatch = ordered.find((match) => match.status === "scheduled");
  const form = [...ordered].filter((match) => match.status === "ft").slice(-5);
  return (
    <>
      {nextMatch && (
        <Card t={t}>
          <SectionTitle t={t}>Next match</SectionTitle>
          <div className="flex items-center justify-between px-5" style={{ color: t.dim, fontSize: 13, fontWeight: 700 }}>
            <span>{dayLabel(nextMatch.date)}</span>
            <span className="rounded-full" style={{ background: t.chip, padding: "5px 10px", textTransform: "uppercase", fontSize: 10.5 }}>{nextMatch.competitionName}</span>
          </div>
          <TeamMatchLine match={nextMatch} teams={teams} t={t} large />
        </Card>
      )}
      {form.length > 0 && (
        <Card t={t}>
          <SectionTitle t={t} action={onMatches}>Team form</SectionTitle>
          <div className="flex items-start overflow-x-auto no-scrollbar px-4 pb-4" style={{ gap: 22 }}>
            {form.map((match) => {
              const opponentId = match.home === team.id ? match.away : match.home;
              const opponent = teams[opponentId];
              const [scored, conceded] = scoreForTeam(match, team.id);
              const resultColor = match.result === "W" ? t.green : match.result === "L" ? t.red : t.drawPill;
              return (
                <Link href={`/match/${match.id}`} key={match.id} className="flex flex-col items-center shrink-0" style={{ gap: 8, width: 48 }}>
                  <span className="rounded-md" style={{ background: resultColor, color: "#fff", padding: "4px 7px", fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap" }}>{scored} - {conceded}</span>
                  <Crest short={opponent?.short || "?"} color={opponent?.color || "#555"} logo={opponent?.logoUrl} size={30} ring={t.divider} />
                </Link>
              );
            })}
          </div>
        </Card>
      )}
      {!nextMatch && form.length === 0 && <Card t={t} style={{ height: 150 }} />}
    </>
  );
}

function Matches({ state, t }) {
  const ordered = [...state.matches].sort((a, b) => matchSortValue(a).localeCompare(matchSortValue(b)));
  const previous = ordered.filter((match) => match.status === "ft").reverse();
  const upcoming = ordered.filter((match) => match.status !== "ft");
  return (
    <>
      {previous.length > 0 && <MatchList title="Previous matches" matches={previous} teams={state.teams} t={t} />}
      {upcoming.length > 0 && <MatchList title="Upcoming matches" matches={upcoming} teams={state.teams} t={t} />}
      {previous.length === 0 && upcoming.length === 0 && <Card t={t} style={{ height: 150 }} />}
    </>
  );
}

function MatchList({ title, matches, teams, t }) {
  return (
    <Card t={t}>
      <SectionTitle t={t}>{title}</SectionTitle>
      {matches.map((match) => (
        <div key={match.id} style={{ borderTop: `1px solid ${t.divider}` }}>
          <div className="flex items-center justify-between px-4 pt-3" style={{ color: t.dim, fontSize: 11.5, fontWeight: 650 }}>
            <span>{dayLabel(match.date)}</span>
            <span className="rounded-full" style={{ background: t.chip, padding: "4px 8px", textTransform: "uppercase", fontSize: 9.5 }}>{match.competitionName}</span>
          </div>
          <TeamMatchLine match={match} teams={teams} t={t} />
        </div>
      ))}
    </Card>
  );
}

function TeamMatchLine({ match, teams, t, large = false }) {
  const home = teams[match.home] || { name: "TBD", short: "?", color: "#555" };
  const away = teams[match.away] || { name: "TBD", short: "?", color: "#555" };
  const score = match.status === "scheduled" ? (match.time || "TBD") : match.status === "ft" ? `${match.hs} - ${match.as}` : liveMinute(match);
  return (
    <Link href={`/match/${match.id}`} className="grid items-center" style={{ gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", gap: large ? 10 : 8, minHeight: large ? 88 : 70, padding: "11px 15px" }}>
      <div className="flex items-center justify-end gap-2 min-w-0">
        <span className="text-right" style={{ color: t.text, fontSize: large ? 14 : 13, fontWeight: 700, lineHeight: 1.15 }}>{home.name}</span>
        <Crest short={home.short} color={home.color} logo={home.logoUrl} size={large ? 34 : 28} ring={t.divider} />
      </div>
      <span style={{ color: match.status === "live" ? t.green : match.status === "scheduled" ? t.dim : t.text, fontSize: large ? 16 : 14, fontWeight: 800, whiteSpace: "nowrap" }}>{score}</span>
      <div className="flex items-center gap-2 min-w-0">
        <Crest short={away.short} color={away.color} logo={away.logoUrl} size={large ? 34 : 28} ring={t.divider} />
        <span style={{ color: t.text, fontSize: large ? 14 : 13, fontWeight: 700, lineHeight: 1.15 }}>{away.name}</span>
      </div>
    </Link>
  );
}

function Table({ state, t }) {
  return (
    <Card t={t}>
      {state.tableCompetition && <SectionTitle t={t}>{state.tableCompetition.name}</SectionTitle>}
      {state.table.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <div className="grid items-center px-3 pb-2" style={{ minWidth: 440, gridTemplateColumns: "28px minmax(150px,1fr) repeat(6,34px) 72px", color: t.dim, fontSize: 10.5 }}>
            <span>#</span><span>Team</span><span>PL</span><span>W</span><span>D</span><span>L</span><span>GD</span><span>PTS</span><span>Form</span>
          </div>
          {state.table.map((row, index) => (
            <Link href={`/team/${row.id}`} key={row.id} className="grid items-center px-3" style={{ minWidth: 440, minHeight: 52, gridTemplateColumns: "28px minmax(150px,1fr) repeat(6,34px) 72px", borderTop: `1px solid ${t.divider}`, background: row.id === state.team.id ? t.hl : "transparent", fontSize: 12.5 }}>
              <span style={{ fontWeight: 800 }}>{index + 1}</span>
              <span className="flex items-center gap-2 min-w-0"><Crest short={row.short} color={row.color} logo={row.logoUrl} size={26} ring={t.divider} /><span style={{ fontWeight: 750 }}>{row.name}</span></span>
              <span>{row.pl}</span><span>{row.w}</span><span>{row.d}</span><span>{row.l}</span><span>{row.gf - row.ga}</span><span style={{ fontWeight: 850 }}>{row.pts}</span>
              <span className="flex gap-1">{row.form.slice(-5).map((result, resultIndex) => <i key={`${result}-${resultIndex}`} className="rounded-full" style={{ width: 9, height: 9, background: result === "W" ? t.green : result === "L" ? t.red : t.drawPill }} />)}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function Stats({ state, t }) {
  const s = state.stats;
  const metrics = [
    ["Matches", s.played], ["Wins", s.wins], ["Draws", s.draws], ["Losses", s.losses],
    ["Goals scored", s.goalsFor], ["Goals conceded", s.goalsAgainst], ["Clean sheets", s.cleanSheets],
    ["Avg. shots", s.averageShots], ["On target", s.averageShotsOnTarget], ["Avg. corners", s.averageCorners],
  ];
  return (
    <>
      <Card t={t} style={{ padding: 18 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Team statistics</h2>
        <div style={{ color: t.dim, fontSize: 12.5, marginBottom: 8 }}>Average possession</div>
        <div className="rounded-full overflow-hidden" style={{ height: 32, background: t.track }}>
          <div className="flex items-center px-3 h-full" style={{ width: `${Math.max(4, Math.min(100, s.averagePossession))}%`, background: t.accent, color: "#07130B", fontWeight: 900 }}>{s.averagePossession}%</div>
        </div>
      </Card>
      <Card t={t} style={{ padding: 10 }}>
        <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          {metrics.map(([label, value]) => (
            <div key={label} style={{ padding: "15px 12px", borderBottom: `1px solid ${t.divider}` }}>
              <div style={{ fontSize: 20, fontWeight: 850 }}>{value}</div>
              <div style={{ color: t.dim, fontSize: 12.5, marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function squadGroup(position) {
  const value = position?.toLowerCase() || "";
  if (/goal|keeper|\bgk\b/.test(value)) return "Keepers";
  if (/def|back/.test(value)) return "Defenders";
  if (/mid/.test(value)) return "Midfielders";
  if (/forward|striker|wing|attack/.test(value)) return "Forwards";
  return "Squad";
}

function Squad({ state, t }) {
  const order = ["Keepers", "Defenders", "Midfielders", "Forwards", "Squad"];
  const grouped = order.map((name) => [name, state.players.filter((player) => squadGroup(player.position) === name)]).filter(([, players]) => players.length);
  return (
    <>
      {state.team.coach && (
        <Card t={t}>
          <div className="flex justify-between px-4 pt-4"><strong style={{ fontSize: 14 }}>Coach</strong><span style={{ color: t.dim, fontSize: 11.5 }}>Age</span></div>
          <PersonRow person={state.team.coach} t={t} />
        </Card>
      )}
      {grouped.map(([name, players]) => (
        <Card t={t} key={name}>
          <div className="flex justify-between px-4 pt-4"><strong style={{ fontSize: 14 }}>{name}</strong><span style={{ color: t.dim, fontSize: 11.5 }}>Age</span></div>
          {players.map((player) => <PersonRow key={player.id} person={player} t={t} player />)}
        </Card>
      ))}
      {!state.team.coach && grouped.length === 0 && <Card t={t} style={{ height: 150 }} />}
    </>
  );
}

function PersonRow({ person, t, player = false }) {
  const age = ageFromDate(person.dateOfBirth);
  return (
    <div className="flex items-center gap-3 px-4" style={{ minHeight: 68 }}>
      <Photo src={person.photoUrl} name={person.name} />
      <div className="min-w-0 flex-1">
        <div style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>{player && person.number != null ? `${person.number} ` : ""}{person.name}</div>
        {person.country && <div style={{ color: t.dim, fontSize: 12, marginTop: 3 }}>{flagFor(person.country)} <span style={{ marginLeft: 4 }}>{person.country}</span></div>}
      </div>
      <span style={{ color: t.text, fontSize: 14, fontWeight: 650 }}>{age ?? ""}</span>
    </div>
  );
}

function Trophies({ state, t }) {
  return (
    <Card t={t}>
      <SectionTitle t={t}>Trophies</SectionTitle>
      {state.trophies.length > 0 ? state.trophies.map((trophy) => (
        <div key={trophy.id} className="flex items-center gap-3 px-4" style={{ minHeight: 76, borderTop: `1px solid ${t.divider}` }}>
          {trophy.imageUrl ? <Photo src={trophy.imageUrl} name={trophy.name} size={46} color="transparent" /> : <span className="flex items-center justify-center rounded-full" style={{ width: 46, height: 46, background: t.chip }}><Trophy size={24} color={t.yellow} /></span>}
          <div className="flex-1">
            <div style={{ fontSize: 14, fontWeight: 750 }}>{trophy.name}</div>
            {(trophy.season || trophy.wonOn) && <div style={{ color: t.dim, fontSize: 12, marginTop: 4 }}>{trophy.season || dayLabel(trophy.wonOn, false)}</div>}
          </div>
        </div>
      )) : <div style={{ height: 110 }} />}
    </Card>
  );
}
