"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Trophy } from "lucide-react";
import { BottomNav } from "@/components/ui";
import { getLeaguesHome } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

export default function LeaguesHome() {
  const { t } = useTheme();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback((force = false) => {
    getLeaguesHome({ force })
      .then((result) => {
        setData(result);
        setLoadError("");
      })
      .catch(() => setLoadError("The leagues could not be loaded."));
  }, []);

  useEffect(() => {
    let refreshTimer;
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => load(true), 140);
    };
    load();
    let channel;
    if (supabase) {
      channel = supabase.channel("touchline-leagues")
        .on("postgres_changes", { event: "*", schema: "public", table: "competitions" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "competition_teams" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, scheduleRefresh)
        .subscribe();
    }
    return () => {
      window.clearTimeout(refreshTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  const competitions = useMemo(() => data?.competitions || [], [data]);
  const visibleCompetitions = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return competitions;
    return competitions.filter((competition) => `${competition.name} ${competition.country || ""}`.toLocaleLowerCase().includes(search));
  }, [competitions, query]);
  return (
    <div style={{ background: t.bg, color: t.text, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 82 }}>
      <header style={{ padding: "22px 16px 10px" }}>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.1, letterSpacing: -0.4 }}>Leagues</h1>
        <label className="flex items-center rounded-full" style={{ height: 48, marginTop: 16, padding: "0 15px", background: t.pill, border: `1px solid ${t.pillBorder}` }}>
          <Search size={20} color={t.dim} />
          <input aria-label="Find leagues" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find leagues" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", color: t.text, padding: "0 10px", fontSize: 14 }} />
        </label>
      </header>

      <main style={{ padding: "15px 12px" }}>
        <div className="flex items-center" style={{ margin: "0 4px 15px" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Following</h2>
        </div>
        {!data && !loadError && <LeagueListShell t={t} />}
        {loadError && (
          <div className="rounded-2xl text-center" style={{ background: t.card, padding: 24 }}>
            <div style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>{loadError}</div>
            <button type="button" onClick={() => load(true)} className="rounded-full" style={{ marginTop: 12, background: t.accent, color: "#07130B", padding: "9px 16px", fontSize: 13, fontWeight: 800 }}>Try again</button>
          </div>
        )}
        {data && competitions.length === 0 && (
          <div className="rounded-2xl text-center" style={{ background: t.card, padding: "36px 24px" }}>
            <Trophy size={34} color={t.dim} style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: 15, fontWeight: 800 }}>No leagues available</div>
            <div style={{ color: t.dim, fontSize: 13, marginTop: 5 }}>Competitions will appear here when available.</div>
          </div>
        )}
        {data && competitions.length > 0 && visibleCompetitions.length === 0 && <div style={{ minHeight: 110 }} />}
        {visibleCompetitions.map((competition) => (
          <Link
            href={`/league/${competition.id}`}
            key={competition.id}
            className="flex items-center rounded-2xl active:opacity-70"
            style={{ minHeight: 66, marginBottom: 9, padding: "10px 15px", background: t.card, border: `1px solid ${t.divider}` }}
          >
            <span className="inline-flex items-center justify-center shrink-0 overflow-hidden" style={{ width: 42, height: 42, background: "transparent" }}>
              {competition.logoUrl
                ? <img src={competition.logoUrl} alt="" style={{ width: 38, height: 38, objectFit: "contain" }} />
                : <Trophy size={28} color={competition.themeColor || t.accent} />}
            </span>
            <span className="min-w-0" style={{ flex: 1, paddingLeft: 15 }}>
              <span className="block truncate" style={{ color: t.text, fontSize: 14 }}>{competition.name}</span>
            </span>
            {competition.liveCount > 0 && (
              <span className="rounded-full" style={{ color: "#07130B", background: t.accent, padding: "5px 8px", fontSize: 9.5, fontWeight: 900, marginRight: 5 }}>LIVE</span>
            )}
          </Link>
        ))}
      </main>

      <BottomNav t={t} active="Leagues" />
    </div>
  );
}

function LeagueListShell({ t }) {
  return <div aria-hidden="true">
    {[0, 1, 2].map((item) => (
      <div key={item} className="flex items-center rounded-2xl" style={{ minHeight: 66, marginBottom: 9, padding: "10px 15px", background: t.card }}>
        <span className="rounded-full" style={{ width: 42, height: 42, background: t.chip }} />
        <span style={{ flex: 1, paddingLeft: 12 }}>
          <span className="block rounded-md" style={{ width: 170, height: 14, background: t.chip }} />
        </span>
      </div>
    ))}
  </div>;
}
