/**
 * "Snapback Nine" — a dip mean-reversion bot for btc-race-24h-20261117-0603.
 *
 * The dev window (24 h of cbBTC/USDC 1-minute bars, 2026-11-16 06:03 UTC to
 * 2026-11-17 06:03 UTC) is a choppy, range-bound day: BTC ends +0.53%, its
 * deepest drawdown from a peak is 2.12%, and no single minute moves more
 * than 50 bps. Trend-following bleeds on a window like this (the kit's
 * ema-cross baseline loses $106.21 in 68 whipsaw trades), while buying a
 * dip and banking the snap-back works: the window's three real dips all
 * recover 180+ bps within a few hours.
 *
 * Rules, all deterministic (integer arithmetic on the bar closes, no clock,
 * no network, no randomness):
 *   - Reference: the 90-bar simple moving average of the close, kept as an
 *     exact integer rolling sum. A dip is a close at least 80 bps below it.
 *   - Entry, full cash, one position at a time: on the first bar whose close
 *     is 80+ bps below the 90-bar SMA, provided the bot is flat, at least 20
 *     bars have passed since its last exit, and the window still has at
 *     least 60 bars left (a late entry cannot outrun the ~26 bps round-trip
 *     cost before the final flatten).
 *   - Exit, the whole position: the first close at least 190 bps above the
 *     average fill price (take profit), or at least 80 bps below it (hard
 *     stop). The average fill comes from the harness's own position cost
 *     (fees included), so the exit lines are anchored on what was actually
 *     paid, not on the close the order was decided on.
 *   - Orders cap slippage at 150 bps from the latest close, far above the
 *     usual 1-minute move, so fills are almost never refused for slipping.
 *     A buy never spends more than the weight room the caps allow.
 *
 * Dev-window result (kit harness, process driver): net PnL +$38.97, 5
 * trades (win rate 1.00), max drawdown 0.72%, fees $2.46 (at 2x fees the
 * net is still +$36.49); buy-and-hold on the same window: +$1.07;
 * ema-cross: -$106.21; hold-cash: $0.00. See README.md for the
 * split-half, noise and neighbour checks.
 */

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

/** Length of the moving-average reference, in bars. */
const MEAN_LEN = 90;
/** Buy when the close sits this far (bps) below the reference average. */
const DIP_BPS = 80;
/** Take profit this far (bps) above the average fill price. */
const TAKE_BPS = 190;
/** Hard stop this far (bps) below the average fill price. */
const STOP_BPS = 80;
/** Bars to wait after an exit before looking for a new entry. */
const REST_BARS = 20;
/** No new entries once this many scored bars have passed. */
const LAST_ENTRY_BAR = 1380;
/** Window length: never order on the final batch. */
const WINDOW_BARS = 1440;
/** Slippage cap on every order, in bps from the latest close. */
const MAX_SLIP_BPS = 150;

/** Rolling window of closes behind the moving average. */
const recentCloses: number[] = [];
let closeSum = 0;
/** Bars fed so far (warm-up included). */
let seenBars = 0;
/** Bar count when the last position emptied (-inf before the first). */
let lastExitBar = -1_000_000_000;
/** Whether the previous batch still held the position. */
let wasHolding = false;

/** Average fill price of the held position, in the bar price scale. */
function averageFill(state: BarsState): number {
  const held = state.positions.get(SYMBOL);
  if (held === undefined || held.qty === 0n) return 0;
  // cost is quote units (fees included); qty is at qty_scale 8 and the
  // price at price_scale 5 against a quote at scale 6, so the average
  // price is cost * 10^13 / (qty * 10^6), truncated like the harness.
  return Number((held.cost * 10n ** 13n) / (held.qty * 10n ** 6n));
}

await runBars({
  onBatch(state, batch) {
    let bar = null;
    for (const candidate of batch.bars) {
      if (candidate.symbol === SYMBOL) {
        bar = candidate;
        break;
      }
    }
    if (bar === null) return [];
    const close = Number(bar.c);

    // Fold the close into the reference average on every bar, warm-up
    // included, so the average is already seeded when trading starts.
    recentCloses.push(close);
    closeSum += close;
    if (recentCloses.length > MEAN_LEN) closeSum -= recentCloses.shift()!;
    seenBars += 1;
    if (state.warmingUp) return [];

    const scored = seenBars - state.warmupBars;
    if (scored >= WINDOW_BARS) return [];

    const held = state.positions.get(SYMBOL);
    const holding = held !== undefined && held.qty > 0n;
    if (!holding && wasHolding) lastExitBar = seenBars;
    wasHolding = holding;

    if (holding) {
      const fill = averageFill(state);
      if (fill > 0) {
        const takeLine = Math.floor((fill * (10_000 + TAKE_BPS)) / 10_000);
        const stopLine = Math.floor((fill * (10_000 - STOP_BPS)) / 10_000);
        if (close >= takeLine || close <= stopLine) {
          return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIP_BPS } satisfies SellInput];
        }
      }
      return [];
    }

    // Flat: look for the dip, with the rest and late-window guards.
    if (seenBars - lastExitBar < REST_BARS) return [];
    if (scored >= LAST_ENTRY_BAR) return [];
    if (recentCloses.length < MEAN_LEN) return [];
    const reference = Math.floor(closeSum / MEAN_LEN);
    const dipLine = Math.floor((reference * (10_000 - DIP_BPS)) / 10_000);
    if (close > dipLine) return [];
    const room = state.weightRoom(SYMBOL);
    let stake = state.cash < room ? state.cash : room;
    if (stake <= 0n) return [];
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: stake, max_slippage_bps: MAX_SLIP_BPS } satisfies BuyInput];
  },
});
