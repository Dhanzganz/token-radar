# Token Radar v2 — what changed over the submitted v1, and the evidence

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
