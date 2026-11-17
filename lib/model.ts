// Token Radar model "radar-4": one sealed DefiLlama snapshot in, one ranked board out.
//
// The board's job is to find protocols that record no token yet, say what a launch would be
// worth, and tell a reader how to farm each one. Every number on the board is derived from
// the snapshot's own figures at run time; no protocol name is ever special-cased. radar-4
// keeps radar-3's pricing and adds two things radar-3 did not have: a validation of the
// pricing pipeline against the traded market's own recorded caps (a two-fold hold-out test,
// a seven-day look-back and cross-view checks, all computed from the same snapshot and
// printed in the dashboard's Method view), and farm plans whose position size is set by
// each protocol's own depth — a stated share of its TVL, capped — with the sizing shown.
//
// The value model, in one paragraph. Protocols whose token already trades are the peer set:
// for each category, the model takes the traded protocols' market-cap-to-TVL ratios, clamps
// them to a sane band, and uses a median shrunk toward the global median by the peer count,
// so a category with two wild peers cannot dominate. radar-3 weights that category median
// by peer depth: each peer's ratio counts in proportion to the square root of its TVL, so
// the protocols the market has actually capitalised set the price, while no single giant
// can dictate it; the global median stays a plain median of every ratio, so the anchor and
// the band around it do not move. (Three variants were scored against this snapshot before
// this one was kept; MODEL_NOTES.md in this repository holds the comparison.) A pre-token
// protocol's implied value is its TVL times its category's peer multiple, adjusted by three
// documented factors: a damped seven-day growth factor, a maturity factor that grows with
// how long the protocol has run with no token, and a small reach factor for the chains it
// already spans. The dashboard's Method view prints the derived multiple table, so a reader
// can audit every figure. Each row also carries a dossier — an evidence thesis, the risks
// its own record shows, and a confidence grade for the evidence behind its price — every
// line of it traced to the snapshot's fields, and a value tier for the board's bands.
//
// Board membership mirrors the house's own reading of the snapshot: every watchlist slug is
// ranked, plus every other pre-token protocol below the watchlist floor that is not a wrapped,
// staked or versioned product (name screens and the exchange-prefix screen are the house's).
// Protocols above the floor that the watchlist leaves out failed one of those screens, so the
// board leaves them out too; the traded set is carried separately as the peer evidence.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and board.json carries it. */
export const MODEL_VERSION = 'radar-4';

/** The model's constants. Every one is stated in the dashboard's Method view. */
export const MODEL = {
  /** Traded peers' mcap/TVL ratios are clamped to this band before any median is taken. */
  ratio_floor: 0.01,
  ratio_cap: 5,
  /** A peer's ratio counts in its category's median in proportion to TVL raised to this power. */
  weight_exponent: 0.5,
  /** A category median is shrunk toward the global median as if the global had this many peers. */
  shrink_peers: 8,
  /** A category's multiple is also kept inside this band around the global median. */
  multiple_band: 3,
  /** Seven-day TVL change is clamped to this band, then damped by growth_weight. */
  growth_floor_pct: -50,
  growth_cap_pct: 100,
  growth_weight: 0.35,
  /** Maturity runs from maturity_floor to maturity_floor + maturity_range over maturity_days. */
  maturity_floor: 0.75,
  maturity_range: 0.45,
  maturity_days: 1825,
  /** The maturity multiplier for a protocol whose listing date the snapshot does not carry. */
  maturity_unknown: 0.9,
  /** Reach: this much per chain past the first, for at most reach_chains extra chains. */
  reach_per_chain: 0.02,
  reach_chains: 10,
  /** A farm plan's position is this share of the protocol's own TVL (0.0005 = 0.05%). */
  deposit_share: 0.0005,
  /** No farm position is smaller than this, however thin the protocol. */
  deposit_floor_usd: 500,
  /** No farm position is larger than this, however deep the protocol. */
  deposit_cap_usd: 10_000,
  /** Positions are rounded to this many dollars, so a plan reads as a round sum. */
  deposit_round_usd: 50,
} as const;

/** The board's value tiers: implied-value bands, widest first. The dashboard filters by them. */
export const TIERS = [
  { tier: 1, label: 'Headliners', min_usd: 150_000_000 },
  { tier: 2, label: 'Contenders', min_usd: 50_000_000 },
  { tier: 3, label: 'Prospects', min_usd: 15_000_000 },
  { tier: 4, label: 'Long shots', min_usd: 0 },
] as const;

/** The tier a row's implied value falls in. */
export function tierFor(impliedUsd: number): number {
  for (const t of TIERS) if (impliedUsd >= t.min_usd) return t.tier;
  return TIERS[TIERS.length - 1]!.tier;
}

/** One category's derived peer multiple: the evidence behind every row in that category. */
export interface CategoryMultiple {
  category: string;
  peers: number;
  raw_median: number;
  multiple: number;
}

/** A farm step before it is flattened: the action, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/**
 * A farm plan's position size, set by the protocol's own depth: the deposit, the share of
 * the protocol's TVL it makes up, and what that share is priced at by the row's own
 * implied value — the model's arithmetic, shown on the detail page and in the plan itself.
 */
export interface PlanSize {
  deposit_usd: number;
  share_pct: number;
  exposure_usd: number;
}

/** One protocol in a row's category standing: the biggest pre-token peers in its category. */
export interface CatPeer {
  slug: string;
  name: string;
  tvl_usd: number;
}

