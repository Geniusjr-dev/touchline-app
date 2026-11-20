"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Search, X } from "lucide-react";
import { Crest } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

const imecId = "013f3c6e-4aa1-486f-a0f9-1d031265655e";

async function searchNames(query, signal) {
  if (!supabase) throw new Error("Search is not connected to the live database.");
  if (query.includes("*")) return [];
  const pattern = query.replace(/[\\%_]/g, "\\$&") + "%";
  const find = (table, columns, field) => supabase.from(table).select(columns)
    .ilike(field, pattern).order(field).limit(20).abortSignal(signal);
  const teams = "id,name,display_name,short,logo_url";
  const players = "id,team_id,name,display_name,photo_url,team:teams(name,display_name)";
  const competitions = "id,name,logo_url";
  const merge = (results) => [...new Map(results.flatMap((result) => result.data).map((row) => [row.id, row])).values()];
  const requests = await Promise.all([
    find("teams", teams, "name"), find("teams", teams, "display_name"), find("teams", teams, "short"),
    find("players", players, "name"), find("players", players, "display_name"),
    find("competitions", competitions, "name"),
    "imec".startsWith(query.toLowerCase())
      ? supabase.from("competitions").select(competitions).eq("id", imecId).abortSignal(signal)
      : Promise.resolve({ data: [] }),
  ]);
  if (requests.some((result) => result.error)) throw new Error("Search could not load.");
  const label = (row) => row.display_name?.trim() || row.name;
  const group = (title, rows) => ({ title, rows: rows.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20) });
  return [
    group("Teams", merge(requests.slice(0, 3)).map((row) => ({
      id: row.id, name: label(row), image: row.logo_url, href: `/team/${row.id}`,
    }))),
    group("Competitions", merge(requests.slice(5)).map((row) => ({
      id: row.id, name: row.id === imecId ? "IMEC" : row.name, image: row.logo_url,
      detail: row.id === imecId ? row.name : null, href: `/league/${row.id}`,
    }))),
    group("Players", merge(requests.slice(3, 5)).map((row) => ({
      id: row.id, name: label(row), image: row.photo_url, detail: row.team ? label(row.team) : null,
      href: row.team_id ? `/team/${row.team_id}?tab=squad` : null,
    }))),
  ].filter(({ rows }) => rows.length);
}

export default function SearchCentre() {
  const router = useRouter();
  const { t } = useTheme();
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  const query = value.trim();
  useEffect(() => {
    if (!query) return;
    const request = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const groups = await searchNames(query, request.signal);
        if (!request.signal.aborted) setResult({ query, groups });
      } catch {
        if (!request.signal.aborted) setResult({ query, error: true });
      }
    }, 160);
    return () => { clearTimeout(timer); request.abort(); };
  }, [query]);

  const current = result?.query === query ? result : null;
  const status = !query ? "Type a name to find teams, competitions or players."
    : !current ? "Searching…" : current.error ? "Search is unavailable right now." : !current.groups.length ? "No matching names." : "";

  return (
    <main className="touchline-public-content mx-auto min-h-screen px-4 py-4" style={{ background: t.bg, color: t.text }}>
      <header className="mb-4 flex items-center gap-3">
        <button type="button" aria-label="Go back" className="grid h-11 w-11 place-items-center rounded-full"
          style={{ background: t.pill }} onClick={() => window.history.length > 1 ? router.back() : router.push("/")}>
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold">Search</h1>
      </header>
      <div role="search" className="flex min-h-12 items-center gap-3 rounded-2xl px-3" style={{ background: t.card }}>
        <Search size={20} aria-hidden="true" />
        <input autoFocus type="text" inputMode="search" maxLength={80} aria-label="Search teams, competitions and players"
          placeholder="Teams, competitions or players" value={value} onChange={(event) => { setValue(event.target.value); setResult(null); }}
          className="min-w-0 flex-1 bg-transparent py-3 text-base" style={{ color: t.text }} />
        {value && <button type="button" aria-label="Clear search" className="grid h-10 w-10 place-items-center"
          onClick={() => { setValue(""); setResult(null); }}><X size={19} /></button>}
      </div>
      <p role="status" className="my-4 text-sm" style={{ color: t.dim }}>{status}</p>
      {current?.groups?.map(({ title, rows }) => (
        <section key={title} className="mb-5">
          <h2 className="mb-2 text-base font-semibold">{title}</h2>
          <ul className="overflow-hidden rounded-2xl" style={{ background: t.card }}>
            {rows.map((row) => {
              const contents = <><Crest size={32} logo={row.image} ring={t.divider} /><span>
                <span className="block font-medium">{row.name}</span>
                {row.detail && <span className="block text-sm" style={{ color: t.dim }}>{row.detail}</span>}
              </span></>;
              const classes = "flex min-h-14 items-center gap-3 px-3 py-2";
              return <li key={row.id}>{row.href ? <Link href={row.href} className={classes}>{contents}</Link>
                : <div className={classes}>{contents}</div>}</li>;
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
