# Friction report

Developer-experience notes gathered while building Khata against
`@arkiv-network/sdk@0.8.1` on the Tiramisu testnet, 16 October 2026.

| | |
|---|---|
| OS | macOS (darwin 27.0.0, Apple Silicon) |
| Node | v26.4.0 |
| npm | 11.17.0 |
| SDK | `@arkiv-network/sdk@0.8.1` |
| viem | `2.37.6` |
| Chain | Tiramisu, id `7738577`, `https://rpc.tiramisu.db-chain.testnet.arkiv.network` |

Written to be useful rather than polite. Three things were genuinely good and
are listed at the end, briefly, because a friction report that is mostly
compliments is not a friction report.

Everything below was actually hit while building this repository. Where a
finding turned out to be our own bug on closer inspection, it is not listed —
one candidate was dropped for exactly that reason after the probe was rerun.

---

## 1. `ne()` is exported, renders fine, and can never succeed — and the SDK destroys the one good error message

**Severity: high.** This is the most costly thing in the report.

`@arkiv-network/sdk/query` exports `ne`. It type-checks, it renders to valid-
looking syntax, and it is rejected by the engine 100% of the time.

The engine's own error is excellent. Sent as raw JSON-RPC:

```
$ curl -s -X POST https://rpc.tiramisu.db-chain.testnet.arkiv.network \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["kind != str('"'"'x'"'"')",{"limit":1}]}'

{"error":{"code":-32002,"message":"!= is not part of the query language —
  write NOT (attr = value) for the complement","data":{"position":5}}}
```

That message tells you the problem *and* the fix. Now the same query through
the SDK (`ne-probe.mjs`, run inside the project):

```js
import { ne, render } from "@arkiv-network/sdk/query";
import { str } from "@arkiv-network/sdk/attr";
import { createPublicClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http } from "viem";

console.log(typeof ne);                              // "function"
console.log(render(ne("kind", str("x"))));           // "kind != str('x')"

const c = createPublicClient({ chain: tiramisu, transport: http() });
await c.select({ key: true }).where(ne("kind", str("x"))).limit(1).fetch();
```

Output:

```
ne() is exported: function
ne() renders to: "kind != str('x')"
ne() query threw: QueryError - Query rejected (type, -32002):
  Requested resource not available.. Query: kind != str('x')
```

Two separate problems:

1. **A public export that cannot work.** `ne` should either be removed from
   `@arkiv-network/sdk/query` until the engine supports `!=`, or throw at
   construction with the message the engine already has. Shipping it means
   every user discovers it at runtime, against a live node.
2. **The SDK replaces a great error with a useless one.** The node said
   `"!= is not part of the query language — write NOT (attr = value)"`. The
   SDK surfaced `"Requested resource not available."` — generic JSON-RPC
   boilerplate for code `-32002` — and threw the real message away. We only
   found the actual cause by bypassing the SDK and curling the node.

   This is the single highest-value fix in this report: `QueryError` should
   prefer `error.data.message` (or `error.message`) over its code-to-string
   table. The engine's query diagnostics are better than the SDK is letting
   users see, which is an unusual way to lose.

Also note the docs and the SDK disagree in public. The JSON-RPC page states
plainly that `!=` is not implemented; the TypeScript SDK's query API lists `ne`
as available. A reader who starts from the SDK reference has no way to know.

**Workaround:** `not(eq(...))`, which works and returns correctly. Verified:
`NOT(eq) works: 1 rows`.

---

## 2. The faucet cannot be used without a browser wallet, which blocks every automated setup path

**Severity: high for hackathons specifically.**

`https://hub.arkiv.network/faucet` renders "CONNECT YOUR WALLET — Sign in with
your wallet to claim $GLM." The API behind it rejects unauthenticated calls:

```
$ curl -s -o /dev/null -w "%{http_code}\n" https://hub.arkiv.network/api/faucet
401
```

There is no documented programmatic path — no "POST an address and solve a
proof-of-work", no CLI command, no per-account API token that grants a claim.
Every claim requires a human with a browser extension.

Why this costs more than it looks:

- **It cannot be scripted**, so it cannot be in CI, in a devcontainer, or in a
  `make bootstrap`. Every contributor to this repository has to be walked
  through a manual step before `npm run seed` will do anything.
- **It fights the multi-wallet case.** Khata seeds four leader personas, which
  is four wallets. Funding each one from the faucet would mean four manual
  claims. We worked around it by deriving the personas from one key and fanning
  GLM out with ordinary transfers (`scripts/seed.ts`) — fine, but it is
  scaffolding written to route around the faucet rather than to build anything.
- **It is the longest pole in time-to-first-write.** Reading from Tiramisu
  worked about four minutes after `npm install`, with no key and no account.
  Writing required stopping to get a human through a wallet connection. The gap
  between those two numbers is almost entirely the faucet.

**Suggested fix:** a rate-limited unauthenticated endpoint that funds an
address with a small amount, even behind a proof-of-work or a 24-hour
per-address cooldown. A testnet faucet that cannot be reached from a script is
a testnet that cannot be in anyone's CI.

---

