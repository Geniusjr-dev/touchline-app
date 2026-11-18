"use client";

import Link from "next/link";
import { useState } from "react";
import { Crest } from "@/components/ui";

export default function CompetitionTable({ t, competition, rows }) {
  const [view, setView] = useState("full");
  const [scope, setScope] = useState("overall");

  if (!rows.length) {
    return (
      <div className="mx-2 my-3 rounded-2xl text-center" style={{ padding: "28px 18px", background: t.card, color: t.dim, fontSize: "var(--type-body)" }}>
        The table will appear when teams are registered for this league.
      </div>
    );
  }

  const scopedRows = rows
    .map((team) => {
      const record = scope === "home"
        ? team.homeRecord || team
        : scope === "away"
          ? team.awayRecord || team
          : team;
      return { ...team, ...record };
    })
    .sort((left, right) => right.pts - left.pts
      || (right.gf - right.ga) - (left.gf - left.ga)
      || right.gf - left.gf
      || left.name.localeCompare(right.name));

  return (
    <>
      <div className="flex items-center gap-2 px-2 pt-2">
        <div className="grid grid-cols-3 flex-1 rounded-full p-1" style={{ background: t.seg }}>
          {["short", "full", "form"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className="rounded-full"
              style={{
                minHeight: 34,
                border: 0,
                background: view === option ? t.segActive : "transparent",
                color: view === option ? t.text : t.dim,
                fontSize: "var(--type-label)",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <select
          aria-label="Table scope"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          style={{
            width: 112,
            minHeight: 40,
            borderRadius: 999,
            border: `1px solid ${t.pillBorder}`,
            background: t.pill,
            color: t.text,
            padding: "0 12px",
            fontSize: "var(--type-label)",
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="overall">Overall</option>
          <option value="home">Home</option>
          <option value="away">Away</option>
        </select>
      </div>

      <div className="standings-card mx-2 my-2 rounded-2xl overflow-hidden" style={{ background: t.card }}>
        <div className="standings-header flex items-center px-3 py-3" style={{ color: t.dim, fontSize: "var(--type-caption)", textTransform: "uppercase" }}>
          <span className="standings-rank-heading" style={{ width: 28, flexShrink: 0, textAlign: "center" }}>#</span>
          <span className="flex-1 pl-1">Team</span>
          {view === "form" ? (
            <span style={{ width: 126, textAlign: "right", paddingRight: 3 }}>Last matches</span>
          ) : view === "short" ? (
            <>
              <Heading width={28}>MP</Heading>
              <Heading width={38}>GD</Heading>
              <Heading width={38}>PTS</Heading>
            </>
          ) : (
            <>
              <Heading width={26}>MP</Heading>
              <Heading width={22}>W</Heading>
              <Heading width={22}>D</Heading>
              <Heading width={22}>L</Heading>
              <Heading width={42}>G</Heading>
              <Heading width={34}>GD</Heading>
              <Heading width={34}>PTS</Heading>
            </>
          )}
        </div>

        {scopedRows.map((team, index) => {
          const goalDifference = team.gf - team.ga;
          const championPosition = competition.competitionType === "league" && index === 0;
          const form = (team.form || []).slice(-5);
          return (
            <Link
              href={`/team/${team.id}`}
              key={team.id}
              className={`standings-row flex items-center px-3 active:opacity-70${championPosition ? " standings-leader" : ""}`}
              style={{ minHeight: 50, borderTop: `1px solid ${t.divider}` }}
            >
              <div className="standings-rank flex items-center" style={{ width: 28, alignSelf: "stretch" }}>
                <span className="standings-stripe" style={{ width: 3, height: "100%", maxHeight: 46, borderRadius: 2, background: championPosition ? t.yellow : "transparent", marginRight: 6 }} />
                <span className="league-table-number standings-rank-number" style={{ color: t.dim, fontSize: "var(--type-label)" }}>{index + 1}<span className="standings-rank-period">.</span></span>
              </div>
              <div className="flex-1 flex items-center gap-2 min-w-0 pl-1">
                <Crest color={team.color} logo={team.logoUrl} label={team.name} size={24} ring={t.divider} />
                <span className="standings-name truncate" style={{ color: t.text, fontSize: "var(--type-body)" }}>{team.name}</span>
              </div>

              {view === "form" ? (
                <span style={{ width: 126 }} className="flex gap-1.5 justify-end">
                  {form.length ? form.map((result, resultIndex) => (
                    <span
                      key={`${result}-${resultIndex}`}
                      title={result === "W" ? "Win" : result === "D" ? "Draw" : "Loss"}
                      className="inline-flex items-center justify-center rounded-md"
                      style={{
                        width: 20,
                        height: 22,
                        background: result === "W" ? t.win : result === "D" ? t.drawPill : t.loss,
                        color: "#FFFFFF",
                        fontSize: "var(--type-badge)",
                        boxShadow: resultIndex === form.length - 1 ? `inset 0 -2px 0 ${t.accent}` : "none",
                      }}
                    >
                      {result}
                    </span>
                  )) : <span style={{ color: t.faint, fontSize: "var(--type-label)" }}>No results</span>}
                </span>
              ) : view === "short" ? (
                <>
                  <Value width={28} color={t.text}>{team.pl}</Value>
                  <Value width={38} color={t.dim}>{signedNumber(goalDifference)}</Value>
                  <Value width={38} color={t.text} points>{team.pts}</Value>
                </>
              ) : (
                <>
                  <Value width={26} color={t.text}>{team.pl}</Value>
                  <Value width={22} color={t.dim}>{team.w}</Value>
                  <Value width={22} color={t.dim}>{team.d}</Value>
                  <Value width={22} color={t.dim}>{team.l}</Value>
                  <Value width={42} color={t.dim}>{team.gf}:{team.ga}</Value>
                  <Value width={34} color={t.dim}>{signedNumber(goalDifference)}</Value>
                  <Value width={34} color={t.text} points>{team.pts}</Value>
                </>
              )}
            </Link>
          );
        })}
      </div>

      <div className="standings-legend flex items-center gap-2 px-4 py-2">
        <span className="standings-legend-key" style={{ width: 10, height: 10, borderRadius: 2, background: t.yellow }} />
        <span style={{ color: t.dim, fontSize: "var(--type-caption)" }}>Champion position</span>
      </div>
      <style jsx global>{`
        .standings-rank-period { display: none; }
        @media (min-width: 900px) {
          .standings-card, .standings-legend { max-width: 650px; margin-inline: auto; }
          .standings-card { --standings-column-scale: 1.35; border-radius: 4px; }
          .standings-card .standings-header { padding-block: 0; min-height: 29px; background: color-mix(in srgb, currentColor 8%, transparent); }
          .standings-card .standings-row { min-height: 36px !important; }
          .standings-card .standings-rank, .standings-card .standings-rank-heading { width: 32px !important; flex-shrink: 0; }
          .standings-card .standings-stripe { display: none; }
          .standings-card .standings-rank-period { display: inline; font-weight: inherit !important; }
          .standings-card .standings-rank-number { display: inline-grid; grid-auto-flow: column; align-items: center; justify-content: center; min-width: 22px; height: 22px; border-radius: 4px; }
          .standings-card .standings-value:not(.standings-points) { font-weight: 400 !important; }
          .standings-card .standings-leader { background: color-mix(in srgb, #409fee 12%, transparent); }
          .standings-card .standings-leader .standings-rank-number, .standings-legend .standings-legend-key { background: #06477e !important; color: white !important; }
          .standings-card .standings-leader .standings-name { font-weight: 650 !important; }
        }
      `}</style>
    </>
  );
}

function Heading({ width, children }) {
  return <span style={{ width: standingsColumnWidth(width), textAlign: "center", flex: "0 0 auto" }}>{children}</span>;
}

function Value({ width, color, children, points = false }) {
  return <span className={`league-table-number standings-value${points ? " standings-points" : ""}`} style={{ width: standingsColumnWidth(width), textAlign: "center", color, fontSize: "var(--standings-value-size)", flex: "0 0 auto" }}>{children}</span>;
}

function standingsColumnWidth(width) {
  return `calc(${width}px * var(--standings-column-scale))`;
}

function signedNumber(value) {
  return value > 0 ? `+${value}` : String(value);
}
