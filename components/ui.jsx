"use client";
import { liveMinute } from "@/lib/db";
import { Search, Newspaper, Trophy, Star } from "lucide-react";

export function Crest({ short, color, size = 26, ring }) {
  return (
    <span className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, background: color, color: "#fff", fontSize: size * 0.36, fontWeight: 800, boxShadow: ring ? `0 0 0 1.5px ${ring}` : "none" }}>
      {short}
    </span>
  );
}

export function PitchIcon({ color }) {
  return (
    <span className="inline-flex items-center justify-center rounded" style={{ width: 28, height: 19, border: `2px solid ${color}`, position: "relative" }}>
      <span style={{ width: 1.5, height: 19, background: color }} />
      <span style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", border: `1.5px solid ${color}` }} />
    </span>
  );
}

export function BottomNav({ t, active = "Matches" }) {
  const items = [
    ["Matches", <PitchIcon key="m" color={active === "Matches" ? t.accent : t.navText} />],
    ["News", <Newspaper key="n" size={19} color={t.navText} />],
    ["Leagues", <Trophy key="l" size={19} color={t.navText} />],
    ["Following", <Star key="f" size={19} color={t.navText} />],
  ];
  return (
    <div className="fixed left-0 right-0 bottom-0 flex items-center px-3 z-40"
      style={{ background: t.nav, height: 62, borderTop: `1px solid ${t.divider}`, maxWidth: 480, margin: "0 auto" }}>
      {items.map(([l, ic]) => (
        <button key={l} className="flex-1 flex flex-col items-center gap-1">
          {ic}<span style={{ fontSize: 11, fontWeight: active === l ? 700 : 500, color: active === l ? t.accent : t.navText }}>{l}</span>
        </button>
      ))}
      <div className="flex items-center justify-center" style={{ width: 54 }}>
        <span className="flex items-center justify-center rounded-full" style={{ width: 42, height: 42, background: t.pill, border: `1px solid ${t.pillBorder}` }}>
          <Search size={19} color={t.text} />
        </span>
      </div>
    </div>
  );
}

// status chip on the far left of a match row (FotMob style)
export function StatusChip({ m, t }) {
  if (m.status === "live" || m.status === "et_live") return (
    <span className="tnum" style={{ background: "#22C55E", color: "#05300f", fontSize: 12.5, fontWeight: 800, borderRadius: 999, padding: "3px 9px", lineHeight: 1.1, whiteSpace: "nowrap" }}>{liveMinute(m)}</span>
  );
  if (m.status === "ht" || m.status === "et_ht") return <span className="tnum" style={{ background: t.pill, color: t.yellow, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 8px" }}>HT</span>;
  if (m.status === "ft") return <span className="tnum" style={{ background: t.pill, color: t.dim, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 8px" }}>FT</span>;
  return null;
}
