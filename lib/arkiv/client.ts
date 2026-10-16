/**
 * Arkiv clients.
 *
 * Two of them, and the split matters:
 *
 *   readClient  — no account, no key, no server. The browser builds one of
 *                 these and queries Tiramisu directly. This is the whole
 *                 "no indexer" claim in one function: there is no Khata
 *                 backend between a reader and the data.
 *
 *   writeClient — needs a private key, so it exists only in the CLI scripts.
 *                 It is never constructed in anything that ships to a browser.
 */

import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

/**
 * Overridable so the same code can point at a local Arkiv node, but defaulting
 * to the public Tiramisu RPC the SDK already knows about.
 */
export function rpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ARKIV_RPC_URL ??
    tiramisu.rpcUrls.default.http[0]
  );
}

export function readClient() {
  return createPublicClient({ chain: tiramisu, transport: http(rpcUrl()) });
}

export type ReadClient = ReturnType<typeof readClient>;

/**
 * Only ever called from `scripts/`. Throws loudly rather than falling back to
 * a default key, because a silent fallback is how test keys end up in git.
 */
export function writeClient() {
  const pk = process.env.KHATA_PUBLISHER_PRIVATE_KEY;
  if (!pk) {
    throw new Error(
      "KHATA_PUBLISHER_PRIVATE_KEY is not set. Copy .env.example to .env and " +
        "put a funded Tiramisu testnet key in it. Never commit that file.",
    );
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error(
      "KHATA_PUBLISHER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.",
    );
  }
  if (/^0x0+$/.test(pk)) {
    throw new Error(
      "KHATA_PUBLISHER_PRIVATE_KEY is still the placeholder from .env.example.",
    );
  }
  const account = privateKeyToAccount(pk as Hex);
  return createWalletClient({
    account,
    chain: tiramisu,
    transport: http(rpcUrl()),
  });
}

export const EXPLORER = "https://tiramisu.explorer.arkiv.network";
export const DATA_EXPLORER = "https://data.arkiv.network";

export function txUrl(hash: Hex): string {
  return `${EXPLORER}/tx/${hash}`;
}
