# The execution seam

Khata v0 **does not execute trades**. This directory is the single place where
a real execution venue plugs in, kept separate so that the boundary between
"recorded claim" and "actual fill" is a module boundary and not a comment.

## Why the seam exists at all

A signal is a claim made before the fact. A settlement says what became of it.
In a complete system the settlement is produced by the venue that filled the
order — it knows the fill price, the slippage and whether the order filled at
all. In v0 there is no venue, so the settlement is produced by a *resolver*:
something that looks at a price reference, or is told the answer by a human,
and writes down the result.

The two are not interchangeable, and Khata never pretends they are:

- Every settlement carries an `outcome` and, in its payload, a `method` string
  naming exactly how the outcome was determined.
- The v0 resolvers write methods like `manual:operator-asserted` and
  `reference-price:<source>`. Neither string claims execution.
- The UI renders the method next to the result. A receipt that was resolved by
  hand says so on its face.

A demo that wrote `filled` when nothing was filled would be a lie told in the
one place the whole project claims to be trustworthy. So it does not.

## The interface

```ts
type Resolver = {
  /** Stable name recorded in the settlement payload as `method`. */
  method: string;
  resolve(signal: DecodedSignal, now: number): Promise<ResolvedOutcome>;
};

type ResolvedOutcome = {
  outcome: "hit" | "miss" | "expired_unfilled";
  exitPrice: string;
  pnlBps: number;
  note: string;
};
```

`lib/execution/resolvers.ts` holds the v0 implementations.

## What plugs in later (ETHGlobal Mumbai)

The planned v1 replaces the resolver with an execution adapter that:

1. Takes the signal's declared `orderType` and `orderSpec` and submits a real
   advanced order (a TWAP with bracket stop-loss / take-profit).
2. Polls for terminal state before the signal's deadline.
3. Emits a `ResolvedOutcome` with `method: "<venue>:<orderId>"` and the real
   fill price.
4. Leaves orders that never reached a fill as `expired_unfilled` — which is
   already what the v0 path does, because that case is the reason the project
   exists and was never going to be an afterthought.

Nothing above the seam changes: the schema, the write path, the query path and
the leaderboard are all already shaped for real fills. That is deliberate. The
v0 cut is a smaller system, not a different one.
