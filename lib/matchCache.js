"use client";

const PUBLIC_PREFIX = "touchline-public-match:";
const ADMIN_PREFIX = "touchline-admin-match:";
const memoryCache = new Map();

function hideRetrospectiveDraft(value) {
  if (value?.match?.operationMode !== "retrospective" || value.match.status === "ft") return value;
  return {
    ...value,
    match: {
      ...value.match,
      status: "scheduled",
      hs: 0,
      as: 0,
      clock_elapsed_seconds: 0,
      clock_started_at: null,
      current_period: 0,
      operationMode: "live",
    },
    detail: value.detail ? { ...value.detail, events: [], stats: null } : null,
  };
}

function write(key, value) {
  if (typeof window === "undefined") return;
  memoryCache.set(key, value);
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // Navigation must continue even when browser storage is unavailable.
  }
}

function read(key) {
  if (typeof window === "undefined") return null;
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) || "null");
    const value = stored?.value || null;
    if (value) memoryCache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export function cachePublicMatch(match, teams, detail = null) {
  if (!match?.id) return;
  const key = `${PUBLIC_PREFIX}${match.id}`;
  const existing = read(key);
  const selectedTeams = {
    [match.home]: teams?.[match.home],
    [match.away]: teams?.[match.away],
  };
  write(key, hideRetrospectiveDraft({
    match: { ...(existing?.match || {}), ...match },
    teams: { ...(existing?.teams || {}), ...selectedTeams },
    detail: detail == null ? existing?.detail || null : detail,
  }));
}

export function readPublicMatch(matchId) {
  return hideRetrospectiveDraft(read(`${PUBLIC_PREFIX}${matchId}`));
}

export function cacheAdminMatch(match) {
  if (match?.id) write(`${ADMIN_PREFIX}${match.id}`, match);
}

export function readAdminMatch(matchId) {
  return read(`${ADMIN_PREFIX}${matchId}`);
}
