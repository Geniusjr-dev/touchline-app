"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Share2, Star, MapPin, Calendar, Disc3, ArrowUp, ArrowDown } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { announcedStoppageMinutes, EMPTY_MATCH_STATS, formatMatchClock, getMatch } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { Crest, BottomNav } from "@/components/ui";

const TABS_PRE = ["Preview", "Stats", "H2H"];
const TABS_LIVE = ["Facts", "Commentary", "Lineup", "Table", "Stats", "H2H"];

function goalsBySide(events, side) {
  return (events || []).filter((e) => e.type === "goal" && e.side === side).length;
}

function hasKnownScorer(player) {
  const name = player?.trim().toLowerCase();
  return Boolean(name && !["unknown", "unknown scorer", "unknown player", "n/a", "na"].includes(name));
}

function MonoFootball({ size = 14, color = "#FFFFFF" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 512 512" width={size} height={size} style={{ display: "inline-block", flex: "0 0 auto", color }}>
      {/* Font Awesome Free futbol icon, used as a fixed monochrome match symbol. */}
      <path fill="currentColor" d="M417.3 360.1l-71.6-4.8c-5.2-.3-10.3 1.1-14.5 4.2s-7.2 7.4-8.4 12.5l-17.6 69.6C289.5 445.8 273 448 256 448s-33.5-2.2-49.2-6.4L189.2 372c-1.3-5-4.3-9.4-8.4-12.5s-9.3-4.5-14.5-4.2l-71.6 4.8c-17.6-27.2-28.5-59.2-30.4-93.6L125 228.3c4.4-2.8 7.6-7 9.2-11.9s1.4-10.2-.5-15l-26.7-66.6C128 109.2 155.3 89 186.7 76.9l55.2 46c4 3.3 9 5.1 14.1 5.1s10.2-1.8 14.1-5.1l55.2-46c31.3 12.1 58.7 32.3 79.6 57.9l-26.7 66.6c-1.9 4.8-2.1 10.1-.5 15s4.9 9.1 9.2 11.9l60.7 38.2c-1.9 34.4-12.8 66.4-30.4 93.6zM256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm14.1-325.7c-8.4-6.1-19.8-6.1-28.2 0L194 221c-8.4 6.1-11.9 16.9-8.7 26.8l18.3 56.3c3.2 9.9 12.4 16.6 22.8 16.6h59.2c10.4 0 19.6-6.7 22.8-16.6l18.3-56.3c3.2-9.9-.3-20.7-8.7-26.8l-47.9-34.8z" />
    </svg>
  );
}

function breakClock(match) {
  const duration = Number(match.matchDurationMinutes || 90);
  const extraTime = Number(match.extraTimeMinutes || 30);
  const minute = match.status === "et_ht" ? duration + extraTime / 2 : duration / 2;
  return `${minute}:00`;
}

function scorerSummary(events, side) {
  const grouped = new Map();
  (events || []).filter((event) => event.type === "goal" && event.side === side && hasKnownScorer(event.player)).forEach((event) => {
    const player = event.player.trim();
    const minute = fotMobMinuteLabel(event.min || `${event.displayMinute || 1}'`);
    if (!grouped.has(player)) grouped.set(player, []);
    grouped.get(player).push(minute);
  });
  return [...grouped.entries()].map(([player, minutes]) => `${player} ${minutes.join(", ")}`);
}

