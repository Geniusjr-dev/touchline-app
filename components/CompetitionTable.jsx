"use client";

import Link from "next/link";
import { useState } from "react";
import { Crest } from "@/components/ui";

export default function CompetitionTable({ t, competition, rows }) {
  const [view, setView] = useState("full");
  const [scope, setScope] = useState("overall");

  if (!rows.length) {
    return (
      <div className="mx-2 my-3 rounded-2xl text-center" style={{ padding: "28px 18px", background: t.card, color: t.dim, fontSize: 13.5 }}>
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
                minHeight: 38,
                border: 0,
                background: view === option ? t.segActive : "transparent",
                color: view === option ? t.text : t.dim,
                fontSize: 13,
                fontWeight: 800,
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
            minHeight: 46,
            borderRadius: 999,
            border: `1px solid ${t.pillBorder}`,
            background: t.pill,
            color: t.text,
            padding: "0 12px",
            fontSize: 13,
            fontWeight: 800,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="overall">Overall</option>
          <option value="home">Home</option>
          <option value="away">Away</option>
        </select>
      </div>

      <div className="mx-2 my-2 rounded-2xl overflow-hidden" style={{ background: t.card }}>
        <div className="flex items-center gap-2 px-4 py-4" style={{ borderBottom: `1px solid ${t.divider}` }}>
          <span aria-hidden="true" style={{ fontSize: 18 }}>🏆</span>
          <span className="truncate" style={{ color: t.text, fontSize: 15, fontWeight: 850 }}>{competition.name}</span>
        </div>

        <div className="flex items-center px-3 py-3" style={{ color: t.dim, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>
          <span style={{ width: 28 }} />
          <span className="flex-1 pl-1">Team</span>
          {view === "form" ? (
            <span style={{ width: 126, textAlign: "right", paddingRight: 3 }}>Last matches</span>
          ) : view === "short" ? (
            <>
              <Heading width={28}>PL</Heading>
              <Heading width={38}>GD</Heading>
              <Heading width={38}>PTS</Heading>
            </>
          ) : (
            <>
              <Heading width={26}>PL</Heading>
              <Heading width={22}>W</Heading>
              <Heading width={22}>D</Heading>
              <Heading width={22}>L</Heading>
              <Heading width={42}>+/-</Heading>
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
              className="flex items-center px-3 active:opacity-70"
              style={{ minHeight: 54, borderTop: `1px solid ${t.divider}` }}
            >
              <div className="flex items-center" style={{ width: 28, alignSelf: "stretch" }}>
                <span style={{ width: 3, height: "100%", maxHeight: 46, borderRadius: 2, background: championPosition ? t.yellow : "transparent", marginRight: 6 }} />
                <span style={{ color: t.dim, fontSize: 13, fontWeight: 750 }}>{index + 1}</span>
              </div>
              <div className="flex-1 flex items-center gap-2 min-w-0 pl-1">
                <Crest short={team.short} color={team.color} logo={team.logoUrl} size={24} ring={t.divider} />
                <span className="truncate" style={{ color: t.text, fontSize: 13.5, fontWeight: 700 }}>{team.name}</span>
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
                        fontSize: 10,
                        fontWeight: 850,
                        boxShadow: resultIndex === form.length - 1 ? `inset 0 -2px 0 ${t.accent}` : "none",
                      }}
                    >
                      {result}
                    </span>
                  )) : <span style={{ color: t.faint, fontSize: 12 }}>No results</span>}
                </span>
              ) : view === "short" ? (
                <>
                  <Value width={28} color={t.text}>{team.pl}</Value>
                  <Value width={38} color={t.dim}>{signedNumber(goalDifference)}</Value>
                  <Value width={38} color={t.text} strong>{team.pts}</Value>
                </>
              ) : (
                <>
                  <Value width={26} color={t.text}>{team.pl}</Value>
                  <Value width={22} color={t.dim}>{team.w}</Value>
                  <Value width={22} color={t.dim}>{team.d}</Value>
                  <Value width={22} color={t.dim}>{team.l}</Value>
                  <Value width={42} color={t.dim}>{team.gf}-{team.ga}</Value>
                  <Value width={34} color={t.dim}>{signedNumber(goalDifference)}</Value>
                  <Value width={34} color={t.text} strong>{team.pts}</Value>
                </>
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2 px-4 py-2">
        <span style={{ width: 10, height: 10, borderRadius: 2, background: t.yellow }} />
        <span style={{ color: t.dim, fontSize: 12 }}>Champion position</span>
      </div>
    </>
  );
}

function Heading({ width, children }) {
  return <span style={{ width, textAlign: "center", flex: "0 0 auto" }}>{children}</span>;
}

function Value({ width, color, strong = false, children }) {
  return <span style={{ width, textAlign: "center", color, fontSize: 12.5, fontWeight: strong ? 850 : 600, flex: "0 0 auto" }}>{children}</span>;
}

function signedNumber(value) {
  return value > 0 ? `+${value}` : String(value);
}
