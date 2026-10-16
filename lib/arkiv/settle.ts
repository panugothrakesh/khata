/**
 * The settle path: turning an open call into a permanent receipt.
 *
 * One settlement per signal, always. A signal that filled gets a receipt; a
 * signal that nobody ever executed gets a receipt too, marked
 * `expired_unfilled`. The second kind is the one that makes the first kind
 * worth anything.
 *
 * The settlement deliberately copies the signal's thesis and order spec into
 * its own payload. That is denormalisation, and it is on purpose: the signal
 * expires in well under an hour, and a receipt that can only be read while its
 * signal is still alive is not a record of anything.
 */

import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk";
import type { Hex } from "viem";
import { writeClient, type WriteClient } from "./client";
import type { DecodedSignal } from "./decode";
import type { Resolver } from "../execution/resolvers";
import {
  SETTLEMENT_TTL_DAYS,
  settlementAttributes,
  type SettlementBody,
} from "./schema";

export type SettleResult = {
  signalId: string;
  signalKey: Hex;
  entityKey: Hex;
  txHash: Hex;
  outcome: string;
  pnlBps: number;
  method: string;
};

/**
 * Writes the receipt for one signal.
 *
 * Note what this function cannot do: it has no way to express "this call did
 * not happen". Every path through it writes an entity. The only question a
 * resolver answers is *which* outcome, never *whether* to record one.
 */
export async function settleSignal(
  signal: DecodedSignal,
  resolver: Resolver,
  now: number = Math.floor(Date.now() / 1000),
  client: WriteClient = writeClient(),
): Promise<SettleResult> {
  const leader = client.account.address as Hex;

  if (leader.toLowerCase() !== signal.leader.toLowerCase()) {
    // Arkiv would not stop us writing this -- anyone can create an entity
    // claiming any `leader` attribute. The leaderboard defends against that by
    // trusting `$creator` over the attribute (see lib/leaderboard.ts), but
    // writing junk in the first place helps nobody.
    throw new Error(
      `Refusing to settle: signal belongs to ${signal.leader}, but the ` +
        `configured wallet is ${leader}.`,
    );
  }

  const resolved = await resolver.resolve(signal, now);

  const body: SettlementBody = {
    method: resolver.method,
    note: resolved.note,
    thesis: signal.body.thesis,
    orderSpec: signal.body.orderSpec,
  };

  const { entityKey, txHash } = await client.createEntity({
    payload: jsonToPayload(body),
    contentType: "application/json",
    attributes: settlementAttributes({
      leader,
      signalId: signal.signalId,
      signalKey: signal.entityKey,
      asset: signal.asset,
      chain: signal.chain,
      direction: signal.direction,
      outcome: resolved.outcome,
      settledAt: now,
      refPrice: signal.refPrice,
      exitPrice: resolved.exitPrice,
      pnlBps: resolved.pnlBps,
    }),
    expires: ExpirationTime.fromDays(SETTLEMENT_TTL_DAYS),
  });

  return {
    signalId: signal.signalId,
    signalKey: signal.entityKey,
    entityKey,
    txHash,
    outcome: resolved.outcome,
    pnlBps: resolved.pnlBps,
    method: resolver.method,
  };
}
