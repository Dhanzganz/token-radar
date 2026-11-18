# Model notes — radar-5

The design record for the Token Radar pricing model, version radar-5: what the traded
record actually shows, the model fitted to it, every variant that was measured on the
way, and the ones that were rejected with their numbers. The test throughout is the
house hold-out: the 128 traded protocols of the sealed snapshot (DefiLlama, 14 November
2026) split in two by an FNV-1a hash of the slug; the pipeline is fitted on one half and
predicts the other half's recorded market caps; the halves swap and the errors pool.
The previous model's published figures on this test are the bar: median miss x4.99,
18.0% of predictions within 2x, 30.5% within 3x, rank correlation 0.37. The naive anchor
(TVL x the fit half's plain median ratio) scores x4.94 / 19.5% / 0.42. A scratch harness
re-implementing the previous model exactly reproduced its published numbers before any
variant was trusted (pooled x4.987 / 18.0% / 30.5% / 0.3695, folds x5.59 and x4.00).

## What the record shows

Three findings drove the redesign.

**Size is the dominant signal the old model ignored.** Across the 128 traded peers, the
rank correlation between log-ratio and log-TVL is -0.379. Median ratios by TVL bucket
fall monotonically: x0.87 under $25M, x0.21 at $25-100M, x0.13 at $100-500M, x0.03 above
$500M. A least-squares fit of log-ratio on log-TVL has slope -0.478: market cap grows at
roughly TVL^0.52. The old model priced a $2.75B protocol and a $3M protocol in the same
category at the same multiple; the record says their multiples differ by more than a
decade. This, not any multiplier, is where the old model's error lived.

**The old multipliers price nothing.** Rank correlations with the log-ratio: seven-day
TVL change -0.015, listing age +0.010 (age buckets are not even monotone), chain count
-0.070. Ablating the old model confirms it: removing all three factors improves its
median miss (x4.87 against x4.99); keeping only growth gives x4.81. The factors were
hand-set in the first version and never re-earned their place.

**Ratios scatter over decades, so fit in log space with medians.** Raw ratios run from
0.0003 to 400 (median x0.214); within a category the interquartile range of the log-ratio
is 0.5 to 1.7 decades. Arithmetic shrinkage of a median toward another median — the old
model's (n·raw + 8·global)/(n + 8) — mixes scales that are not comparable; in log space
the same shrinkage is a proper weighted average of positions on the scale the data
lives on.

## The model

For each traded peer, y = log10 of its cap-to-TVL ratio winsorised to [0.01, 5]. The fit
alternates five passes:

- given the slope, each category's **level** is the median of its peers' size-adjusted
  y, shrunk toward the market level (the median of all adjusted y) by n/(n + 5);
- given the levels, the **size slope** is the Theil–Sen median of the pairwise slopes of
  the level-adjusted record against (log10 TVL - reference), clamped to [-0.9, +0.1].
  The reference is the peers' median log-TVL.

A protocol is priced at TVL x 10^(level + slope x size gap), the multiple clamped to the
traded band [0.01, 5]. Fitted on all 128 peers: slope **-0.4412**, reference TVL
**$32,564,327**, market level **x0.2754** at that size. Category levels at the reference
size run from x0.57 (Canonical Bridge) and x0.54 (Privacy) down to x0.14 (Liquid
Staking) and x0.16 (Liquidity Manager) — after shrinkage, and after size is accounted
for, which is why they differ from the raw category medians: CEX, for example, sits at
x0.51 at typical size because its raw median was dragged down by its giants.

Hold-out, pooled, the shipped pipeline measuring itself: **median miss x3.70, 31.3%
within 2x, 45.3% within 3x, rank correlation 0.426** — better than the previous model on
every measure, and better than the naive anchor on miss and within-2x (the anchor's rank
correlation, 0.421, is matched, not beaten: ranking is mostly size, and the anchor has
size). Fold detail: fitted on 69, tested on 59 — x3.78 / 27.1% / 0.413; fitted on 59,
tested on 69 — x3.38 / 34.8% / 0.441. Per-fold slopes fit at -0.336 and -0.446, so the
size term is not one fold's artefact. A five-fold split tells the same story (x3.52 /
32.0% / 0.402). The board's own jackknife (in board.json): refitting without each
category's largest peer moves the median category level by 8.3%.

