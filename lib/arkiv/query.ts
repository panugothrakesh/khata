/**
 * The read path.
 *
 * Every function here runs equally well in Node and in the browser, and none of
 * them touches a Khata server, because there isn't one. Arkiv's query engine is
 * the index. There is no subgraph, no Postgres mirror, no Redis cache, no
 * `/api/leaderboard` route — the deployed site ships these functions to the
 * client and the client talks to Tiramisu.
 *
 * That is not an architectural flourish; it is the point being demonstrated.
 * If Khata kept its own copy of the data, "the record cannot be quietly edited"
 * would be a claim about Khata's honesty rather than a property of the system.
 */

import { and, eq, gte, lte } from "@arkiv-network/sdk/query";
import type { ProjectedEntity, SelectQueryBuilder } from "@arkiv-network/sdk/query";
import { str, u64 } from "@arkiv-network/sdk/attr";
import type { Hex } from "viem";
import { readClient, type ReadClient } from "./client";
import {
  decodeSettlement,
  decodeSignal,
  type DecodedSettlement,
  type DecodedSignal,
} from "./decode";
import { KIND_SETTLEMENT, KIND_SIGNAL } from "./schema";

/** Arkiv caps a page at 200 entities. */
const PAGE = 200;

/**
 * A query's selection. We ask for the payload too: the thesis lives there and
 * the receipts view shows it. Selections are opt-in field by field, so this is
 * the honest cost of the view rather than a reflexive `SELECT *`.
 */
const FULL = {
  key: true,
  owner: true,
  attributes: true,
  payload: true,
} as const;

/** Exactly the shape `select(FULL)` returns, inferred rather than restated. */
type Row = ProjectedEntity<typeof FULL>;

/**
 * Walks every page of a query.
 *
 * Arkiv returns a cursor rather than an offset, so paging is a loop and not
 * arithmetic. `maxPages` is a seatbelt: this runs in a browser tab, and an
 * unbounded loop against a public RPC is a good way to get rate-limited.
 */
async function fetchAll(
  builder: SelectQueryBuilder<Row>,
  maxPages = 25,
): Promise<Row[]> {
  const out: Row[] = [];
  let page = await builder.limit(PAGE).fetch();
  let guard = 0;
  for (;;) {
    out.push(...page.entities);
    if (!page.hasNextPage() || ++guard >= maxPages) break;
    page = await page.next();
  }
  return out;
}

function safeJson(row: Row): unknown {
  // A payload that is not valid JSON is someone else's entity, or a bug. Either
  // way the decoder should see `null` rather than throw and kill the page.
  try {
    return row.toJson();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Every settlement ever written by Khata. This is the leaderboard's whole
 * input: the record is the outcomes, including the ones that went nowhere.
 */
export async function fetchAllSettlements(
  client: ReadClient = readClient(),
): Promise<DecodedSettlement[]> {
  const rows = await fetchAll(
    client.select(FULL).where(eq("kind", str(KIND_SETTLEMENT))),
  );
  return rows
    .map((r) => decodeSettlement(r.key, r.owner, r.attributes, safeJson(r)))
    .filter((s): s is DecodedSettlement => s !== null);
}

/** One leader's receipts, filtered server-side by indexed attribute. */
export async function fetchSettlementsByLeader(
  leader: Hex,
  client: ReadClient = readClient(),
): Promise<DecodedSettlement[]> {
  const rows = await fetchAll(
    client
      .select(FULL)
      .where(and(eq("kind", str(KIND_SETTLEMENT)), eq("leader", leader))),
  );
  return rows
    .map((r) => decodeSettlement(r.key, r.owner, r.attributes, safeJson(r)))
    .filter((s): s is DecodedSettlement => s !== null);
}

/**
 * Signals that are still open right now.
 *
 * Two filters do different jobs. Arkiv has already dropped anything past its
 * TTL, so a result here is a live entity by definition — but a signal's TTL
 * carries a grace window past its deadline so the settle path can still read
 * it. `deadline >= now` is therefore a business filter on top of the
 * protocol's, and it is a range query on an indexed `u64`, done by the node.
 */
export async function fetchOpenSignals(
  nowSeconds: number = Math.floor(Date.now() / 1000),
  client: ReadClient = readClient(),
): Promise<DecodedSignal[]> {
  const rows = await fetchAll(
    client
      .select(FULL)
      .where(
        and(eq("kind", str(KIND_SIGNAL)), gte("deadline", u64(BigInt(nowSeconds)))),
      ),
  );
  return rows
    .map((r) => decodeSignal(r.key, r.owner, r.attributes, safeJson(r)))
    .filter((s): s is DecodedSignal => s !== null);
}

/**
 * Signals whose deadline has passed but which are still inside their grace
 * window — exactly the set the settle path needs to act on.
 */
export async function fetchSettleableSignals(
  nowSeconds: number = Math.floor(Date.now() / 1000),
  client: ReadClient = readClient(),
): Promise<DecodedSignal[]> {
  const rows = await fetchAll(
    client
      .select(FULL)
      .where(
        and(eq("kind", str(KIND_SIGNAL)), lte("deadline", u64(BigInt(nowSeconds)))),
      ),
  );
  return rows
    .map((r) => decodeSignal(r.key, r.owner, r.attributes, safeJson(r)))
    .filter((s): s is DecodedSignal => s !== null);
}

/** All live signals regardless of deadline, for a leader's page. */
export async function fetchSignalsByLeader(
  leader: Hex,
  client: ReadClient = readClient(),
): Promise<DecodedSignal[]> {
  const rows = await fetchAll(
    client
      .select(FULL)
      .where(and(eq("kind", str(KIND_SIGNAL)), eq("leader", leader))),
  );
  return rows
    .map((r) => decodeSignal(r.key, r.owner, r.attributes, safeJson(r)))
    .filter((s): s is DecodedSignal => s !== null);
}

/** Browse by asset — the filter a follower actually reaches for. */
export async function fetchSettlementsByAsset(
  asset: string,
  client: ReadClient = readClient(),
): Promise<DecodedSettlement[]> {
  const rows = await fetchAll(
    client
      .select(FULL)
      .where(and(eq("kind", str(KIND_SETTLEMENT)), eq("asset", str(asset)))),
  );
  return rows
    .map((r) => decodeSettlement(r.key, r.owner, r.attributes, safeJson(r)))
    .filter((s): s is DecodedSettlement => s !== null);
}
