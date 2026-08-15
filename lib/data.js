// ---- teams ----
export const TEAMS = {
  BUY: { name: "Buya Stars", short: "BUY", color: "#18A558" },
  KAB: { name: "Kabonwule FC", short: "KAB", color: "#2563EB" },
  BBU: { name: "Banda-Buya United", short: "BBU", color: "#DC2626" },
  KAT: { name: "Katiejeli Kotoko", short: "KAT", color: "#7C3AED" },
  KPW: { name: "Kpandai Warriors", short: "KPW", color: "#EA580C" },
  NKA: { name: "Nkanchina United", short: "NKA", color: "#0891B2" },
  KIT: { name: "Kitare FC", short: "KIT", color: "#DB2777" },
  BLA: { name: "Bladjai Stars", short: "BLA", color: "#CA8A04" },
};
export const team = (k) => TEAMS[k] || { name: k, short: k.slice(0, 3).toUpperCase(), color: "#555" };

// ---- home screen: competitions with matches (mixed states) ----
// status: scheduled | live | ht | ft ; live uses `min`
export const COMPETITIONS = [
  {
    id: "ijon-groupA", name: "Ijon Memorial Championship", sub: "Group A", flag: "🏆",
    matches: [
      { id: "m-live-1", home: "BUY", away: "KAB", status: "live", min: 67, hs: 2, as: 1 },
      { id: "m-ht-1", home: "BBU", away: "KAT", status: "ht", hs: 0, as: 0 },
      { id: "m-up-1", home: "KPW", away: "NKA", status: "scheduled", time: "16:00" },
      { id: "m-up-2", home: "KIT", away: "BLA", status: "scheduled", time: "16:30" },
    ],
  },
  {
    id: "ijon-groupB", name: "Ijon Memorial Championship", sub: "Group B", flag: "🏆",
    matches: [
      { id: "m-ft-1", home: "KAT", away: "BUY", status: "ft", hs: 1, as: 3 },
      { id: "m-ft-2", home: "NKA", away: "BBU", status: "ft", hs: 2, as: 2 },
    ],
  },
  {
    id: "friendlies", name: "Community friendlies", sub: null, flag: "🌍",
    matches: [
      { id: "m-ft-3", home: "KPW", away: "KIT", status: "ft", hs: 4, as: 0 },
      { id: "m-up-3", home: "BLA", away: "KAB", status: "scheduled", time: "17:15" },
    ],
  },
];

// flat lookup
export const ALL_MATCHES = COMPETITIONS.flatMap((c) => c.matches.map((m) => ({ ...m, compId: c.id, compName: c.name, compSub: c.sub })));
export const findMatch = (id) => ALL_MATCHES.find((m) => m.id === id);

// ---- detailed record for the featured live match (m-live-1: Buya Stars vs Kabonwule) ----
export const DETAIL = {
  "m-live-1": {
    venue: { name: "Buya Community Park", loc: "Buya, Kpandai District", cap: "3,000", att: "1,850", pct: 62, surface: "Grass", weather: "27°C  |  Clear" },
    details: { date: "Sat, 27 Dec 2026  15:00", comp: "Ijon Memorial Championship - Group A", ref: "S. Mahamadu" },
    events: [
      { m: 12, min: "12'", type: "goal", side: "home", player: "K. Mahama", assist: "S. Adzah", score: "1 - 0", scored: "home" },
      { m: 27, min: "27'", type: "yellow", side: "away", player: "I. Fuseini" },
      { m: 39, min: "39'", type: "goal", side: "away", player: "M. Osei", score: "1 - 1", scored: "away" },
      { m: 45, type: "half", label: "HT", score: "1 - 1" },
      { m: 54, min: "54'", type: "goal", side: "home", player: "K. Mahama", assist: null, score: "2 - 1", scored: "home" },
      { m: 63, min: "63'", type: "sub", side: "away", on: "A. Nuhu", off: "M. Osei" },
    ],
  },
};
export const detail = (id) => DETAIL[id] || null;
