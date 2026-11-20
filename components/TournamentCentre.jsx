"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Trophy } from "lucide-react";
import { BottomNav, Crest } from "@/components/ui";
import { fixtureStages, knockoutRound, matchWinner, qualification, seasonFinal } from "@/lib/tournament.mjs";

const tabs = ["Group Tables", "Knockout", "Fixtures", "Seasons"];
const finished = (match) => ["ft", "awarded", "cancelled"].includes(match.status);
const dated = (date) => date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Date to be confirmed";
const teamName = (teams, id) => teams[id]?.name || "TBD";
const keyFor = (season) => season.id || "legacy";

function TeamMark({ teams, id, t, size = 25 }) {
  return <Crest size={size} logo={teams[id]?.logoUrl} ring={t.divider} />;
}

function Controls({ label, options, selected, onChange, t }) {
  return <div role="group" aria-label={label} className="flex gap-1 overflow-x-auto rounded-full p-1" style={{ background: t.pill }}>
    {options.map((item) => <button key={item} type="button" aria-pressed={selected === item} onClick={() => onChange(item)}
      className="min-h-10 grow whitespace-nowrap rounded-full px-3 text-sm font-bold" style={{ background: selected === item ? t.card : "transparent", color: selected === item ? t.text : t.dim }}>{item}</button>)}
  </div>;
}

function GroupCard({ title, rows, statuses, view, t }) {
  const columns = view === "Short" ? ["PL", "GD", "PTS"] : view === "Form" ? ["PL", "Form", "PTS"] : ["PL", "W", "D", "L", "+/-", "GD", "PTS"];
  const widths = { PL: "7%", W: "6%", D: "6%", L: "6%", "+/-": "10%", GD: "9%", PTS: "9%", Form: "32%" };
  return <section className="mb-4 overflow-hidden rounded-2xl" style={{ background: t.card, border: `1px solid ${t.divider}` }}>
    <table className="w-full table-fixed text-center text-sm tabular-nums" aria-label={title}>
      <colgroup><col />{columns.map((label) => <col key={label} style={{ width: widths[label] }} />)}</colgroup>
      <thead><tr style={{ color: t.dim }}>
        <th scope="col" className="py-4 pl-4 text-left text-sm font-bold" style={{ color: t.text }}>{title}</th>
        {columns.map((label) => <th scope="col" key={label} className="py-4 text-xs font-bold">{label}</th>)}
      </tr></thead>
      <tbody>{rows.map((row, index) => {
        const status = statuses.get(row.id);
        const color = status === "direct" || status === "third" ? "#23ad67" : status ? "#dda92e" : "transparent";
        const gd = row.gf - row.ga;
        const values = { PL: row.pl, W: row.w, D: row.d, L: row.l, "+/-": `${row.gf}-${row.ga}`, GD: gd > 0 ? `+${gd}` : gd, PTS: row.pts, Form: row.form?.slice(-5).join(" ") || "·" };
        return <tr key={row.id}>
          <th scope="row" className="relative text-left font-medium">
            <span aria-hidden="true" className="absolute inset-y-1 left-0 w-1 rounded-full" style={{ background: color }} />
            <Link href={`/team/${row.id}`} className="flex min-h-12 items-center gap-2 py-2 pl-2 pr-1">
              <span className="w-5 shrink-0 text-center font-bold">{index + 1}</span>
              <Crest logo={row.logoUrl} size={22} ring={t.divider} />
              <span className="min-w-0 break-words leading-tight">{row.name}{status && <span className="sr-only">, {status === "direct" || status === "third" ? "qualified" : "possible qualification"}</span>}</span>
            </Link>
          </th>
          {columns.map((label) => <td key={label} className={label === "PTS" ? "font-extrabold" : ""}>{values[label]}</td>)}
        </tr>;
      })}</tbody>
    </table>
  </section>;
}

