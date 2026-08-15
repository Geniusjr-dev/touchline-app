"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, ChevronUp, ChevronDown } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { getHome } from "@/lib/db";
import { Crest, BottomNav, StatusChip } from "@/components/ui";

const DAYS = ["Thu 25", "Fri 26", "Today", "Tomorrow", "Sun 29", "Mon 30"];
const ACTIVE_DAY = 2;

function MatchRow({ m, teams, t }) {
  const h = teams[m.home] || { name: "TBD", short: "?", color: "#555" };
  const a = teams[m.away] || { name: "TBD", short: "?", color: "#555" };
  const showScore = m.status !== "scheduled";
  return (
    <Link href={`/match/${m.id}`} className="flex items-center px-3 active:opacity-70"
      style={{ minHeight: 60, borderTop: `1px solid ${t.divider}`, textDecoration: "none" }}>
      <div style={{ width: 46 }} className="flex justify-center">{showScore ? <StatusChip m={m} t={t} /> : <span />}</div>
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
        <span className="truncate text-right" style={{ color: t.text, fontSize: 14.5, fontWeight: 500 }}>{h.name}</span>
        <Crest short={h.short} color={h.color} size={24} ring={t.divider} />
      </div>
      <div className="px-3 shrink-0 text-center" style={{ minWidth: 58 }}>
        {showScore
          ? <span className="font-mono" style={{ color: t.text, fontSize: 15, fontWeight: 700 }}>{m.hs} - {m.as}</span>
          : <span className="font-mono" style={{ color: t.dim, fontSize: 14, fontWeight: 600 }}>{m.time || "\u2014"}</span>}
      </div>
      <div className="flex-1 flex items-center justify-start gap-2 min-w-0">
        <Crest short={a.short} color={a.color} size={24} ring={t.divider} />
        <span className="truncate" style={{ color: t.text, fontSize: 14.5, fontWeight: 500 }}>{a.name}</span>
      </div>
    </Link>
  );
}

function Group({ c, teams, t }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mx-2 my-2 rounded-2xl overflow-hidden" style={{ background: t.card }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-4 py-3" style={{ background: t.groupHead }}>
        <span style={{ fontSize: 16 }}>{c.flag}</span>
        <span style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>{c.name}</span>
        {c.sub && <span style={{ color: t.dim, fontSize: 13 }}>\u00b7 {c.sub}</span>}
        <span className="ml-auto">{open ? <ChevronUp size={18} color={t.dim} /> : <ChevronDown size={18} color={t.dim} />}</span>
      </button>
      {open && c.matches.map((m) => <MatchRow key={m.id} m={m} teams={teams} t={t} />)}
    </div>
  );
}

export default function MatchesHome() {
  const { t, mode, toggle } = useTheme();
  const [liveOnly, setLiveOnly] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => { getHome().then(setData); }, []);

  const comps = !data ? [] : (liveOnly
    ? data.competitions.map((c) => ({ ...c, matches: c.matches.filter((m) => m.status === "live" || m.status === "ht") })).filter((c) => c.matches.length)
    : data.competitions);

  return (
    <div style={{ background: t.bg, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 74 }}>
      <div className="flex items-center justify-between px-4 sticky top-0 z-30" style={{ background: t.bg, height: 56 }}>
        <span style={{ color: t.text, fontSize: 21, fontWeight: 800, letterSpacing: -0.5 }}>
          <span style={{ color: t.accent }}>\u26a1</span>Touchline
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full overflow-hidden" style={{ background: t.pill, border: `1px solid ${t.pillBorder}`, height: 34 }}>
            <button onClick={() => setLiveOnly((v) => !v)} className="flex items-center gap-1.5 px-3 h-full">
              <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: liveOnly ? t.red : t.dim }} />
              <span style={{ color: liveOnly ? t.text : t.dim, fontSize: 13, fontWeight: 700 }}>Live</span>
            </button>
            <div style={{ width: 1, height: 20, background: t.pillBorder }} />
            <button onClick={toggle} className="flex items-center justify-center px-3 h-full" style={{ color: t.text }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{mode === "dark" ? "\u263E" : "\u2600"}</span>
            </button>
          </div>
          <Link href="/admin" className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: t.pill, border: `1px solid ${t.pillBorder}` }}>
            <Menu size={18} color={t.text} />
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-6 px-4 overflow-x-auto no-scrollbar sticky z-20" style={{ background: t.bg, height: 46, top: 56 }}>
        {DAYS.map((d, i) => (
          <button key={d} className="shrink-0" style={{ color: i === ACTIVE_DAY ? t.text : t.faint, fontSize: i === ACTIVE_DAY ? 16 : 15, fontWeight: i === ACTIVE_DAY ? 800 : 600, whiteSpace: "nowrap" }}>{d}</button>
        ))}
      </div>

      {!data && <div className="text-center py-16" style={{ color: t.dim, fontSize: 14 }}>Loading\u2026</div>}
      {data && comps.map((c) => <Group key={c.id} c={c} teams={data.teams} t={t} />)}
      {data && comps.length === 0 && (
        <div className="text-center py-16 px-6" style={{ color: t.dim, fontSize: 14 }}>
          No matches yet. Open the menu to add teams and matches in the admin area.
        </div>
      )}

      <BottomNav t={t} active="Matches" />
    </div>
  );
}
