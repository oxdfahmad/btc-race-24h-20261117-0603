# btc-race-24h-20261117-0603

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/oxdfahmad/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/oxdfahmad/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A bot for **btc-race-24h-20261117-0603** (make.fun): trades cbBTC/USDC on
1-minute on-chain bars with $1,000 of paper money. Long only, no leverage.

## Strategy — "Snapback Nine"

The dev window (24 h of cbBTC/USDC 1-minute bars, 2026-11-16 06:03 UTC to
2026-11-17 06:03 UTC) is a choppy, range-bound day: BTC ends +0.53%, its
deepest drawdown from a peak is 2.12%, and no single minute moves more than
50 bps. Trend-following bleeds on a window like this (the kit's ema-cross
baseline loses $106.21 in 68 whipsaw trades), while buying a dip and
banking the snap-back works: the window's three real dips all recover
180+ bps within a few hours. The live dev leaderboard agrees — its top 10
are all dip / mean-reversion bots ($41.90–$49.70), and no trend bot is
anywhere near it.

- **Reference**: the 90-bar simple moving average of the close, kept as an
  exact integer rolling sum. A dip is a close at least **80 bps below** it.
- **Enter**, full cash, one position at a time: on the first bar whose close
  is 80+ bps below the 90-bar SMA, provided the bot is flat, at least 20
  bars have passed since its last exit, and at least 60 bars of the window
  remain (a late entry cannot outrun the ~26 bps round-trip cost before the
  final flatten).
- **Exit**, the whole position: the first close at least **190 bps above**
  the average fill price (take profit), or at least **80 bps below** it
  (hard stop). The average fill comes from the harness's own position cost
  (fees included), so the exit lines are anchored on what was actually
  paid, not on the close the order was decided on.
- Orders cap slippage at 150 bps from the latest close, far above the
  usual 1-minute move, so fills are almost never refused for slipping. A
  buy never spends more than the weight room the caps allow.

## Dev-window results (kit harness, process driver)

| check | net PnL | trades | max drawdown |
|---|---:|---:|---:|
| full dev window | **+$38.97** | 5 (win rate 1.00) | 0.72% |
| first 12 h | +$27.41 | — | — |
| second 12 h | +$11.56 | — | — |
| at 2× fees | +$36.49 | — | — |
| buy-and-hold, same window | +$1.07 | 1 | 2.12% |
| ema-cross baseline, same window | −$106.21 | 68 | 10.96% |
| hold-cash | $0.00 | 0 | 0% |

Trade anatomy (3 round trips): buy the morning low at $64,040 → sell at
$65,168 (+176 bps gross); buy the midday dip at $64,167 → sell at $65,276
(+173 bps); buy the evening dip at $64,516 → flattened at $64,689
(+27 bps gross, ~breakeven after costs).

Robustness: the same strategy under 8 deterministic ±10 bps noise
perturbations of every bar averaged **+$29.25** (median +$34.30, worst
+$18.03, positive 8/8). Neighbouring parameters (SMA 80–100, dip 75–85,
TP 180–200, stop 60–120) all stay profitable ($19.94–$38.97), so the
result is a broad region, not a knife-edge fit. The two losing ideas that
were tried and rejected: a trailing exit instead of the fixed +190 bps
take-profit (best $33.37), and a trend-following arm (the gated-EMA
"Trend Rider" logic loses −$17.82 on this window).

## Honest caveats

- The dev window is one choppy day (BTC +0.53% with 2.12% swings). The
  race window is unseen: if it chops like the dev window, the bot should
  bank dips the same way; if it trends hard, the bot should mostly sit in
  cash and lose little; if it falls steadily, the dip entries can stop out
  at −80 bps a few times. No backtest can promise a race outcome.
- Only 3 round trips on the dev window — a small sample. The edge is the
  dip filter (cash in chop that is not a dip), not trade frequency.
- Dev rank of +$38.97 is ~#32 of 2,333 on the dev board (top 1.4%) — a
  strong dev score, but the prizes are decided on the unseen race window.

## Files

- `main.ts` — the bot (Node 22, TypeScript, stdlib only).
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's TS shim.
- `LICENSE` — MIT.
