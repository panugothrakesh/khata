/**
 * Synthetic seed data.
 *
 * Every leader below is invented, every thesis is written for this repository,
 * and every wallet is derived deterministically from the local test key. No
 * real person, real handle, real channel or real trading call appears here,
 * and none of the prices are presented as live market data.
 *
 * The personas exist because the product only makes sense against a spread of
 * behaviour. The interesting one is `shadow`: a leader with a good-looking
 * executed record and a pile of calls that were never executed at all. On a
 * screenshot-based track record they look like the best leader here. On Khata
 * they do not.
 */

export type SeedCall = {
  asset: string;
  chain: string;
  direction: "long" | "short";
  orderType: "spot" | "twap" | "twap_bracket" | "limit";
  refPrice: string;
  thesis: string;
  orderSpec: string;
  /**
   * How this call should end.
   *  - "fill": executed inside the window; `exitPrice` decides hit or miss.
   *  - "unfilled": the deadline passes with nothing executed against it.
   */
  ending: { kind: "fill"; exitPrice: string; note: string } | { kind: "unfilled" };
};

export type SeedLeader = {
  /** Used to derive the wallet; also the display handle. */
  handle: string;
  blurb: string;
  calls: SeedCall[];
};

const twap = "TWAP 30m, SL -2.0%, TP +4.0%";
const tight = "TWAP 15m, SL -1.0%, TP +2.0%";

