/**
 * Publish one trading call to Arkiv, before any execution.
 *
 *   npm run publish-signal -- --asset WBTC --chain base --direction long \
 *     --ref-price 61240.50 --thesis "..." --ttl 30
 */
import { publishSignal } from "../lib/arkiv/publish";
import { txUrl, DATA_EXPLORER } from "../lib/arkiv/client";
import type { Direction, OrderType } from "../lib/arkiv/schema";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined || v.startsWith("--")) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required --${name}`);
  }
  return v;
}

const direction = arg("direction") as Direction;
if (direction !== "long" && direction !== "short") {
  throw new Error(`--direction must be long or short, got "${direction}"`);
}

const result = await publishSignal({
  asset: arg("asset"),
  chain: arg("chain", "base"),
  direction,
  orderType: arg("order-type", "twap_bracket") as OrderType,
  refPrice: arg("ref-price"),
  thesis: arg("thesis"),
  orderSpec: arg("order-spec", "TWAP 30m, SL -2.0%, TP +4.0%"),
  priceSource: arg("price-source", "operator-supplied"),
  ttlMinutes: Number(arg("ttl", "30")),
});

console.log("published signal");
console.log(`  signalId   ${result.signalId}`);
console.log(`  entityKey  ${result.entityKey}`);
console.log(`  leader     ${result.leader}`);
console.log(`  deadline   ${new Date(result.deadline * 1000).toISOString()}`);
console.log(`  expires at block ${result.expiresAtBlock}`);
console.log(`  tx         ${txUrl(result.txHash)}`);
console.log(`  entity     ${DATA_EXPLORER}/entity/${result.entityKey}`);
