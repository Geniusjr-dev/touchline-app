export function shootoutScore(match) {
  if (!["ft", "awarded"].includes(match.status) || !Number.isInteger(match.hs) || match.hs !== match.as) return null;
  const home = match.home_penalties;
  const away = match.away_penalties;
  return Number.isInteger(home) && Number.isInteger(away) && home !== away ? { home, away } : null;
}

export function matchWinner(match) {
  if (!["ft", "awarded"].includes(match.status)) return null;
  if (!match.home || !match.away || match.home === match.away) return null;
  const score = match.shootout || { home: match.hs, away: match.as };
  return score.home > score.away ? match.home : score.away > score.home ? match.away : null;
}

export function knockoutRound(label = "") {
  const value = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/\b(?:third|3rd) place\b|\bbronze\b/.test(value)) return { name: "Third place", order: 95 };
  if (/\bsemi ?finals?\b/.test(value)) return { name: "Semi-finals", order: 90 };
  if (/\bquarter ?finals?\b/.test(value)) return { name: "Quarter-finals", order: 80 };
  const round = value.match(/\b(?:round of|last) (\d+)\b/);
  if (round) return { name: `Round of ${round[1]}`, order: 75 - Math.log2(+round[1]) };
  if (/\bfinals?\b/.test(value)) return { name: "Final", order: 100 };
  if (/\bplay ?offs?\b|\bknock ?out\b/.test(value)) return { name: "Play-offs", order: 0 };
  return null;
}

export function seasonFinal(matches) {
  const finals = matches.filter((match) => knockoutRound(match.round)?.name === "Final");
  return finals.length === 1 && matchWinner(finals[0]) ? finals[0] : null;
}

export function qualification(groupTables, configuredSlots, complete) {
  const count = groupTables.length;
  const direct = count * 2;
  const powerOfTwo = count > 0 && (count & (count - 1)) === 0;
  const defaults = { 3: 8, 6: 16, 9: 24, 12: 32 };
  const target = configuredSlots ?? (powerOfTwo ? direct : defaults[count]);
  const ranked = groupTables.flatMap(({ group, rows }) => rows[2] ? [{ ...rows[2], group }] : []);
  const compare = (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf;
  ranked.sort(compare);
  const wanted = Number.isInteger(target) && target >= direct && target <= direct + count ? target - direct : 0;
  const status = new Map();
  groupTables.forEach(({ rows }) => rows.slice(0, 2).forEach((row) => status.set(row.id, complete ? "direct" : "provisional")));
  if (wanted) {
    const cutoff = ranked[wanted - 1];
    const next = ranked[wanted];
    const tied = cutoff && next && compare(cutoff, next) === 0;
    ranked.forEach((row, index) => {
      if (tied && compare(row, cutoff) === 0) status.set(row.id, "possible");
      else if (index < wanted) status.set(row.id, complete && ranked.length === count ? "third" : "possible");
    });
  }
  return { ranked: wanted ? ranked : [], wanted, status };
}
