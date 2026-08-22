export const PLAYER_POSITION_GROUPS = [
  { key: "goalkeeper", label: "Goalkeepers" },
  { key: "defender", label: "Defenders" },
  { key: "midfielder", label: "Midfielders" },
  { key: "forward", label: "Forwards" },
  { key: "unspecified", label: "Other players" },
];

export function playerPositionGroup(position) {
  const value = String(position || "").trim().toLowerCase();
  if (!value) return "unspecified";
  if (/goalkeeper|keeper|\bgk\b/.test(value)) return "goalkeeper";
  if (/defender|centre back|center back|full back|wing back|\bcb\b|\blb\b|\brb\b|\blwb\b|\brwb\b/.test(value)) return "defender";
  if (/midfielder|midfield|\bdm\b|\bcm\b|\bam\b|\blm\b|\brm\b/.test(value)) return "midfielder";
  if (/forward|striker|attacker|winger|\bst\b|\bcf\b|\blw\b|\brw\b/.test(value)) return "forward";
  return "unspecified";
}

export function groupPlayersByPosition(players = []) {
  const groups = Object.fromEntries(PLAYER_POSITION_GROUPS.map((group) => [group.key, []]));
  players.forEach((player) => {
    groups[playerPositionGroup(player.position)].push(player);
  });
  return PLAYER_POSITION_GROUPS
    .map((group) => ({ ...group, players: groups[group.key] }))
    .filter((group) => group.players.length > 0);
}