## Variants measured, and what became of them

Two-fold pooled hold-out; median miss / within 2x / within 3x / rank correlation.

| variant | median | 2x | 3x | rho | verdict |
|---|---|---|---|---|---|
| previous model (radar-4), full | 4.99 | 18.0% | 30.5% | 0.369 | the bar |
| radar-4, factors ablated | 4.87 | 18.0% | 29.7% | 0.374 | factors earn nothing |
| log levels only (no size slope) | 4.99 | 21.1% | 32.0% | 0.395 | log space alone helps ranking, not miss |
| log levels + OLS slope | 3.67 | 31.3% | 44.5% | 0.420 | close; OLS chases outliers |
| log levels + Theil–Sen slope, shrink 4 | 3.59 | 31.3% | 44.5% | 0.422 | kept family |
| **shrink 5 (shipped)** | **3.70** | **31.3%** | **45.3%** | **0.426** | **shipped** |
| shrink 6 | 3.74 | 31.3% | 43.8% | 0.428 | same family |
| shrink 8 | 3.76 | 30.5% | 44.5% | 0.436 | same family |
| log + TS slope, sqrt-TVL-weighted medians | 4.27 | 31.3% | 41.4% | 0.354 | rejected: weighting hurts in log space |
| size slope only, no categories | 3.74 | 27.3% | 41.4% | 0.437 | rejected: categories carry the 2x share |
| mean levels, empirical-Bayes shrink | 3.85 | 30.5% | 45.3% | 0.409 | rejected: means chase the scatter medians ignore |
| hinge slope (flatter above $100M) | 3.49 | 32.8% | 44.5% | 0.422 | rejected: five-fold rho falls to 0.387; a two-fold artefact |
| slope damped x0.85 | 3.86 | 28.9% | 43.8% | 0.419 | rejected: the record's slope is the record's |
| shipped model + old growth/maturity/reach | 3.50 | 27.3% | 44.5% | 0.420 | rejected: buys median, pays in 2x |
| shipped model + growth only | 3.55 | 31.3% | 46.1% | 0.426 | not kept: see below |

Shrink 4/5/6/8 are one family within noise of each other; 5 is the middle of the family
and the roundest statement of the rule (a category's own record counts once it has five
peers against it). The hinge and the growth-only rows are recorded because they were
measured, not kept: the hinge's gain does not survive the five-fold split, and the
growth multiplier's gain sits entirely in the median while its field's own correlation
with the target is -0.02 — on 128 points that is fold luck, and it would put one week's
TVL move back into every price, which is the behaviour this redesign exists to remove.

## What the board looks like now

The size term reprices the top of the board hard, and that is the honest consequence of
the record, not a defect: traded protocols at $2.75B of TVL trade at x0.03-0.05, so
Steakhouse Financial — $2.75B of TVL the old model priced at $1,509,029,737 — is priced
at $147,730,003, and the board's top is Gauntlet ($108M) and Nonce Capital ($58M)
behind it. The value tiers were re-barred to the model's own scale (Headliners from
$35M: 10 rows) because the old bars ($150M) would have left the top tier empty. Every
row's price stays inside the traded band by construction: implied/TVL is within
[0.01, 5] for all 213 rows.

## Limits, stated plainly

- 128 peers is a small record, and category levels rest on as few as one peer (14 board
  rows sit in categories with no traded peer at all and are priced at the market level;
  their dossiers say so). The jackknife and the fold spread are the honest measure of
  how much to trust a level.
- The slope is fitted on traded protocols and extrapolated to pre-token ones; a row more
  than a decade from the reference size is priced mostly by that extrapolation, and its
  dossier flags it.
- A median miss of x3.70 means the typical price is still off by nearly fourfold in one
  direction or the other. The model orders the board far better than it prices any
  single launch, and the dashboard's method view says so.
