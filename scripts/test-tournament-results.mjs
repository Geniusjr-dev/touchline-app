import assert from "node:assert/strict";
import { matchWinner, qualification, seasonFinal, shootoutScore, knockoutRound } from "../lib/tournament.mjs";

function groups(size) {
  return Array.from({ length: size }, (_, index) => ({
    group: index + 1,
    rows: [0, 1, 2, 3].map((rank) => ({
      id: `${index}:${rank}`, pts: rank === 2 ? size - index : 10 - rank, gf: 3, ga: 2,
    })),
  }));
}
for (const [count, thirds] of [[2, 0], [3, 2], [4, 0], [6, 4], [8, 0], [9, 6], [12, 8]]) {
  const actual = qualification(groups(count), null, true);
  assert.equal(actual.wanted, thirds);
  assert.equal([...actual.status.values()].filter((status) => status === "direct").length, count * 2);
  assert.equal([...actual.status.values()].filter((status) => status === "third").length, thirds);
}
assert.equal(qualification(groups(3), 7, true).wanted, 1);
assert.equal(qualification(groups(3), null, false).status.get("0:2"), "possible");
const tied = groups(3);
tied[1].rows[2].pts = tied[2].rows[2].pts;
assert.equal(qualification(tied, null, true).status.get("1:2"), "possible");
assert.equal(qualification(tied, null, true).status.get("2:2"), "possible");

const semi = { id: "sf", round: "Semi-final (Puma won 4-2 on penalties)", status: "ft", home: "Bayern", away: "Puma", hs: 2, as: 2 };
semi.shootout = shootoutScore({ ...semi, home_penalties: 2, away_penalties: 4 });
assert.deepEqual(semi.shootout, { home: 2, away: 4 });
assert.equal(matchWinner(semi), "Puma");
assert.equal(seasonFinal([semi]), null);
assert.equal(knockoutRound("Quarter-finals").name, "Quarter-finals");
assert.equal(knockoutRound("Group A"), null);
const final = { id: "final", round: "Final", status: "ft", home: "Puma", away: "Rex", hs: 2, as: 1 };
assert.equal(seasonFinal([semi, final]).id, "final");
assert.equal(matchWinner(final), "Puma");
assert.equal(seasonFinal([{ ...final, status: "scheduled" }]), null);
assert.equal(shootoutScore({ ...semi, hs: 3, home_penalties: 2, away_penalties: 4 }), null);
console.log("Tournament rules: all checks passed.");
