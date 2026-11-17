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
