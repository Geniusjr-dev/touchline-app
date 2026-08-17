"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Menu, ChevronUp, ChevronDown, Calendar } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { getHome } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { Crest, BottomNav, StatusChip } from "@/components/ui";

function dateKey(d) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function buildDays(todayKey) {
  const today = new Date(todayKey + "T00:00:00");
  const list = [];
  for (let i = -3; i <= 10; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    list.push(dateKey(d));
  }
  return list;
}
function dayLabel(key, todayKey) {
  const d = new Date(key + "T00:00:00"); const today = new Date(todayKey + "T00:00:00");
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function MatchRow({ m, teams, t }) {
  const h = teams[m.home] || { name: "TBD", short: "?", color: "#555" };
  const a = teams[m.away] || { name: "TBD", short: "?", color: "#555" };
  const started = m.status !== "scheduled";
  const nameStyle = { color: t.text, fontSize: 15, fontWeight: 500, minWidth: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.15, wordBreak: "break-word" };
  return (
    <Link href={`/match/${m.id}`} className="flex items-center active:opacity-70"
      style={{ minHeight: 64, borderTop: `1px solid ${t.divider}`, textDecoration: "none", paddingLeft: 8, paddingRight: 8 }}>
      <div style={{ width: 50, flexShrink: 0 }} className="flex justify-center">{started ? <StatusChip m={m} t={t} /> : null}</div>
      <div className="flex-1 flex items-center justify-end min-w-0" style={{ gap: 8 }}>
        <span className="text-right" style={nameStyle}>{h.name}</span>
        <span style={{ flexShrink: 0 }}><Crest short={h.short} color={h.color} size={26} ring={t.divider} /></span>
      </div>
      <div className="text-center" style={{ width: 64, flexShrink: 0 }}>
        {started
          ? <span className="tnum" style={{ color: t.text, fontSize: 16, fontWeight: 700 }}>{m.hs} - {m.as}</span>
          : <span className="tnum" style={{ color: t.dim, fontSize: 14, fontWeight: 600 }}>{m.time || "–"}</span>}
      </div>
      <div className="flex-1 flex items-center justify-start min-w-0" style={{ gap: 8 }}>
        <span style={{ flexShrink: 0 }}><Crest short={a.short} color={a.color} size={26} ring={t.divider} /></span>
        <span style={nameStyle}>{a.name}</span>
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
        {c.sub && <span style={{ color: t.dim, fontSize: 13 }}>· {c.sub}</span>}
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
  const [todayKey] = useState(() => dateKey(new Date()));
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const dateInputRef = useRef(null);
  const activeRef = useRef(null);
  const stripRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = () => getHome().then((r) => { if (alive) setData(r); });
    load();
    let ch;
    if (supabase) {
      ch = supabase.channel("home")
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, load)
        .subscribe();
    }
    return () => { alive = false; if (ch) supabase.removeChannel(ch); };
  }, []);
  useEffect(() => {
    if (activeRef.current) { try { activeRef.current.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); } catch (_) {} }
  }, [selected, data]);

  const days = buildDays(todayKey);

  // filter by selected day; matches with no date fall on Today
  const dayFiltered = !data ? [] : data.competitions
    .map((c) => ({ ...c, matches: c.matches.filter((m) => (m.date || todayKey) === selected) }))
    .filter((c) => c.matches.length);
  const comps = liveOnly
    ? dayFiltered.map((c) => ({ ...c, matches: c.matches.filter((m) => ["live", "ht", "et_live", "et_ht"].includes(m.status)) })).filter((c) => c.matches.length)
    : dayFiltered;

  return (
    <div style={{ background: t.bg, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 74 }}>
      <div className="flex items-center justify-between px-4 sticky top-0 z-30" style={{ background: t.bg, height: 56 }}>
        <span style={{ color: t.text, fontSize: 21, fontWeight: 800, letterSpacing: -0.5 }}>
          <span style={{ color: t.accent }}>⚡</span>Touchline
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full overflow-hidden" style={{ background: t.pill, border: `1px solid ${t.pillBorder}`, height: 34 }}>
            <button onClick={() => setLiveOnly((v) => !v)} className="flex items-center gap-1.5 px-3 h-full">
              <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: liveOnly ? t.red : t.dim }} />
              <span style={{ color: liveOnly ? t.text : t.dim, fontSize: 13, fontWeight: 700 }}>Live</span>
            </button>
            <div style={{ width: 1, height: 20, background: t.pillBorder }} />
            <button onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()} className="flex items-center justify-center px-3 h-full" style={{ color: t.text }} aria-label="Pick a date">
              <Calendar size={16} color={t.text} />
            </button>
          </div>
          <input ref={dateInputRef} type="date" value={selected} onChange={(e) => e.target.value && setSelected(e.target.value)}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} tabIndex={-1} />
          <button onClick={toggle} className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: t.pill, border: `1px solid ${t.pillBorder}`, color: t.text }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{mode === "dark" ? "☾" : "☀"}</span>
          </button>
          <Link href="/admin" className="flex items-center justify-center rounded-full" style={{ width: 34, height: 34, background: t.pill, border: `1px solid ${t.pillBorder}` }}>
            <Menu size={18} color={t.text} />
          </Link>
        </div>
      </div>

      <div ref={stripRef} className="flex items-center gap-6 overflow-x-auto no-scrollbar sticky z-20" style={{ background: t.bg, height: 46, top: 56, padding: "0 50%" }}>
        {days.map((key) => {
          const on = key === selected;
          return (
            <button key={key} ref={on ? activeRef : null} onClick={() => setSelected(key)} className="shrink-0"
              style={{ color: on ? t.text : t.faint, fontSize: on ? 16 : 15, fontWeight: on ? 800 : 600, whiteSpace: "nowrap" }}>
              {dayLabel(key, todayKey)}
            </button>
          );
        })}
      </div>

      {!data && <div className="text-center py-16" style={{ color: t.dim, fontSize: 14 }}>Loading…</div>}
      {data && comps.map((c) => <Group key={c.id} c={c} teams={data.teams} t={t} />)}
      {data && comps.length === 0 && (
        <div className="text-center py-16 px-6" style={{ color: t.dim, fontSize: 14 }}>
          No matches on {dayLabel(selected, todayKey)}.
        </div>
      )}

      <BottomNav t={t} active="Matches" />
    </div>
  );
}
