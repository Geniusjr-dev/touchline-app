"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Menu, Trophy } from "lucide-react";
import { BottomNav } from "@/components/ui";
import { getLeaguesHome } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

export default function LeaguesHome() {
  const { t, mode, toggle } = useTheme();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

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

  const competitions = data?.competitions || [];
  return (
    <div style={{ background: t.bg, color: t.text, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 82 }}>
      <header className="sticky top-0 z-30" style={{ background: t.bg, borderBottom: `1px solid ${t.divider}` }}>
        <div className="flex items-center justify-between px-4" style={{ height: 56 }}>
          <Link href="/" style={{ color: t.text, fontSize: 21, fontWeight: 800, letterSpacing: -0.5 }}>
            <span style={{ color: t.accent }}>⚡</span>Touchline
          </Link>
          <div className="relative">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center justify-center rounded-full"
              style={{ width: 36, height: 36, background: t.pill, border: `1px solid ${t.pillBorder}` }}
            >
              <Menu size={19} color={t.text} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 overflow-hidden rounded-xl z-50" style={{ minWidth: 142, background: t.card, border: `1px solid ${t.divider}`, boxShadow: "0 10px 28px rgba(0,0,0,0.34)" }}>
                <Link href="/admin" className="block px-4 py-3" style={{ color: t.text, fontSize: 13, fontWeight: 700, borderBottom: `1px solid ${t.divider}` }}>Admin</Link>
                <button type="button" onClick={() => { toggle(); setMenuOpen(false); }} className="w-full text-left px-4 py-3" style={{ color: t.text, fontSize: 13, fontWeight: 700 }}>
                  {mode === "dark" ? "Light mode" : "Dark mode"}
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: "10px 16px 16px" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 850 }}>Leagues</h1>
          <p style={{ margin: "5px 0 0", color: t.dim, fontSize: 13 }}>Select a league to view its table and matches.</p>
        </div>
      </header>

      <main style={{ padding: "12px 8px" }}>
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
            <div style={{ color: t.dim, fontSize: 13, marginTop: 5 }}>Leagues created by an administrator will appear here.</div>
          </div>
        )}
        {competitions.map((competition) => (
          <Link
            href={`/league/${competition.id}`}
            key={competition.id}
            className="flex items-center rounded-2xl active:opacity-70"
            style={{ minHeight: 88, marginBottom: 9, padding: "13px 14px", background: t.card, border: `1px solid ${t.divider}` }}
          >
            <span className="inline-flex items-center justify-center rounded-2xl shrink-0" style={{ width: 52, height: 52, background: t.disc }}>
              <Trophy size={25} color={t.accent} />
            </span>
            <span className="min-w-0" style={{ flex: 1, padding: "0 12px" }}>
              <span className="block truncate" style={{ color: t.text, fontSize: 15, fontWeight: 800 }}>{competition.name}</span>
              {competition.sub && <span className="block truncate" style={{ color: t.dim, fontSize: 12.5, marginTop: 3 }}>{competition.sub}</span>}
              <span className="flex items-center gap-2" style={{ color: t.dim, fontSize: 11.5, marginTop: 6 }}>
                <span>{competition.teamCount} teams</span>
                <span>•</span>
                <span>{competition.completedCount}/{competition.matchCount} matches completed</span>
              </span>
            </span>
            {competition.liveCount > 0 && (
              <span className="rounded-full" style={{ color: "#07130B", background: t.accent, padding: "5px 8px", fontSize: 9.5, fontWeight: 900, marginRight: 5 }}>LIVE</span>
            )}
            <ChevronRight size={20} color={t.dim} />
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
      <div key={item} className="flex items-center rounded-2xl" style={{ minHeight: 88, marginBottom: 9, padding: "13px 14px", background: t.card }}>
        <span className="rounded-2xl" style={{ width: 52, height: 52, background: t.chip }} />
        <span style={{ flex: 1, paddingLeft: 12 }}>
          <span className="block rounded-md" style={{ width: 170, height: 14, background: t.chip }} />
          <span className="block rounded-md" style={{ width: 116, height: 10, background: t.chip, marginTop: 10 }} />
        </span>
      </div>
    ))}
  </div>;
}
