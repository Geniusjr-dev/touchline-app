"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Trophy } from "lucide-react";
import CompetitionTable from "@/components/CompetitionTable";
import { BottomNav, Crest, StatusChip } from "@/components/ui";
import { getLeagueCentre } from "@/lib/db";
import { cachePublicMatch } from "@/lib/matchCache";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

function withDeadline(promise, milliseconds = 6000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("The league request timed out.")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function dateLabel(date) {
  if (!date) return "Date to be confirmed";
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(value);
}

export default function LeagueCentre({ id }) {
  const { t } = useTheme();
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("Table");
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(() => {
    withDeadline(getLeagueCentre(id))
      .then((result) => {
        setState(result);
        setLoadError(result ? "" : "This league is unavailable.");
      })
      .catch(() => setLoadError("This league could not be loaded."));
  }, [id]);

  useEffect(() => {
    let refreshTimer;
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(load, 140);
    };
    load();
    setNow(Date.now());
    const ticker = window.setInterval(() => setNow(Date.now()), 15000);
    let channel;
    if (supabase) {
      channel = supabase.channel(`touchline-league-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "competitions", filter: `id=eq.${id}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "competition_teams", filter: `competition_id=eq.${id}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `competition_id=eq.${id}` }, scheduleRefresh)
        .subscribe();
    }
    return () => {
      window.clearTimeout(refreshTimer);
      window.clearInterval(ticker);
      if (channel) supabase.removeChannel(channel);
    };
  }, [id, load]);

  if (!state) return <LeagueShell t={t} error={loadError} onRetry={load} />;
  const completed = state.matches.filter((match) => match.status === "ft").length;
  const live = state.matches.filter((match) => ["live", "ht", "et_live", "et_ht"].includes(match.status)).length;

  return (
    <div style={{ background: t.bg, color: t.text, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 82 }}>
      <header className="sticky top-0 z-30" style={{ background: t.card, borderBottom: `1px solid ${t.divider}` }}>
        <div className="flex items-center px-3" style={{ height: 54 }}>
          <Link href="/leagues" aria-label="Back to leagues" className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: t.pill, border: `1px solid ${t.pillBorder}` }}>
            <ChevronLeft size={22} color={t.text} />
          </Link>
        </div>
        <div className="flex items-center gap-4 px-5" style={{ minHeight: 108, paddingBottom: 18 }}>
          <span className="inline-flex items-center justify-center rounded-2xl" style={{ width: 62, height: 62, background: t.disc }}>
            <Trophy size={30} color={t.accent} />
          </span>
          <div className="min-w-0">
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.12, fontWeight: 850 }}>{state.competition.name}</h1>
            {state.competition.sub && <div style={{ color: t.dim, fontSize: 13.5, marginTop: 6 }}>{state.competition.sub}</div>}
            <div className="flex items-center gap-2" style={{ color: t.dim, fontSize: 11.5, marginTop: 8 }}>
              <span>{state.table.length} teams</span>
              <span>•</span>
              <span>{completed}/{state.matches.length} completed</span>
              {live > 0 && <span style={{ color: t.accent, fontWeight: 850 }}>• {live} live</span>}
            </div>
          </div>
        </div>
        <nav className="grid grid-cols-2" style={{ height: 46, borderTop: `1px solid ${t.divider}` }}>
          {["Table", "Matches"].map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setTab(item)}
              className="relative"
              style={{ color: tab === item ? t.text : t.tab, fontSize: 14, fontWeight: tab === item ? 800 : 650 }}
            >
              {item}
              {tab === item && <span className="absolute left-8 right-8 bottom-0 rounded-full" style={{ height: 3, background: t.accent }} />}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ paddingTop: 4 }}>
        {tab === "Table" && <CompetitionTable t={t} competition={state.competition} rows={state.table} />}
        {tab === "Matches" && <LeagueMatches matches={state.matches} teams={state.teams} t={t} now={now} />}
      </main>

      <BottomNav t={t} active="Leagues" />
    </div>
  );
}

function LeagueMatches({ matches, teams, t, now }) {
  if (!matches.length) {
    return <div className="mx-2 my-3 rounded-2xl text-center" style={{ padding: "28px 18px", background: t.card, color: t.dim, fontSize: 13.5 }}>No matches have been scheduled for this league.</div>;
  }
  return <div className="mx-2 my-2 rounded-2xl overflow-hidden" style={{ background: t.card }}>
    {matches.map((match, index) => (
      <LeagueMatchRow key={match.id} match={match} teams={teams} t={t} now={now} first={index === 0} />
    ))}
  </div>;
}

function LeagueMatchRow({ match, teams, t, now, first }) {
  const home = teams[match.home] || { name: "TBD", short: "?", color: "#555" };
  const away = teams[match.away] || { name: "TBD", short: "?", color: "#555" };
  const showScore = ["live", "ht", "et_live", "et_ht", "ft"].includes(match.status);
  const rememberMatch = () => cachePublicMatch(match, teams);
  return (
    <Link
      href={`/match/${match.id}`}
      onPointerDown={rememberMatch}
      onClick={rememberMatch}
      className="block active:opacity-70"
      style={{ padding: "12px 13px", borderTop: first ? "none" : `1px solid ${t.divider}` }}
    >
      <div className="flex items-center justify-between" style={{ color: t.dim, fontSize: 10.5, fontWeight: 700, marginBottom: 10 }}>
        <span>{dateLabel(match.date)}</span>
        <StatusChip m={match} t={t} now={now} />
      </div>
      <div className="grid items-center" style={{ gridTemplateColumns: "minmax(0, 1fr) 48px minmax(0, 1fr)", gap: 8 }}>
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className="truncate" style={{ fontSize: 13, fontWeight: 700 }}>{home.name}</span>
          <Crest short={home.short} color={home.color} logo={home.logoUrl} size={25} ring={t.divider} />
        </div>
        <span style={{ textAlign: "center", color: showScore ? t.text : t.dim, fontSize: 14, fontWeight: 850, whiteSpace: "nowrap" }}>
          {showScore ? `${match.hs} - ${match.as}` : match.time || "TBD"}
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <Crest short={away.short} color={away.color} logo={away.logoUrl} size={25} ring={t.divider} />
          <span className="truncate" style={{ fontSize: 13, fontWeight: 700 }}>{away.name}</span>
        </div>
      </div>
    </Link>
  );
}

function LeagueShell({ t, error, onRetry }) {
  return <div style={{ background: t.bg, color: t.text, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 82 }}>
    <div style={{ height: 208, background: t.card, borderBottom: `1px solid ${t.divider}` }} />
    {error ? (
      <div className="mx-3 mt-4 rounded-2xl text-center" style={{ padding: 22, background: t.card }}>
        <div style={{ fontSize: 14, fontWeight: 750 }}>{error}</div>
        <button type="button" onClick={onRetry} className="rounded-full" style={{ marginTop: 12, padding: "9px 16px", background: t.accent, color: "#07130B", fontSize: 13, fontWeight: 800 }}>Try again</button>
      </div>
    ) : (
      <div className="mx-2 mt-3 rounded-2xl" style={{ height: 360, background: t.card }} />
    )}
    <BottomNav t={t} active="Leagues" />
  </div>;
}
