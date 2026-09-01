"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Menu, ChevronUp, ChevronDown } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { getHome, getMatch } from "@/lib/db";
import { cachePublicMatch } from "@/lib/matchCache";
import { supabase } from "@/lib/supabase";
import { Crest, BottomNav, StatusChip } from "@/components/ui";
import MatchNotificationButton from "@/components/MatchNotificationButton";
import MatchDateCalendar from "@/components/MatchDateCalendar";

const warmedMatches = new Set();
const selectedDateStorageKey = "touchline-selected-match-date";

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

function dateLabel(date, today) {
  const difference = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (difference === -1) return "Yesterday";
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const month = date.toLocaleDateString(undefined, { month: "short" });
  return `${weekday} ${month} ${date.getDate()}`;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDateKey(date) === value;
}

function MatchRow({ m, teams, t, now }) {
  const h = teams[m.home] || { name: "TBD", short: "?", color: "#555" };
  const a = teams[m.away] || { name: "TBD", short: "?", color: "#555" };
  const homeName = h.displayName || h.name;
  const awayName = a.displayName || a.name;
  const showScore = ["live", "ht", "ft", "et_live", "et_ht"].includes(m.status);
  const showStatus = showScore || ["postponed", "cancelled"].includes(m.status);
  const rememberMatch = () => cachePublicMatch(m, teams);
  const warmMatch = () => {
    rememberMatch();
    if (warmedMatches.has(m.id)) return;
    warmedMatches.add(m.id);
    getMatch(m.id)
      .then((next) => {
        if (next?.match) cachePublicMatch(next.match, next.teams, next.detail);
      })
      .catch(() => warmedMatches.delete(m.id));
  };
  const teamNameStyle = {
    color: t.text,
    fontSize: "clamp(12.5px, 3.5vw, 14px)",
    fontWeight: 500,
    lineHeight: 1.16,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
    overflowWrap: "break-word",
    wordBreak: "normal",
    hyphens: "none",
  };
  return (
    <div className="relative" style={{ borderTop: `1px solid ${t.divider}` }}>
      <Link
        href={`/match/${m.id}`}
        onPointerEnter={warmMatch}
        onPointerDown={warmMatch}
        onFocus={warmMatch}
        onTouchStart={warmMatch}
        onClick={warmMatch}
        className="relative grid items-center gap-x-2 px-3 py-2 active:opacity-70"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) 54px minmax(0, 1fr)",
          minHeight: 80,
          textDecoration: "none",
        }}
      >
      {showStatus && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex justify-center">
          <StatusChip m={m} t={t} now={now} />
        </div>
      )}
      <div className="flex items-center justify-end gap-1.5 min-w-0" style={{ paddingLeft: showStatus ? 42 : 0 }}>
        <span className="min-w-0 text-right" style={teamNameStyle}>{homeName}</span>
        <Crest short={h.short} color={h.color} logo={h.logoUrl} size={24} ring={t.divider} />
      </div>
      <div className="shrink-0 text-center min-w-0">
        {showScore
          ? <span style={{ color: t.text, fontSize: 15, fontWeight: 750, whiteSpace: "nowrap" }}>{m.hs} - {m.as}</span>
          : <span style={{ color: t.dim, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", textDecoration: ["postponed", "cancelled"].includes(m.status) ? "line-through" : "none" }}>{m.time || "TBD"}</span>}
      </div>
      <div className="flex items-center justify-start gap-1.5 min-w-0" style={{ paddingRight: m.status === "scheduled" ? 14 : 0 }}>
        <Crest short={a.short} color={a.color} logo={a.logoUrl} size={24} ring={t.divider} />
        <span className="min-w-0 text-left" style={teamNameStyle}>{awayName}</span>
      </div>
      </Link>
      {m.status === "scheduled" && (
        <div className="absolute right-1 bottom-1 z-20">
          <MatchNotificationButton matchId={m.id} status={m.status} color={t.dim} size={13} compact />
        </div>
      )}
    </div>
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [data, setData] = useState(null);
  const [now, setNow] = useState(0);
  const dateStripRef = useRef(null);
  const todayKey = now ? localDateKey(new Date(now)) : "";
  const [selectedDateOverride, setSelectedDateOverride] = useState(null);
  const selectedDate = selectedDateOverride || todayKey;
  const dateWindow = useMemo(() => {
    if (!todayKey || !selectedDate) return [];
    const today = new Date(`${todayKey}T12:00:00`);
    const centreDate = new Date(`${selectedDate}T12:00:00`);
    return Array.from({ length: 13 }, (_, index) => {
      const offset = index - 6;
      const date = addLocalDays(centreDate, offset);
      return { key: localDateKey(date), label: dateLabel(date, today) };
    });
  }, [selectedDate, todayKey]);

  useEffect(() => {
    let alive = true;
    let refreshTimer;
    const load = (force = false) => getHome({ force }).then((next) => { if (alive) setData(next); }).catch(() => {});
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => load(true), 140);
    };
    load();
    const firstTick = window.setTimeout(() => setNow(Date.now()), 0);
    const ticker = window.setInterval(() => setNow(Date.now()), 15000);
    let channel;
    if (supabase) {
      channel = supabase.channel("touchline-home")
        .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, scheduleRefresh)
        .subscribe();
    }
    return () => {
      alive = false;
      window.clearTimeout(refreshTimer);
      window.clearTimeout(firstTick);
      window.clearInterval(ticker);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!todayKey) return;

    try {
      const savedDate = window.localStorage.getItem(selectedDateStorageKey);
      if (isValidDateKey(savedDate)) {
        setSelectedDateOverride(savedDate);
      } else if (savedDate) {
        window.localStorage.removeItem(selectedDateStorageKey);
      }
    } catch {
      // Date selection still works when browser storage is unavailable.
    }
  }, [todayKey]);

  useEffect(() => {
    if (!selectedDate) return undefined;
    const centreSelectedDate = window.setTimeout(() => {
      const selectedButton = dateStripRef.current?.querySelector(`[data-date="${selectedDate}"]`);
      selectedButton?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
    }, 0);
    return () => window.clearTimeout(centreSelectedDate);
  }, [selectedDate]);

  const selectDate = (dateKey) => {
    const returningToToday = dateKey === todayKey;
    setSelectedDateOverride(returningToToday ? null : dateKey);
    setLiveOnly(false);

    try {
      if (returningToToday) {
        window.localStorage.removeItem(selectedDateStorageKey);
      } else {
        window.localStorage.setItem(selectedDateStorageKey, dateKey);
      }
    } catch {
      // Keep the in-memory selection when browser storage is unavailable.
    }
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
        <span style={{ color: t.text, fontSize: 19, letterSpacing: -0.35 }}>
          <span style={{ color: t.accent }}>⚡</span>Touchline
        </span>
        <div className="relative flex items-center gap-2">
          <div className="flex items-center rounded-full overflow-hidden" style={{ background: t.pill, border: `1px solid ${t.pillBorder}`, height: 34 }}>
            <button onClick={() => setLiveOnly((v) => !v)} className="flex items-center gap-1.5 px-3 h-full">
              <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: liveOnly ? t.red : t.dim }} />
              <span style={{ color: liveOnly ? t.text : t.dim, fontSize: 13, fontWeight: 700 }}>Live</span>
            </button>
            <div style={{ width: 1, height: 20, background: t.pillBorder }} />
            <button type="button" onClick={() => setCalendarOpen(true)} aria-label="Open match calendar" className="relative flex items-center justify-center h-full" style={{ width: 42, color: t.text }}>
              <span className="relative inline-flex items-center justify-center rounded" style={{ width: 20, height: 19, border: `2px solid ${t.text}`, fontSize: 10, fontWeight: 800, lineHeight: 1 }}>
                <span style={{ position: "absolute", left: -2, right: -2, top: 3, height: 2, background: t.text }} />
                <span style={{ paddingTop: 4 }}>{selectedDate ? Number(selectedDate.slice(8, 10)) : ""}</span>
              </span>
            </button>
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
            type="button"
            key={day.key}
            data-date={day.key}
            onClick={(event) => {
              selectDate(day.key);
              event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
            }}
            aria-pressed={active}
            className="shrink-0"
            style={{ color: active ? t.text : t.faint, fontSize: active ? 16 : 15, fontWeight: active ? 800 : 600, whiteSpace: "nowrap", scrollSnapAlign: "center", cursor: "pointer" }}
          >
            {day.label}
          </button>;
        })}
      </div>

      {!data && <HomeContentShell t={t} />}
      {data && comps.map((c) => <Group key={c.id} c={c} teams={data.teams} t={t} now={now} />)}
      {data && comps.length === 0 && (
        <div className="text-center py-16 px-6" style={{ color: t.dim, fontSize: 14 }}>
          {liveOnly ? `No live matches on ${selectedLabel}.` : `No matches scheduled for ${selectedLabel}.`}
        </div>
      )}

      {selectedDate && selectedDate !== todayKey && (
        <button
          type="button"
          onClick={() => selectDate(todayKey)}
          className="fixed left-1/2 -translate-x-1/2 rounded-full"
          style={{ bottom: "max(76px, calc(env(safe-area-inset-bottom) + 70px))", zIndex: 45, minWidth: 118, height: 44, padding: "0 24px", background: t.accent, color: "#07130B", boxShadow: "0 8px 24px rgba(0,0,0,0.38)", fontSize: 15, fontWeight: 850 }}
        >
          Today
        </button>
      )}

      <BottomNav t={t} active="Matches" />
      <MatchDateCalendar open={calendarOpen} selectedDate={selectedDate} t={t} onSelect={selectDate} onClose={() => setCalendarOpen(false)} />
    </div>
  );
}

function HomeContentShell({ t }) {
  return <div aria-hidden="true">
    {[0, 1].map((group) => (
      <div key={group} className="mx-2 my-2 rounded-2xl overflow-hidden" style={{ background: t.card }}>
        <div style={{ height: 46, background: t.groupHead, borderBottom: `1px solid ${t.divider}` }} />
        {[0, 1, 2].map((row) => (
          <div key={row} className="grid items-center px-5" style={{ height: 72, gridTemplateColumns: "1fr 54px 1fr", borderTop: row ? `1px solid ${t.divider}` : "none" }}>
            <div className="rounded-md justify-self-end" style={{ width: 96, height: 13, background: t.chip }} />
            <div className="rounded-md justify-self-center" style={{ width: 34, height: 13, background: t.chip }} />
            <div className="rounded-md" style={{ width: 96, height: 13, background: t.chip }} />
          </div>
        ))}
      </div>
    ))}
  </div>;
}
