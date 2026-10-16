# Arkiv schema

Khata stores two entity types on the Arkiv Tiramisu DB-chain. The canonical
definition is [`lib/arkiv/schema.ts`](../lib/arkiv/schema.ts); this document
explains the choices behind it.

The design has one organising idea: **a signal is a claim, a settlement is a
receipt, and the receipt has to outlive the claim by a very long way.** Almost
every decision below falls out of that.

---

## Entity type 1 — `signal`

The trading call, written **before** any execution. `kind = "khata.signal.v1"`.

| Attribute | Type | Indexed | Why |
|---|---|---|---|
| `kind` | `str` | yes | Discriminator. Tiramisu is a shared namespace — every team's entities live in the same query space — so *every* Khata query starts with `kind = str('khata.signal.v1')`. Without it "all signals" is not a well-defined set. |
| `v` | `i32` | yes | Schema version. Indexed so a future v2 can be rolled out without a migration: queries pin the version they understand and simply do not see the others. |
| `signalId` | `str` | yes | Stable public id. The join key a settlement points back with, and what appears in a URL. |
| `leader` | `addr` | yes | The publisher's wallet. The leaderboard's primary filter. Note this is the *self-declared* author — see "Trusting `$creator`" below. |
| `asset` | `str` | yes | `eq` and `STARTSWITH`. The first thing a follower filters on. |
| `chain` | `str` | yes | Second filter. Low cardinality, but filtering server-side beats shipping every signal to the browser to drop 80% of them. |
| `direction` | `str` | yes | `long` / `short`. Indexed so "show me only shorts on WETH" is one query. |
| `orderType` | `str` | yes | The *intended* order type. Indexed because judging a spot entry against a bracketed TWAP is comparing different claims, and a reader must be able to separate them. |
| `createdAt` | `u64` | yes | Unix seconds. `u64` rather than `str` so date ranges are real range queries. |
| `deadline` | `u64` | yes | Unix seconds. The call's own expiry. Range-queried constantly: "open now" is `deadline >= now`, "settleable" is `deadline <= now`. |
| `refPrice` | `dec` | yes | Price at publish. `dec`, never `str` — see "The `dec` trap". |

Payload (`application/json`, **not** queryable):

```jsonc
{
  "thesis":      "…the leader's reasoning, free text…",
  "orderSpec":   "TWAP 30m, SL -2.0%, TP +4.0%",
  "priceSource": "where refPrice came from"
}
```

### Why the thesis is not an attribute

It is the longest field and the only one nobody filters on. Arkiv caps a string
attribute at 128 bytes, which is far too short for real reasoning, and indexing
prose would mean paying index cost for a field whose only query would be
`STARTSWITH` — which is not how anyone searches text. It belongs in the
payload, and it is fetched only on the views that display it.

---

## Entity type 2 — `settlement`

The permanent receipt. One per signal, always.
`kind = "khata.settlement.v1"`.

| Attribute | Type | Indexed | Why |
|---|---|---|---|
| `kind`, `v` | `str`, `i32` | yes | As above. |
| `signalId` | `str` | yes | Join back to the call. |
| `signalKey` | `key` | yes | The signal's **Arkiv entity key**. The `key` type exists for exactly this and is a stronger link than the string id: it points at one specific entity that one specific wallet created, and the entity explorer resolves it directly. |
| `leader` | `addr` | yes | Self-declared author. Cross-checked against `$creator`. |
| `asset`, `chain`, `direction` | `str` | yes | Copied from the signal. Denormalised deliberately — see below. |
| `outcome` | `str` | yes | `hit`, `miss`, or `expired_unfilled`. Indexed so "show me every call this leader never executed" is a single node-side query rather than a client-side filter over their whole history. |
| `settledAt` | `u64` | yes | Unix seconds. Range-queried for "last 30 days". |
| `refPrice`, `exitPrice` | `dec` | yes | Both, so a reader can recompute `pnlBps` and check our arithmetic. |
| `pnlBps` | `i32` | yes | Signed basis points. **`i32`, not `u64`** — a losing call is a negative number, and it must sort correctly against winning ones. |

Payload:

```jsonc
{
  "method":    "manual:operator-asserted",   // how the outcome was decided
  "note":      "…",
  "thesis":    "copy of the signal's thesis",
  "orderSpec": "copy of the signal's order spec"
}
```

### Why the settlement duplicates its signal

This is the one place Khata denormalises on purpose. A settlement copies the
signal's asset, chain, direction, thesis and order spec.

The reason is TTL. The signal is gone in 40 minutes. If the receipt only held a
pointer, then an hour after publication the record would read "signal
`0x9f2c…`: hit, +148 bps" and nobody could tell you what the call had been. A
receipt that cannot be read without its subject is not a receipt.

So the settlement is self-contained, and `signalKey` is kept as *provenance* —
proof of which entity this settles, resolvable on the explorer for as long as
that entity lives — rather than as a lookup the UI depends on.

---

## Lifetimes

Arkiv lifetimes are measured in blocks (2s each) and set at creation.

| Entity | Lifetime | Reasoning |
|---|---|---|
| `signal` | **40 min** (30 min deadline + 10 min grace) | A trading call with an open-ended deadline is unfalsifiable: "BTC to 100k" is right eventually. Khata forces a short, explicit deadline, and the entity's lifetime is that deadline plus a grace window. |
| `settlement` | **365 days** | The receipt is the product. |

### The grace window is not padding

