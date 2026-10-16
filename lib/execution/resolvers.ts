/**
 * v0 outcome resolvers.
 *
 * Read `lib/execution/README.md` first. In short: nothing here executes a
 * trade, and nothing here is allowed to produce a settlement that *looks* like
 * it did. Every resolver stamps a `method` onto the receipt that says plainly
 * how the number was arrived at.
 */

import type { DecodedSignal } from "../arkiv/decode";
import type { Outcome } from "../arkiv/schema";

export type ResolvedOutcome = {
  outcome: Outcome;
  exitPrice: string;
  pnlBps: number;
  note: string;
};

export type Resolver = {
  /** Recorded verbatim in the settlement payload. Must never imply a real fill. */
  method: string;
  resolve(signal: DecodedSignal, now: number): Promise<ResolvedOutcome>;
};

/**
 * Basis points of move, signed by the direction that was called.
 *
 * A short that went down is a positive number here. This is the only place the
 * direction is applied, so a sign error shows up in one spot rather than in
 * every consumer.
 */
export function pnlBasisPoints(
  refPrice: string,
  exitPrice: string,
  direction: "long" | "short",
): number {
  const ref = Number(refPrice);
  const exit = Number(exitPrice);
  if (!Number.isFinite(ref) || !Number.isFinite(exit) || ref === 0) return 0;
  const raw = ((exit - ref) / ref) * 10_000;
  return Math.round(direction === "long" ? raw : -raw);
}

/**
 * Resolver 1 — the call was never executed.
 *
 * This is the case Khata exists to record, so it is a first-class resolver and
 * not an error path. The exit price is the reference price because nothing
 * moved: no position was ever taken.
 */
export const unfilledResolver: Resolver = {
  method: "no-execution:deadline-passed",
  async resolve(signal): Promise<ResolvedOutcome> {
    return {
      outcome: "expired_unfilled",
      exitPrice: signal.refPrice,
      pnlBps: 0,
      note:
        "The call's deadline passed with no execution recorded against it. " +
        "Counted as a miss in the leader's hit rate.",
    };
  },
};

/**
 * Resolver 2 — a human asserts the outcome.
 *
 * Used for seeding and for demos. The method string says "operator-asserted"
 * so that no reader, and no judge, can mistake it for a venue fill.
 */
export function manualResolver(exitPrice: string, note: string): Resolver {
  return {
    method: "manual:operator-asserted",
    async resolve(signal): Promise<ResolvedOutcome> {
      const pnlBps = pnlBasisPoints(signal.refPrice, exitPrice, signal.direction);
      return {
        outcome: pnlBps >= 0 ? "hit" : "miss",
        exitPrice,
        pnlBps,
        note,
      };
    },
  };
}

/**
 * Resolver 3 — a public spot price decides it.
 *
 * Still not an execution: it answers "was the call directionally right by the
 * deadline", which is a weaker claim than "this order filled at this price",
 * and the method string records which feed was asked.
 */
export function referencePriceResolver(
  fetchPrice: (asset: string) => Promise<string | null>,
  source: string,
): Resolver {
  return {
    method: `reference-price:${source}`,
    async resolve(signal): Promise<ResolvedOutcome> {
      const exitPrice = await fetchPrice(signal.asset);
      if (exitPrice === null) {
        // No price means no judgement. Falling back to "hit" here would be
        // the single most dishonest line of code in the project.
        return unfilledResolver.resolve(signal, 0);
      }
      const pnlBps = pnlBasisPoints(signal.refPrice, exitPrice, signal.direction);
      return {
        outcome: pnlBps >= 0 ? "hit" : "miss",
        exitPrice,
        pnlBps,
        note: `Directional outcome judged against the ${source} spot price at the deadline.`,
      };
    },
  };
}