## 3. Every Node CLI run prints a `localStorage` warning that comes from the SDK

**Severity: low, but it is on every single command.**

```
$ npm run query
(node:97257) ExperimentalWarning: localStorage is not available because
--localstorage-file was not provided.
```

Source — the SDK's debug helper, in `dist/query-Ber-lOJQ.js`:

```js
if (typeof globalThis !== "undefined" && "localStorage" in globalThis)
  try { return globalThis.localStorage?.getItem("DEBUG") || ""; } catch {}
```

On Node ≥ 24 `localStorage` is present on `globalThis` as an experimental
built-in, so the `in` check passes, the getter is touched, and Node emits the
warning. The `try/catch` catches the throw but not the warning.

Reproduce with nothing but the SDK:

```
$ node --input-type=module -e 'await import("@arkiv-network/sdk")'
```

**Fix:** check `typeof process !== "undefined" && process.versions?.node` first
and skip the `localStorage` branch entirely on Node, or feature-detect with
`typeof localStorage === "object"` inside the `try` rather than `in` outside it.

It is cosmetic, but it is the first thing a new user sees on every command, and
it looks like their setup is broken when it is not.

---

## 4. The npm registry says the SDK is "Proprietary"; the tarball says MIT

**Severity: medium — it is a licensing question, not a cosmetic one.**

```
$ npm view @arkiv-network/sdk
@arkiv-network/sdk@0.8.1 | Proprietary | deps: 1 | versions: 93

$ npm view @arkiv-network/sdk@0.8.1 license
(empty)

$ head -3 node_modules/@arkiv-network/sdk/LICENSE.md
MIT License

Copyright (c) 2025 Arkiv Network
```

The published `package.json` has no `license` field, so npm falls back to
displaying "Proprietary", while the package itself ships an MIT licence.

This matters more than a typo would. This challenge requires entrants to
publish under MIT, and any organisation with a dependency-licence gate — which
is most of them — will have its scanner flag the SDK as proprietary and block
the build. Adding `"license": "MIT"` to the published `package.json` is a
one-line fix.

---

## 5. The JSON-RPC docs describe `limit` as a hex string; plain integers also work

**Severity: low.** Docs imprecision, found while writing a raw-RPC probe.

The querying-data page gives `limit` as a hex string (`"limit": "0xa"`). Both
forms are in fact accepted:

```
params: ["*", {"limit":"0x2"}]  → 2 rows
params: ["*", {"limit":2}]      → 2 rows   (identical response)
```

Not a bug, but the hex-only framing sends people writing
`"0x" + n.toString(16)` for no reason. Worth one sentence saying both are
accepted, or picking one and rejecting the other.

---

## 6. `$creator` versus `$owner` deserves a prominent callout, not a list entry

**Severity: low, but it is a security footgun.**

The fundamentals page lists the system attributes — `$owner`, `$creator`,
`$createdAt`, `$updatedAt`, `$expiresAt` — as a set, without drawing out that
**`$owner` is transferable and `$creator` is not**. `changeOwnership` is
documented separately.

Any application that treats an entity as a claim *by someone* has to reason
about this, and the naive choice is `$owner`, because it is listed first and
reads like "whose entity is this". For Khata the difference is the whole
security model: scoring a leaderboard on `$owner` would mean a track record
could be bought along with the wallet, and scoring on a self-declared
attribute would mean it could be forged for the price of one transaction.

We got this right by reading the `changeOwnership` docs, not from the
fundamentals page. One sentence there — "`$creator` is immutable; `$owner` can
be transferred, so use `$creator` for provenance" — would put it in front of
everyone who needs it.

---

## 7. Shared namespace is real and under-signposted

Tiramisu is one global query space. A query without a discriminator returns
other teams' entities, and a naive `v > i32(0)` returns a stranger's row:

```
v > i32(0)   → OK, 1 row    (not ours — we had written nothing at that point)
```

This is obvious in hindsight and the docs do not hide it, but no example shows
a type discriminator, so the natural first schema has no `kind` attribute and
starts returning other people's data as soon as anyone else uses a common
attribute name. Worth making the "add a type attribute and filter on it in
every query" pattern explicit in the fundamentals example, since every real
application needs it.

---

## What was good

Briefly, because these saved real time:

- **The query engine's error messages are the best part of the product.** They
  name the position, state the rule, and give the fix:
  `"str values have no ordering — only i32, u64, u256 and dec support < <="`,
  `"untagged strings are only valid for system attributes — write str('…')"`.
  See item 1 for the one place the SDK hides them.
- **The `.d.ts` files are the real documentation.** Every public function
  carries a worked example, the selection API's type narrowing is explained
  inline, and `CreateEntityReturnType.expiresAt` documents the subtlety that a
  duration-based expiry is a *lower bound* because the engine resolves it
  against the block the transaction lands in. We read the bundled types in
  preference to the docs site for most of this build and did not regret it.
- **Reads need no account, no key and no API key.** Pointing a browser at the
  public RPC and querying worked immediately. Khata's entire architecture — a
  static site with no backend — depends on that being true, and it was true
  without configuration.
