/**
 * Settles signals whose deadline has passed.
 *
 * With no arguments it finds every settleable signal owned by the configured
 * wallet and records it as `expired_unfilled` — the keeper behaviour a real
 * deployment would run on a timer.
 *
 * With `--signal-key` and `--exit-price` it settles one call as executed,
 * using the manual resolver. That path exists for demos and stamps
 * `manual:operator-asserted` onto the receipt so the provenance is on the
 * record itself.
 */
import type { Hex } from "viem";
import { writeClient, txUrl } from "../lib/arkiv/client";
import { fetchSettleableSignals, fetchSignalByKey } from "../lib/arkiv/query";
import { settleSignal } from "../lib/arkiv/settle";
import { manualResolver, unfilledResolver } from "../lib/execution/resolvers";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : undefined;
}

const client = writeClient();
const me = client.account.address.toLowerCase();

const signalKey = flag("signal-key") as Hex | undefined;
const exitPrice = flag("exit-price");

if (signalKey) {
  if (!exitPrice) throw new Error("--signal-key requires --exit-price");
  const signal = await fetchSignalByKey(signalKey);
  if (!signal) throw new Error(`No live signal at ${signalKey}`);
  const r = await settleSignal(
    signal,
    manualResolver(exitPrice, flag("note") ?? "Outcome asserted by the operator."),
  );
  console.log(`settled ${r.signalId} as ${r.outcome} (${r.pnlBps} bps)`);
  console.log(`  method ${r.method}`);
  console.log(`  tx     ${txUrl(r.txHash)}`);
} else {
  const due = (await fetchSettleableSignals()).filter(
    (s) => s.creator.toLowerCase() === me,
  );
  if (due.length === 0) {
    console.log("No signals of yours are past their deadline.");
  }
  for (const signal of due) {
    const r = await settleSignal(signal, unfilledResolver);
    console.log(`${r.signalId}  ${r.outcome}  ${txUrl(r.txHash)}`);
  }
}