export default function MatchCentre({ id }) {
  const { t } = useTheme();
  const router = useRouter();
  const [state, setState] = useState(null);
  const [tab, setTab] = useState(null);
  const [now, setNow] = useState(0);
  const [following, setFollowing] = useState(false);

  async function shareMatch() {
    const shareData = { title: "Touchline match", url: window.location.href };
    if (navigator.share) {
      await navigator.share(shareData).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(window.location.href).catch(() => {});
  }

  useEffect(() => {
    let alive = true;
    const load = () => getMatch(id).then((r) => { if (alive) setState(r); });
    load();
    const firstTick = window.setTimeout(() => setNow(Date.now()), 0);
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    let ch;
    if (supabase) {
      ch = supabase.channel("m-" + id)
        .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `match_id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_statistics", filter: `match_id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, load)
        .subscribe();
    }
    return () => { alive = false; window.clearTimeout(firstTick); window.clearInterval(ticker); if (ch) supabase.removeChannel(ch); };
  }, [id]);

  const loadingStyle = { background: t.bg, minHeight: "100vh", color: t.dim, display: "flex", alignItems: "center", justifyContent: "center" };
  if (!state) return <div style={loadingStyle}>Loading…</div>;
  const { match: m, teams, detail: d } = state;
  if (!m) return <div style={loadingStyle}>Match not found.</div>;

  const h = teams[m.home] || { name: "TBD", short: "?", color: "#555" };
  const a = teams[m.away] || { name: "TBD", short: "?", color: "#555" };
  const live = ["live", "ht", "et_live", "et_ht"].includes(m.status);
  const ended = m.status === "ft";
  const started = live || ended;
  const tabs = started ? TABS_LIVE : TABS_PRE;
  const activeTab = tab || (started ? "Facts" : "Preview");
  const hs = m.hs != null ? m.hs : 0, as = m.as != null ? m.as : 0;
  const announcedStoppage = announcedStoppageMinutes(m);
  const homeScorers = scorerSummary(d?.events, "home");
  const awayScorers = scorerSummary(d?.events, "away");
  const hasScorerSummary = homeScorers.length > 0 || awayScorers.length > 0;

  return (
    <div style={{ background: t.bg, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 74 }}>
      {/* header */}
      <div className="sticky top-0 z-30" style={{ background: t.bg }}>
        <div className="flex items-center justify-between px-3" style={{ height: 48 }}>
          <button onClick={() => router.push("/")} className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: t.pill }}>
            <ChevronLeft size={22} color={t.text} />
          </button>
          <span />
          <div className="flex items-center rounded-full" style={{ height: 38, background: t.pill, border: `1px solid ${t.divider}` }}>
            <button aria-label="Share match" onClick={shareMatch} className="flex items-center justify-center" style={{ width: 40, height: 38 }}>
              <Share2 size={18} color={t.text} />
            </button>
            <span style={{ width: 1, height: 22, background: t.divider }} />
            <button aria-label={following ? "Stop following match" : "Follow match"} onClick={() => setFollowing((value) => !value)} className="flex items-center justify-center" style={{ width: 40, height: 38 }}>
              <Star size={19} color={t.text} fill={following ? t.text : "none"} />
            </button>
          </div>
        </div>
        <div className="grid items-start px-8 pb-2" style={{ gridTemplateColumns: "minmax(0, 1fr) 104px minmax(0, 1fr)" }}>
          <Link href={`/team/${m.home}`} className="flex flex-col items-center min-w-0">
            <Crest short={h.short} color={h.color} logo={h.logoUrl} size={44} ring={t.divider} />
            <span className="text-center mt-1" style={{ color: t.text, fontSize: 11.5, fontWeight: 700, lineHeight: 1.15, maxWidth: 120 }}>{h.name}</span>
          </Link>
          <div className="flex flex-col items-center pt-1">
            {m.status === "scheduled"
              ? <span style={{ color: t.text, fontSize: 24, fontWeight: 750, whiteSpace: "nowrap" }}>{m.time || "—"}</span>
              : <span className="flex items-center gap-2" style={{ color: t.text, fontSize: 26, fontWeight: 750, whiteSpace: "nowrap" }}>{hs} <span style={{ color: t.dim }}>-</span> {as}</span>}
            {m.status === "ht" && <span style={{ color: t.dim, fontSize: 11, fontWeight: 700, marginTop: 3 }}>Half time · {breakClock(m)}</span>}
            {m.status === "et_ht" && <span style={{ color: t.dim, fontSize: 11, fontWeight: 700, marginTop: 3 }}>Extra-time break · {breakClock(m)}</span>}
            {(m.status === "live" || m.status === "et_live") && (
              <span className="inline-flex items-center gap-1.5" style={{ color: t.red, fontSize: 11, fontWeight: 700, marginTop: 3 }}>
                <span className="inline-block rounded-full animate-pulse" style={{ width: 6, height: 6, background: t.red }} />
                {m.status === "et_live" ? "ET " : ""}{formatMatchClock(m, now)}{announcedStoppage ? ` · +${announcedStoppage} added` : ""}
              </span>
            )}
            {ended && <span style={{ color: t.dim, fontSize: 11, fontWeight: 700, marginTop: 3 }}>Full time</span>}
          </div>
          <Link href={`/team/${m.away}`} className="flex flex-col items-center min-w-0">
            <Crest short={a.short} color={a.color} logo={a.logoUrl} size={44} ring={t.divider} />
            <span className="text-center mt-1" style={{ color: t.text, fontSize: 11.5, fontWeight: 700, lineHeight: 1.15, maxWidth: 120 }}>{a.name}</span>
          </Link>
        </div>
        {hasScorerSummary && (
          <div className="grid px-8 pb-2" style={{ gridTemplateColumns: "minmax(0, 1fr) 16px minmax(0, 1fr)", columnGap: 6, alignItems: "start" }}>
            <div style={{ color: t.dim, fontSize: 10.5, lineHeight: 1.35, textAlign: "right", minWidth: 0 }}>
              {homeScorers.map((scorer) => <div key={scorer}>{scorer}</div>)}
            </div>
            <span className="inline-flex justify-center" style={{ paddingTop: 1 }}><MonoFootball size={11} color={t.text} /></span>
            <div style={{ color: t.dim, fontSize: 10.5, lineHeight: 1.35, textAlign: "left", minWidth: 0 }}>
              {awayScorers.map((scorer) => <div key={scorer}>{scorer}</div>)}
            </div>
          </div>
        )}
        <div className="flex items-center gap-6 px-4 overflow-x-auto no-scrollbar" style={{ height: 46, borderBottom: `1px solid ${t.divider}` }}>
          {tabs.map((tb) => {
            const on = tb === activeTab;
            return (
              <button key={tb} onClick={() => setTab(tb)} className="shrink-0 relative h-full" style={{ color: on ? t.text : t.tab, fontSize: 16, fontWeight: on ? 800 : 600 }}>
                {tb}{on && <span className="absolute left-0 right-0" style={{ bottom: 0, height: 3, background: t.text, borderRadius: 3 }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* content */}
      {(activeTab === "Preview" || activeTab === "Facts") && <FactsPreview t={t} m={m} h={h} a={a} d={d} started={started} />}
      {activeTab === "Commentary" && <Commentary t={t} m={m} d={d} h={h} a={a} />}
      {activeTab === "Stats" && <StatsTab t={t} stats={d?.stats} />}
      {activeTab === "Table" && <TableTab t={t} m={m} rows={d?.table || []} />}
      {activeTab === "H2H" && <H2H t={t} h={h} a={a} />}

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

function StatsTab({ t, stats }) {
  const s = { ...EMPTY_MATCH_STATS, ...(stats || {}) };
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
        <div className="flex items-center px-3" style={{ width: `${s.home_possession}%`, background: t.blue, color: "#07131B", fontSize: 15, fontWeight: 850 }}>{s.home_possession}%</div>
        <div className="flex items-center justify-end px-3" style={{ width: `${s.away_possession}%`, background: t.red, color: "#fff", fontSize: 15, fontWeight: 850 }}>{s.away_possession}%</div>
      </div>
      {rows.map(([label, home, away]) => (
        <div key={label} className="grid items-center py-2" style={{ gridTemplateColumns: "44px 1fr 44px" }}>
          <span className="inline-flex items-center justify-center rounded-full" style={{ justifySelf: "start", minWidth: 30, height: 24, padding: "0 7px", background: t.blue, color: "#07131B", fontSize: 13, fontWeight: 800 }}>{home}</span>
          <span className="text-center" style={{ color: t.text, fontSize: 13 }}>{label}</span>
          <span style={{ justifySelf: "end", color: t.text, fontSize: 13, fontWeight: 700 }}>{away}</span>
        </div>
      ))}
    </Card>
  );
}

// ---------- Facts / Preview ----------
function FactsPreview({ t, m, h, a, d, started }) {
  return (
    <div>
      {d && d.venue && d.details && (
        <>
          <Card t={t}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-3">
                <Disc3 size={20} color={t.dim} />
                <div>
                  <div style={{ color: t.text, fontSize: 16, fontWeight: 700 }}>{d.venue.name}</div>
                  <div style={{ color: t.dim, fontSize: 13 }}>{d.venue.loc}</div>
                </div>
              </div>
              <span className="inline-flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: t.chip }}><MapPin size={16} color={t.accent} /></span>
            </div>
            <div style={{ height: 1, background: t.divider }} />
            {started ? (
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span style={{ color: t.text, fontSize: 14 }}><b>Attendance</b> <span style={{ color: t.dim }}>{d.venue.att}</span></span>
                  <span style={{ color: t.text, fontSize: 14 }}><b>Capacity</b> <span style={{ color: t.dim }}>{d.venue.cap}</span></span>
                </div>
                <div className="rounded-full relative" style={{ height: 6, background: t.divider }}>
                  <div className="rounded-full absolute left-0 top-0" style={{ height: 6, width: `${d.venue.pct}%`, background: t.accent }} />
                </div>
              </div>
            ) : (
              <div className="px-4 py-3" style={{ color: t.text, fontSize: 14 }}><b>Capacity</b> <span style={{ color: t.dim }}>{d.venue.cap}</span></div>
            )}
            <div style={{ height: 1, background: t.divider }} />
            <div className="px-4 py-3" style={{ color: t.text, fontSize: 14 }}><b>Surface</b> <span style={{ color: t.dim }}>{d.venue.surface}</span></div>
            <div style={{ height: 1, background: t.divider }} />
            <div className="px-4 py-3" style={{ color: t.text, fontSize: 14 }}><b>Weather</b> <span style={{ color: t.dim }}>{d.venue.weather}</span></div>
          </Card>

          <Card t={t}>
            <div className="px-4 py-3 flex items-center gap-3"><Calendar size={17} color={t.dim} /><span style={{ color: t.text, fontSize: 14, fontWeight: 600 }}>{d.details.date}</span></div>
            <div style={{ height: 1, background: t.divider }} />
            <div className="px-4 py-3 flex items-center gap-3"><span className="rounded-full px-3 py-1" style={{ background: t.chip, color: t.text, fontSize: 13, fontWeight: 600 }}>{d.details.comp}</span></div>
            <div style={{ height: 1, background: t.divider }} />
            <div className="px-4 py-3 flex items-center gap-3"><Disc3 size={17} color={t.dim} /><span style={{ color: t.text, fontSize: 14 }}>Referee {d.details.ref}</span></div>
          </Card>
        </>
      )}

      {started ? (
        d ? <Timeline t={t} events={d.events} match={m} /> : <Empty t={t} title="Match started" note="Events will appear here as the scorer records them." />
      ) : (
        <Empty t={t} title="Not started yet" note="Line-ups and match events will appear here once the match kicks off." />
      )}
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
  if (!timelineEvents.length) return <Empty t={t} title="No events yet" note="The timeline fills as the match unfolds." />;
  const sorted = timelineEvents.sort((x, y) => x.m - y.m);
  return (
    <Card t={t} style={{ paddingTop: 4, paddingBottom: 8 }}>
      <div className="px-3">{sorted.map((e, i) => <Ev key={i} e={e} t={t} />)}</div>
    </Card>
  );
}
function RunScore({ score, scored, t }) {
  const [x, y] = score.split(" - ");
  return <span style={{ color: t.dim, fontSize: 13 }}>(<span style={{ color: scored === "home" ? t.green : t.dim, fontWeight: 700 }}>{x}</span> - <span style={{ color: scored === "away" ? t.green : t.dim, fontWeight: 700 }}>{y}</span>)</span>;
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
  const icon = e.type === "goal" ? <MonoFootball size={16} color={t.text} />
    : e.type === "yellow" ? <span className="rounded-sm" style={{ width: 11, height: 15, background: t.yellow, display: "inline-block" }} />
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
    if (e.type === "goal") {
      const knownScorer = hasKnownScorer(e.player);
      return <div style={{ textAlign: align }}>
        <div style={{ fontSize: 14 }}>{knownScorer && <span style={{ color: t.text, fontWeight: 700 }}>{e.player} </span>}<RunScore score={e.score} scored={e.scored} t={t} /></div>
        {knownScorer && hasKnownScorer(e.assist) && <div style={{ color: t.dim, fontSize: 12 }}>Assist by {e.assist}</div>}
      </div>;
    }
    return hasKnownScorer(e.player)
      ? <div style={{ color: t.text, fontSize: 14, fontWeight: 600, textAlign: align }}>{e.player}</div>
      : null;
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

function goalCommentary(event, match, home, away) {
  const [homeScore = "0", awayScore = "0"] = (event.score || "0 - 0").split(" - ").map((score) => score.trim());
  const scoringTeam = event.side === "away" ? away : home;
  const concedingTeam = event.side === "away" ? home : away;
  const scoringTeamScore = Number(event.side === "away" ? awayScore : homeScore);
  const concedingTeamScore = Number(event.side === "away" ? homeScore : awayScore);
  const scoreline = `${scoringTeam.name} ${scoringTeamScore}, ${concedingTeam.name} ${concedingTeamScore}.`;
  const scorer = hasKnownScorer(event.player) ? ` Scored by: ${event.player}.` : "";
  const duration = Number(match.matchDurationMinutes || 90);
  const extraTime = Number(match.extraTimeMinutes || 30);
  const displayedMinute = Number(event.displayMinute || Math.max(1, Math.ceil(rawEventSeconds(event) / 60)));
  const period = Number(event.period || (displayedMinute > duration / 2 ? 2 : 1));
  const lateInRegulation = period === 2 && displayedMinute >= Math.max(duration - 10, duration / 2 + 1);
  const lateInExtraTime = period === 4 && displayedMinute >= duration + Math.max(extraTime - 5, 1);
  const late = lateInRegulation || lateInExtraTime;
  const equaliser = scoringTeamScore === concedingTeamScore;
  const takesLead = scoringTeamScore > concedingTeamScore && scoringTeamScore - 1 <= concedingTeamScore;
  const friendly = match.competitionType === "friendly"
    || /friend(?:ly|lies)|exhibition|warm[ -]?up/i.test(match.compName || "");
  const inAddedTime = String(event.min || "").includes("+");
  const moment = inAddedTime ? "deep into stoppage time" : "in the dying moments";

  if (late && equaliser) {
    return friendly
      ? `GOALLLLLL! ${scoringTeam.name} find a late equaliser. ${scoreline}${scorer}`
      : `GOALLLLLLLLLLLLLL! Late drama! ${scoringTeam.name} draw level ${moment}! ${scoreline}${scorer}`;
  }
  if (late && takesLead) {
    return friendly
      ? `GOALLLLLL! A late goal puts ${scoringTeam.name} in front. ${scoreline}${scorer}`
      : `GOALLLLLLLLLLLLLL! Incredible late drama! ${scoringTeam.name} take the lead ${moment}. Could this be the winner? ${scoreline}${scorer}`;
  }
  return `GOAL! ${scoreline}${scorer}`;
}

function commentaryMilestones(match, includeHalfTime = true) {
  const duration = Number(match.matchDurationMinutes || 90);
  const extraTime = Number(match.extraTimeMinutes || 30);
  const half = duration / 2;
  const currentPeriod = Number(match.current_period || 1);
  const lines = [{ sort: 100000, m: "1'", text: "First half begins." }];
  const addStoppage = (minutes, endMinute, period, periodName) => {
    if (minutes > 0) lines.push({
      sort: period * 100000 + endMinute * 60,
      m: `${endMinute}'`,
      text: `A minimum of ${minutes} minute${minutes === 1 ? "" : "s"} will be added at the end of ${periodName}.`,
    });
  };

  addStoppage(Number(match.first_half_stoppage_minutes || 0), half, 1, "the first half");
  if (includeHalfTime && (match.status === "ht" || currentPeriod >= 2 || match.status === "ft")) {
    lines.push({ sort: 100000 + (half + Number(match.first_half_stoppage_minutes || 0)) * 60 + 1, m: `${half}'`, text: "Half time." });
  }
  if (currentPeriod >= 2) lines.push({ sort: 200000 + half * 60 + 1, m: `${half + 1}'`, text: "Second half begins." });
  addStoppage(Number(match.second_half_stoppage_minutes || 0), duration, 2, "the second half");
  if (currentPeriod >= 3) lines.push({ sort: 300000 + duration * 60 + 1, m: `${duration + 1}'`, text: "First half of extra time begins." });
  addStoppage(Number(match.extra_time_first_half_stoppage_minutes || 0), duration + extraTime / 2, 3, "the first half of extra time");
  if (currentPeriod >= 4) lines.push({ sort: 400000 + (duration + extraTime / 2) * 60 + 1, m: `${duration + extraTime / 2 + 1}'`, text: "Second half of extra time begins." });
  addStoppage(Number(match.extra_time_second_half_stoppage_minutes || 0), duration + extraTime, 4, "the second half of extra time");
  return lines;
}

function Commentary({ t, m, d, h, a }) {
  if (!d) return <Empty t={t} title="Commentary" note="Commentary is generated from match events as they are recorded." />;
  const eventLines = [...d.events].map((e) => {
    const sort = eventSortSeconds(e, m);
    if (e.type === "half") return { sort, m: e.min || "HT", text: `Half time. ${h.name} ${e.score} ${a.name}.` };
    if (e.type === "goal") return { sort, m: e.min, text: goalCommentary(e, m, h, a) };
    if (e.type === "yellow") {
      const team = e.side === "away" ? a : h;
      return { sort, m: e.min, text: hasKnownScorer(e.player) ? `Yellow card shown to ${e.player} (${team.name}).` : `Yellow card for ${team.name}.` };
    }
    if (e.type === "red") {
      const team = e.side === "away" ? a : h;
      return { sort, m: e.min, text: hasKnownScorer(e.player) ? `Red card! ${e.player} (${team.name}) is sent off.` : `Red card for ${team.name}.` };
    }
    if (e.type === "sub") {
      const playerOn = hasKnownScorer(e.player) ? e.player : null;
      const playerOff = hasKnownScorer(e.assist) ? e.assist : null;
      const text = playerOn && playerOff ? `Substitution: ${playerOn} replaces ${playerOff}.`
        : playerOn ? `Substitution: ${playerOn} comes on.`
        : playerOff ? `Substitution: ${playerOff} leaves the field.`
        : "Substitution.";
      return { sort, m: e.min, text };
    }
    return { sort, m: e.min, text: "" };
  });
  const fullTimeLines = m.status === "ft" ? [
    {
      sort: 900000002,
      m: null,
      text: `Match ends, ${h.name} ${m.hs}, ${a.name} ${m.as}.`,
    },
    {
      sort: 900000001,
      m: finalWhistleMinute(m),
      text: `${Number(m.current_period || 2) >= 3 ? "Second half of extra time" : "Second half"} ends, ${h.name} ${m.hs}, ${a.name} ${m.as}.`,
    },
  ] : [];
  const lines = [...eventLines, ...commentaryMilestones(m, !d.events.some((event) => event.type === "half")), ...fullTimeLines]
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
  if (!rows.length) return <Empty t={t} title="Competition table" note="The table will appear when this competition has fixtures." />;
  const hi = [m.home, m.away];
  return (
    <>
      <div className="mx-2 my-2 rounded-2xl overflow-hidden" style={{ background: t.card }}>
        <div className="flex items-center px-3 py-2" style={{ color: t.dim, fontSize: 11, fontWeight: 700 }}>
          <span style={{ width: 22 }} /><span className="flex-1 pl-1">Team</span>
          <span style={{ width: 22, textAlign: "center" }}>PL</span><span style={{ width: 20, textAlign: "center" }}>W</span>
          <span style={{ width: 20, textAlign: "center" }}>D</span><span style={{ width: 20, textAlign: "center" }}>L</span>
          <span style={{ width: 30, textAlign: "center" }}>GD</span><span style={{ width: 30, textAlign: "center" }}>PTS</span>
          <span style={{ width: 92, textAlign: "right", paddingRight: 4 }}>Form</span>
        </div>
        <div style={{ height: 1, background: t.divider }} />
        {rows.map((tm, i) => {
          const gd = tm.gf - tm.ga; const on = hi.includes(tm.id); const q = i < Math.min(4, rows.length);
          return <div key={tm.id} className="flex items-center px-3 py-2.5" style={{ background: on ? t.hl : "transparent", borderBottom: `1px solid ${t.divider}` }}>
            <div className="flex items-center" style={{ width: 22 }}>
              <span style={{ width: 3, height: 22, borderRadius: 2, background: q ? t.accent : "transparent", marginRight: 5 }} />
              <span style={{ color: t.dim, fontSize: 13, fontWeight: 600 }}>{i + 1}</span>
            </div>
            <div className="flex-1 flex items-center gap-2 min-w-0 pl-1">
              <Crest short={tm.short} color={tm.color} logo={tm.logoUrl} size={22} ring={t.divider} />
              <span className="truncate" style={{ color: t.text, fontSize: 13.5, fontWeight: 600 }}>{tm.name}</span>
            </div>
            <span style={{ width: 22, textAlign: "center", color: t.text, fontSize: 13 }}>{tm.pl}</span>
            <span style={{ width: 20, textAlign: "center", color: t.dim, fontSize: 13 }}>{tm.w}</span>
            <span style={{ width: 20, textAlign: "center", color: t.dim, fontSize: 13 }}>{tm.d}</span>
            <span style={{ width: 20, textAlign: "center", color: t.dim, fontSize: 13 }}>{tm.l}</span>
            <span style={{ width: 30, textAlign: "center", color: t.dim, fontSize: 13 }}>{gd > 0 ? "+" + gd : gd}</span>
            <span style={{ width: 30, textAlign: "center", color: t.text, fontSize: 14, fontWeight: 800 }}>{tm.pts}</span>
            <span style={{ width: 92 }} className="flex gap-1 justify-end">
              {tm.form.slice(-5).map((r, k) => <span key={k} className="inline-flex items-center justify-center rounded-full" style={{ width: 16, height: 16, background: r === "W" ? t.win : r === "D" ? t.drawPill : t.loss, color: "#fff", fontSize: 9, fontWeight: 800 }}>{r}</span>)}
            </span>
          </div>;
        })}
      </div>
      <div className="flex items-center gap-2 px-4 py-2">
        <span style={{ width: 10, height: 10, borderRadius: 2, background: t.accent }} />
        <span style={{ color: t.dim, fontSize: 12 }}>Advances to the knockout stage</span>
      </div>
    </>
  );
}

// ---------- H2H ----------
function H2H() {
  return null;
}
