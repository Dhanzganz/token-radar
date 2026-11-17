# Model notes — how radar-3's peer multiples were chosen

radar-3 changes exactly one thing in radar-2's value model: how a category's peer multiple
is taken from its traded peers. Four candidate scorings were run against the same sealed
snapshot (DefiLlama, as of 2026-11-14; 758 protocols, 213 board rows) before one was kept.
This file is the record of that comparison. All figures below are the runs' own output.

## The baseline was verified first

A scratch re-implementation of radar-2 reproduced the submitted board **exactly — 213 of
213 rows, identical rank order and identical implied values** — so every variant was
measured against a baseline known to be the real one, not an approximation of it.

## The variants

- **v1 — radar-2 (baseline).** Category multiple = plain median of the peers' clamped
  mcap/TVL ratios, shrunk toward the plain global median (×0.2138); growth weight 0.35.
- **M — momentum-weighted.** v1's multiples, but the growth factor's weight doubles
  (0.35 → 0.70) and its clamp widens (−50…+100 → −60…+150).
- **L — fully depth-weighted.** Category medians *and* the global median weighted by each
  peer's full TVL; growth weight 0.25.
- **L2a — depth-weighted categories, plain anchor.** Category medians weighted by full
  TVL; the global median stays plain; growth weight 0.35.
- **L2b — radar-3 (kept).** Category medians weighted by the **square root** of each peer's
  TVL; the global median stays plain; growth weight 0.35. Everything else — clamps,
  shrinkage, band, growth/maturity/reach factors, board membership — is radar-2 unchanged.

## The numbers

| Variant | Spearman ρ vs v1 | Top-10 overlap | Top-25 overlap | Categories pinned at a band edge |
| --- | --- | --- | --- | --- |
| M (momentum) | 0.9973 | 10/10 | 25/25 | 3/34 (as v1) |
| L (full TVL, weighted anchor) | 0.9124 | 9/10 | 23/25 | **13/34** |
| L2a (full TVL, plain anchor) | 0.9211 | 9/10 | 23/25 | 4/34 |
| L2b (√TVL, plain anchor) | 0.9631 | 10/10 | 24/25 | 3/34 (as v1) |

No variant priced any row outside the peer band (implied/TVL within [0.01, 5] for all 213
rows in every run).

**Why M was rejected.** It is cosmetic: the growth factor is clamped, so doubling its
weight moves almost nothing (ρ = 0.9973; the top 25's mean growth multiplier goes from
×0.991 to ×0.983). What little it does change, it changes by leaning harder on the single
noisiest field in the snapshot — one seven-day TVL change. More exposure to the weakest
evidence is not a refinement.

**Why L was rejected.** Weighting the *global* median by TVL breaks the anchor. The
snapshot's largest traded protocols are staking and bridge giants that trade at very low
mcap/TVL, so the TVL-weighted global median collapses from ×0.2138 to **×0.0336**. The band
around it ([global/3, global×3]) then crushes **13 of 34 categories onto a band edge** —
Dexs, Yield, Canonical Bridge and Basis Trading all land on exactly ×0.1007 — and category
evidence is flattened into a near-uniform price. The top row's implied value falls from
$1.51B to $292M not because any evidence about it changed, but because the anchor moved.
A model whose categories stop differing has less to say, not more.

**Why L2b over L2a.** Both keep the plain anchor and differ only in the weight. Full-TVL
weights let a category's single largest peer pick the median outright; square-root weights
let depth count without handing it the decision — a peer with 100× another's TVL counts
10×, not 100×. L2b is also the most conservative change that is still real: the top of the
board is untouched where the evidence is unchanged, and multiples move only where depth
genuinely disagrees with a head-count median:

| Category | Peers | radar-2 multiple | radar-3 multiple |
| --- | --- | --- | --- |
| Basis Trading | 7 | ×0.42 | ×0.21 |
| Canonical Bridge | 8 | ×0.48 | ×0.28 |
| Yield | 9 | ×0.20 | ×0.27 |
| RWA | 9 | ×0.25 | ×0.17 |
| Liquid Staking | 9 | ×0.12 | ×0.11 |
| Lending | 15 | ×0.16 | ×0.16 (unchanged) |
| Dexs | 11 | ×0.29 | ×0.29 (unchanged) |
| CEX | 9 | ×0.14 | ×0.14 (unchanged) |

Top of the board under radar-3: Steakhouse Financial **$1,509,029,737** and Gauntlet
**$888,384,891** — unchanged, because Risk Curators has a single traded peer and a median
of one is the same weighted or not — then Veda **$285,472,307** (radar-2: $287,122,436).