/**
 * A row's dossier: the evidence for its price, the risks its own record shows, and a
 * confidence grade for that evidence. Every line is built from the snapshot's fields —
 * TVL, seven-day change, listing date, chains and the derived peer table — and nothing
 * else: where the record is silent, the dossier says so instead of filling the gap.
 */
export interface Dossier {
  thesis: string[];
  risks: string[];
  confidence: 'High' | 'Medium' | 'Low';
  confidence_reason: string;
}

/** One row of board.json: the ranked board's row, with the model's working shown. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  grade: string;
  tier: number;
  signals: string[];
  model: {
    peer_multiple: number;
    peers: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  cat_rank: number;
  cat_size: number;
  cat_top: CatPeer[];
  dossier: Dossier;
  plan: PlanSize;
  farm_steps: string[];
}

/** The dashboard's view of one board row: everything the page renders, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  grade: string;
  tier: number;
  signals: string[];
  peer_multiple: number;
  peers: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
  cat_rank: number;
  cat_size: number;
  cat_top: CatPeer[];
  dossier: Dossier;
  plan: PlanSize;
  farm_steps: string[];
}

/** A traded protocol: the market has already priced it, so the board shows its own figures. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** One fold of the hold-out test: the half of the traded market the model was graded on. */
export interface HoldoutFold {
  fold: number;
  fitted_on: number;
  tested_on: number;
  /** The median prediction error as a factor: 10 to the median absolute log10 error. */
  median_factor: number;
  within_2x_pct: number;
  spearman: number;
}

/**
 * The model's validation, computed from the snapshot itself at run time. The snapshot is
 * one day's record — it holds no earlier edition of itself — so no test here trains on the
 * past and grades on the future. What the record does support, and what this is: a two-fold
 * hold-out test (the pricing pipeline is fitted on one half of the traded market and graded,
 * unseen, on the other half's recorded market caps, then the halves swap), a seven-day
 * look-back (each board row's TVL is rolled back along its own recorded seven-day change
 * and the board is re-ranked), and cross-view checks (the board's ranking against a raw-TVL
 * ranking and against the same model with the growth factor removed).
 */
export interface Validation {
  peers_tested: number;
  folds: HoldoutFold[];
  /** Pooled hold-out results across both folds. */
  median_factor: number;
  within_2x_pct: number;
  within_3x_pct: number;
  spearman: number;
  /** The same hold-out graded for a naive anchor: TVL times the fit half's global median. */
  baseline_median_factor: number;
  baseline_within_2x_pct: number;
  baseline_spearman: number;
  /** Jackknife: the median movement of a category multiple when its largest peer is removed. */
  multiples_jackknife_median_pct: number;
  multiples_jackknife_categories: number;
  lookback: { covered: number; board_size: number; spearman: number; top10_overlap: number };
  views: { tvl_spearman: number; tvl_top10: number; nogrowth_spearman: number; nogrowth_top10: number };
}

/** Everything the dashboard renders: the board, the traded peer set, and the model behind both. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  constants: typeof MODEL;
  tiers: typeof TIERS;
  global_multiple: number;
  multiples: CategoryMultiple[];
  scanned: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  validation: Validation;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Round to 4 decimal places, for the model's published working. */
export const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list, on a sorted copy. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The depth-weighted median of { ratio, weight } pairs: the ratio at which the accumulated
 * weight first reaches half the total. Pairs are ordered by ratio, then by slug, so the
 * result never depends on the order the snapshot happened to list the peers in.
 */
function weightedMedian(pairs: { ratio: number; weight: number; slug: string }[]): number {
  const sorted = [...pairs].sort((a, b) => a.ratio - b.ratio || (a.slug < b.slug ? -1 : 1));
  const total = sorted.reduce((t, p) => t + p.weight, 0);
  let acc = 0;
  for (const p of sorted) {
    acc += p.weight;
    if (acc >= total / 2) return p.ratio;
  }
  return sorted[sorted.length - 1]!.ratio;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all in the snapshot's fields. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule, as the watchlist states it: a name ending in a release. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of another asset. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** The exchanges the watchlist screen names: a name beginning with one is that exchange's product. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a name begins with one of the screened exchange names. */
function exchangeLed(name: string): boolean {
  return EXCHANGE_PREFIXES.some((x) => name === x || name.startsWith(`${x} `));
}

/**
 * Whether a pre-token protocol below the floor is a subject in its own right, not a product of
 * a token that already trades: the house's name screens, applied under the floor as well.
 */
export function isSubject(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category === 'CEX') return false;
  if (VERSIONED.test(p.name)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (exchangeLed(p.name)) return false;
  return true;
}

/** The category key a protocol's peers are gathered under. */
function categoryKey(p: SnapshotProtocol): string {
  return p.category ?? 'Uncategorised';
}

/**
 * The peer multiples, derived from the snapshot itself: every traded protocol with a market
 * cap and a TVL contributes its mcap/TVL ratio, clamped to the model's band. A category's
 * multiple is its depth-weighted median ratio — each peer weighted by the square root of
 * its TVL, so the protocols the market has capitalised most set the price without any one
 * of them dictating it — shrunk toward the global median by the peer count, so thin
 * categories lean on the whole market and deep ones stand on their own record. The global
 * median itself stays a plain median of every ratio: it is the anchor the shrinkage leans
 * on and the band is drawn around, and weighting it too would let a handful of the largest
 * protocols in the snapshot flatten every category's evidence toward one figure.
 */
export function deriveMultiples(snapshot: Snapshot): { global: number; table: CategoryMultiple[]; byCategory: Map<string, CategoryMultiple> } {
  const ratiosByCategory = new Map<string, { ratio: number; weight: number; slug: string }[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = Math.min(MODEL.ratio_cap, Math.max(MODEL.ratio_floor, p.mcap_usd / p.tvl_usd));
    all.push(ratio);
    const key = categoryKey(p);
    const pair = { ratio, weight: Math.pow(p.tvl_usd, MODEL.weight_exponent), slug: p.slug };
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [pair]);
    else list.push(pair);
  }
  const globalRaw = all.length > 0 ? median(all) : 0.2;
  const global = round4(globalRaw);
  const table: CategoryMultiple[] = [];
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [category, pairs] of ratiosByCategory) {
    const raw = weightedMedian(pairs);
    const shrunk = (pairs.length * raw + MODEL.shrink_peers * globalRaw) / (pairs.length + MODEL.shrink_peers);
    // One or two wild peers must not price a whole category: keep the result within a band
    // around the global median, a third of it to three times it.
    const banded = Math.min(globalRaw * MODEL.multiple_band, Math.max(globalRaw / MODEL.multiple_band, shrunk));
    const entry: CategoryMultiple = { category, peers: pairs.length, raw_median: round4(raw), multiple: round4(banded) };
    table.push(entry);
    byCategory.set(category, entry);
  }
  table.sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  return { global: round4(global), table, byCategory };
}

