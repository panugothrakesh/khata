"use client";

import Link from "next/link";
import { DATA_EXPLORER, EXPLORER, rpcUrl } from "../lib/arkiv/client";

export function Masthead({ children }: { children?: React.ReactNode }) {
  return (
    <header className="masthead">
      <div className="brand">
        <h1>
          Khata <span className="deva">खाता</span>
        </h1>
        <span className="tag">a tamper-evident ledger for trading calls</span>
      </div>
      {children}
    </header>
  );
}

/**
 * Shown on every page on purpose. The claim Khata makes is "you do not have to
 * trust this website", and the way to make that real is to put the RPC
 * endpoint and the block height on screen so a reader can go and check.
 */
export function SourceBar({
  block,
  ok,
  count,
}: {
  block: bigint | null;
  ok: boolean;
  count: string;
}) {
  return (
    <div className="src">
      <span className={ok ? "dot" : "dot off"} />
      <b>source</b> {rpcUrl().replace("https://", "")}
      <b>chain</b> tiramisu / 7738577
      <b>block</b> {block === null ? "…" : block.toString()}
      <b>read</b> {count}
      <span style={{ marginLeft: "auto" }}>
        <a href={EXPLORER} target="_blank" rel="noreferrer">
          block explorer
        </a>
        {" · "}
        <a href={DATA_EXPLORER} target="_blank" rel="noreferrer">
          entity explorer
        </a>
      </span>
    </div>
  );
}

export function Foot() {
  return (
    <footer>
      Khata v0 records trading calls. It does <strong>not</strong> execute them:
      every outcome on this page was resolved by a reference price or asserted
      by an operator, and each receipt carries the method that produced it. All
      data shown is synthetic, written to the Arkiv Tiramisu testnet for
      demonstration.
      <br />
      <Link href="/">leaderboard</Link> · <a
        href="https://github.com/"
        target="_blank"
        rel="noreferrer"
      >
        source (MIT)
      </a>{" "}
      · built on <a href="https://arkiv.network" target="_blank" rel="noreferrer">Arkiv</a>
    </footer>
  );
}