## The kept rule, stated plainly

A peer's ratio counts in its category's median in proportion to the square root of its
TVL. The global median — the anchor for shrinkage and for the band — stays a plain median
of every traded ratio. The weighted median orders pairs by ratio, then by slug, so the
result never depends on the order the snapshot listed the peers in, and two runs of the
program on the same snapshot stay byte-identical.

## The validation (radar-4)

radar-4 keeps radar-3's pricing untouched — every row's implied value is identical to
v2's — and adds the thing radar-3 never had: the model is tested, on every build,
against the only ground truth the snapshot carries, and the tests are printed in the
dashboard's Method view and carried in `board.json` under `validation`.

**What the record can and cannot support.** The snapshot's ten protocol fields are
`slug, name, category, chains, tvl_usd, change_7d, mcap_usd, listed_at, gecko_id,
symbol`. There is exactly one change window (seven days), one age field, and market
caps for the traded protocols. There is no TVL history series and no earlier edition
of the snapshot, so a genuine walk-forward — fit on the past, grade on the future —
is impossible from this record, and nothing here is labelled one. What the record
does support is a hold-out test, a jackknife, a seven-day look-back, and cross-view
consistency checks. Those are what radar-4 runs.

**Hold-out test.** The 128 traded protocols with a recorded cap and a TVL are split
into two folds by an FNV-1a hash of the slug (59 / 69). The whole pricing pipeline —
category multiples, shrinkage, band, and each protocol's own growth, maturity and
reach factors — is fitted on one fold and predicts the other fold's recorded market
caps; then the folds swap and the results pool:

| | Median miss (factor) | Within 2× | Within 3× | Rank correlation |
| --- | --- | --- | --- | --- |
| Full pipeline | 4.99 | 18.0% | 30.5% | 0.37 |
| Naive anchor (TVL × global median) | 4.94 | 19.5% | — | 0.42 |

Fold by fold, the pipeline's median miss is 5.59 (fold 0, fitted on 69, tested on 59)
and 4.00 (fold 1, fitted on 59, tested on 69). The honest reading: on individual
traded protocols the category structure does **not** beat the global anchor. A
recorded cap carries an idiosyncratic market rating — the record's own ratios run
from ×0.0003 to ×400 around a median of ×0.22 — that no TVL-based model can foresee,
and the hold-out measures exactly that dispersion. The board therefore claims the
*typical* peer price for a category, not a forecast of any protocol's rating, and
each row's confidence grade carries how much evidence stands behind its price. The
test's job is to keep that claim calibrated and printed, not to decorate it.

**Jackknife.** Every category with at least three traded peers is refitted without
its largest peer: across the 14 qualifying categories the multiple moves by a median
of 35.2%. Thin categories genuinely lean on their largest peer — which is why the
model shrinks them toward the global median and why the dossier marks their rows'
confidence down. The number is printed rather than smoothed over.

**Seven-day look-back.** For each board row carrying a seven-day change (211 of
213), last week's TVL is reconstructed as `tvl / (1 + change_7d / 100)`, the row is
re-priced with peer multiples held at the fetch's, the growth factor neutral (the
prior week's change is not in the record) and maturity aged seven days, and the
board is re-ranked. The look-back order correlates **0.96** (Spearman) with today's,
and **9 of the top 10** were already there. The ranking is not one day's artefact.

**Cross-view checks.** Against a raw-TVL ranking the board correlates 0.89 with 7
of the top 10 shared — the model is not a size sort. Against the same model with
the growth factor removed it correlates 0.998 with the top 10 unchanged — the one
noisy field in the record tilts the board; it does not drive it.

## Deposit-sized farm plans (radar-4)

radar-3 sized every farm position from flat TVL tiers ($50–$250). radar-4 sizes each
plan by its protocol's own depth: the deposit is **0.05% of the protocol's TVL**,
kept between **$500** and **$10,000** and rounded to the nearest $50. Every detail
page shows the sizing — deposit, share of TVL, and the exposure (the deposit priced
at the row's own implied multiple) — and the plan's hold step repeats the math. On
this board the deposits run $2,500–$10,000 (the $500 floor never binds: the
snapshot's own inclusion floor is $5M of TVL) and the shares run 0.0004%–0.0504%
of TVL. The share is the honest figure: the same $10,000 is a sliver of Steakhouse
Financial's $2.75B and a twentieth of a percent of a $20M protocol, and no plan
recommends a position its protocol's depth makes absurd.
