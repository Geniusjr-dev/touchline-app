"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, MoreHorizontal, MapPin, Calendar, Disc3, ArrowUp, ArrowDown } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { getMatch } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { Crest, BottomNav } from "@/components/ui";

const TABS_PRE = ["Preview", "H2H"];
const TABS_LIVE = ["Facts", "Commentary", "Lineup", "Stats", "Table", "H2H"];

function goalsBySide(events, side) {
  return (events || []).filter((e) => e.type === "goal" && e.side === side).length;
}

export default function MatchCentre({ id }) {
  const { t } = useTheme();
  const router = useRouter();
  const [state, setState] = useState(null);
  const [tab, setTab] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => getMatch(id).then((r) => { if (alive) setState(r); });
    load();
    let ch;
    if (supabase) {
      ch = supabase.channel("m-" + id)
        .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `match_id=eq.${id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${id}` }, load)
        .subscribe();
    }
    return () => { alive = false; if (ch) supabase.removeChannel(ch); };
  }, [id]);

  const loadingStyle = { background: t.bg, minHeight: "100vh", color: t.dim, display: "flex", alignItems: "center", justifyContent: "center" };
  if (!state) return <div style={loadingStyle}>Loading…</div>;
  const { match: m, teams, detail: d } = state;
  if (!m) return <div style={loadingStyle}>Match not found.</div>;

  const h = teams[m.home] || { name: "TBD", short: "?", color: "#555" };
  const a = teams[m.away] || { name: "TBD", short: "?", color: "#555" };
  // Kit colours worn in THIS match — drive the stats bars. Fall back to team identity colour.
  const homeKit = m.homeKit || h.color;
  const awayKit = m.awayKit || a.color;
  const live = m.status === "live" || m.status === "ht";
  const ended = m.status === "ft";
  const started = live || ended;
  const tabs = started ? TABS_LIVE : TABS_PRE;
  const activeTab = tab || (started ? "Facts" : "Preview");
  const hs = m.hs != null ? m.hs : 0, as = m.as != null ? m.as : 0;

  return (
    <div style={{ background: t.bg, maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 74 }}>
      {/* header */}
      <div className="sticky top-0 z-30" style={{ background: t.bg }}>
        <div className="flex items-center justify-between px-3" style={{ height: 56 }}>
          <button onClick={() => router.push("/")} className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: t.pill }}>
            <ChevronLeft size={22} color={t.text} />
          </button>
          <div className="flex items-center gap-3">
            <Crest short={h.short} color={h.color} ring={t.divider} />
            {m.status === "scheduled"
              ? <span style={{ color: t.text, fontSize: 18, fontWeight: 700 }}>{m.time}</span>
              : <span className="flex items-center gap-2" style={{ color: t.text, fontSize: 20, fontWeight: 700 }}>{hs} <span style={{ color: t.dim }}>-</span> {as}</span>}
            <Crest short={a.short} color={a.color} ring={t.divider} />
          </div>
          <button className="flex items-center justify-center rounded-full" style={{ width: 38, height: 38, background: t.pill }}>
            <MoreHorizontal size={20} color={t.text} />
          </button>
        </div>
        {started && (
          <div className="text-center pb-1">
            {live
              ? <span className="inline-flex items-center gap-1.5" style={{ color: t.red, fontSize: 12, fontWeight: 700 }}>
                  <span className="inline-block rounded-full animate-pulse" style={{ width: 6, height: 6, background: t.red }} />
                  {m.status === "ht" ? "Half time" : `${m.min}′`}
                </span>
              : <span style={{ color: t.dim, fontSize: 12, fontWeight: 700 }}>Full time</span>}
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
      {activeTab === "Commentary" && <Commentary t={t} d={d} h={h} a={a} />}
      {activeTab === "Stats" && <StatsTab t={t} h={h} a={a} homeKit={homeKit} awayKit={awayKit} />}
      {activeTab === "Lineup" && <Empty t={t} title="Line-ups" note="Managers submit line-ups before kick-off. They will appear here once confirmed." />}
      {activeTab === "Table" && <TableTab t={t} m={m} />}
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

// ---------- Facts / Preview ----------
function FactsPreview({ t, m, h, a, d, started }) {
  return (
    <div>
      {d && (
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
        d ? <Timeline t={t} events={d.events} /> : <Empty t={t} title="Match started" note="Events will appear here as the scorer records them." />
      ) : (
        <Empty t={t} title="Not started yet" note="Line-ups and match events will appear here once the match kicks off." />
      )}
    </div>
  );
}

function Timeline({ t, events }) {
  if (!events || !events.length) return <Empty t={t} title="No events yet" note="The timeline fills as the match unfolds." />;
  const sorted = [...events].sort((x, y) => x.m - y.m);
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
  const icon = e.type === "goal" ? <span style={{ fontSize: 15 }}>⚽</span>
    : e.type === "yellow" ? <span className="rounded-sm" style={{ width: 11, height: 15, background: t.yellow, display: "inline-block" }} />
    : e.type === "red" ? <span className="rounded-sm" style={{ width: 11, height: 15, background: t.red, display: "inline-block" }} />
    : <span className="inline-flex flex-col items-center" style={{ gap: 2 }}>
        <span className="inline-flex items-center justify-center rounded-full" style={{ width: 15, height: 15, background: t.green }}><ArrowUp size={10} color="#fff" strokeWidth={3} /></span>
        <span className="inline-flex items-center justify-center rounded-full" style={{ width: 15, height: 15, background: t.red }}><ArrowDown size={10} color="#fff" strokeWidth={3} /></span>
      </span>;
  const body = (align) => {
    if (e.type === "sub") return <div style={{ textAlign: align }}>
      <div style={{ color: t.green, fontSize: 14, fontWeight: 600 }}>{e.on}</div>
      <div style={{ color: t.red, fontSize: 14, fontWeight: 600 }}>{e.off}</div>
    </div>;
    if (e.type === "goal") return <div style={{ textAlign: align }}>
      <div style={{ fontSize: 14 }}><span style={{ color: t.text, fontWeight: 700 }}>{e.player} </span><RunScore score={e.score} scored={e.scored} t={t} /></div>
      {e.assist && <div style={{ color: t.dim, fontSize: 12 }}>Assist by {e.assist}</div>}
    </div>;
    return <div style={{ color: t.text, fontSize: 14, fontWeight: 600, textAlign: align }}>{e.player}</div>;
  };
  const minute = <div className="flex flex-col items-center shrink-0" style={{ minWidth: 34 }}><span style={{ color: t.text, fontSize: 13, fontWeight: 700 }}>{e.min}</span></div>;
  if (e.side === "home") return <div className="flex items-start gap-2 py-2.5" style={{ paddingRight: 12 }}>{minute}<span className="shrink-0 mt-0.5">{icon}</span><div className="flex-1">{body("left")}</div></div>;
  return <div className="flex items-start gap-2 py-2.5 justify-end" style={{ paddingLeft: 12 }}><div className="flex-1">{body("right")}</div><span className="shrink-0 mt-0.5">{icon}</span>{minute}</div>;
}

// ---------- Commentary (from events) ----------
function Commentary({ t, d, h, a }) {
  if (!d) return <Empty t={t} title="Commentary" note="Commentary is generated from match events as they are recorded." />;
  const lines = [...d.events].sort((x, y) => y.m - x.m).map((e) => {
    if (e.type === "half") return { m: e.min || "HT", text: `Half time. ${h.name} ${e.score} ${a.name}.` };
    if (e.type === "goal") return { m: e.min, text: `GOAL! ${e.player} scores${e.assist ? `, set up by ${e.assist}` : ""}. It's ${e.score}.` };
    if (e.type === "yellow") return { m: e.min, text: `Yellow card shown to ${e.player}.` };
    if (e.type === "red") return { m: e.min, text: `Red card! ${e.player} is sent off.` };
    if (e.type === "sub") return { m: e.min, text: `Substitution: ${e.on} replaces ${e.off}.` };
    return { m: e.min, text: "" };
  });
  return <Card t={t} style={{ paddingTop: 6, paddingBottom: 8 }}>
    {lines.map((l, i) => (
      <div key={i} className="flex gap-3 px-4 py-3" style={{ borderTop: i ? `1px solid ${t.divider}` : "none" }}>
        <span className="font-mono shrink-0" style={{ color: t.dim, fontSize: 13, fontWeight: 700, width: 34 }}>{l.m}</span>
        <span style={{ color: t.text, fontSize: 14 }}>{l.text}</span>
      </div>
    ))}
  </Card>;
}

// ---------- Stats ----------
function StatsTab({ t, h, a, homeKit, awayKit }) {
  const rows = [
    { name: "Total shots", hv: "9", av: "6", hn: 9, an: 6 },
    { name: "Shots on target", hv: "5", av: "2", hn: 5, an: 2 },
    { name: "Corners", hv: "6", av: "3", hn: 6, an: 3 },
    { name: "Fouls", hv: "8", av: "11", hn: 8, an: 11 },
    { name: "Offsides", hv: "2", av: "3", hn: 2, an: 3 },
    { name: "Yellow cards", hv: "0", av: "1", hn: 0, an: 1 },
  ];
  return (
    <Card t={t} style={{ paddingBottom: 6 }}>
      <div className="text-center pt-4 pb-1" style={{ color: t.text, fontSize: 17, fontWeight: 800 }}>Top stats</div>
      <div className="px-4 pt-3 pb-4">
        <div className="text-center mb-2" style={{ color: t.dim, fontSize: 13 }}>Ball possession</div>
        <div className="flex items-center rounded-full overflow-hidden" style={{ height: 28 }}>
          <div className="flex items-center pl-3" style={{ width: "58%", background: homeKit, height: "100%" }}><span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>58%</span></div>
          <div className="flex items-center justify-end pr-3" style={{ width: "42%", background: awayKit, height: "100%" }}><span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>42%</span></div>
        </div>
      </div>
      {rows.map((s, i) => {
        const hl = s.hn > s.an, al = s.an > s.hn;
        return <div key={i}>
          <div className="flex items-center py-2.5 px-4">
            <div style={{ width: 90 }} className="flex justify-start">{hl ? <span className="rounded-full px-2.5 py-1" style={{ background: homeKit, color: "#fff", fontSize: 14, fontWeight: 700 }}>{s.hv}</span> : <span style={{ color: t.text, fontSize: 14, padding: "0 4px" }}>{s.hv}</span>}</div>
            <div className="flex-1 text-center" style={{ color: t.dim, fontSize: 13 }}>{s.name}</div>
            <div style={{ width: 90 }} className="flex justify-end">{al ? <span className="rounded-full px-2.5 py-1" style={{ background: awayKit, color: "#fff", fontSize: 14, fontWeight: 700 }}>{s.av}</span> : <span style={{ color: t.text, fontSize: 14, padding: "0 4px" }}>{s.av}</span>}</div>
          </div>
          {i < rows.length - 1 && <div style={{ height: 1, background: t.divider, marginLeft: 16, marginRight: 16 }} />}
        </div>;
      })}
    </Card>
  );
}

// ---------- Table ----------
const GROUP = [
  { s: "BUY", name: "Buya Stars", color: "#18A558", pl: 7, w: 5, d: 1, l: 1, gf: 14, ga: 6, pts: 16, form: ["W", "W", "D", "W", "L"] },
  { s: "KAB", name: "Kabonwule FC", color: "#2563EB", pl: 7, w: 4, d: 2, l: 1, gf: 12, ga: 7, pts: 14, form: ["W", "D", "W", "W", "L"] },
  { s: "BBU", name: "Banda-Buya United", color: "#DC2626", pl: 7, w: 4, d: 1, l: 2, gf: 11, ga: 8, pts: 13, form: ["L", "W", "W", "D", "W"] },
  { s: "KAT", name: "Katiejeli Kotoko", color: "#7C3AED", pl: 7, w: 3, d: 2, l: 2, gf: 10, ga: 9, pts: 11, form: ["D", "L", "W", "W", "D"] },
  { s: "KPW", name: "Kpandai Warriors", color: "#EA580C", pl: 7, w: 2, d: 3, l: 2, gf: 9, ga: 9, pts: 9, form: ["D", "W", "D", "L", "L"] },
  { s: "NKA", name: "Nkanchina United", color: "#0891B2", pl: 7, w: 2, d: 2, l: 3, gf: 8, ga: 11, pts: 8, form: ["L", "D", "L", "W", "D"] },
  { s: "KIT", name: "Kitare FC", color: "#DB2777", pl: 7, w: 1, d: 2, l: 4, gf: 6, ga: 12, pts: 5, form: ["L", "L", "D", "L", "W"] },
  { s: "BLA", name: "Bladjai Stars", color: "#CA8A04", pl: 7, w: 0, d: 3, l: 4, gf: 5, ga: 13, pts: 3, form: ["L", "D", "L", "L", "D"] },
];
function TableTab({ t, m }) {
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
        {GROUP.map((tm, i) => {
          const gd = tm.gf - tm.ga; const on = hi.includes(tm.s); const q = i < 4;
          return <div key={tm.s} className="flex items-center px-3 py-2.5" style={{ background: on ? t.hl : "transparent", borderBottom: `1px solid ${t.divider}` }}>
            <div className="flex items-center" style={{ width: 22 }}>
              <span style={{ width: 3, height: 22, borderRadius: 2, background: q ? t.accent : "transparent", marginRight: 5 }} />
              <span style={{ color: t.dim, fontSize: 13, fontWeight: 600 }}>{i + 1}</span>
            </div>
            <div className="flex-1 flex items-center gap-2 min-w-0 pl-1">
              <Crest short={tm.s} color={tm.color} size={22} ring={t.divider} />
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
function H2H({ t, h, a }) {
  return <Card t={t} style={{ padding: "40px 16px" }}>
    <div className="text-center">
      <div style={{ color: t.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>First meeting</div>
      <div style={{ color: t.dim, fontSize: 13 }}>{h.name} and {a.name} have not met before in the tournament. Head-to-head records build as they play.</div>
    </div>
  </Card>;
}
