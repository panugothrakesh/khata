/**
 * Seeds Tiramisu with a synthetic Khata record.
 *
 * What this does, in order:
 *
 *   1. Derives one wallet per seed leader from the publisher key, so the whole
 *      cast is reproducible from a single secret and no extra keys exist to
 *      leak. Derivation is keccak256(masterKey ‖ handle).
 *   2. Tops each leader up with a little GLM from the publisher wallet.
 *   3. Every leader publishes every one of their calls, as real transactions.
 *   4. Calls destined to fill are settled straight away — a fill legitimately
 *      happens inside the window.
 *   5. The rest are left alone until their deadline has genuinely passed, and
 *      only then settled as `expired_unfilled`.
 *
 * Step 5 is why this script takes a couple of minutes rather than seconds. It
 * would be trivial to write the `expired_unfilled` receipts immediately, and
 * it would also be a lie: the entity would claim a deadline had passed while
 * the chain said otherwise, and anyone comparing `settledAt` against
 * `deadline` would catch it. The waiting is the honesty.
 */

import { concatHex, formatEther, keccak256, parseEther, stringToHex } from "viem";
import type { Hex } from "viem";
import {
  publisherPrivateKey,
  readClient,
  walletClientFor,
  txUrl,
  type WriteClient,
} from "../lib/arkiv/client";
import { publishSignal } from "../lib/arkiv/publish";
import { settleSignal } from "../lib/arkiv/settle";
import { fetchSignalByKey } from "../lib/arkiv/query";
import { manualResolver, unfilledResolver } from "../lib/execution/resolvers";
import { SEED_LEADERS, type SeedCall } from "./data/synthetic";

/** Minutes a seeded signal stays open. Short, so the script can outlast it. */
const SEED_TTL_MINUTES = 2;
/** GLM sent to each derived leader wallet. */
const TOPUP = parseEther("0.05");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function deriveLeaderKey(master: Hex, handle: string): Hex {
  return keccak256(concatHex([master, stringToHex(handle)]));
}

const master = publisherPrivateKey();
const pub = readClient();
const bank = walletClientFor(master);

console.log(`bank     ${bank.account.address}`);
const bankBalance = await pub.getBalance({ address: bank.account.address });
console.log(`balance  ${formatEther(bankBalance)} GLM\n`);

const needed = TOPUP * BigInt(SEED_LEADERS.length);
if (bankBalance < needed) {
  console.error(
    `Not enough GLM to seed: need about ${formatEther(needed)} to fund ` +
      `${SEED_LEADERS.length} leaders, have ${formatEther(bankBalance)}.\n` +
      `Claim testnet funds at https://hub.arkiv.network/faucet for ` +
      `${bank.account.address}.`,
  );
  process.exit(1);
}

/* 1 + 2 — derive and fund ------------------------------------------------- */

type Cast = { handle: string; client: WriteClient; calls: SeedCall[] };
const cast: Cast[] = [];

for (const leader of SEED_LEADERS) {
  const client = walletClientFor(deriveLeaderKey(master, leader.handle));
  const addr = client.account.address;
  const bal = await pub.getBalance({ address: addr });
  if (bal < TOPUP / 2n) {
    const hash = await bank.sendTransaction({ to: addr, value: TOPUP });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`funded   ${leader.handle.padEnd(17)} ${addr}`);
  } else {
    console.log(`funded   ${leader.handle.padEnd(17)} ${addr}  (already has ${formatEther(bal)})`);
  }
  cast.push({ handle: leader.handle, client, calls: leader.calls });
}

/* 3 — publish every call --------------------------------------------------- */

console.log("\npublishing signals");
type Pending = { handle: string; call: SeedCall; entityKey: Hex; client: WriteClient; deadline: number };
const pending: Pending[] = [];

for (const member of cast) {
  for (const call of member.calls) {
    const r = await publishSignal(
      {
        asset: call.asset,
        chain: call.chain,
        direction: call.direction,
        orderType: call.orderType,
        refPrice: call.refPrice,
        thesis: call.thesis,
        orderSpec: call.orderSpec,
        priceSource: "synthetic:seed-fixture",
        ttlMinutes: SEED_TTL_MINUTES,
      },
      member.client,
    );
    pending.push({
      handle: member.handle,
      call,
      entityKey: r.entityKey,
      client: member.client,
      deadline: r.deadline,
    });
    console.log(
      `  ${member.handle.padEnd(17)} ${call.direction.toUpperCase().padEnd(5)} ` +
        `${call.asset.padEnd(5)} ${r.entityKey.slice(0, 12)}…  ${txUrl(r.txHash)}`,
    );
  }
}

/* 4 — settle the fills now ------------------------------------------------- */

console.log("\nsettling executed calls");
const unfilled = pending.filter((p) => p.call.ending.kind === "unfilled");

for (const p of pending) {
  if (p.call.ending.kind !== "fill") continue;
  const signal = await fetchSignalByKey(p.entityKey, pub);
  if (!signal) {
    console.log(`  ! could not read back ${p.entityKey} — skipping`);
    continue;
  }
  const r = await settleSignal(
    signal,
    manualResolver(p.call.ending.exitPrice, p.call.ending.note),
    Math.floor(Date.now() / 1000),
    p.client,
  );
  console.log(
    `  ${p.handle.padEnd(17)} ${r.outcome.padEnd(16)} ${String(r.pnlBps).padStart(6)} bps  ${txUrl(r.txHash)}`,
  );
}

/* 5 — wait for the rest to genuinely expire, then settle ------------------- */

if (unfilled.length) {
  const latest = Math.max(...unfilled.map((p) => p.deadline));
  const waitMs = (latest - Math.floor(Date.now() / 1000) + 5) * 1000;
  if (waitMs > 0) {
    console.log(
      `\nwaiting ${Math.ceil(waitMs / 1000)}s for ${unfilled.length} calls to pass ` +
        `their deadline before recording them as unfilled`,
    );
    await sleep(waitMs);
  }

  console.log("\nsettling calls that were never executed");
  for (const p of unfilled) {
    const signal = await fetchSignalByKey(p.entityKey, pub);
    if (!signal) {
      console.log(`  ! ${p.entityKey.slice(0, 12)}… already pruned, cannot settle`);
      continue;
    }
    const r = await settleSignal(
      signal,
      unfilledResolver,
      Math.floor(Date.now() / 1000),
      p.client,
    );
    console.log(
      `  ${p.handle.padEnd(17)} ${r.outcome.padEnd(16)}  ${txUrl(r.txHash)}`,
    );
  }
}

console.log("\nseed complete. `npm run query` to read it back out of Arkiv.");
