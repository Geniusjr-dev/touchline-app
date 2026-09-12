"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, Newspaper, Trophy, Star, Shield } from "lucide-react";
import { liveMinute } from "@/lib/db";

export function Crest({ logo, size = 26, ring, label = "" }) {
  const [failedLogo, setFailedLogo] = useState("");
  const showLogo = Boolean(logo && failedLogo !== logo);
  return (
    <span className="inline-flex items-center justify-center shrink-0" aria-label={!showLogo && label ? `${label} logo unavailable` : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: showLogo ? 0 : "50%",
        background: showLogo ? "transparent" : "#E1E3E6",
        color: "#858B94",
        boxShadow: !showLogo ? `${ring ? `0 0 0 1.5px ${ring}, ` : ""}inset 0 0 0 1px rgba(127,127,127,.28)` : "none",
        overflow: "hidden",
      }}>
      {showLogo ? (
        // Supabase public media URLs are administrator-controlled team assets.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={label ? `${label} logo` : ""} onError={() => setFailedLogo(logo)} style={{ width: "100%", height: "100%", objectFit: "contain", background: "transparent", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.25))" }} />
      ) : <Shield aria-hidden="true" size={size * 0.56} strokeWidth={1.7} />}
    </span>
  );
}

export function PitchIcon({ color }) {
  return (
    <span className="inline-flex items-center justify-center rounded" style={{ width: 32, height: 22, border: `2px solid ${color}`, position: "relative" }}>
      <span style={{ width: 1.5, height: 22, background: color }} />
      <span style={{ position: "absolute", width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${color}` }} />
    </span>
  );
}

export function BottomNav({ t, active = "Matches" }) {
  const items = [
    { label: "Matches", href: "/", icon: (color) => <PitchIcon color={color} /> },
    { label: "News", href: null, icon: (color) => <Newspaper size={22} color={color} strokeWidth={2.1} /> },
    { label: "Leagues", href: "/leagues", icon: (color) => <Trophy size={22} color={color} strokeWidth={2.1} /> },
    { label: "Following", href: null, icon: (color) => <Star size={22} color={color} strokeWidth={2.1} /> },
  ];
  return (
    <div
      className="touchline-bottom-nav flex items-center gap-2 z-40 pointer-events-none"
    >
      <div className="flex flex-1 items-center rounded-full overflow-hidden pointer-events-auto" style={{ height: 62, padding: 4, background: t.nav, border: `1px solid ${t.pillBorder}`, boxShadow: "0 4px 14px rgba(0,0,0,0.18)" }}>
        {items.map((item) => {
          const selected = active === item.label;
          const color = selected ? t.accent : t.text;
          const contents = <>
            {item.icon(color)}
            <span className={`public-nav-label${selected ? " is-active" : ""}`} style={{ fontSize: 11.5, color, fontWeight: selected ? 700 : 600 }}>{item.label}</span>
          </>;
          const styles = { background: selected ? t.pill : "transparent", boxShadow: selected ? `inset 0 0 0 1px ${t.pillBorder}` : "none" };
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
      <div className="flex items-center justify-center rounded-full shrink-0 pointer-events-auto" style={{ width: 62, height: 62, background: t.nav, border: `1px solid ${t.pillBorder}`, boxShadow: "0 4px 14px rgba(0,0,0,0.18)" }}>
        <span className="flex items-center justify-center rounded-full" style={{ width: 50, height: 50, background: t.pill }}>
          <Search size={25} color={t.text} strokeWidth={2.2} />
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
