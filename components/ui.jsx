"use client";
import Link from "next/link";
import { Search, Newspaper, Trophy, Star } from "lucide-react";
import { liveMinute } from "@/lib/db";
import { readableTextColor } from "@/lib/teamColors";

export function Crest({ short, color, logo, size = 26, ring }) {
  return (
    <span className="inline-flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: logo ? 0 : "50%",
        background: logo ? "transparent" : color,
        color: readableTextColor(color),
        fontSize: size * 0.36,
        fontWeight: 800,
        boxShadow: !logo ? `${ring ? `0 0 0 1.5px ${ring}, ` : ""}inset 0 0 0 1px rgba(127,127,127,.28)` : "none",
        overflow: "hidden",
      }}>
      {logo ? (
        // Supabase public media URLs are administrator-controlled team assets.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", background: "transparent", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.25))" }} />
      ) : short}
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
    { label: "Matches", href: "/", icon: (color) => <PitchIcon color={color} /> },
    { label: "News", href: null, icon: (color) => <Newspaper size={19} color={color} /> },
    { label: "Leagues", href: "/leagues", icon: (color) => <Trophy size={19} color={color} /> },
    { label: "Following", href: null, icon: (color) => <Star size={19} color={color} /> },
  ];
  return (
    <div
      className="fixed left-0 right-0 flex items-center gap-2 px-3 z-40 pointer-events-none"
      style={{ maxWidth: 480, margin: "0 auto", bottom: "max(7px, env(safe-area-inset-bottom))" }}
    >
      <div className="flex flex-1 items-center rounded-full overflow-hidden pointer-events-auto" style={{ height: 58, padding: 4, background: t.nav, border: `1px solid ${t.pillBorder}`, boxShadow: "0 6px 24px rgba(0,0,0,0.36)" }}>
        {items.map((item) => {
          const selected = active === item.label;
          const color = selected ? t.accent : t.navText;
          const contents = <>
            {item.icon(color)}
            <span style={{ fontSize: 10.5, color }}>{item.label}</span>
          </>;
          const styles = { background: selected ? t.pill : "transparent" };
          return item.href ? (
            <Link
              key={item.label}
              href={item.href}
              aria-current={selected ? "page" : undefined}
              className="flex-1 h-full flex flex-col items-center justify-center gap-1 rounded-full"
              style={styles}
            >
              {contents}
            </Link>
          ) : (
            <button
              key={item.label}
              type="button"
              aria-disabled="true"
              className="flex-1 h-full flex flex-col items-center justify-center gap-1 rounded-full"
              style={styles}
            >
              {contents}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-center rounded-full shrink-0 pointer-events-auto" style={{ width: 58, height: 58, background: t.nav, border: `1px solid ${t.pillBorder}`, boxShadow: "0 6px 24px rgba(0,0,0,0.36)" }}>
        <span className="flex items-center justify-center rounded-full" style={{ width: 48, height: 48, background: t.pill }}>
          <Search size={23} color={t.text} />
        </span>
      </div>
    </div>
  );
}

// status chip on the far left of a match row
export function StatusChip({ m, t, now }) {
  const base = {
    minWidth: 34,
    height: 22,
    padding: "0 7px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
  if (m.status === "live" || m.status === "et_live") return (
    <span className="inline-flex items-center justify-center" style={{ ...base, color: "#07130B", background: t.green, fontSize: 12 }}>
      {m.status === "et_live" ? "ET " : ""}{liveMinute(m, now)}
    </span>
  );
  if (m.status === "ht") return <span className="inline-flex items-center justify-center" style={{ ...base, color: t.yellow, background: t.chip }}>HT</span>;
  if (m.status === "et_ht") return <span className="inline-flex items-center justify-center" style={{ ...base, color: t.yellow, background: t.chip }}>ET HT</span>;
  if (m.status === "ft") return <span className="inline-flex items-center justify-center" style={{ ...base, color: t.dim, background: t.chip }}>FT</span>;
  if (m.status === "postponed") return <span className="inline-flex items-center justify-center" style={{ ...base, color: t.dim, background: t.chip }}>PP</span>;
  if (m.status === "cancelled") return <span className="inline-flex items-center justify-center" style={{ ...base, color: t.dim, background: t.chip }}>CANC</span>;
  return null;
}
