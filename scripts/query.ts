/**
 * Reads the record straight out of Arkiv and prints it.
 *
 * Deliberately shares every line of its read path with the website, so that
 * "the site has no backend" is demonstrable rather than asserted: this CLI and
 * the browser call the identical functions.
 */
import {
  fetchAllSettlements,
  fetchOpenSignals,
  fetchSettlementsByAsset,
} from "../lib/arkiv/query";
import {
  computeLeaderboard,
  formatBps,
  formatPct,
  shortAddress,
} from "../lib/leaderboard";

const asset = process.argv.includes("--asset")
  ? process.argv[process.argv.indexOf("--asset") + 1]
  : undefined;

const t0 = Date.now();
const settlements = asset
  ? await fetchSettlementsByAsset(asset)
  : await fetchAllSettlements();
const open = await fetchOpenSignals();
const ms = Date.now() - t0;

console.log(
  `read ${settlements.length} settlements and ${open.length} open signals ` +
    `from Arkiv in ${ms}ms${asset ? ` (asset=${asset})` : ""}\n`,
);

console.log("LEADERBOARD  (hit rate includes calls that never executed)");
console.log(
  "leader".padEnd(16) +
    "calls".padStart(6) +
    "hit".padStart(5) +
    "miss".padStart(6) +
    "unfilled".padStart(10) +
    "honest".padStart(9) +
    "screenshot".padStart(12) +
    "avg".padStart(11),
);
for (const s of computeLeaderboard(settlements)) {
  console.log(
    shortAddress(s.leader).padEnd(16) +
      String(s.total).padStart(6) +
      String(s.hits).padStart(5) +
      String(s.misses).padStart(6) +
      String(s.unfilled).padStart(10) +
      formatPct(s.hitRate).padStart(9) +
      formatPct(s.hitRateExcludingUnfilled).padStart(12) +
      formatBps(s.avgPnlBps).padStart(11),
  );
}

if (open.length) {
  console.log("\nOPEN CALLS");
  for (const o of open) {
    const mins = Math.max(0, Math.round((o.deadline - Date.now() / 1000) / 60));
    console.log(
      `  ${o.direction.toUpperCase().padEnd(5)} ${o.asset.padEnd(6)} ` +
        `@ ${o.refPrice.padEnd(12)} ${mins}m left  ${shortAddress(o.leader)}`,
    );
  }
}
