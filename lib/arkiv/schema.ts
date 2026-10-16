/**
 * Khata's Arkiv entity schema.
 *
 * Two entity types, deliberately asymmetric:
 *
 *   signal      — the pre-execution trading call. Short-lived. It is working
 *                 state: a claim that is currently open. Once its deadline
 *                 passes it has no further job to do, so it is allowed to
 *                 expire off the query surface.
 *
 *   settlement  — the permanent receipt. Long-lived. Written once per signal,
 *                 saying what became of it: filled, or expired without ever
 *                 being executed.
 *
 * The asymmetry is the whole point. A track record is not a list of open
 * positions; it is a list of outcomes, and it is only honest if the outcomes
 * that went nowhere are in it too. So settlements outlive signals by three
 * orders of magnitude, and a settlement carries enough of its signal to stand
 * on its own after the signal it refers to is gone.
 *
 * Every attribute named here is a queryable, indexed Arkiv attribute. Anything
 * that is not in this file lives in the entity payload and cannot be filtered
 * on — see `arkiv/schema.md` for why each field landed where it did.
 */

import { addr, dec, i32, key, str, u64 } from "@arkiv-network/sdk/attr";
import type { AttributeInputs } from "@arkiv-network/sdk/attr";
import type { Hex } from "viem";

/** Bumped when the attribute set changes shape. Queries pin it. */
export const SCHEMA_VERSION = 1;

/**
 * Discriminators. Every Khata entity carries `kind`, and every query filters on
 * it, because an Arkiv DB-chain is a shared namespace: Tiramisu holds every
 * other team's entities too. `kind` is what makes "all Khata signals" a
 * meaningful set.
 */
export const KIND_SIGNAL = "khata.signal.v1";
export const KIND_SETTLEMENT = "khata.settlement.v1";

export type Direction = "long" | "short";

/**
 * The order type the leader *intended* at publish time.
 *
 * In v0 this is a declared intent only — Khata does not execute. It is recorded
 * because a track record that hides what kind of order was meant is not a track
 * record: "long WBTC" judged as a spot entry and "long WBTC via a TWAP with a
 * 2% stop" are different claims. See `lib/execution/README.md` for the seam
 * where a real execution venue plugs in.
 */
export type OrderType = "spot" | "twap" | "twap_bracket" | "limit";

/** What happened to a signal. There is no fourth option, and no way to not have one. */
export type Outcome =
  /** Executed, and the call was right. */
  | "hit"
  /** Executed, and the call was wrong. */
  | "miss"
  /** Never executed. The deadline passed with no fill. Counts against the leader. */
  | "expired_unfilled";

export type Settled = {
  outcome: Outcome;
  /** Signed basis points of move in the direction called. Negative means wrong. */
  pnlBps: number;
};

/** The fields of a signal that are indexed and therefore filterable. */
export type SignalFacts = {
  leader: Hex;
  signalId: string;
  asset: string;
  chain: string;
  direction: Direction;
  orderType: OrderType;
  /** Unix seconds. When the call was made. */
  createdAt: number;
  /** Unix seconds. The call's own deadline — distinct from the entity's TTL. */
  deadline: number;
  /** Reference price at publish, as a decimal string. */
  refPrice: string;
};

/** The parts of a signal that are not filterable and live in the payload. */
export type SignalBody = {
  /** The leader's reasoning, in their own words. Free text, never indexed. */
  thesis: string;
  /** Human-readable rendering of the intended order, e.g. "TWAP 30m, SL -2%, TP +4%". */
  orderSpec: string;
  /** Where refPrice came from, so a reader can check it. */
  priceSource: string;
};

export type Signal = SignalFacts & { body: SignalBody };

export type SettlementFacts = {
  leader: Hex;
  signalId: string;
  /** The Arkiv entity key of the signal this settles. */
  signalKey: Hex;
  asset: string;
  chain: string;
  direction: Direction;
  outcome: Outcome;
  /** Unix seconds. */
  settledAt: number;
  refPrice: string;
  /** Decimal string. Equal to refPrice when the call never filled. */
  exitPrice: string;
  pnlBps: number;
};

export type SettlementBody = {
  /** How the outcome was determined. Never a claim of real execution in v0. */
  method: string;
  /** Free-text note, e.g. why a call went unfilled. */
  note: string;
  /** Copy of the signal's thesis, so the receipt survives the signal's expiry. */
  thesis: string;
  orderSpec: string;
};

export type Settlement = SettlementFacts & { body: SettlementBody };

/* -------------------------------------------------------------------------- */
/* Attribute encoding                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Arkiv caps string attributes at 128 bytes. Asset symbols and chain names are
 * far shorter, but a signalId is ours to generate, so it is bounded here rather
 * than discovered at write time.
 */
export const MAX_SIGNAL_ID_BYTES = 64;

export function assertValidSignalId(signalId: string): void {
  const bytes = new TextEncoder().encode(signalId).length;
  if (bytes === 0 || bytes > MAX_SIGNAL_ID_BYTES) {
    throw new Error(
      `signalId must be 1..${MAX_SIGNAL_ID_BYTES} bytes, got ${bytes} (${signalId})`,
    );
  }
}

/**
 * Prices are decimals and must stay range-queryable, so they are `dec` and not
 * `str`. Arkiv's own docs call this out as the classic mistake: a number stored
 * as a string compares lexicographically, so "9" > "10" and every range filter
 * silently returns the wrong set.
 */
export function signalAttributes(s: SignalFacts): AttributeInputs {
  assertValidSignalId(s.signalId);
  return {
    kind: str(KIND_SIGNAL),
    v: i32(SCHEMA_VERSION),
    signalId: str(s.signalId),
    leader: addr(s.leader),
    asset: str(s.asset),
    chain: str(s.chain),
    direction: str(s.direction),
    orderType: str(s.orderType),
    createdAt: u64(BigInt(s.createdAt)),
    deadline: u64(BigInt(s.deadline)),
    refPrice: dec(s.refPrice),
  };
}

export function settlementAttributes(s: SettlementFacts): AttributeInputs {
  assertValidSignalId(s.signalId);
  return {
    kind: str(KIND_SETTLEMENT),
    v: i32(SCHEMA_VERSION),
    signalId: str(s.signalId),
    signalKey: key(s.signalKey),
    leader: addr(s.leader),
    asset: str(s.asset),
    chain: str(s.chain),
    direction: str(s.direction),
    outcome: str(s.outcome),
    settledAt: u64(BigInt(s.settledAt)),
    refPrice: dec(s.refPrice),
    exitPrice: dec(s.exitPrice),
    // Signed, so i32 rather than u64: a losing call is a negative number and
    // must stay orderable against winning ones.
    pnlBps: i32(s.pnlBps),
  };
}

/* -------------------------------------------------------------------------- */
/* Lifetimes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A trading call with an open-ended deadline is unfalsifiable: "BTC to 100k"
 * is right eventually. Khata's signals are short by construction, and the
 * entity's TTL is set to the call's own deadline plus a settlement grace
 * window, so the data cannot outlive the claim by much.
 */
export const SIGNAL_TTL_MINUTES = 30;

/**
 * Grace period after the deadline during which the signal entity is still
 * readable, so the settle path can read it back and copy its contents into the
 * receipt before it vanishes.
 */
export const SIGNAL_GRACE_MINUTES = 10;

/**
 * Receipts are the product. One year, extended by a keeper, rather than
 * `ExpirationTime.permanent()` — see `arkiv/schema.md` for why we do not claim
 * a permanence the protocol prices by the block.
 */
export const SETTLEMENT_TTL_DAYS = 365;
