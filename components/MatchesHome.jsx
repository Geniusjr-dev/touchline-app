"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Menu, ChevronUp, ChevronDown } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { getHome } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { Crest, BottomNav, StatusChip } from "@/components/ui";

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalDays(date, amount) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + amount);
  return next;
}

function dateLabel(date, offset) {
  if (offset === -1) return "Yesterday";
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const month = date.toLocaleDateString(undefined, { month: "short" });
  return `${weekday} ${month} ${date.getDate()}`;
}

function MatchRow({ m, teams, t, now }) {
  const h = teams[m.home] || { name: "TBD", short: "?", color: "#555" };
  const a = teams[m.away] || { name: "TBD", short: "?", color: "#555" };
  const homeName = h.displayName || h.name;
  const awayName = a.displayName || a.name;
  const showScore = ["live", "ht", "ft", "et_live", "et_ht"].includes(m.status);
  const showStatus = showScore || ["postponed", "cancelled"].includes(m.status);
  const teamNameStyle = {
    color: t.text,
    fontSize: "clamp(11.5px, 3.25vw, 13.5px)",
    fontWeight: 500,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
  };
  return (
    <Link
      href={`/match/${m.id}`}
      className="grid items-center gap-x-1 px-2 py-2 active:opacity-70"
      style={{
        gridTemplateColumns: "36px minmax(0, 1fr) 50px minmax(0, 1fr) 12px",
        minHeight: 72,
        borderTop: `1px solid ${t.divider}`,
        textDecoration: "none",
      }}
    >
      <div className="flex items-center justify-center min-w-0">
        {showStatus ? <StatusChip m={m} t={t} now={now} /> : null}
      </div>
      <div className="flex items-center justify-end gap-1 min-w-0">
        <span className="min-w-0 text-right" title={h.fullName || h.name} style={teamNameStyle}>{homeName}</span>
        <Crest short={h.short} color={h.color} size={24} ring={t.divider} />
      </div>
      <div className="shrink-0 text-center min-w-0">
        {showScore
          ? <span style={{ color: t.text, fontSize: 15, fontWeight: 750, whiteSpace: "nowrap" }}>{m.hs} - {m.as}</span>
          : <span style={{ color: t.dim, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", textDecoration: ["postponed", "cancelled"].includes(m.status) ? "line-through" : "none" }}>{m.time || "—"}</span>}
      </div>
      <div className="flex items-center justify-start gap-1 min-w-0">
        <Crest short={a.short} color={a.color} size={24} ring={t.divider} />
        <span className="min-w-0 text-left" title={a.fullName || a.name} style={teamNameStyle}>{awayName}</span>
      </div>
      <span aria-hidden="true" />
    </Link>
  );
}

function Group({ c, teams, t, now }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mx-2 my-2 rounded-2xl overflow-hidden" style={{ background: t.card }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-4 py-3" style={{ background: t.groupHead }}>
        <span style={{ fontSize: 16 }}>{c.flag}</span>
        <span style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>{c.name}</span>
        {c.sub && <span style={{ color: t.dim, fontSize: 13 }}>· {c.sub}</span>}
        <span className="ml-auto">{open ? <ChevronUp size={18} color={t.dim} /> : <ChevronDown size={18} color={t.dim} />}</span>
      </button>
      {open && c.matches.map((m) => <MatchRow key={m.id} m={m} teams={teams} t={t} now={now} />)}
    </div>
  );
}

export default function MatchesHome() {
  const { t, mode, toggle } = useTheme();
  const [liveOnly, setLiveOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState(null);
  const [now, setNow] = useState(0);
  const dateStripRef = useRef(null);
  const todayButtonRef = useRef(null);
  const todayKey = now ? localDateKey(new Date(now)) : "";
  const [selectedDateOverride, setSelectedDateOverride] = useState(null);
  const selectedDate = selectedDateOverride || todayKey;
  const dateWindow = useMemo(() => {
    if (!todayKey) return [];
    const today = new Date(`${todayKey}T12:00:00`);
    return Array.from({ length: 13 }, (_, index) => {
      const offset = index - 6;
      const date = addLocalDays(today, offset);
      return { key: localDateKey(date), label: dateLabel(date, offset), offset };
    });
  }, [todayKey]);

  useEffect(() => {
    let alive = true;
    const load = () => getHome().then((next) => { if (alive) setData(next); }).catch(() => {});
    load();
    const firstTick = window.setTimeout(() => setNow(Date.now()), 0);
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    let channel;
    if (supabase) {
      channel = supabase.channel("touchline-home")
        .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, load)
        .subscribe();
    }
    return () => {
      alive = false;
      window.clearTimeout(firstTick);
      window.clearInterval(ticker);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!selectedDate) return undefined;
    const centreSelectedDate = window.setTimeout(() => {
      const selectedButton = dateStripRef.current?.querySelector(`[data-date="${selectedDate}"]`);
      selectedButton?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
    }, 0);
    return () => window.clearTimeout(centreSelectedDate);
  }, [selectedDate]);

  const selectDate = (dateKey) => {
    setSelectedDateOverride(dateKey === todayKey ? null : dateKey);
    setLiveOnly(false);
  };

  const comps = !data ? [] : data.competitions
    .map((competition) => ({
      ...competition,
      matches: competition.matches.filter((match) => {
        const onSelectedDate = (match.date || todayKey) === selectedDate;
        const passesLiveFilter = !liveOnly || ["live", "ht", "et_live", "et_ht"].includes(match.status);
        return onSelectedDate && passesLiveFilter;
      }),
    }))
    .filter((competition) => competition.matches.length);
  const selectedLabel = dateWindow.find((day) => day.key === selectedDate)?.label || selectedDate;

  return (
    <div style={{ background: t.bg, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 74 }}>
      <div className="flex items-center justify-between px-4 sticky top-0 z-30" style={{ background: t.bg, height: 56 }}>
        <span style={{ color: t.text, fontSize: 21, fontWeight: 800, letterSpacing: -0.5 }}>
          <span style={{ color: t.accent }}>⚡</span>Touchline
        </span>
        <div className="relative flex items-center gap-2">
          <div className="flex items-center rounded-full overflow-hidden" style={{ background: t.pill, border: `1px solid ${t.pillBorder}`, height: 34 }}>
            <button onClick={() => setLiveOnly((v) => !v)} className="flex items-center gap-1.5 px-3 h-full">
              <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: liveOnly ? t.red : t.dim }} />
              <span style={{ color: liveOnly ? t.text : t.dim, fontSize: 13, fontWeight: 700 }}>Live</span>
            </button>
            <div style={{ width: 1, height: 20, background: t.pillBorder }} />
            <label className="relative flex items-center justify-center h-full cursor-pointer" style={{ width: 42, color: t.text }}>
              <span className="relative inline-flex items-center justify-center rounded" style={{ width: 20, height: 19, border: `2px solid ${t.text}`, fontSize: 10, fontWeight: 800, lineHeight: 1 }}>
                <span style={{ position: "absolute", left: -2, right: -2, top: 3, height: 2, background: t.text }} />
                <span style={{ paddingTop: 4 }}>{selectedDate ? Number(selectedDate.slice(8, 10)) : ""}</span>
              </span>
              <input
                type="date"
                aria-label="Choose match date"
                value={selectedDate}
                min={dateWindow[0]?.key}
                max={dateWindow[dateWindow.length - 1]?.key}
                onChange={(event) => event.target.value && selectDate(event.target.value)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", fontSize: 16 }}
              />
            </label>
          </div>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center justify-center rounded-full"
            style={{ width: 34, height: 34, background: t.pill, border: `1px solid ${t.pillBorder}` }}
          >
            <Menu size={18} color={t.text} />
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

      <div
        ref={dateStripRef}
        className="flex items-center gap-6 px-4 overflow-x-auto no-scrollbar sticky z-20"
        style={{ background: t.bg, height: 46, top: 56, scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
        aria-label="Match dates"
      >
        {dateWindow.map((day) => {
          const active = day.key === selectedDate;
          return <button
            key={day.key}
            ref={day.offset === 0 ? todayButtonRef : null}
            data-date={day.key}
            onClick={(event) => {
              selectDate(day.key);
              event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
            }}
            aria-pressed={active}
            className="shrink-0"
            style={{ color: active ? t.text : t.faint, fontSize: active ? 16 : 15, fontWeight: active ? 800 : 600, whiteSpace: "nowrap", scrollSnapAlign: "center" }}
          >
            {day.label}
          </button>;
        })}
      </div>

      {!data && <div className="text-center py-16" style={{ color: t.dim, fontSize: 14 }}>Loading…</div>}
      {data && comps.map((c) => <Group key={c.id} c={c} teams={data.teams} t={t} now={now} />)}
      {data && comps.length === 0 && (
        <div className="text-center py-16 px-6" style={{ color: t.dim, fontSize: 14 }}>
          {liveOnly ? `No live matches on ${selectedLabel}.` : `No matches scheduled for ${selectedLabel}.`}
        </div>
      )}

      <BottomNav t={t} active="Matches" />
    </div>
  );
}