function Standings({ season, t }) {
  const [view, setView] = useState("Full");
  const groups = season.groupTables || [];
  const groupMatches = season.matches.filter((match) => match.groupNumber && !knockoutRound(match.round));
  const complete = season.completed || (groupMatches.length > 0 && groupMatches.every(finished) &&
    groups.every(({ rows }) => rows.length > 1 && rows.every((row) => row.pl >= rows.length - 1)));
  const result = qualification(groups, season.knockout_slots, complete);
  if (!groups.length) return <Empty t={t}>No group standings yet.</Empty>;
  return <>
    <div className="mb-4"><Controls label="Table view" options={["Short", "Full", "Form"]} selected={view} onChange={setView} t={t} /></div>
    {groups.map(({ group, rows }) => <GroupCard key={group} title={`Grp. ${String.fromCharCode(64 + group)}`} rows={rows} statuses={result.status} view={view} t={t} />)}
    {result.ranked.length > 0 && <GroupCard title="Best third-placed teams" rows={result.ranked} statuses={result.status} view={view} t={t} />}
    <div className="space-y-2 px-1 text-sm" style={{ color: t.dim }}>
      <p><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-[#23ad67]" />Qualification to the next stage</p>
      <p><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-[#dda92e]" />Possible qualification to the next stage</p>
      {result.wanted > 0 && <p>{result.wanted} third-placed {result.wanted === 1 ? "team advances" : "teams advance"}; ranked by points, goal difference, then goals scored.</p>}
    </div>
  </>;
}

function MatchLink({ match, teams, t, bracket = false, final = false }) {
  const winner = knockoutRound(match.round) ? matchWinner(match) : null;
  const side = (id) => winner && id !== winner ? { color: final ? "#d5dbea" : t.dim, textDecoration: "line-through" } : undefined;
  const score = ["live", "ht", "et_live", "et_ht", "ft", "awarded"].includes(match.status) ? `${match.hs} - ${match.as}` : match.time || "TBD";
  const pens = match.shootout && `Pen ${match.shootout.home} - ${match.shootout.away}`;
  return <Link href={`/match/${match.id}`} className={bracket ? "block rounded-xl px-3 py-2" : "grid min-h-16 grid-cols-[minmax(0,1fr)_66px_minmax(0,1fr)] items-center gap-1 px-2 py-2"}
    style={{ background: final ? "linear-gradient(125deg,#152f56,#432c61 58%,#75405a)" : bracket ? t.card : undefined, color: final ? "white" : t.text }}>
    {bracket ? <>
      {final && <Trophy aria-hidden="true" size={19} color="#f5d889" className="absolute right-3 top-2" />}
      {[["home", "hs"], ["away", "as"]].map(([key, metric]) => <div key={key} className="flex min-h-7 items-center gap-2 text-sm">
        <TeamMark id={match[key]} teams={teams} t={t} size={20} />
        <span className="min-w-0 flex-1 truncate" style={side(match[key])}>{teamName(teams, match[key])}</span>
        <strong className={final ? "mr-7" : ""}>{score === "TBD" || !["live", "ht", "et_live", "et_ht", "ft", "awarded"].includes(match.status) ? "·" : match[metric]}{match.shootout ? ` (${match.shootout[key]})` : ""}</strong>
      </div>)}
      <p className="truncate text-xs" style={{ color: final ? "#e5deef" : t.dim }}>{[pens, match.venueName].filter(Boolean).join(" · ") || dated(match.date)}</p>
    </> : <>
      <span className="flex min-w-0 items-center justify-end gap-2 text-right text-sm font-semibold"><span className="min-w-0 break-words" style={side(match.home)}>{teamName(teams, match.home)}</span><TeamMark id={match.home} teams={teams} t={t} /></span>
      <span className="text-center font-bold tabular-nums">{score}{pens && <small className="block whitespace-nowrap text-xs" style={{ color: t.dim }}>{pens}</small>}</span>
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><TeamMark id={match.away} teams={teams} t={t} /><span className="min-w-0 break-words" style={side(match.away)}>{teamName(teams, match.away)}</span></span>
    </>}
  </Link>;
}

function Fixtures({ season, teams, t }) {
  if (!season.matches.length) return <Empty t={t}>No fixtures in this edition.</Empty>;
  return <div className="space-y-4">
    {fixtureStages(season.matches).map(({ title, matches }) => (
      <section key={title} className="overflow-hidden rounded-2xl pb-3" style={{ background: t.card }}>
        <h2 className="mx-4 border-b py-4 text-lg font-extrabold sm:mx-6 sm:text-xl" style={{ borderColor: t.divider }}>{title}</h2>
        {matches.map((match, index) => <div key={match.id}>
          {(index === 0 || matches[index - 1].date !== match.date) && (
            <h3 className="px-4 pt-3 text-sm font-semibold sm:px-6" style={{ color: t.dim }}>{dated(match.date)}</h3>
          )}
          <MatchLink match={match} teams={teams} t={t} />
        </div>)}
      </section>
    ))}
  </div>;
}

function Bracket({ season, teams, t }) {
  const [stage, setStage] = useState(null);
  const rounds = new Map();
  season.matches.forEach((match) => {
    const round = knockoutRound(match.round);
    if (!round) return;
    if (!rounds.has(round.name)) rounds.set(round.name, { ...round, matches: [] });
    rounds.get(round.name).matches.push(match);
  });
  const ordered = [...rounds.values()].sort((a, b) => a.order - b.order);
  if (!ordered.length) return <Empty t={t}>No knockout matches yet.</Empty>;
  const start = Math.max(0, ordered.findIndex((round) => round.name === stage));
  const currentRound = ordered[start];
  const nextRound = currentRound.name === "Third place" ? null : ordered.slice(start + 1).find((round) => round.name !== "Third place");
  const columns = nextRound ? [currentRound, nextRound] : [currentRound];
  const width = 225;
  const gap = 28;
  const step = 106;
  const left = columns[0].matches.map((match, index) => ({ match, y: index * step }));
  const connected = (source, target) => {
    const winner = matchWinner(source);
    return winner && (target.home === winner || target.away === winner);
  };
  const right = [];
  columns[1]?.matches.forEach((match, index) => {
    const feeds = columns[1].name === "Third place" ? [] : left.filter((entry) => connected(entry.match, match));
    const ideal = feeds.length ? feeds.reduce((sum, entry) => sum + entry.y, 0) / feeds.length : index * step;
    right.push({ match, feeds, y: Math.max(ideal, right.length ? right.at(-1).y + step : 0) });
  });
  const height = Math.max(96, ...[...left, ...right].map((item) => item.y + 96));
  return <>
    <Controls label="Knockout rounds" options={ordered.map(({ name }) => name)} selected={columns[0].name} onChange={setStage} t={t} />
    <div className="mt-4 overflow-x-auto pb-3">
      <div style={{ width: columns.length === 2 ? 2 * width + gap : width }}>
        <div className="flex" style={{ gap }}>
          {columns.map((round) => <div key={round.name} style={{ width }} className="mb-3 shrink-0 px-1">
            <h2 className="font-bold">{round.name}</h2>
            <p className="text-xs" style={{ color: t.dim }}>{dated(round.matches[0]?.date)}</p>
          </div>)}
        </div>
        <div className="relative" style={{ height }}>
          {right.length > 0 && <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={2 * width + gap} height={height}>
            {right.flatMap(({ match, y, feeds }) => feeds.map((feed) => <path key={`${feed.match.id}-${match.id}`} d={`M ${width} ${feed.y + 43} H ${width + gap / 2} V ${y + 43} H ${width + gap}`} fill="none" stroke={t.dim} strokeWidth="1.5" />))}
          </svg>}
          {[left, right].map((items, col) => items.map(({ match, y }) => <div key={match.id} className="absolute" style={{ width, top: y, left: col * (width + gap) }}>
            <MatchLink match={match} teams={teams} t={t} bracket final={columns[col].name === "Final"} />
          </div>))}
        </div>
      </div>
    </div>
  </>;
}

function Empty({ t, children }) {
  return <p className="rounded-2xl p-6 text-center" style={{ background: t.card, color: t.dim }}>{children}</p>;
}

export default function TournamentCentre({ state, t, initialTab = "Group Tables", initialEdition = null }) {
  const [tab, setTab] = useState(initialTab);
  const [selection, setSelection] = useState(initialEdition);
  const season = state.seasons.find((item) => keyFor(item) === selection) || state.seasons[0];
  const { competition, teams } = state;
  return <div className="min-h-screen pb-24" style={{ background: t.bg, color: t.text }}>
    <header style={{ background: `linear-gradient(135deg,#14294b,${/^#[0-9a-f]{6}$/i.test(competition.themeColor || "") ? competition.themeColor : "#382953"})`, color: "white" }}>
      <div className="mx-auto max-w-4xl px-3 pt-5 sm:px-4 sm:pt-6">
        <div className="flex min-h-20 items-center gap-3 py-3 sm:min-h-28">
          <Link href="/leagues" aria-label="Back to competitions" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/30"><ChevronLeft size={22} /></Link>
          <Crest logo={competition.logoUrl} size={42} />
          <div className="min-w-0 flex-1"><h1 className="text-lg font-extrabold leading-tight">{competition.name}</h1><p className="text-sm text-white/80">{competition.country}</p></div>
          <select aria-label="Season" value={keyFor(season)} onChange={(event) => setSelection(event.target.value)} className="rounded-full border border-white/30 bg-[#1d2f50] px-2 py-2 text-sm font-bold">
            {state.seasons.map((item) => <option key={keyFor(item)} value={keyFor(item)}>{item.label}</option>)}
          </select>
        </div>
        <nav aria-label="Tournament sections" className="mt-4 grid grid-cols-4">
          {tabs.map((item) => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)} className="min-h-14 min-w-0 border-b-[3px] px-1 py-2 text-base font-bold leading-tight sm:min-h-16 sm:text-lg" style={{ borderColor: tab === item ? "#64d99e" : "transparent", opacity: tab === item ? 1 : 0.8 }}>{item}</button>)}
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-4xl px-3 py-4">
      {tab === "Group Tables" && <Standings season={season} t={t} />}
      {tab === "Knockout" && <Bracket key={keyFor(season)} season={season} teams={teams} t={t} />}
      {tab === "Fixtures" && <Fixtures season={season} teams={teams} t={t} />}
      {tab === "Seasons" && state.seasons.map((item) => {
        const decidingMatch = seasonFinal(item.matches);
        const champion = decidingMatch && matchWinner(decidingMatch);
        const runnerUp = decidingMatch && (champion === decidingMatch.home ? decidingMatch.away : decidingMatch.home);
        return <article key={keyFor(item)} className="mb-3 rounded-2xl p-4" style={{ background: t.card, border: `1px solid ${t.divider}` }}>
          <button type="button" className="flex w-full items-center justify-between gap-2 text-left font-extrabold" onClick={() => { setSelection(keyFor(item)); setTab(champion ? "Knockout" : "Group Tables"); }}>
            <span>{item.label}</span><span className="text-sm" style={{ color: t.dim }}>Open edition</span>
          </button>
          {champion ? <>
            <div className="mt-4 flex flex-wrap gap-5">{[[champion, "Winner"], [runnerUp, "Runner-up"]].map(([id, label]) =>
              <Link key={label} href={`/team/${id}`} className="flex items-center gap-2"><TeamMark id={id} teams={teams} t={t} size={30} /><span><small className="block" style={{ color: t.dim }}>{label}</small><strong>{teamName(teams, id)}</strong></span></Link>)}</div>
          </> : <p className="mt-3 text-sm" style={{ color: t.dim }}>No confirmed champion yet.</p>}
        </article>;
      })}
    </main>
    <BottomNav t={t} active="Leagues" />
  </div>;
}
