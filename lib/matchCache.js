"use client";

const PUBLIC_PREFIX = "touchline-public-match:";
const ADMIN_PREFIX = "touchline-admin-match:";

function write(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // Navigation must continue even when browser storage is unavailable.
  }
}

function read(key) {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) || "null");
    return stored?.value || null;
  } catch {
    return null;
  }
}

export function cachePublicMatch(match, teams, detail = null) {
  if (!match?.id) return;
  const selectedTeams = {
    [match.home]: teams?.[match.home],
    [match.away]: teams?.[match.away],
  };
  write(`${PUBLIC_PREFIX}${match.id}`, { match, teams: selectedTeams, detail });
}

export function readPublicMatch(matchId) {
  return read(`${PUBLIC_PREFIX}${matchId}`);
}

export function cacheAdminMatch(match) {
  if (match?.id) write(`${ADMIN_PREFIX}${match.id}`, match);
}

export function readAdminMatch(matchId) {
  return read(`${ADMIN_PREFIX}${matchId}`);
}