export const SEED_LEADERS: SeedLeader[] = [
  {
    handle: "steady-hand",
    blurb:
      "Posts few calls, executes nearly all of them, and is wrong about a third of the time. " +
      "The honest baseline.",
    calls: [
      {
        asset: "WETH", chain: "base", direction: "long", orderType: "twap_bracket",
        refPrice: "2412.80", orderSpec: twap,
        thesis: "Base sequencer fees have been falling for three weeks and bridge inflows are positive. Scaling in rather than taking a single entry.",
        ending: { kind: "fill", exitPrice: "2501.15", note: "Filled across the TWAP window; take-profit hit before the deadline." },
      },
      {
        asset: "WBTC", chain: "base", direction: "short", orderType: "twap_bracket",
        refPrice: "61240.50", orderSpec: twap,
        thesis: "Funding has been positive for five sessions and open interest is at a local high. Expecting a flush rather than a trend break.",
        ending: { kind: "fill", exitPrice: "61980.00", note: "Filled, then stopped out. The flush did not come." },
      },
      {
        asset: "ARB", chain: "arbitrum", direction: "long", orderType: "twap",
        refPrice: "0.7240", orderSpec: tight,
        thesis: "Unlock cleared last week with no sustained sell pressure. Taking a small position into the gap.",
        ending: { kind: "fill", exitPrice: "0.7515", note: "Filled; closed at the deadline in profit." },
      },
      {
        asset: "WETH", chain: "arbitrum", direction: "short", orderType: "twap_bracket",
        refPrice: "2498.00", orderSpec: twap,
        thesis: "Rejected the same level three times. Fading it with a tight stop above.",
        ending: { kind: "fill", exitPrice: "2470.40", note: "Filled; take-profit reached." },
      },
      {
        asset: "SOL", chain: "base", direction: "long", orderType: "spot",
        refPrice: "138.90", orderSpec: "Spot entry, no bracket",
        thesis: "Simple momentum continuation. No thesis beyond the trend being intact.",
        ending: { kind: "fill", exitPrice: "134.10", note: "Filled; closed at a loss at the deadline." },
      },
      {
        asset: "WBTC", chain: "base", direction: "long", orderType: "twap_bracket",
        refPrice: "60800.00", orderSpec: twap,
        thesis: "Reclaimed the range low on volume. Scaling in with a stop under the wick.",
        ending: { kind: "fill", exitPrice: "61750.25", note: "Filled; take-profit reached." },
      },
    ],
  },
  {
    handle: "shadow-caller",
    blurb:
      "Publishes constantly and executes selectively. Every executed call looks good. " +
      "Most calls were never executed at all — which is exactly what a screenshot cannot show.",
    calls: [
      {
        asset: "WBTC", chain: "base", direction: "long", orderType: "twap_bracket",
        refPrice: "60120.00", orderSpec: twap,
        thesis: "Bottom is in. Loading here.",
        ending: { kind: "fill", exitPrice: "62400.00", note: "Filled; take-profit reached." },
      },
      {
        asset: "WETH", chain: "base", direction: "long", orderType: "twap_bracket",
        refPrice: "2380.00", orderSpec: twap,
        thesis: "ETH is coiled. This is the move.",
        ending: { kind: "fill", exitPrice: "2466.70", note: "Filled; take-profit reached." },
      },
      {
        asset: "SOL", chain: "base", direction: "long", orderType: "twap", refPrice: "141.20", orderSpec: tight,
        thesis: "SOL breaking out. Size up.",
        ending: { kind: "unfilled" },
      },
      {
        asset: "ARB", chain: "arbitrum", direction: "short", orderType: "twap", refPrice: "0.7390", orderSpec: tight,
        thesis: "ARB is done. Fading every bounce.",
        ending: { kind: "unfilled" },
      },
      {
        asset: "WETH", chain: "arbitrum", direction: "short", orderType: "twap_bracket", refPrice: "2455.00", orderSpec: twap,
        thesis: "Reversal here. Short with conviction.",
        ending: { kind: "unfilled" },
      },
      {
        asset: "WBTC", chain: "base", direction: "short", orderType: "twap_bracket", refPrice: "62100.00", orderSpec: twap,
        thesis: "Top signal flashing. Shorting the high.",
        ending: { kind: "unfilled" },
      },
      {
        asset: "SOL", chain: "base", direction: "short", orderType: "spot", refPrice: "137.40", orderSpec: "Spot entry, no bracket",
        thesis: "SOL rolling over. Out of longs, into shorts.",
        ending: { kind: "unfilled" },
      },
      {
        asset: "LINK", chain: "arbitrum", direction: "long", orderType: "twap", refPrice: "11.42", orderSpec: tight,
        thesis: "LINK about to run. Front-running the news.",
        ending: { kind: "unfilled" },
      },
    ],
  },
  {
    handle: "range-trader",
    blurb:
      "Mechanical, unexciting, mostly right. Publishes small and executes everything.",
    calls: [
      {
        asset: "WETH", chain: "base", direction: "short", orderType: "limit", refPrice: "2495.00",
        orderSpec: "Limit at range high, SL -1.0%",
        thesis: "Upper band of a two-week range. Mechanical fade, no narrative.",
        ending: { kind: "fill", exitPrice: "2451.30", note: "Filled at the limit; closed at the mid." },
      },
      {
        asset: "WETH", chain: "base", direction: "long", orderType: "limit", refPrice: "2401.00",
        orderSpec: "Limit at range low, SL -1.0%",
        thesis: "Lower band of the same range. Same trade, other side.",
        ending: { kind: "fill", exitPrice: "2438.60", note: "Filled at the limit; closed at the mid." },
      },
      {
        asset: "WBTC", chain: "base", direction: "short", orderType: "limit", refPrice: "62000.00",
        orderSpec: "Limit at range high, SL -1.0%",
        thesis: "Range high. Mechanical.",
        ending: { kind: "fill", exitPrice: "62310.00", note: "Filled, then stopped out when the range broke." },
      },
      {
        asset: "ARB", chain: "arbitrum", direction: "long", orderType: "limit", refPrice: "0.7110",
        orderSpec: "Limit at support, SL -1.5%",
        thesis: "Support held twice. Third test, same plan.",
        ending: { kind: "unfilled" },
      },
      {
        asset: "WETH", chain: "arbitrum", direction: "long", orderType: "limit", refPrice: "2408.00",
        orderSpec: "Limit at range low, SL -1.0%",
        thesis: "Range low on Arbitrum. Mechanical.",
        ending: { kind: "fill", exitPrice: "2444.90", note: "Filled at the limit; closed at the mid." },
      },
    ],
  },
  {
    handle: "momentum-chaser",
    blurb: "High volume, high conviction, poor record. Executes most of what is published.",
    calls: [
      {
        asset: "SOL", chain: "base", direction: "long", orderType: "spot", refPrice: "144.80",
        orderSpec: "Spot entry, no bracket",
        thesis: "Green candle. Chasing.",
        ending: { kind: "fill", exitPrice: "138.20", note: "Filled; closed down at the deadline." },
      },
      {
        asset: "LINK", chain: "arbitrum", direction: "long", orderType: "spot", refPrice: "11.88",
        orderSpec: "Spot entry, no bracket",
        thesis: "Breaking out of the weekly. Full size.",
        ending: { kind: "fill", exitPrice: "11.31", note: "Filled; closed down at the deadline." },
      },
      {
        asset: "WBTC", chain: "base", direction: "long", orderType: "twap", refPrice: "62450.00", orderSpec: tight,
        thesis: "New highs mean more highs.",
        ending: { kind: "fill", exitPrice: "61700.00", note: "Filled; closed down at the deadline." },
      },
      {
        asset: "WETH", chain: "base", direction: "long", orderType: "spot", refPrice: "2488.00",
        orderSpec: "Spot entry, no bracket",
        thesis: "Momentum is obvious here.",
        ending: { kind: "fill", exitPrice: "2529.40", note: "Filled; closed up at the deadline." },
      },
      {
        asset: "ARB", chain: "arbitrum", direction: "long", orderType: "spot", refPrice: "0.7520",
        orderSpec: "Spot entry, no bracket",
        thesis: "ARB going parabolic.",
        ending: { kind: "unfilled" },
      },
    ],
  },
];
