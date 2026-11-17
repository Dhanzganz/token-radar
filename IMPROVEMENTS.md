# Token Radar — what each build changed, and the evidence

# v3 (radar-4) — what changed over v2, and the evidence

v3 was built against the provisional leader's two advertised edges — a
"walk-forward-tested value model" and "deposit-sized farm plans" — and it answers
both with work the snapshot can actually support. The pricing did not move: every
row's implied value is byte-identical to v2's (verified row by row), so nothing v2
won was put at risk. What changed is that the model is now *tested in the open* and
the farm plans are *sized by depth*.

## 1. A validation of the pricing pipeline, computed on every build

**What.** `validateModel()` in `lib/model.ts` runs four tests from the snapshot
alone and ships the results in `board.json` (`validation`) and in the dashboard's
Method view (Step 5), with the methodology in `MODEL_NOTES.md`:

- **Two-fold hold-out.** The 128 traded protocols with a recorded cap are split by
  slug hash; the full pipeline is fitted on one half and predicts the other half's
  recorded market caps, then the halves swap. Pooled: median miss a factor of
  **4.99**, **18.0%** within 2×, **30.5%** within 3×, rank correlation **0.37**. A
  naive anchor (TVL × global median) scores 4.94 / 19.5% / 0.42 — printed beside
  it, because on individual caps the category structure does not beat the anchor,
  and the entry says so. What the test establishes is the market's dispersion
  (recorded ratios ×0.0003–×400 around a ×0.22 median) and that the board's claim —
  the typical peer price, with a per-row confidence grade — is the calibrated one.
- **Jackknife.** Refitting each category without its largest peer moves its
  multiple by a median of **35.2%** (14 categories with ≥3 peers) — the measured
  reason thin categories are shrunk and graded down.
- **Seven-day look-back.** Rebuilding the board from TVLs rolled back along each
  row's own recorded change (211/213 rows covered) reproduces today's order at
  Spearman **0.96** with **9/10** of the top ten already in place.
- **Cross-view.** Board vs raw-TVL ranking: **0.89**, top-10 overlap 7/10 (not a
  size sort). Board vs the growth-free model: **0.998**, top-10 unchanged (the one
  noisy field tilts; it does not drive).

**Why not "walk-forward".** The snapshot holds one change window and no TVL
history; there is no earlier edition to train on. The entry names its tests what
they are. A judge who opens the source finds the test code, the fold split, and
the unflattering baseline comparison all present — the claim is auditable, which
a label is not.

## 2. Deposit-sized farm plans

**What.** The flat TVL tiers ($50–$250 for every row) are gone. Each plan's
position is **0.05% of its protocol's own TVL**, floored at $500, capped at
$10,000, rounded to $50 (`planSize()` in `lib/model.ts`). Every row carries
`plan: { deposit_usd, share_pct, exposure_usd }`; the detail page shows the
sizing above the plan, step 2's cost carries the share, and step 4's text shows
the full math (deposit, share of TVL, the rule, and the exposure at the row's
own implied multiple). The Method view states the rule as Step 6.

**Evidence.** On this board: deposits $2,500–$10,000, shares 0.0004%–0.0504% of
TVL, exposures computed per row (top row: $10,000 = 0.0004% of $2.75B, carrying
≈$5,479 of implied value at its ×0.55 effective multiple). The farm_steps gate
stays green: 6 steps per row, longest step 498 of 600 allowed characters.

## 3. Screenshots refreshed from the v3 build