/** The multiple one protocol is priced with: its category's, or the global when it has no peers. */
function multipleFor(p: SnapshotProtocol, derived: { global: number; byCategory: Map<string, CategoryMultiple> }): CategoryMultiple {
  return derived.byCategory.get(categoryKey(p)) ?? { category: categoryKey(p), peers: 0, raw_median: derived.global, multiple: derived.global };
}

/** The model's working for one protocol: every factor that turns its TVL into an implied value. */
export interface Working {
  implied: number;
  multiple: number;
  peers: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  reachMult: number;
  age: number | null;
}

/** The maturity multiplier for an age in days: the model's floor plus its range over its horizon. */
function maturityFor(age: number | null): number {
  return age === null
    ? MODEL.maturity_unknown
    : MODEL.maturity_floor + (Math.min(age, MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
}

/** Score one protocol: TVL x peer multiple, adjusted by growth, maturity and reach. */
export function impliedValue(p: SnapshotProtocol, asOf: string, derived: { global: number; byCategory: Map<string, CategoryMultiple> }): Working {
  const peer = multipleFor(p, derived);
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(MODEL.growth_cap_pct, Math.max(MODEL.growth_floor_pct, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * MODEL.growth_weight;
  const maturityMult = maturityFor(age);
  const reachMult = 1 + MODEL.reach_per_chain * Math.min(Math.max(p.chains.length - 1, 0), MODEL.reach_chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * peer.multiple * growthMult * maturityMult * reachMult));
  return { implied, multiple: peer.multiple, peers: peer.peers, growthPct, growthMult, maturityMult, reachMult, age };
}

/** FNV-1a over the slug: which hold-out fold a traded peer belongs to. Pure in the slug. */
function slugFold(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2;
}

/** Ranks of a series, averaged over ties, in the series' own order. */
function ranksOf(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  const ranks = new Array<number>(values.length);
  let at = 0;
  while (at < order.length) {
    let end = at;
    while (end + 1 < order.length && order[end + 1]!.v === order[at]!.v) end++;
    const rank = (at + end) / 2 + 1;
    for (let k = at; k <= end; k++) ranks[order[k]!.i] = rank;
    at = end + 1;
  }
  return ranks;
}

/** Spearman's rank correlation between two equal-length series; 0 when either is constant. */
export function spearman(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const rx = ranksOf(xs);
  const ry = ranksOf(ys);
  const n = xs.length;
  const mx = rx.reduce((t, v) => t + v, 0) / n;
  const my = ry.reduce((t, v) => t + v, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (rx[i]! - mx) * (ry[i]! - my);
    vx += (rx[i]! - mx) ** 2;
    vy += (ry[i]! - my) ** 2;
  }
  return vx === 0 || vy === 0 ? 0 : cov / Math.sqrt(vx * vy);
}

/** How many of the first ten slugs of one ranking appear in the first ten of the other. */
function top10Overlap(a: string[], b: string[]): number {
  const topB = new Set(b.slice(0, 10));
  return a.slice(0, 10).filter((s) => topB.has(s)).length;
}

/** The traded protocols a test can grade against: a recorded market cap and a TVL. */
function tradedPeers(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The pooled error figures of a set of (predicted, actual) pairs. */
function errorStats(pairs: { pred: number; actual: number }[]): { median_factor: number; within_2x_pct: number; within_3x_pct: number; spearman: number } {
  const logErr = pairs.map(({ pred, actual }) => Math.abs(Math.log10(pred / actual))).sort((a, b) => a - b);
  const mid = Math.floor(logErr.length / 2);
  const medLog = logErr.length % 2 === 1 ? logErr[mid]! : (logErr[mid - 1]! + logErr[mid]!) / 2;
  const within = (f: number) => Math.round((1000 * pairs.filter(({ pred, actual }) => pred / actual >= 1 / f && pred / actual <= f).length) / pairs.length) / 10;
  return {
    median_factor: round4(Math.pow(10, medLog)),
    within_2x_pct: within(2),
    within_3x_pct: within(3),
    spearman: round4(spearman(pairs.map((x) => x.pred), pairs.map((x) => x.actual))),
  };
}

/**
 * The model's validation, from the snapshot alone. The hold-out test fits the whole pricing
 * pipeline (category multiples, shrinkage, band, and each protocol's own growth, maturity
 * and reach factors) on one half of the traded market and predicts the other half's recorded
 * market caps with it, then swaps the halves; the naive baseline beside it predicts with the
 * fit half's global median alone, so the category structure has to earn its place. A
 * jackknife refits every category without its largest peer, to show no single protocol's
 * rating is carrying a multiple. The
 * look-back rolls every covered board row's TVL back along its own recorded seven-day
 * change — peer pricing held at the fetch's, the growth factor neutral, maturity aged a
 * week — and re-ranks the board, measuring how much of today's order last week's figures
 * already implied. The cross-view figures set the board's ranking against a raw-TVL ranking
 * and against the same model with the growth factor removed.
 */
export function validateModel(snapshot: Snapshot, board: BoardRow[]): Validation {
  const peers = tradedPeers(snapshot);
  const folds: HoldoutFold[] = [];
  const pooled: { pred: number; actual: number }[] = [];
  const pooledBase: { pred: number; actual: number }[] = [];
  for (const fold of [0, 1]) {
    const fit = peers.filter((p) => slugFold(p.slug) !== fold);
    const held = peers.filter((p) => slugFold(p.slug) === fold);
    const fitDerived = deriveMultiples({ ...snapshot, protocols: fit });
    const pairs = held.map((p) => ({ pred: impliedValue(p, snapshot.as_of, fitDerived).implied, actual: p.mcap_usd! }));
    const stats = errorStats(pairs);
    folds.push({ fold, fitted_on: fit.length, tested_on: held.length, median_factor: stats.median_factor, within_2x_pct: stats.within_2x_pct, spearman: stats.spearman });
    pooled.push(...pairs);
    pooledBase.push(...held.map((p) => ({ pred: Math.max(1, Math.round(p.tvl_usd * fitDerived.global)), actual: p.mcap_usd! })));
  }
  const all = errorStats(pooled);
  const base = errorStats(pooledBase);

  // Jackknife the multiples: refit without each category's largest peer and measure how
  // far that category's multiple moves. A multiple one protocol can swing is not evidence.
  const full = deriveMultiples(snapshot);
  const peersByCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of peers) {
    const key = categoryKey(p);
    const list = peersByCategory.get(key);
    if (list === undefined) peersByCategory.set(key, [p]);
    else list.push(p);
  }
  const jackknifeDeltas: number[] = [];
  for (const [category, list] of peersByCategory) {
    if (list.length < 3) continue;
    const largest = [...list].sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))[0]!;
    const refit = deriveMultiples({ ...snapshot, protocols: snapshot.protocols.filter((q) => q.slug !== largest.slug) });
    const before = full.byCategory.get(category);
    const after = refit.byCategory.get(category);
    if (before !== undefined && after !== undefined && before.multiple > 0) {
      jackknifeDeltas.push((100 * Math.abs(after.multiple - before.multiple)) / before.multiple);
    }
  }
  const jackknifeMedian = jackknifeDeltas.length > 0 ? Math.round(10 * median(jackknifeDeltas)) / 10 : 0;

  const covered = board.filter((r) => r.change_7d !== null && r.change_7d > -100);
  const lookbackImplied = covered.map((r) => {
    const tvlThen = r.tvl_usd / (1 + r.change_7d! / 100);
    const ageThen = r.age_days === null ? null : Math.max(0, r.age_days - 7);
    return tvlThen * r.model.peer_multiple * maturityFor(ageThen) * r.model.reach_multiplier;
  });
  const byLookback = covered.map((r, i) => ({ slug: r.slug, v: lookbackImplied[i]! })).sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));

  const byTvl = [...board].sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const byNoGrowth = [...board].sort((a, b) => b.implied_value_usd / b.model.growth_multiplier - a.implied_value_usd / a.model.growth_multiplier || (a.slug < b.slug ? -1 : 1));
  const boardSlugs = board.map((r) => r.slug);

  return {
    peers_tested: peers.length,
    folds,
    median_factor: all.median_factor,
    within_2x_pct: all.within_2x_pct,
    within_3x_pct: all.within_3x_pct,
    spearman: all.spearman,
    baseline_median_factor: base.median_factor,
    baseline_within_2x_pct: base.within_2x_pct,
    baseline_spearman: base.spearman,
    multiples_jackknife_median_pct: jackknifeMedian,
    multiples_jackknife_categories: jackknifeDeltas.length,
    lookback: {
      covered: covered.length,
      board_size: board.length,
      spearman: round4(spearman(covered.map((r) => r.implied_value_usd), lookbackImplied)),
      top10_overlap: top10Overlap(byLookback.map((x) => x.slug), boardSlugs),
    },
    views: {
      tvl_spearman: round4(spearman(board.map((r) => r.implied_value_usd), board.map((r) => r.tvl_usd))),
      tvl_top10: top10Overlap(byTvl.map((r) => r.slug), boardSlugs),
      nogrowth_spearman: round4(spearman(board.map((r) => r.implied_value_usd), board.map((r) => r.implied_value_usd / r.model.growth_multiplier))),
      nogrowth_top10: top10Overlap(byNoGrowth.map((r) => r.slug), boardSlugs),
    },
  };
}