If a signal expired exactly at its deadline, it would vanish from the query
surface at the precise moment the settle path needs to read it back and copy
its contents into the receipt. The 10-minute grace window is the settle path's
room to work. We found this by reasoning it through rather than by being
bitten, but it is the kind of thing a TTL-based store makes you think about
and a Postgres row never would.

### We do not claim permanence

`ExpirationTime.permanent()` exists, and we deliberately do not use it. Arkiv
prices lifetime, so "permanent" is a commercial claim as much as a technical
one, and a project whose entire pitch is *honest record-keeping* should not
open with a durability promise it has not costed.

What is true: a settlement lives a year, and extending it is a call to
`extendEntity()` by its owner. A production Khata runs a keeper that renews
receipts and publishes what it spends. If that keeper stops, the receipts
eventually prune — and saying so plainly is better than implying a permanence
the protocol charges for by the block.

---

## The `dec` trap

Prices are `dec`, never `str`. Arkiv's own docs flag this and it is worth
restating because the failure is silent: a number stored as a string compares
lexicographically, so `"9" > "10"`, and every range query returns a
plausible-looking wrong answer. Nothing errors. For a project about trustworthy
numbers that would have been a particularly embarrassing bug, so prices are
`dec` and timestamps are `u64` throughout.

Similarly `pnlBps` is `i32` rather than `u64`: basis points go negative, and an
unsigned type would have wrapped every losing call into a very large win.

---

## Trusting `$creator`, not `leader`

Arkiv sets five system attributes that no one can write: `$owner`, `$creator`,
`$createdAt`, `$updatedAt`, `$expiresAt`.

Khata's `leader` attribute is just a field. Anyone can write an entity whose
`leader` says someone else, so a forged track record — good or bad — would cost
one testnet transaction. `$creator` is the wallet that actually signed the
entity into existence and cannot be set, changed or transferred.

So:

- Queries filter on `leader`, because it is ours and it is indexed.
- The leaderboard **scores** on `$creator`, and discards any settlement whose
  `leader` disagrees with its `$creator`
  ([`rejectForgedSettlements`](../lib/leaderboard.ts)).

`$owner` is deliberately not used for this. Ownership can be transferred with
`changeOwnership`; authorship cannot. Buying a wallet should not buy its record.

There is also no application-level signature anywhere in Khata. Creating an
entity *is* a signed Ethereum transaction, so the leader's signature is already
on the write and already recorded as `$creator`. Storing a second signature in
the payload would be weaker than the one the protocol gives for free, and would
invite readers to verify the wrong artefact.

---

## What we deliberately kept **off** Arkiv

Arkiv is a public, queryable, wallet-owned database. Everything written to it is
readable by everyone, for as long as it lives. That makes the question of what
*not* to write at least as important as the schema itself.

### 1. Order payloads and execution credentials

v0 does not execute. v1 (planned for ETHGlobal Mumbai) will route orders through
a real venue, and **none of that goes on Arkiv**: no venue API keys, no signed
order payloads, no order ids that authorise anything, no integrator secrets.

A signed order payload on a public database is a standing invitation to replay
it. The entity records the *intent* — asset, direction, order type, deadline,
reference price — in the open, and the instrument that could move money stays
with the venue. The receipt then records the *result*. Intent and result are the
parts that need to be public; the authorisation in between is the part that must
not be.

### 2. Private keys, obviously — but also key material of any kind

No key, seed, mnemonic or derived secret is written to an entity, printed into a
payload, or committed to this repository. `.env` is gitignored, `.env.example`
carries a zeroed placeholder, and the seeder derives its personas' wallets from
the one local key rather than storing four more.

### 3. Follower balances, positions and copy-trade sizes

The mirroring design has followers trade non-custodially from their own wallets.
Position sizes on a public ledger would be a targeting list: a leader's
followers, their sizes, and a 30-minute window in which they are all about to
take the same side of the same trade. That is front-running material, and on a
queryable index it is a single range query away from being a product.

Only the leader's call is public. What anyone does about it is theirs.

### 4. Any real person's identity

Seed data is entirely synthetic. No real handle, channel, phone number or
trading call appears in this repository or on-chain. A leader is a wallet
address and nothing else. A system whose purpose is permanent, unerasable
records is precisely the wrong place to put personal data, and TTL does not
save you: by the time someone wants it gone it has been queryable by everyone
for a year.

### 5. Derived data, including the leaderboard itself

No ranking, hit rate, aggregate or cached roll-up is stored. Those are computed
in the browser from the settlements, in
[`lib/leaderboard.ts`](../lib/leaderboard.ts).

This is the one that is most tempting to get wrong, because writing a
`leader_stats` entity would make the homepage a single fast query. It would also
be the one number on the site nobody could check, and the one place Khata could
quietly flatter someone. Storing a derived number means asking readers to trust
the deriver — which is the exact thing this project exists to avoid. The maths
is cheap; the trust is not.

---

## Query patterns

Every query the application makes, with the index each relies on:

| View | Query | Index used |
|---|---|---|
| Leaderboard | `kind = str('khata.settlement.v1')` | `kind` |
| Leader receipts | `kind = … AND leader = 0x…` | `kind`, `leader` |
| Open calls | `kind = str('khata.signal.v1') AND deadline >= u64(now)` | `kind`, `deadline` (range) |
| Settle queue | `kind = str('khata.signal.v1') AND deadline <= u64(now)` | `kind`, `deadline` (range) |
| Browse by asset | `kind = … AND asset = str('WBTC')` | `kind`, `asset` |

All five run on the node. None is a client-side filter over a larger result set,
and there is no server in between — the browser issues these directly against
`rpc.tiramisu.db-chain.testnet.arkiv.network`.
