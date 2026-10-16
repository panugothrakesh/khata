"use client";

/**
 * One leader's receipts: every call they ever published, including the ones
 * that expired without ever being executed.
 *
 * A plain query-string route rather than a dynamic segment, because the site
 * is a static export and the set of leader addresses is not knowable at build
 * time. Any address on the chain works, whether or not it existed when this
 * page was built — which is itself the point.
 */

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Hex } from "viem";
import { DATA_EXPLORER, readClient } from "../../lib/arkiv/client";
import {
  fetchSettlementsByLeader,
  fetchSignalsByLeader,
} from "../../lib/arkiv/query";
import type { DecodedSettlement, DecodedSignal } from "../../lib/arkiv/decode";
import {
  computeLeaderboard,
  formatBps,
  formatPct,
  shortAddress,
} from "../../lib/leaderboard";
import { Foot, Masthead, SourceBar } from "../../components/chrome";

const OUTCOME_LABEL: Record<string, string> = {
  hit: "hit",
  miss: "miss",
  expired_unfilled: "never executed",
};

function Receipts() {
  const params = useSearchParams();
  const address = (params.get("address") ?? "") as Hex;

  const [settlements, setSettlements] = useState<DecodedSettlement[]>([]);
  const [open, setOpen] = useState<DecodedSignal[]>([]);
  const [block, setBlock] = useState<bigint | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      setError("No valid ?address= in the URL.");
      setState("error");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const client = readClient();
        const [b, s, sig] = await Promise.all([
          client.getBlockNumber(),
          fetchSettlementsByLeader(address, client),
          fetchSignalsByLeader(address, client),
        ]);
        if (cancelled) return;
        setBlock(b);
        setSettlements(s.sort((a, c) => c.settledAt - a.settledAt));
        setOpen(sig.filter((x) => x.deadline > Date.now() / 1000));
        setState("ok");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const stats = computeLeaderboard(settlements)[0];

  return (
    <div className="wrap">
      <Masthead>
        <p className="lede" style={{ marginBottom: 10 }}>
          <Link className="back" href="/">
            ← leaderboard
          </Link>
        </p>
        <p className="lede">
          Every call{" "}
          <span className="addr">{address ? shortAddress(address) : "—"}</span>{" "}
          has published. <strong>Including the ones that went nowhere</strong>,
          which is the part a screenshot can never show you.
        </p>
      </Masthead>

      <SourceBar
        block={block}
        ok={state !== "error"}
        count={state === "loading" ? "…" : `${settlements.length} receipts`}
      />

      {state === "error" && (
        <>
          <h2 className="sec">Could not load this leader</h2>
          <div className="err">{error}</div>
        </>
      )}

      {stats && (
        <>
          <h2 className="sec">Record</h2>
          <table>
            <thead>
              <tr>
                <th>Calls published</th>
                <th>Hit</th>
                <th>Miss</th>
                <th>Never executed</th>
                <th>Honest hit rate</th>
                <th>Screenshot hit rate</th>
                <th>Avg move</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num">{stats.total}</td>
                <td className="num">{stats.hits}</td>
                <td className="num">{stats.misses}</td>
                <td className="num">{stats.unfilled}</td>
                <td className="num honest">{formatPct(stats.hitRate)}</td>
                <td className="num screenshot">
                  {formatPct(stats.hitRateExcludingUnfilled)}
                </td>
                <td
                  className={
                    "num " +
                    (stats.avgPnlBps === null
                      ? ""
                      : stats.avgPnlBps >= 0
                        ? "pos"
                        : "neg")
                  }
                >
                  {formatBps(stats.avgPnlBps)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {open.length > 0 && (
        <>
          <h2 className="sec">Open right now</h2>
          <div className="cards">
            {open.map((s) => (
              <div className="card" key={s.entityKey}>
                <div className="top">
                  <div className="ttl">
                    <span className="dir">{s.direction.toUpperCase()}</span>{" "}
                    {s.asset}{" "}
                    <span className="meta">@ {s.refPrice} · {s.chain}</span>
                  </div>
                  <span className="pill live">open</span>
                </div>
                <p className="thesis">{s.body.thesis}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="sec">Receipts</h2>
      <p className="note">
        One per call, written after the fact and never edited. Each says how its
        outcome was decided — Khata v0 does not execute trades, so nothing here
        claims a venue fill.
      </p>

      {state === "loading" && <div className="empty">Querying Arkiv…</div>}
      {state === "ok" && settlements.length === 0 && (
        <div className="empty">This address has published nothing.</div>
      )}

      <div className="cards">
        {settlements.map((s) => (
          <div className="card" key={s.entityKey}>
            <div className="top">
              <div>
                <div className="ttl">
                  <span className="dir">{s.direction.toUpperCase()}</span>{" "}
                  {s.asset}{" "}
                  <span className="meta">
                    {s.refPrice} → {s.exitPrice} · {s.chain}
                  </span>
                </div>
                <p className="thesis">{s.body.thesis}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className={`pill ${s.outcome === "expired_unfilled" ? "unfilled" : s.outcome}`}>
                  {OUTCOME_LABEL[s.outcome] ?? s.outcome}
                </span>
                <div
                  className={
                    "num sub " +
                    (s.outcome === "expired_unfilled"
                      ? ""
                      : s.pnlBps >= 0
                        ? "pos"
                        : "neg")
                  }
                >
                  {s.outcome === "expired_unfilled" ? "no position" : formatBps(s.pnlBps)}
                </div>
              </div>
            </div>
            <div className="foot">
              <span>{s.body.orderSpec}</span>
              <span>resolved by {s.body.method}</span>
              <span>{new Date(s.settledAt * 1000).toISOString().replace("T", " ").slice(0, 16)}</span>
              <a
                href={`${DATA_EXPLORER}/entity/${s.entityKey}`}
                target="_blank"
                rel="noreferrer"
              >
                receipt ↗
              </a>
              <a
                href={`${DATA_EXPLORER}/entity/${s.signalKey}`}
                target="_blank"
                rel="noreferrer"
              >
                original call ↗
              </a>
            </div>
          </div>
        ))}
      </div>

      <Foot />
    </div>
  );
}

export default function LeaderPage() {
  return (
    <Suspense fallback={<div className="wrap">Loading…</div>}>
      <Receipts />
    </Suspense>
  );
}