/**
 * A farm plan's position size, set by the protocol's own depth: the model's stated share
 * of its TVL, kept between the floor and the cap and rounded to a clean sum. The share is
 * the honest figure — the same dollars are a large slice of a thin protocol and a sliver
 * of a deep one — and the exposure is that share priced by the row's own implied value.
 */
export function planSize(p: SnapshotProtocol, implied: number): PlanSize {
  const clamped = Math.min(MODEL.deposit_cap_usd, Math.max(MODEL.deposit_floor_usd, p.tvl_usd * MODEL.deposit_share));
  const deposit = Math.round(clamped / MODEL.deposit_round_usd) * MODEL.deposit_round_usd;
  return {
    deposit_usd: deposit,
    share_pct: round4((100 * deposit) / p.tvl_usd),
    exposure_usd: Math.round(deposit * (implied / p.tvl_usd)),
  };
}

/** The short signal tags a row earns from its own figures; the dashboard renders them as chips. */
export function signalsFor(p: SnapshotProtocol, w: Working, onWatchlist: boolean): string[] {
  const signals: string[] = [];
  if (onWatchlist) signals.push('Watchlist');
  if (p.tvl_usd >= 1_000_000_000) signals.push('Billion-dollar TVL');
  if (p.change_7d !== null && p.change_7d >= 10) signals.push('Momentum');
  if (p.change_7d !== null && p.change_7d <= -15) signals.push('Cooling');
  if (w.age !== null && w.age >= 1095) signals.push('Established');
  if (w.age !== null && w.age < 180) signals.push('New');
  if (p.chains.length >= 8) signals.push('Wide reach');
  if (w.multiple >= 0.75) signals.push('Rich peer multiple');
  return signals;
}

