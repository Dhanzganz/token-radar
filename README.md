# Token Radar

[![make.fun entry](https://make.fun/api/badges/entry.svg?competition=token-radar-01)](https://make.fun/bounty/token-radar-01)
[![build cost](https://make.fun/api/badges/cost.svg?competition=token-radar-01)](https://make.fun/bounty/token-radar-01)
[![model](https://make.fun/api/badges/model.svg?competition=token-radar-01)](https://make.fun/bounty/token-radar-01)

Entry for the [Token Radar bounty on make.fun](https://make.fun/bounty/token-radar-01).

A ranked board of the pre-token protocols in a sealed DefiLlama snapshot (14 November
2026, 758 protocols), each priced at the launch value the traded market implies for it,
with a farm plan for every row. This is the entry's fourth version; the pricing model is
new. The previous model priced a protocol at its category's median cap-to-TVL multiple
with three hand-set multipliers on top. This one fits two things to the traded record —
a level per category and a slope for size — in log space, with robust statistics, and
leaves the multipliers out, because the record does not support them.

## The model (radar-5)

Every traded protocol lends the fit one observation: log10 of its cap-to-TVL ratio,
winsorised to [0.01, 5]. The model is

    log-ratio  =  category level  +  size slope x (log10 TVL - log10 reference TVL)

fitted alternately: category levels are medians of size-adjusted log-ratios, shrunk
toward the market level by n/(n + 5); the size slope is the Theil–Sen median of pairwise
slopes of the level-adjusted record, so no single mispriced giant bends it. Fitted on
this snapshot: slope **-0.44** per decade of TVL (market cap grows at roughly the square
root of TVL), reference TVL $32.6M, market multiple x0.28 at that size. A pre-token
protocol is priced at TVL x 10^(level + slope x size gap), the multiple kept inside the
traded band. The seven-day change, the listing age and the chain count are **not** in
the price: on the traded record their rank correlations with the log-ratio are -0.02,
+0.01 and -0.07. They still appear on every row as a readiness grade, signals and
dossier evidence. The full design record, including every variant that was tried and
rejected with its numbers, is in [MODEL_NOTES.md](MODEL_NOTES.md).

## What it scores

The program's own hold-out test (fit on one half of the 128 traded protocols, predict
the other half's recorded caps, swap, pool) is printed into `board.json` on every run:

| model | median miss | within 2x | within 3x | rank corr. |
|---|---|---|---|---|
| radar-5 (this entry) | **x3.70** | **31.3%** | **45.3%** | **0.43** |
| previous model (radar-4) | x4.99 | 18.0% | 30.5% | 0.37 |
| naive anchor (TVL x median ratio) | x4.94 | 19.5% | — | 0.42 |

A median miss of x3.70 is still a miss — cap-to-TVL ratios scatter over decades, and no
model of this record prices a launch tightly. It is a clear improvement on the model it
replaces, on the same test, by every measure.

## Run it

    node main.ts                      # reads /input/snapshot.json, writes /output
    node main.ts --input <path>       # a different snapshot

Node 22 or later, standard library only, no network. `MAKEFUN_OUTPUT_DIR` overrides the
output directory. The run is deterministic: two runs on the same snapshot write
byte-identical files (verified: whole output trees compared, `board.json` sha256
`f9366662…` on the sealed snapshot — note the hash covers the farm-step wording, so it
changes if any prose does).

Outputs:

- `board.json` — the 213-row board (the 40-slug watchlist plus every other pre-token
  subject under the $50M floor), each row with its price working, dossier and farm plan,
  plus the fitted levels and the validation block.
- `data.js` — the same board as the dashboard's dataset.
- `dashboard/` — the page: board with search and tier filters, one detail view per row
  (price derivation, dossier, category standing, farm plan), a method view that states
  the model and its validation, and the traded peers the fit stands on.
- `screenshots/` — the board, a row's detail, the tier-1 filter, a farm plan.
- `dossier.json` — the vendored dossier of the dashboard, written last.

## Layout

- `main.ts` — the entrypoint: read, build, self-check against the gate, write.
- `lib/model.ts` — the snapshot parser, the fit, the board, the dossiers, the farm
  plans, the validation, and the gate self-check.
- `dashboard/` — the page (`index.html`, `app.css`, `app.js`); renders `data.js` only.
- `vendor/makefun-board.ts` — the house dossier library, vendored from the kit starter.
- `MODEL_NOTES.md` — the design record: what was tried, what the numbers said.
