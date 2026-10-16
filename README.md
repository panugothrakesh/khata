# Khata — खाता

**A tamper-evident ledger for trading calls.** Leaders publish a call *before*
they execute it, to a database they do not control. Calls that quietly went
nowhere stay on the record permanently, counted against them.

Built on [Arkiv](https://arkiv.network). MIT licensed.

| | |
|---|---|
| **Live deployment** | https://panugothrakesh.github.io/khata/ |
| **Schema** | [`arkiv/schema.md`](arkiv/schema.md) |
| **Friction report** | [`arkiv/friction.md`](arkiv/friction.md) |
| **Chain** | Arkiv Tiramisu testnet, id `7738577` |

> **This is v0 and it does not execute trades.** Every outcome shown was
> resolved by a reference price or asserted by an operator, and each receipt
> records on-chain which method produced it. Nothing in this repository claims
> a venue fill. See [the execution seam](lib/execution/README.md).
>
> **All data is synthetic.** The leaders are invented, the wallets are derived
> from a local test key, and no real person, handle, channel or trading call
> appears anywhere in this repository or on-chain.

---

## The problem

Indian retail investing runs on Telegram and WhatsApp. Tip groups with tens of
thousands of members, finfluencers posting calls between ads, "SEBI-registered"
in a bio that nobody checks. A call goes out — *long WBTC here, target 4%* —
and one of two things happens.

If it works, there is a screenshot. Cropped to the entry, posted to the
channel, pinned, reposted, sold as a track record.

If it does not work, the message is deleted. Not argued with, not corrected:
deleted. By the time anyone asks, it was never there.

So the wins are evidence and the losses are not anything at all. A follower
deciding whether to put money behind someone is shown a record that was
assembled by the person it describes, from the subset of their history that
flatters them. The hit rate they are quoted is not wrong so much as
**unfalsifiable** — there is no denominator.

The people harmed are specific. They are retail investors, often first-time,
often in smaller cities, putting real money behind a track record that has been
edited. The edit is invisible by construction. That is the harm: not bad advice,
which is ordinary, but a *measurement system that cannot record being wrong*.

---

## What Khata does

Four rules, and they only work together.

1. **The call is published before execution.** Asset, chain, direction,
   intended order type, thesis, reference price, and an explicit deadline — to
   Arkiv, as a transaction signed by the leader's wallet. Before anything is
   executed. After the fact it is a screenshot; before the fact it is a
   prediction.

2. **The deadline is short and mandatory.** A call with an open-ended horizon
   is unfalsifiable: *BTC to 100k* is right eventually. Signals carry a 30
   minute deadline and the Arkiv entity's lifetime is set from it.

3. **Every call gets exactly one receipt, including the ones that went
   nowhere.** A call that was never executed settles as `expired_unfilled` and
   lives for a year. There is no code path that declines to write an outcome.

4. **The hit rate counts the misses.** The leaderboard shows two numbers side
   by side: the honest hit rate over every call published, and the
   "screenshot" hit rate you would see if the unexecuted ones were dropped.
   **The gap between those two columns is the product.**

A leader cannot delete a call, because entities are not theirs to remove from
other people's queries once written, and the leaderboard counts first
settlements only. A leader cannot forge someone else's record, because scoring
uses the protocol's `$creator` rather than the self-declared `leader` attribute
— see [`arkiv/schema.md`](arkiv/schema.md). A leader *can* stop publishing —
and that shows up as a stale record rather than as a clean one.

---

## Why Arkiv, and not something else

### Why not a subgraph or any onchain indexer

**This is the argument that decides it.** A call that is never executed
produces no onchain event. There is no transaction, no log, no state change —
nothing happened, and "nothing happened" is precisely the datum a track record
needs most.

A subgraph indexes events. It cannot index the absence of one. Build Khata on
The Graph and you get a flawless record of every trade a leader *chose to
make*, which is the screenshot problem again with better tooling: the system
would be structurally incapable of recording the thing it exists to record.

Khata's `expired_unfilled` receipts are first-class rows, and they exist
because the claim was written down **before** anyone knew whether it would be
executed. That ordering requirement is what rules out every
derive-it-from-chain-state approach, not just subgraphs.

### Why not Postgres

A database we run is a database we can edit. The entire value proposition is
"the operator cannot quietly change the record", and a Postgres row fails that
at the first `UPDATE`. We could publish hashes, run an audit log, sign rows —
at which point we have built a worse blockchain, and the reader still has to
trust that we are running the code we published.

On Arkiv the write is a transaction signed by the leader's wallet, and
`$creator` is set by the protocol. Not by us. There is no operator key that
can rewrite a leader's history because there is no operator.

### Why not IPFS or Arweave

Content-addressed storage gets immutability right and querying wrong. Khata's
core read is *"every settlement by this leader, newest first"* and
*"every open signal whose deadline has not passed"*. On IPFS that requires an
index — which someone must run, and that someone can omit entries. The
censorship surface moves from the storage to the index, which is exactly where
it hurts, because the index is what everybody actually reads.

Arkiv's typed indexed attributes mean the query **is** the index, and it is
served by the chain. There is nothing in between to curate the results.

### Why not a custom API

Same failure as Postgres, plus a single point of shutdown. If Khata's server
goes away, every track record it hosted becomes unverifiable. On Arkiv the
record is readable by anyone with the RPC URL whether or not this project still
exists — including by a competitor who wants to build a better leaderboard over
the same data.

### What Arkiv specifically gives us

- **Wallet-owned entities** — authorship is the transaction signature, so no
  application-level signing scheme is needed and none is used.
- **Typed indexed attributes** — `dec` prices and `u64` timestamps are
  range-queryable on the node, so the browser filters server-side rather than
  downloading everything.
- **TTL as a modelling tool** — short-lived claims and long-lived receipts are
  a first-class distinction rather than a cron job deleting old rows.
- **A query surface with no server in front of it** — which is why this
  deployment is a static export.

### The honest limits

- Arkiv is **testnet-only** today. Khata on Tiramisu is a demonstration; test
  GLM has no value and the chain carries no durability guarantee.
- TTL means nothing is permanent by default. Receipts live a year and need a
  keeper to extend them. We deliberately do not use
  `ExpirationTime.permanent()` — see [`arkiv/schema.md`](arkiv/schema.md) for
  why claiming permanence we have not costed would be the wrong move for a
  project about honest records.
- Khata proves a call was *published* before a deadline. It does not prove the
  leader believed it, or that they did not publish the opposite call from
  another wallet. Sybil resistance across wallets is out of scope for v0.

---

## There is no backend

The deployed site is a **static export** (`output: "export"` in
[`next.config.ts`](next.config.ts)). No API routes, no server components that
touch data, no database, no cache, no indexer, no subgraph.

Every number on the leaderboard is computed in your browser from entities your
browser fetched from `rpc.tiramisu.db-chain.testnet.arkiv.network`. The RPC
endpoint and the current block height are printed at the top of every page so
you can check.

This is enforced rather than promised: with `output: "export"` a backend cannot
be added later without the build failing. The CLI (`npm run query`) and the
website call the identical functions in [`lib/arkiv/query.ts`](lib/arkiv/query.ts).

---

## Run it yourself

```bash
git clone https://github.com/panugothrakesh/khata.git
cd khata
npm install
```

### Read the live record — no key, no account, no funds

```bash
npm run query
```

This queries Tiramisu directly and prints the leaderboard. It needs no wallet
because reads on Arkiv need no wallet.

```bash
npm run dev     # the website, at http://localhost:3000
```

### Write to the chain

Writing needs a funded Tiramisu wallet.

```bash
cp .env.example .env
```

Put a throwaway testnet private key in `KHATA_PUBLISHER_PRIVATE_KEY`. **Never
use a key that holds anything.** `.env` is gitignored; `.env.example` carries a
zeroed placeholder.

```bash
npm run whoami   # prints your address and GLM balance
```

Claim test GLM for that address at https://hub.arkiv.network/faucet — this
requires connecting a wallet in a browser and cannot currently be scripted
(see [`arkiv/friction.md`](arkiv/friction.md) item 2).

Then:

```bash
npm run seed
```

The seeder derives four leader personas from your one key, funds them, publishes
every call as a real transaction, settles the executed ones immediately, and
then **waits out the deadline** before recording the rest as
`expired_unfilled`. It takes two to three minutes, and the waiting is
deliberate: writing those receipts early would put a `settledAt` before its
`deadline` on a public chain, where anyone could check.

Publish a single call by hand:

```bash
npm run publish-signal -- \
  --asset WBTC --chain base --direction long \
  --ref-price 61240.50 --ttl 30 \
  --thesis "Reclaimed the range low on volume."
```

Settle whatever is past its deadline:

```bash
npm run settle
```

---

## Addresses used

Everything below is on Tiramisu testnet (`7738577`) and holds valueless test
GLM only.

| Role | Address |
|---|---|
| Publisher / bank | `0x2347a75989ab2cF12F708Ad1a04632cCeFA1985B` |

The four seed personas are derived deterministically from the publisher key as
`keccak256(privateKey ‖ handle)` for handles `steady-hand`, `shadow-caller`,
`range-trader` and `momentum-chaser`, so the whole cast is reproducible from a
single secret and no additional keys exist to leak. `npm run seed` prints each
derived address as it funds it.

Browse the entities at https://data.arkiv.network and the transactions at
https://tiramisu.explorer.arkiv.network.

---

## Layout

```
lib/arkiv/schema.ts      entity types, attributes, TTLs — the canonical schema
lib/arkiv/client.ts      read client (no key) and write client (key, CLI only)
lib/arkiv/publish.ts     write path: publish a call before execution
lib/arkiv/settle.ts      settle path: exactly one receipt per call
lib/arkiv/query.ts       read path, shared verbatim by the CLI and the browser
lib/arkiv/decode.ts      entity → record, defensive about a shared namespace
lib/leaderboard.ts       hit rates, forgery rejection, dedup — pure functions
lib/execution/           the seam a real venue plugs into; v0 resolvers
app/                     the static site
scripts/                 publish, settle, query, seed, whoami
arkiv/schema.md          schema rationale, including what was kept OFF Arkiv
arkiv/friction.md        DX findings with reproduction steps
```

---

## What comes next

v1 replaces the resolver in [`lib/execution/`](lib/execution/README.md) with a
real execution adapter: the declared order type becomes an actual advanced
order, and the receipt carries the real fill price and venue order id. Nothing
above the seam changes — the schema, the write path, the query path and the
leaderboard are already shaped for real fills. The v0 cut is a smaller system,
not a different one.

Followers mirroring trades non-custodially from their own wallets is the other
half, and is deliberately absent here: position sizes on a public queryable
index would be a front-running list, which is reasoned through in
[`arkiv/schema.md`](arkiv/schema.md).

---

## Licence

MIT — see [LICENSE](LICENSE).