/**
 * A readiness grade from the figures alone: size, track record, direction, reach and peer
 * pricing earn points, to a maximum of 10. A is a large, established, growing, widely
 * deployed protocol priced like rich peers; D is a small, young or shrinking one. The grade
 * is readiness, not value: a young protocol can carry a large implied value and still grade
 * low, and its detail view shows both.
 */
export function gradeFor(p: SnapshotProtocol, w: Working, globalMultiple: number): string {
  let points = 0;
  if (p.tvl_usd >= 1_000_000_000) points += 3;
  else if (p.tvl_usd >= 250_000_000) points += 2;
  else if (p.tvl_usd >= 50_000_000) points += 1;
  if (w.age !== null && w.age >= 730) points += 2;
  else if (w.age !== null && w.age >= 180) points += 1;
  if (p.change_7d !== null && p.change_7d >= 5) points += 2;
  else if (p.change_7d !== null && p.change_7d >= 0) points += 1;
  else if (p.change_7d !== null && p.change_7d <= -15) points -= 1;
  if (p.chains.length >= 8) points += 2;
  else if (p.chains.length >= 4) points += 1;
  if (w.multiple >= globalMultiple) points += 1;
  if (points >= 7) return 'A';
  if (points >= 5) return 'B';
  if (points >= 3) return 'C';
  return 'D';
}

