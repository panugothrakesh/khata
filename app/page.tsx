"use client";

/**
 * The leaderboard.
 *
 * Every number on this page is computed in the browser from entities fetched
 * from Arkiv in this component. There is no API call to a Khata server,
 * because the deployment is a static export and no such server exists.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { readClient } from "../lib/arkiv/client";
import { fetchAllSettlements, fetchOpenSignals } from "../lib/arkiv/query";
import type { DecodedSettlement, DecodedSignal } from "../lib/arkiv/decode";
import {
  computeLeaderboard,
  formatBps,
  formatPct,
  shortAddress,
  type LeaderStats,
} from "../lib/leaderboard";
import { Foot, Masthead, SourceBar } from "../components/chrome";

export default function Home() {
  const [rows, setRows] = useState<LeaderStats[]>([]);
  const [open, setOpen] = useState<DecodedSignal[]>([]);
  const [settlements, setSettlements] = useState<DecodedSettlement[]>([]);
  const [block, setBlock] = useState<bigint | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = readClient();
        const [b, s, o] = await Promise.all([
          client.getBlockNumber(),
          fetchAllSettlements(client),
          fetchOpenSignals(undefined, client),
        ]);
        if (cancelled) return;
        setBlock(b);
        setSettlements(s);
        setRows(computeLeaderboard(s));
        setOpen(o.sort((x, y) => x.deadline - y.deadline));
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
  }, []);

  return (
    <div className="wrap">
      <Masthead>
        <p className="lede">
          Indian retail trading advice runs on Telegram and WhatsApp. A call
          goes out, and if it works there is a screenshot; if it does not, the
          message is deleted. The wins are evidence and the losses are not
          anything at all.{" "}
          <strong>
            Khata makes leaders publish the call before they execute it
          </strong>
          , to a ledger they do not control — so a call that quietly went
          nowhere is still there a year later, counted against them.
        </p>
      </Masthead>

      <SourceBar
        block={block}
        ok={state !== "error"}
        count={
          state === "loading"
            ? "…"
            : `${settlements.length} receipts, ${open.length} open`
        }
      />

      {state === "error" && (
        <>
          <h2 className="sec">Could not reach Arkiv</h2>
          <div className="err">{error}</div>
        </>
      )}

      <h2 className="sec">Leaderboard</h2>
      <p className="note">
        <strong>Honest</strong> is hits divided by every call published.{" "}
        <strong>Screenshot</strong> is what the same leader would show you if
        the calls that never executed were simply dropped — the number a
        Telegram channel posts. The gap between the two columns is the entire
        reason this project exists.
      </p>

      {state === "loading" && <div className="empty">Querying Arkiv…</div>}

      {state === "ok" && rows.length === 0 && (
        <div className="empty">
          No receipts on Arkiv yet.
          <br />
          Run <code>npm run seed</code> to write a synthetic record to Tiramisu.
        </div>
      )}

      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Leader</th>
              <th>Calls</th>
              <th>Hit</th>
              <th>Miss</th>
              <th>Never executed</th>
              <th>Honest</th>
              <th>Screenshot</th>
              <th>Avg move</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gap =
                r.hitRate !== null && r.hitRateExcludingUnfilled !== null
                  ? r.hitRateExcludingUnfilled - r.hitRate
                  : 0;
              return (
                <tr key={r.leader}>
                  <td className="addr">
                    <Link href={`/leader?address=${r.leader}`}>
                      {shortAddress(r.leader)}
                    </Link>
                    <span className="sub">
                      {r.assets.join(" · ")} on {r.chains.join(" · ")}
                    </span>
                  </td>
                  <td className="num">{r.total}</td>
                  <td className="num">{r.hits}</td>
                  <td className="num">{r.misses}</td>
                  <td className="num">
                    {r.unfilled > 0 ? (
                      <span className="pill unfilled">{r.unfilled}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="num honest">{formatPct(r.hitRate)}</td>
                  <td className="num">
                    <span className={gap > 0.001 ? "screenshot" : ""}>
                      {formatPct(r.hitRateExcludingUnfilled)}
                    </span>
                    {gap > 0.001 && (
                      <span className="sub gap">
                        +{Math.round(gap * 100)} pts of flattery
                      </span>
                    )}
                  </td>
                  <td
                    className={
                      "num " +
                      (r.avgPnlBps === null
                        ? ""
                        : r.avgPnlBps >= 0
                          ? "pos"
                          : "neg")
                    }
                  >
                    {formatBps(r.avgPnlBps)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h2 className="sec">Open calls</h2>
      <p className="note">
        Published, not yet settled, deadline still ahead. These entities carry a
        short Arkiv lifetime — a call with no deadline is unfalsifiable, so
        Khata does not allow one.
      </p>

      {state === "ok" && open.length === 0 && (
        <div className="empty">Nothing open right now.</div>
      )}

      <div className="cards">
        {open.map((s) => {
          const mins = Math.max(
            0,
            Math.round((s.deadline - Date.now() / 1000) / 60),
          );
          return (
            <div className="card" key={s.entityKey}>
              <div className="top">
                <div>
                  <div className="ttl">
                    <span className="dir">{s.direction.toUpperCase()}</span>{" "}
                    {s.asset}{" "}
                    <span className="meta">
                      @ {s.refPrice} · {s.chain} · {s.orderType}
                    </span>
                  </div>
                  <p className="thesis">{s.body.thesis}</p>
                </div>
                <span className="pill live">{mins}m left</span>
              </div>
              <div className="foot">
                <span>{s.body.orderSpec}</span>
                <Link href={`/leader?address=${s.creator}`}>
                  {shortAddress(s.creator)}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <Foot />
    </div>
  );
}
