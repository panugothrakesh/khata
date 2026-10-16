/**
 * The write path: a leader publishes a call *before* it is executed.
 *
 * Ordering is the entire product. A call published after the fact is a
 * screenshot; a call published before the fact, to a ledger its author cannot
 * rewrite, is a prediction. Everything Khata claims rests on the signal
 * entity existing on Tiramisu at a block height that precedes its outcome.
 *
 * Authorship needs no application-level signature. Creating an Arkiv entity is
 * an Ethereum transaction, so the leader's wallet has already signed the write,
 * and the protocol records the signer as `$creator` — an attribute no one,
 * including the owner, can set or change afterwards. A second signature stored
 * in the payload would be weaker than the one already there, and would invite
 * a reader to verify the wrong thing.
 */

import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk";
import type { Hex } from "viem";
import { writeClient, type WriteClient } from "./client";
import {
  SIGNAL_GRACE_MINUTES,
  SIGNAL_TTL_MINUTES,
  signalAttributes,
  type Direction,
  type OrderType,
  type SignalBody,
} from "./schema";

export type PublishSignalInput = {
  asset: string;
  chain: string;
  direction: Direction;
  orderType: OrderType;
  /** Reference price at publish time, as a decimal string. */
  refPrice: string;
  thesis: string;
  orderSpec: string;
  priceSource: string;
  /** Minutes until the call's own deadline. Defaults to the schema's TTL. */
  ttlMinutes?: number;
};

export type PublishedSignal = {
  signalId: string;
  entityKey: Hex;
  txHash: Hex;
  leader: Hex;
  deadline: number;
  /** Block height at which Arkiv will prune the signal. */
  expiresAtBlock: bigint;
};

/**
 * A signal id that is unique without a coordinator.
 *
 * Deliberately not a hash of the contents: two leaders may legitimately make
 * the identical call in the same second, and collapsing those into one id would
 * silently merge two people's records. Leader address plus timestamp plus
 * randomness keeps them distinct, and keeps the id readable in a URL.
 */
export function mintSignalId(leader: Hex, atSeconds: number): string {
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `${leader.slice(2, 10).toLowerCase()}-${atSeconds}-${rand}`;
}

export async function publishSignal(
  input: PublishSignalInput,
  client: WriteClient = writeClient(),
): Promise<PublishedSignal> {
  const leader = client.account.address as Hex;

  const createdAt = Math.floor(Date.now() / 1000);
  const ttlMinutes = input.ttlMinutes ?? SIGNAL_TTL_MINUTES;
  const deadline = createdAt + ttlMinutes * 60;
  const signalId = mintSignalId(leader, createdAt);

  const body: SignalBody = {
    thesis: input.thesis,
    orderSpec: input.orderSpec,
    priceSource: input.priceSource,
  };

  const { entityKey, txHash, expiresAt } = await client.createEntity({
    payload: jsonToPayload(body),
    contentType: "application/json",
    attributes: signalAttributes({
      leader,
      signalId,
      asset: input.asset,
      chain: input.chain,
      direction: input.direction,
      orderType: input.orderType,
      createdAt,
      deadline,
      refPrice: input.refPrice,
    }),
    // The entity outlives the call's deadline by a grace window, so the settle
    // path can still read the signal back when it goes to write the receipt.
    // Without this the signal would vanish at exactly the moment it is needed.
    expires: ExpirationTime.fromMinutes(ttlMinutes + SIGNAL_GRACE_MINUTES),
  });

  return { signalId, entityKey, txHash, leader, deadline, expiresAtBlock: expiresAt };
}