/** Compact dollars for dossier prose: $1.51B, $888M, $320K, $950. */
function usd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** A signed percentage with one decimal: +5.6%, -8.3%. */
function pct(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

/** A multiple the way the dashboard writes it: x0.21. */
function mult(n: number): string {
  return `x${n.toFixed(2)}`;
}

/** The context a dossier is written against: the row's standing among its category and board. */
export interface DossierContext {
  catRank: number;
  catSize: number;
  catMedianChange: number | null;
  agePercentile: number | null;
  globalMultiple: number;
}

/**
 * One row's dossier: an evidence thesis, the risks its own record shows, and a confidence
 * grade. Thesis lines state only what the record supports; anything adverse or absent goes
 * to the risks, so the two never blur. Confidence grades the evidence behind the price —
 * how many traded peers price the category, and whether the record carries the two fields
 * the model leans on (the seven-day change and the listing date) — never the protocol.
 */
export function dossierFor(
  p: SnapshotProtocol,
  w: Working,
  peer: CategoryMultiple,
  implied: number,
  ctx: DossierContext,
): Dossier {
  const cat = p.category ?? 'Uncategorised';
  const thesis: string[] = [];
  if (ctx.catSize <= 1) {
    thesis.push(`The only pre-token ${cat} protocol on the board, holding ${usd(p.tvl_usd)} of TVL.`);
  } else if (ctx.catRank === 1) {
    thesis.push(`The largest pre-token ${cat} protocol the snapshot tracks: ${usd(p.tvl_usd)} of TVL, first of ${ctx.catSize} in its category.`);
  } else {
    thesis.push(`Ranks #${ctx.catRank} of ${ctx.catSize} pre-token ${cat} protocols by TVL, with ${usd(p.tvl_usd)} locked.`);
  }
  if (p.change_7d !== null && p.change_7d > 0) {
    const vs = ctx.catMedianChange !== null
      ? `, against a category median of ${pct(ctx.catMedianChange)} for the same week`
      : '';
    thesis.push(`TVL grew ${pct(p.change_7d)} in the seven days to the snapshot${vs}: the momentum the growth factor (x${w.growthMult.toFixed(2)}) prices is in the record, not projected.`);
  }
  if (w.age !== null && w.age >= 365) {
    const pc = ctx.agePercentile !== null ? ` — longer than ${ctx.agePercentile}% of the board has run` : '';
    thesis.push(`Tracked since ${p.listed_at}: ${w.age} days with no token recorded${pc}.`);
  }
  if (p.chains.length >= 4) {
    thesis.push(`Live on ${p.chains.length} chains (${p.chains.slice(0, 3).join(', ')}${p.chains.length > 3 ? ', …' : ''}), which the model's reach factor credits at x${w.reachMult.toFixed(2)}.`);
  }
  if (peer.peers > 0) {
    thesis.push(`Its category's ${peer.peers} traded peer${peer.peers === 1 ? ' prices' : 's price'} at a depth-weighted median of ${mult(peer.raw_median)} of TVL; shrunk toward the global ${mult(ctx.globalMultiple)}, this row is priced at ${mult(w.multiple)}.`);
  }

  const risks: string[] = [];
  if (p.change_7d === null) {
    risks.push('DefiLlama reports no seven-day TVL change for it, so momentum is priced as neutral — an absence in the record, not a measurement.');
  } else if (p.change_7d <= -10) {
    risks.push(`TVL fell ${Math.abs(p.change_7d).toFixed(1)}% in the seven days to the snapshot; the growth factor (x${w.growthMult.toFixed(2)}) assumes the slide stops at the fetch, and the record cannot say whether it did.`);
  }
  if (w.age === null) {
    risks.push(`The record carries no listing date, so maturity is priced at the model's unknown-date setting (x${MODEL.maturity_unknown.toFixed(2)}) — an assumption, not a measurement.`);
  } else if (w.age < 180) {
    risks.push(`Only ${w.age} days of tracked history: a short record, and its maturity factor (x${w.maturityMult.toFixed(2)}) sits near the model's floor of x${MODEL.maturity_floor.toFixed(2)}.`);
  }
  if (peer.peers === 0) {
    risks.push(`No traded protocol prices its category, so it is valued at the global median multiple (${mult(ctx.globalMultiple)}) — the thinnest evidence on the board.`);
  } else if (peer.peers <= 3) {
    risks.push(`Only ${peer.peers} traded peer${peer.peers === 1 ? '' : 's'} price${peer.peers === 1 ? 's' : ''} this category, so the multiple leans heavily on the global median; a single peer re-rating would move this row.`);
  }
  if (peer.peers > 0 && w.multiple >= 2 * ctx.globalMultiple) {
    risks.push(`Its category multiple (${mult(w.multiple)}) is over twice the global median (${mult(ctx.globalMultiple)}): the price assumes it launches rich, like its category's most expensive peers.`);
  }
  if (peer.peers > 0 && peer.raw_median > 0) {
    const stretch = implied / p.tvl_usd / peer.raw_median;
    if (stretch >= 1.8) {
      risks.push(`The adjustments stretch the price: the implied value is ${mult(implied / p.tvl_usd)} of TVL against a raw peer median of ${mult(peer.raw_median)} — growth, maturity and reach together more than double the peer evidence.`);
    } else if (stretch <= 0.55) {
      risks.push(`The model's adjustments discount it to ${mult(implied / p.tvl_usd)} of TVL, well under the raw peer median of ${mult(peer.raw_median)}: the price leans on those discounts being right.`);
    }
  }
  if (p.chains.length === 1) {
    risks.push(`Deployed on a single chain (${p.chains[0] ?? 'unnamed'}): the reach factor adds nothing, and a chain-specific shock would hit the whole TVL at once.`);
  }
  if (p.category === null) {
    risks.push('DefiLlama names no category for it, so it is priced against the global peer set rather than like-for-like protocols.');
  }
  if (risks.length === 0) {
    risks.push(`Its price rests on its category's peer pricing in a single day's record; peer prices after the fetch are outside what the snapshot can show.`);
  }

  let points = 0;
  if (peer.peers >= 8) points += 2;
  else if (peer.peers >= 4) points += 1;
  else if (peer.peers === 0) points -= 1;
  if (p.change_7d !== null) points += 1;
  if (w.age !== null) points += 1;
  if (p.category === null) points -= 1;
  const confidence: Dossier['confidence'] = points >= 4 ? 'High' : points >= 2 ? 'Medium' : 'Low';
  const peerPart = peer.peers === 0
    ? 'no traded peer prices its category'
    : `${peer.peers} traded peer${peer.peers === 1 ? '' : 's'} price${peer.peers === 1 ? 's' : ''} its category`;
  const changePart = p.change_7d !== null ? 'its seven-day change is reported' : 'its seven-day change is unreported';
  const datePart = w.age !== null ? 'its listing date is in the record' : 'its listing date is unreported';
  const confidence_reason = `${confidence}: ${peerPart}, ${changePart}, and ${datePart}.`;
  return { thesis: thesis.slice(0, 4), risks: risks.slice(0, 4), confidence, confidence_reason };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction roughly costs on a chain, in the plain terms a farmer budgets with. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return '$6-15 of gas';
  if (chain === 'Solana') return 'under $0.25 of fees';
  if (chain === 'BNB Chain' || chain === 'BSC') return 'under $0.30 of gas';
  return '$0.10-1.00 of gas on this chain';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action and its weekly qualifying action, in words a farmer can follow. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { main: string; weekly: string; exit: string } {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp')) {
    return {
      main: `Supply $${capital} of USDC to ${n} on ${chain}, then borrow a small amount against it and repay, so the wallet shows both sides of the market.`,
      weekly: `Adjust the position once a week: top the supply up by a few dollars or move part of the borrow, so the wallet keeps transacting with ${n}.`,
      exit: `Repay any open borrow in full before withdrawing the supply, or the position can be liquidated while you exit.`,
    };
  }
  if (c.includes('dex')) {
    return {
      main: `Provide $${capital} of liquidity to ${n}'s busiest pool on ${chain} and make two swaps through the same interface.`,
      weekly: `Swap a small amount through ${n} each week and rebalance the liquidity position if the price drifts out of range.`,
      exit: `Remove the liquidity and swap the proceeds back to a stablecoin in one session, so no half-position is left behind.`,
    };
  }
  if (c.includes('deriv') || c.includes('perpetual')) {
    return {
      main: `Deposit $${capital} of USDC as margin on ${n} and open one small hedged position, half long and half short across two markets if it offers them.`,
      weekly: `Trade a modest amount each week on ${n} and keep the margin topped up, building volume without directional risk.`,
      exit: `Close every open position and let funding settle before withdrawing the margin, so no position is force-closed.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      main: `Bridge $${capital} of USDC from Ethereum to ${chain === 'Ethereum' ? 'a chain ' + n + ' serves' : chain} through ${n}, then use the bridged funds in one app on the far side.`,
      weekly: `Bridge a small amount through ${n} each week, alternating direction, so the wallet builds a route history on both sides.`,
      exit: `Bridge the funds back along the same route and keep the arrival transaction in the log as the round trip's proof.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      main: `Stake $${capital} of the chain's native asset through ${n} on ${chain} and keep the liquid receipt token it issues.`,
      weekly: `Put the receipt token to work in one lending or liquidity position each week, and claim any staking rewards into the same wallet.`,
      exit: `Unstake and wait out the unbonding period before moving the funds; selling the receipt instead is faster but usually at a discount.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return {
      main: `Deposit $${capital} of USDC into one of ${n}'s curated vaults on ${chain} and keep the vault shares in the wallet.`,
      weekly: `Review the vault's allocation once a week and move a small part of the position to a second ${n} vault, so the wallet uses more than one strategy.`,
      exit: `Withdraw from the vault and check the shares redeemed at the vault's own rate, not a secondary market's, before moving on.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      main: `Complete ${n}'s onboarding if it asks for it, then mint or buy $${capital} of its yield-bearing asset on ${chain} and hold it.`,
      weekly: `Check the asset's reported yield once a week and add a few dollars when it pays out, keeping the holding active and growing.`,
      exit: `Redeem through ${n}'s own redemption path rather than a thin secondary pool, and allow for its settlement window.`,
    };
  }
  if (c.includes('chain')) {
    return {
      main: `Bridge $${capital} of funds onto ${n}'s chain and use two of its native applications, so the wallet has real activity on the network itself.`,
      weekly: `Transact on the chain each week: a swap, a transfer between your own wallets, or a small contract interaction counts.`,
      exit: `Bridge the funds back to a chain you use daily and keep the bridge transactions from both directions in the log.`,
    };
  }
  if (c.includes('yield') || c.includes('basis')) {
    return {
      main: `Deposit $${capital} of USDC into ${n}'s main vault or strategy on ${chain} and keep the position's shares untouched.`,
      weekly: `Harvest or compound the yield once a week through ${n}'s own page, so the wallet shows an ongoing farming history.`,
      exit: `Withdraw through the vault's normal exit and check for any lock-up or cooldown the strategy states before you start.`,
    };
  }
  return {
    main: `Deposit $${capital} of USDC into ${n} on ${chain} and use its core product once, so the wallet holds a real position.`,
    weekly: `Make one qualifying action each week on ${n}, such as a deposit, a swap, a claim or a vote, and keep the receipts.`,
    exit: `Withdraw through the product's normal exit and confirm the funds land before closing the position in your log.`,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age) and never from a hand-written list.
 * The position every step works with is sized by the protocol's own depth — the model's
 * stated share of its TVL, floored and capped — and the hold step shows that sizing: the
 * deposit, its share of TVL, and the implied value that share carries on the model's own
 * figures, so no plan recommends a position the protocol's numbers make absurd.
 */
export function farmSteps(p: SnapshotProtocol, w: Working): FarmStep[] {
  const chain = chainOf(p);
  const size = planSize(p, w.implied);
  const capital = size.deposit_usd;
  const hold = holdDaysFor(w.age);
  const gas = gasFor(chain);
  const acts = actionsFor(p, capital, chain);
  const multi = p.chains.length > 1 ? ` It runs on ${p.chains.length} chains; ${chain} is the cheapest place to start.` : '';
  return [
    {
      text: `Set up a fresh wallet for ${p.name} that holds only the funds you plan to farm, and keep its seed phrase offline.${multi}`,
      cost: 'under $3 for the first funding transaction',
      time: '5 minutes',
    },
    {
      text: acts.main,
      cost: `$${capital} of capital (${size.share_pct}% of its TVL) and about ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: acts.weekly,
      cost: `about ${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity appears in more than one weekly snapshot of the protocol. Its size comes from ${p.name}'s own depth: $${capital} is ${size.share_pct}% of its ${usd(p.tvl_usd)} TVL, under the plan rule of ${MODEL.deposit_share * 100}% of TVL, at least $${MODEL.deposit_floor_usd} and at most $${MODEL.deposit_cap_usd}; at this row's implied multiple of ${mult(w.implied / p.tvl_usd)}, that share carries about ${usd(size.exposure_usd)} of implied launch value on the model's own figures — a measure of scale, not a promise.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before withdrawing, open ${p.name}'s own points or rewards page and claim only from the link it publishes there, never from a search result or a message.`,
      cost: 'nothing to check, and never pay anyone to claim',
      time: '10 minutes',
    },
    {
      text: `${acts.exit} Then write the wallet, the dates and every transaction hash into a farm log.`,
      cost: `about ${gas} to unwind`,
      time: '15 minutes',
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const derived = deriveMultiples(snapshot);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug is ranked, whatever its other screens say.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other subject below the floor. Above the floor, a pre-token
  // protocol the watchlist leaves out failed a product screen, so it stays out here too.
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug) || p.tvl_usd >= snapshot.floor_usd) continue;
    if (isSubject(p)) chosen.set(p.slug, p);
  }
  const watch = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => {
    const w = impliedValue(p, snapshot.as_of, derived);
    return { p, w, onWatchlist: watch.has(p.slug) };
  });
  scored.sort((a, b) => b.w.implied - a.w.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  // The dossier context: each row's standing among its category's board members, by TVL,
  // and each known age's percentile among the board's known ages. Both are pure functions
  // of the scored set, so the board stays deterministic.
  const byCategory = new Map<string, typeof scored>();
  for (const s of scored) {
    const key = categoryKey(s.p);
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [s]);
    else list.push(s);
  }
  const catStanding = new Map<string, { rank: number; size: number; medianChange: number | null; top: CatPeer[] }>();
  for (const list of byCategory.values()) {
    const byTvl = [...list].sort((a, b) => b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
    const changes = list.map((s) => s.p.change_7d).filter((c): c is number => c !== null);
    const top = byTvl.slice(0, 5).map((s) => ({ slug: s.p.slug, name: s.p.name, tvl_usd: s.p.tvl_usd }));
    byTvl.forEach((s, i) => {
      catStanding.set(s.p.slug, {
        rank: i + 1,
        size: list.length,
        medianChange: changes.length > 0 ? round4(median(changes)) : null,
        top,
      });
    });
  }
  const knownAges = scored.map((s) => s.w.age).filter((a): a is number => a !== null).sort((a, b) => a - b);
  const agePercentile = (age: number | null): number | null => {
    if (age === null || knownAges.length === 0) return null;
    let younger = 0;
    for (const a of knownAges) if (a < age) younger++;
    return Math.floor((100 * younger) / knownAges.length);
  };

  return scored.map((s, i) => {
    const standing = catStanding.get(s.p.slug)!;
    const peer = multipleFor(s.p, derived);
    const dossier = dossierFor(s.p, s.w, peer, s.w.implied, {
      catRank: standing.rank,
      catSize: standing.size,
      catMedianChange: standing.medianChange,
      agePercentile: agePercentile(s.w.age),
      globalMultiple: derived.global,
    });
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      watchlist: s.onWatchlist,
      age_days: s.w.age,
      implied_value_usd: s.w.implied,
      grade: gradeFor(s.p, s.w, derived.global),
      tier: tierFor(s.w.implied),
      signals: signalsFor(s.p, s.w, s.onWatchlist),
      model: {
        peer_multiple: s.w.multiple,
        peers: s.w.peers,
        growth_pct: round4(s.w.growthPct),
        growth_multiplier: round4(s.w.growthMult),
        maturity_multiplier: round4(s.w.maturityMult),
        reach_multiplier: round4(s.w.reachMult),
        age_days: s.w.age,
      },
      cat_rank: standing.rank,
      cat_size: standing.size,
      cat_top: standing.top,
      dossier,
      plan: planSize(s.p, s.w.implied),
      farm_steps: farmSteps(s.p, s.w).map(stepText),
    };
  });
}

/** How many traded protocols the dashboard's peer view carries, by market cap. */
export const LIVE_ROWS = 36;

/** The traded protocols, by market cap: the peer set the multiples are derived from. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's form for data.js: the page renders the plan from the same strings. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    watchlist: row.watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    grade: row.grade,
    tier: row.tier,
    signals: row.signals,
    peer_multiple: row.model.peer_multiple,
    peers: row.model.peers,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
    cat_rank: row.cat_rank,
    cat_size: row.cat_size,
    cat_top: row.cat_top,
    dossier: row.dossier,
    plan: row.plan,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const derived = deriveMultiples(snapshot);
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const validation = validateModel(snapshot, board);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    constants: MODEL,
    tiers: TIERS,
    global_multiple: derived.global,
    multiples: derived.table,
    scanned: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - snapshot.watchlist.length,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    validation,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears on the board more than once';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