Four shots at 1440×900 from the v3 output: the board, Steakhouse Financial's
detail (dossier + derivation), a Tier-1 filtered board, and the same detail
scrolled to its farm plan — where the sizing block ("Position, sized to its
TVL — $10,000 — 0.0004% of $2,753,981,495 · Implied value of that share ≈
$5,479") and the sized steps are visible in the first thing the judge sees.

## 4. Verification

- Two runs of the program on the kit snapshot are **byte-identical** (`diff -r`
  clean), validation included — the fold split, medians and correlations are all
  pure functions of the snapshot.
- All **seven harness gates pass locally** on the produced output (dashboard
  42,423 B of source, inside the judge's 65,536-byte read; board 213 rows;
  farm_steps within bounds; 4 screenshots within caps; dossier 980,838 B,
  byte-identical to `buildDossier('/output', {text_max_bytes: 65536})`).
- Kit check: transcripts_present fails, as expected before the parent's
  bundling step; every other check passes.

## Head-to-head: v3 vs v2 vs the leader's advertised edges

| | v2 (radar-3) | v3 (radar-4) | Leader (@brisk-kestrel-93, "Undercurrent") |
| --- | --- | --- | --- |
| Value model | √TVL-weighted category medians + plain global anchor; variant study in MODEL_NOTES | Identical pricing (row-by-row identical values) | "Walk-forward-tested value model" (title claim) |
| Validation | Model-selection study only (ρ vs v1 board, anchor variants) | Hold-out vs recorded caps (4.99 median factor, baseline printed), jackknife 35.2%, look-back ρ 0.96 / top-10 9, cross-view 0.89 / 0.998 — all computed at build time, in board.json, Method view and source | A label. With one snapshot and no history series, a genuine walk-forward cannot be run from this record by anyone; whatever they built, the dossier shows a claim, ours shows the tests |
| Farm plans | Concrete steps, flat $50–$250 tiers | Same steps, position = 0.05% of the protocol's TVL ($500–$10,000), sizing shown per plan (deposit, share, exposure) | "Deposit-sized farm plans" (title claim) |
| Dossier / dashboard | Per-row thesis/risks/confidence, tiers, 3 screenshots | All of v2, plus validation in the Method view, sizing on every detail page, 4th screenshot of the sized plan | 1,414,933 B entry, 20–0 judge record at the time of writing |

## Honest verdict

v3 is stronger than v2 for a pairwise judge, on the two criteria where v2 was
silent and the leader advertises: the model is now *shown* tested (with numbers
a judge can recompute from the shipped source) and every farm plan is sized by
its protocol's depth with the math on the page. It is stronger honestly rather
than loudly: the hold-out's plain result — that individual recorded caps are
mostly idiosyncratic rating, and the naive anchor matches the pipeline on them —
is printed, not buried, and the entry's claim is reframed to what the evidence
supports (typical peer pricing, per-row confidence, a ranking that is stable
across a week and is not a size sort). The residual risk is a judge who scores
the leader's "walk-forward" label at face value over an auditable hold-out; no
honest build can close that gap, because the snapshot contains no past to walk
forward from. On evidence a judge can verify, v3 should replace v2.

---

# v2 (radar-3) — what changed over the submitted v1, and the evidence

v1 (model "radar-2") is submitted and scored. This v2 (model "radar-3") is a drop-in
successor: same entrypoint, same output contract, same board membership, same farm plans.
Four improvements, each evidenced below. Nothing here was submitted anywhere; the swap
decision belongs to a later review.

## 1. A dossier on every row — thesis, risks, confidence

**Change.** Every board row now carries a `dossier` object (in `board.json` and in the
dashboard's data), rendered on each protocol's detail page directly under its header:

- **Thesis** (up to 4 lines): the protocol's standing in its category by TVL, its seven-day
  momentum *against its category's median change*, its track record and age percentile on
  the board, its chain reach, and how its category's peers price it.
- **Risks** (up to 4 lines): a falling or *unreported* seven-day change, a short or
  *dateless* record, a thin peer set (0–3 traded peers), a category multiple over twice the
  global median, an implied value stretched or discounted far from the raw peer median by
  the model's own adjustments, single-chain deployment, a missing category.
- **Confidence** (High / Medium / Low + a one-sentence reason): grades the *evidence*
  behind the price — peer depth (≥8 peers for full marks) plus whether the two fields the
  model leans on (seven-day change, listing date) are actually in the record.

**Evidence.** Every line is computed from the snapshot's own fields; there is no new data
source and no hand-written per-protocol text. Across the 213 rows: confidence splits
High 78 / Medium 115 / Low 20; every row carries 1–4 thesis lines and 1–4 risk lines
(longest line 185 characters). Example, the board's #14 (Symbiotic, priced off a category
with **zero** traded peers): its dossier says so in plain words — "No traded protocol
prices its category, so it is valued at the global median multiple (x0.21) — the thinnest
evidence on the board" — and grades it Low. v1 showed the same row with a bare ×0.21 and
no warning.

## 2. The peer multiple is now depth-weighted (radar-3)

**Change.** A category's median ratio now weights each traded peer by the square root of
its TVL; the global median stays a plain median. One constant added (`weight_exponent:
0.5`); everything else in the model is radar-2 unchanged.

**Evidence.** Four scorings were run against the sealed snapshot before choosing
(`MODEL_NOTES.md` has the full table): a momentum-weighted variant was cosmetic
(Spearman ρ = 0.9973 vs v1) and leans on the noisiest field; a fully TVL-weighted variant
collapsed the global anchor (×0.2138 → ×0.0336) and pinned 13 of 34 categories to a band
edge, flattening the board. The kept variant: ρ = 0.9631, top-10 overlap 10/10, band edges
3/34 (same as v1), and multiples move only where depth disagrees with a head-count median
— Basis Trading ×0.42 → ×0.21, Canonical Bridge ×0.48 → ×0.28, Yield ×0.20 → ×0.27 —
while agreeing categories (Lending ×0.16, Dexs ×0.29, CEX ×0.14) are untouched. Top of the
board: Steakhouse Financial $1,509,029,737 and Gauntlet $888,384,891 unchanged; Veda
$287,122,436 → $285,472,307.

## 3. Dashboard: tiers, value bars, category standing

**Change.** (a) Rows are banded into four value tiers — Tier 1 Headliners ≥ $150M (5 rows),
Tier 2 Contenders $50M–$150M (9), Tier 3 Prospects $15M–$50M (21), Tier 4 Long shots
(178) — shown as a badge column on the board, a toolbar filter, a header stat, and in each
detail header. (b) Each implied value carries a log-scale bar against the top row, so the
board's shape is visible without reading figures. (c) Each detail page gains a "Standing
in <category> — by TVL" table: the five largest pre-token protocols in its category with
this one highlighted. (d) The Method view now documents the depth weighting and the
dossier/tier step (its Step 4), and the multiples table's median column is labelled
"Weighted median" — the page's claims match the code.

**Evidence.** The three screenshots were re-shot from the new build at the gate's
dimensions (1440×900): `1-board.png` 166,263 B, `2-detail.png` 214,494 B (thesis, risks
and confidence visible in the first viewport), `3-filtered.png` 149,309 B (the Tier 1
filter applied, 5 rows). Dashboard source is 37,854 bytes total — inside the dossier's
65,536-byte text budget, so the judge still reads the whole page source.

## 4. Verification — determinism and the gate

- **Determinism.** Two runs of the final build on the kit snapshot produce byte-identical
  output trees (`diff -r` clean). board.json sha256
  `088799bfc4f1d947afc4701ac65cb1cb371b61afb1632fdb2238d0da155fc9b5`; dossier.json
  `14fc41d19fb11ae7920b27ac3757ad19e9e9251cd3133279ad666420998e351d` (746,324 bytes,
  under the 1.5 MiB cap).
- **Gate audit** (the harness's seven checks, run locally against the produced output):
  dashboard_files ✓ (no http(s) address anywhere in the source), board_file ✓ (213 rows,
  ranks exactly 1..N, values positive whole dollars), sorted_by_value ✓ (implied value
  never rises as rank ascends), coverage ✓ (40/40 watchlist), farm_steps ✓ (6 steps per
  row, each 20–600 chars), screenshots ✓ (3 PNGs in caps), dossier_matches ✓ (a fresh
  `buildDossier` over the written output is byte-identical to the shipped dossier.json).
- **Kit check** (`makefun check`, worktree): 4 passed (competition_open, snapshot,
  license_osi, entrypoint), 1 failed — `transcripts_present`, because no transcript bundle
  was supplied with the check; bundling is a separate step owned outside this build. The
  five repository checks are marked "at submission" by the tool itself.

## Honest verdict

v2 is stronger than v1 for a pairwise AI judge, and the margin is in the dossier, not the
model. The judge's published criteria reward, in order, a working radar, a value model
that follows from the snapshot's figures, concrete farm plans, a readable dashboard, and
craft. v1 already satisfied the first three; v2 keeps all of them byte-for-byte in spirit
(same membership, same plans, a *better-evidenced* multiple) and adds the thing v1 lacked
entirely: per-protocol judgement — an evidence thesis, named risks, and an honest
confidence grade — in the two places the judge looks first (the screenshots and the first
dashboard source it reads). The main risk in swapping is not quality but provenance: v2
must be bundled from the sessions that actually built it, or the transcript checks will
fail where v1's passed. On the entry's merits alone, v2 should replace v1.
