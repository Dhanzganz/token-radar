# Token Radar

[![Token Radar bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/Dhanzganz/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/Dhanzganz/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar, built for make.fun's [token-radar-01 bounty](https://make.fun/bounty/token-radar-01):
it reads a sealed snapshot of every protocol DefiLlama tracks, works out which ones still
record no token and are not a wrapped or staked product of one that trades, and ranks them
by what their launch would be worth — with a farm plan for each.

## The model (radar-4)

Nothing is hardcoded per protocol. The program derives its prices from the snapshot itself:

1. **Peer multiples.** For every traded protocol, take `mcap / TVL`, clamp to 0.01–5, and
   group by category. A category's multiple is its **depth-weighted median** ratio — each
   peer weighted by the square root of its TVL, so the protocols the market has actually
   capitalised set the price without any one of them dictating it — shrunk toward the
   global median as if the global had 8 extra peers, and kept within a third to three times
   that median. The global median stays a plain median of every ratio: weighting it too
   would let a handful of giants flatten every category's evidence (measured, not guessed —
   `MODEL_NOTES.md` holds the variant comparison behind this choice).
2. **Implied value.** `TVL × category multiple × growth × maturity × reach` — growth damps
   the 7-day TVL change, maturity rewards years run with no token, reach counts chains.
3. **The board.** Every watchlist protocol, plus every other pre-token protocol below the
   watchlist floor that passes the house's name screens (no version markers, no whole word
   *wrapped* / *staked* / *staking*, no exchange name at the head). Traded protocols are
   never ranked; they are the evidence. Rows are banded into value tiers (Tier 1
   Headliners ≥ $150M down to Tier 4 Long shots < $15M).
4. **The dossier.** Every row carries an evidence thesis (its standing in its category,
   its momentum against that category's median, its track record, its peers' pricing), the
   risks its own record shows, and a confidence grade for the evidence behind its price.
   Every line traces to the snapshot's fields; where the record is silent, the dossier
   says so instead of filling the gap.
5. **The validation.** The pricing is tested against the traded market's own recorded
   caps on every build: a two-fold hold-out (fit on one half of the traded protocols,
   predict the other half's caps, swap), a jackknife of every category multiple, a
   seven-day look-back that re-ranks the board from last week's TVLs, and cross-view
   checks against a raw-TVL ranking and a growth-free model. The snapshot holds one
   day's record and no earlier edition of itself, so no past-to-future test is claimed;
   the Method view prints the tests that the record does support, with their numbers.
6. **Deposit-sized farm plans.** Each plan's position is 0.05% of its protocol's own
   TVL (at least $500, at most $10,000), and the detail page shows the sizing — the
   deposit, its share of TVL, and the implied value that share carries — so no plan
   recommends a position the protocol's depth makes absurd.

The dashboard's **Method** view prints the full derived multiple table, every constant,
and the validation results.

## Layout

- `main.ts` — the entry program (Node 22, standard library only). Reads
  `/input/snapshot.json`, writes `/output/board.json`, `/output/data.js`,
  `/output/dashboard/`, `/output/screenshots/` and `/output/dossier.json`.
- `lib/model.ts` — the value model, the board builder and the farm playbooks.
- `vendor/makefun-board.ts` — the kit's dossier library, vendored unchanged.
- `dashboard/` — the static page (board, per-protocol detail, filters, traded peers,
  method). Renders with no network from the `data.js` the program writes beside it.
- `screenshots/` — the board, a protocol's detail view, a filtered view, and a detail
  view scrolled to its deposit-sized farm plan.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Then open `out/dashboard/index.html` in a browser.
