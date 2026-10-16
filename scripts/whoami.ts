/**
 * Prints the configured publisher wallet and its balance.
 *
 * The first thing to run after cloning: it answers "is my key set up and does
 * it have gas" without writing anything.
 */
import { formatEther } from "viem";
import { readClient, writeClient, EXPLORER } from "../lib/arkiv/client";

const wallet = writeClient();
const pub = readClient();
const address = wallet.account.address;
const balance = await pub.getBalance({ address });

console.log(`publisher   ${address}`);
console.log(`chain       ${wallet.chain.name} (${wallet.chain.id})`);
console.log(`balance     ${formatEther(balance)} GLM`);
console.log(`block       ${await pub.getBlockNumber()}`);
console.log(`explorer    ${EXPLORER}/address/${address}`);

if (balance === 0n) {
  console.log(
    "\nNo GLM. Claim testnet funds at https://hub.arkiv.network/faucet " +
      "for the address above, then re-run this.",
  );
  process.exit(1);
}
