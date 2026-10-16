/**
 * Turning Arkiv entities back into Khata records.
 *
 * Arkiv hands back attributes as tagged values (`{ type: "u64", value: 1n }`).
 * Everything below is defensive on purpose: Tiramisu is a shared namespace and
 * `kind = str('khata.signal.v1')` is the only thing stopping another team's
 * entity from landing in a result set. An entity that claims to be ours but is
 * malformed is skipped, never coerced.
 */

import type { Attributes } from "@arkiv-network/sdk/attr";
import type { Hex } from "viem";
import {
  KIND_SETTLEMENT,
  KIND_SIGNAL,
  type Direction,
  type Outcome,
  type Settlement,
  type Signal,
} from "./schema";

function raw(attrs: Attributes, name: string): unknown {
  const a = (attrs as Record<string, { value: unknown } | undefined>)[name];
  return a?.value;
}

function asString(attrs: Attributes, name: string): string | null {
  const v = raw(attrs, name);
  return typeof v === "string" ? v : null;
}

function asNumber(attrs: Attributes, name: string): number | null {
  const v = raw(attrs, name);
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return null;
}

function asDecimalString(attrs: Attributes, name: string): string | null {
  const v = raw(attrs, name);
  if (typeof v === "string") return v;
  if (typeof v === "bigint" || typeof v === "number") return String(v);
  return null;
}

function asHex(attrs: Attributes, name: string): Hex | null {
  const v = raw(attrs, name);
  return typeof v === "string" && v.startsWith("0x") ? (v as Hex) : null;
}

const DIRECTIONS = new Set<string>(["long", "short"]);
const OUTCOMES = new Set<string>(["hit", "miss", "expired_unfilled"]);

/** JSON payloads are untrusted: a missing or wrong-typed field becomes "". */
function bodyString(body: unknown, field: string): string {
  if (typeof body !== "object" || body === null) return "";
  const v = (body as Record<string, unknown>)[field];
  return typeof v === "string" ? v : "";
}

/**
 * `creator` is the protocol's record of which wallet signed the transaction
 * that created the entity. It is set by the engine, is not writable, and
 * -- unlike `owner` -- cannot be transferred. It is therefore the only
 * trustworthy answer to "who made this call", and the leaderboard uses it in
 * preference to the self-declared `leader` attribute.
 */
export type DecodedSignal = Signal & { entityKey: Hex; creator: Hex };
export type DecodedSettlement = Settlement & { entityKey: Hex; creator: Hex };

export function decodeSignal(
  entityKey: Hex,
  creator: Hex,
  attrs: Attributes,
  payload: unknown,
): DecodedSignal | null {
  if (asString(attrs, "kind") !== KIND_SIGNAL) return null;

  const signalId = asString(attrs, "signalId");
  const leader = asHex(attrs, "leader");
  const asset = asString(attrs, "asset");
  const chain = asString(attrs, "chain");
  const direction = asString(attrs, "direction");
  const orderType = asString(attrs, "orderType");
  const createdAt = asNumber(attrs, "createdAt");
  const deadline = asNumber(attrs, "deadline");
  const refPrice = asDecimalString(attrs, "refPrice");

  if (
    !signalId || !leader || !asset || !chain || !orderType ||
    !direction || !DIRECTIONS.has(direction) ||
    createdAt === null || deadline === null || refPrice === null
  ) {
    return null;
  }

  return {
    entityKey,
    creator,
    signalId,
    leader,
    asset,
    chain,
    direction: direction as Direction,
    orderType: orderType as Signal["orderType"],
    createdAt,
    deadline,
    refPrice,
    body: {
      thesis: bodyString(payload, "thesis"),
      orderSpec: bodyString(payload, "orderSpec"),
      priceSource: bodyString(payload, "priceSource"),
    },
  };
}

export function decodeSettlement(
  entityKey: Hex,
  creator: Hex,
  attrs: Attributes,
  payload: unknown,
): DecodedSettlement | null {
  if (asString(attrs, "kind") !== KIND_SETTLEMENT) return null;

  const signalId = asString(attrs, "signalId");
  const signalKey = asHex(attrs, "signalKey");
  const leader = asHex(attrs, "leader");
  const asset = asString(attrs, "asset");
  const chain = asString(attrs, "chain");
  const direction = asString(attrs, "direction");
  const outcome = asString(attrs, "outcome");
  const settledAt = asNumber(attrs, "settledAt");
  const refPrice = asDecimalString(attrs, "refPrice");
  const exitPrice = asDecimalString(attrs, "exitPrice");
  const pnlBps = asNumber(attrs, "pnlBps");

  if (
    !signalId || !signalKey || !leader || !asset || !chain ||
    !direction || !DIRECTIONS.has(direction) ||
    !outcome || !OUTCOMES.has(outcome) ||
    settledAt === null || refPrice === null || exitPrice === null ||
    pnlBps === null
  ) {
    return null;
  }

  return {
    entityKey,
    creator,
    signalId,
    signalKey,
    leader,
    asset,
    chain,
    direction: direction as Direction,
    outcome: outcome as Outcome,
    settledAt,
    refPrice,
    exitPrice,
    pnlBps,
    body: {
      method: bodyString(payload, "method"),
      note: bodyString(payload, "note"),
      thesis: bodyString(payload, "thesis"),
      orderSpec: bodyString(payload, "orderSpec"),
    },
  };
}
