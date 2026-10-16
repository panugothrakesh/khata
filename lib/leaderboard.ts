/**
 * The leaderboard, computed from nothing but Arkiv entities.
 *
 * There is no stored ranking. Hand this function the settlements a query
 * returned and it produces the table; the only state is the chain's. That is
 * why the numbers can be checked: a reader who distrusts the site can run the
 * same query and get the same table, and a reader who distrusts the *maths*
 * can read this file.
 *
 * Two rules do the real work:
 *
 *   1. Unfilled calls count. `expired_unfilled` is in the denominator of the
 *      hit rate. A leader who publishes forty calls, executes the six that
 *      were going well and lets thirty-four lapse has a hit rate of 15%, not
 *      100%, and this is the function that says so.
 *
 *   2. Authorship comes from `$creator`, not from the payload. Anyone can
 *      write an entity whose `leader` attribute names someone else. Those are
 *      dropped rather than counted against the person they name.
 */

import type { DecodedSettlement } from "./arkiv/decode";
import type { Hex } from "viem";

export type LeaderStats = {
  leader: Hex;
  /** Every settled call, including the ones that never executed. */
  total: number;
  hits: number;
  misses: number;
  /** Published, never executed, deadline passed. */
  unfilled: number;
  /**
   * hits / total, where total includes unfilled calls.
   * A number between 0 and 1, or null when there is nothing to rate.
   */
  hitRate: number | null;
  /**
   * What the hit rate would look like if unfilled calls were quietly dropped —
   * the number a screenshot-based track record would show. Displayed next to
   * the real one, because the gap between them is the product.
   */
  hitRateExcludingUnfilled: number | null;
  /** Mean signed basis points across executed calls only. */
  avgPnlBps: number | null;
  /** Unix seconds of the most recent settlement. */
  lastSettledAt: number;
  assets: string[];
  chains: string[];
};

/**
 * Discards settlements whose self-declared `leader` does not match the wallet
 * that actually signed them into existence.
 *
 * Without this, forging a rival's track record costs one testnet transaction.
 */
export function rejectForgedSettlements(
  settlements: readonly DecodedSettlement[],
): DecodedSettlement[] {
  return settlements.filter(
    (s) => s.leader.toLowerCase() === s.creator.toLowerCase(),
  );
}

/**
 * A leader could settle the same signal twice, keeping whichever receipt
 * flattered them. Entities are immutable once written and both would be
 * visible, so the fix is a rule rather than a deletion: the *first* settlement
 * for a signal is the one that counts, and later ones are ignored.
 */
export function dedupeBySignal(
  settlements: readonly DecodedSettlement[],
): DecodedSettlement[] {
  const first = new Map<string, DecodedSettlement>();
  for (const s of settlements) {
    const id = `${s.creator.toLowerCase()}:${s.signalId}`;
    const existing = first.get(id);
    if (!existing || s.settledAt < existing.settledAt) first.set(id, s);
  }
  return [...first.values()];
}

export function computeLeaderboard(
  settlements: readonly DecodedSettlement[],
): LeaderStats[] {
  const clean = dedupeBySignal(rejectForgedSettlements(settlements));

  const byLeader = new Map<string, DecodedSettlement[]>();
  for (const s of clean) {
    const k = s.creator.toLowerCase();
    const list = byLeader.get(k);
    if (list) list.push(s);
    else byLeader.set(k, [s]);
  }

  const stats: LeaderStats[] = [];
  for (const rows of byLeader.values()) {
    const first = rows[0];
    if (!first) continue;

    const hits = rows.filter((r) => r.outcome === "hit").length;
    const misses = rows.filter((r) => r.outcome === "miss").length;
    const unfilled = rows.filter((r) => r.outcome === "expired_unfilled").length;
    const total = rows.length;
    const executed = hits + misses;

    const pnlSum = rows
      .filter((r) => r.outcome !== "expired_unfilled")
      .reduce((a, r) => a + r.pnlBps, 0);

    stats.push({
      leader: first.creator,
      total,
      hits,
      misses,
      unfilled,
      hitRate: total === 0 ? null : hits / total,
      hitRateExcludingUnfilled: executed === 0 ? null : hits / executed,
      avgPnlBps: executed === 0 ? null : Math.round(pnlSum / executed),
      lastSettledAt: rows.reduce((a, r) => Math.max(a, r.settledAt), 0),
      assets: [...new Set(rows.map((r) => r.asset))].sort(),
      chains: [...new Set(rows.map((r) => r.chain))].sort(),
    });
  }

  // Most-called first, then by honest hit rate. Ranking by hit rate alone would
  // put a leader with one lucky call at the top of the table.
  return stats.sort(
    (a, b) => b.total - a.total || (b.hitRate ?? 0) - (a.hitRate ?? 0),
  );
}

export function formatPct(x: number | null): string {
  return x === null ? "—" : `${(x * 100).toFixed(0)}%`;
}

export function formatBps(x: number | null): string {
  if (x === null) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x} bps`;
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
