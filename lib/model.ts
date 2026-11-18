// Token Radar (token-radar-01) — model "radar-5".
//
// The pricing model, in one paragraph. Every traded protocol in the snapshot lends the
// model one observation: the logarithm of its market-cap-to-TVL ratio, winsorised to the
// band the traded record actually spans. A protocol's log-ratio is modelled as a level
// for its category plus a size term — the level the whole market sits at, shifted by a
// slope times how far the protocol's TVL sits from the market's typical size, both in
// log10. The slope is fitted by the Theil–Sen median of pairwise slopes, so no single
// mispriced giant can bend it; each category's level is the median of its peers'
// size-adjusted log-ratios, pulled toward the market level by a shrinkage weight that
// counts the category's peers against five, so a category with two peers leans on the
// market and one with twenty stands on its own record. Levels and slope are fitted
// alternately until they agree. A pre-token protocol is then priced at the multiple its
// category and its size imply: implied value = TVL x 10^(level + slope x size gap).
//
// What is NOT in the price, deliberately: the seven-day TVL change, the listing age and
// the chain count. On the traded record each of those fields' rank correlation with the
// log-ratio is within a few points of zero, and the previous model's multipliers for
// them (growth, maturity, reach) are ablated in MODEL_NOTES.md: they move the hold-out
// median a little and cost more than they return in the within-2x share. Those fields
// still appear on every row — as a readiness grade and as dossier evidence — where they
// describe the protocol without pretending to price it.

/** One protocol as the snapshot carries it: the ten DefiLlama fields, nothing else. */
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

/** The sealed snapshot: its date, its source line, its watchlist floor and its protocols. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's name, carried in board.json and named on the dashboard. */
export const MODEL_VERSION = 'radar-5';

/** The model's constants. Each one is stated on the dashboard's Method view. */
export const MODEL = {
  /** Traded ratios are winsorised to this band before their logarithms are taken. */
  ratio_floor: 0.01,
  ratio_cap: 5,
  /** Shrinkage: a category's own level counts n/(n + shrink_peers) against the market's. */
  shrink_peers: 5,
  /** The fitted size slope is kept inside this band, whatever the pairs say. */
  slope_floor: -0.9,
  slope_cap: 0.1,
  /** Passes of the alternating fit (levels given slope, slope given levels). */
  fit_passes: 5,
  /** A farm plan's position is this share of the protocol's own TVL (0.0005 = 0.05%). */
  deposit_share: 0.0005,
  /** No farm position is smaller than this, however thin the protocol. */
  deposit_floor_usd: 500,
  /** No farm position is larger than this, however deep the protocol. */
  deposit_cap_usd: 10_000,
  /** Positions are rounded to this many dollars, so a plan reads as a round sum. */
  deposit_round_usd: 50,
} as const;

/** The board's value tiers, widest first; the dashboard filters by them. The bars are
 *  set on this model's scale: its honest top is near $148M, not the old model's $1.5B. */
export const TIERS = [
  { tier: 1, label: 'Headliners', min_usd: 35_000_000 },
  { tier: 2, label: 'Contenders', min_usd: 12_000_000 },
  { tier: 3, label: 'Prospects', min_usd: 3_500_000 },
  { tier: 4, label: 'Long shots', min_usd: 0 },
] as const;

/** The tier a row's implied value falls in. */
export function tierFor(impliedUsd: number): number {
  for (const t of TIERS) if (impliedUsd >= t.min_usd) return t.tier;
  return TIERS[TIERS.length - 1]!.tier;
}

/**
 * One category's fitted pricing: how many traded peers stand behind it, the multiple a
 * peer of the market's typical size would carry, and the multiple before shrinkage.
 */
export interface CategoryLevel {
  category: string;
  peers: number;
  /** The category's multiple at the reference size, after shrinkage toward the market. */
  multiple_at_ref: number;
  /** The same, before shrinkage: the category's own size-adjusted median. */
  raw_multiple_at_ref: number;
}

/** The fitted pricing model: everything a price is computed from. */
export interface Pricing {
  /** log10 of the market's typical TVL: the size the levels are stated at. */
  reference_log_tvl: number;
  /** The market's typical TVL in dollars, rounded for display. */
  reference_tvl_usd: number;
  /** The market-wide log-ratio level at the reference size. */
  global_level: number;
  /** The market-wide multiple at the reference size. */
  global_multiple: number;
  /** The size slope: log-ratio change per decade of TVL away from the reference. */
  size_slope: number;
  /** Every fitted category, deepest peer set first. */
  table: CategoryLevel[];
  byCategory: Map<string, CategoryLevel>;
  /** The fitted category levels in log space, unrounded: what prices are computed from. */
  levelByCategory: Map<string, number>;
}

/** A farm step before it is flattened into one string. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm plan's position, sized from the protocol's own depth. */
export interface PlanSize {
  deposit_usd: number;
  share_pct: number;
  exposure_usd: number;
}

/** One protocol in a row's category standing: the largest pre-token peers beside it. */
export interface CatPeer {
  slug: string;
  name: string;
  tvl_usd: number;
}

/** A row's dossier: thesis, risks and a confidence grade, all from the row's own record. */
export interface Dossier {
  thesis: string[];
  risks: string[];
  confidence: 'High' | 'Medium' | 'Low';
  confidence_reason: string;
}

/** One row of board.json. */
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
    /** The multiple the row is priced at: its category level at its own size. */
    peer_multiple: number;
    peers: number;
    /** The category's multiple at the market's typical size, before this row's size gap. */
    level_multiple: number;
    /** The factor the row's size applies to its category level: 10^(slope x size gap). */
    size_adjustment: number;
    /** log10 of the row's TVL minus log10 of the reference TVL. */
    size_gap: number;
  };
  cat_rank: number;
  cat_size: number;
  cat_top: CatPeer[];
  dossier: Dossier;
  plan: PlanSize;
  farm_steps: string[];
}

/** The dashboard's view of one board row. */
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
  level_multiple: number;
  size_adjustment: number;
  size_gap: number;
  cat_rank: number;
  cat_size: number;
  cat_top: CatPeer[];
  dossier: Dossier;
  plan: PlanSize;
  farm_steps: string[];
}

/** A traded protocol, shown in the dashboard's peer view at its own market figures. */
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

/** One fold of the hold-out test. */
export interface HoldoutFold {
  fold: number;
  fitted_on: number;
  tested_on: number;
  median_factor: number;
  within_2x_pct: number;
  spearman: number;
}

/** The model's validation, computed from the snapshot at run time. */
export interface Validation {
  peers_tested: number;
  folds: HoldoutFold[];
  median_factor: number;
  within_2x_pct: number;
  within_3x_pct: number;
  spearman: number;
  /** The same hold-out graded for the naive anchor: TVL x the fit half's median ratio. */
  baseline_median_factor: number;
  baseline_within_2x_pct: number;
  baseline_spearman: number;
  /** Jackknife: median movement of a category's level when its largest peer is removed. */
  multiples_jackknife_median_pct: number;
  multiples_jackknife_categories: number;
  lookback: { covered: number; board_size: number; spearman: number; top10_overlap: number };
  views: { tvl_spearman: number; tvl_top10: number; nosize_spearman: number; nosize_top10: number };
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  constants: typeof MODEL;
  tiers: typeof TIERS;
  global_multiple: number;
  reference_tvl_usd: number;
  size_slope: number;
  multiples: CategoryLevel[];
  scanned: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  validation: Validation;
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** Round to 4 decimal places, for the model's published working. */
export const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list, taken on a sorted copy. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The Theil–Sen slope of y on x: the median of every pairwise slope. With a few dozen
 * points it shrugs off the wild pairs a least-squares line would chase, and it is a pure
 * function of the point set, so two fits on the same record agree to the last bit.
 */
function theilSen(xs: number[], ys: number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const dx = xs[j]! - xs[i]!;
      if (dx !== 0) slopes.push((ys[j]! - ys[i]!) / dx);
    }
  }
  return slopes.length > 0 ? median(slopes) : 0;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when a date is absent or bad. */
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

/** The watchlist's version-marker rule: a name ending in a release tag. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of another asset. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** The exchanges the watchlist screen names: a name beginning with one is its product. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a name begins with one of the screened exchange names. */
function exchangeLed(name: string): boolean {
  return EXCHANGE_PREFIXES.some((x) => name === x || name.startsWith(`${x} `));
}

/**
 * Whether a pre-token protocol is a subject in its own right rather than a product of a
 * token that already trades: the house's name screens, applied under the floor as well.
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

/** The traded protocols that carry the model's evidence: a recorded cap and a TVL. */
export function tradedPeers(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** One peer's observation: the winsorised log-ratio and the log of its TVL. */
interface Observation {
  slug: string;
  category: string;
  logRatio: number;
  logTvl: number;
}

/** The observations a protocol list lends the fit. */
function observations(protocols: SnapshotProtocol[]): Observation[] {
  return tradedPeers(protocols).map((p) => ({
    slug: p.slug,
    category: categoryKey(p),
    logRatio: Math.log10(Math.min(MODEL.ratio_cap, Math.max(MODEL.ratio_floor, p.mcap_usd! / p.tvl_usd))),
    logTvl: Math.log10(p.tvl_usd),
  }));
}

/**
 * Fit the pricing model on a protocol list (the whole snapshot for the board, one
 * hold-out half for the test). The fit alternates: given the slope, each category's
 * level is the median of its peers' size-adjusted log-ratios, shrunk toward the market
 * level by n/(n + shrink_peers); given the levels, the slope is the Theil–Sen median of
 * the level-adjusted pairs. After the stated passes the two agree, and because every
 * step is a median of a fixed set, the result is exact and repeatable.
 */
export function fitPricing(protocols: SnapshotProtocol[]): Pricing {
  const obs = observations(protocols);
  const reference = obs.length > 0 ? median(obs.map((o) => o.logTvl)) : Math.log10(50_000_000);
  let slope = 0;
  let globalLevel = obs.length > 0 ? median(obs.map((o) => o.logRatio)) : Math.log10(0.2);
  const levels = new Map<string, { level: number; rawLevel: number; peers: number }>();
  for (let pass = 0; pass < MODEL.fit_passes; pass++) {
    const adjusted = obs.map((o) => o.logRatio - slope * (o.logTvl - reference));
    globalLevel = median(adjusted);
    const byCat = new Map<string, number[]>();
    obs.forEach((o, i) => {
      const list = byCat.get(o.category);
      if (list === undefined) byCat.set(o.category, [adjusted[i]!]);
      else list.push(adjusted[i]!);
    });
    levels.clear();
    for (const [category, list] of byCat) {
      const rawLevel = median(list);
      const weight = list.length / (list.length + MODEL.shrink_peers);
      levels.set(category, { level: globalLevel + (rawLevel - globalLevel) * weight, rawLevel, peers: list.length });
    }
    if (obs.length >= 2) {
      const xs = obs.map((o) => o.logTvl - reference);
      const ys = obs.map((o) => o.logRatio - (levels.get(o.category)?.level ?? globalLevel));
      slope = Math.min(MODEL.slope_cap, Math.max(MODEL.slope_floor, theilSen(xs, ys)));
    }
  }
  const table: CategoryLevel[] = [...levels.entries()]
    .map(([category, v]) => ({
      category,
      peers: v.peers,
      multiple_at_ref: round4(Math.pow(10, v.level)),
      raw_multiple_at_ref: round4(Math.pow(10, v.rawLevel)),
    }))
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const byCategory = new Map(table.map((t) => [t.category, t]));
  const levelByCategory = new Map([...levels.entries()].map(([category, v]) => [category, v.level]));
  return {
    reference_log_tvl: reference,
    reference_tvl_usd: Math.round(Math.pow(10, reference)),
    global_level: globalLevel,
    global_multiple: round4(Math.pow(10, globalLevel)),
    size_slope: slope,
    table,
    byCategory,
    levelByCategory,
  };
}

/** The model's working for one protocol: the multiple its category and size imply. */
export interface Working {
  implied: number;
  /** The final multiple the row is priced at, after the size term and the band clamp. */
  multiple: number;
  peers: number;
  /** The category's multiple at the reference size (the market's, when it has no peers). */
  levelMultiple: number;
  /** 10^(slope x size gap): what the row's size does to its category's level. */
  sizeAdjustment: number;
  sizeGap: number;
  age: number | null;
}

/** Price one protocol: TVL x the multiple its category level and its size imply. */
export function impliedValue(p: SnapshotProtocol, asOf: string, pricing: Pricing): Working {
  const entry = pricing.byCategory.get(categoryKey(p));
  const level = pricing.levelByCategory.get(categoryKey(p)) ?? pricing.global_level;
  const levelMultiple = Math.pow(10, level);
  const sizeGap = Math.log10(p.tvl_usd) - pricing.reference_log_tvl;
  const sizeAdjustment = Math.pow(10, pricing.size_slope * sizeGap);
  const multiple = Math.min(MODEL.ratio_cap, Math.max(MODEL.ratio_floor, Math.pow(10, level) * sizeAdjustment));
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple));
  return {
    implied,
    multiple,
    peers: entry !== undefined ? entry.peers : 0,
    levelMultiple,
    sizeAdjustment,
    sizeGap,
    age: ageDays(asOf, p.listed_at),
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
 * A readiness grade from the figures alone: size, track record, direction, reach and
 * peer pricing earn points, to a maximum of 10. The grade is readiness, not value — it
 * deliberately uses the fields the price ignores, so a young protocol can carry a large
 * implied value and still grade low, and its detail view shows both.
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
  referenceTvlUsd: number;
}

/**
 * One row's dossier: an evidence thesis, the risks its own record shows, and a confidence
 * grade. Thesis lines state only what the record supports; anything adverse or absent
 * goes to the risks, so the two never blur. Confidence grades the evidence behind the
 * price — how many traded peers price the category, and whether the record carries the
 * two fields the dossier leans on (the seven-day change and the listing date) — never
 * the protocol.
 */
export function dossierFor(
  p: SnapshotProtocol,
  w: Working,
  peer: CategoryLevel | undefined,
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
  if (peer !== undefined && peer.peers > 0) {
    const sizeLine = w.sizeGap >= 0.5
      ? ` At ${usd(p.tvl_usd)} it is far above the market's typical ${usd(ctx.referenceTvlUsd)}, and the model's size term — fitted on the traded record, where large protocols trade at lower multiples — prices that scale at ${mult(w.multiple)}.`
      : w.sizeGap <= -0.5
        ? ` At ${usd(p.tvl_usd)} it is well below the market's typical ${usd(ctx.referenceTvlUsd)}, and the model's size term — fitted on the traded record, where smaller protocols trade at higher multiples — prices it at ${mult(w.multiple)}.`
        : ` Its size is near the market's typical ${usd(ctx.referenceTvlUsd)}, so its price sits close to its category's level of ${mult(w.levelMultiple)}.`;
    thesis.push(`Its category's ${peer.peers} traded peer${peer.peers === 1 ? ' prices' : 's price'} at ${mult(peer.multiple_at_ref)} of TVL for a protocol of typical size.${sizeLine}`);
  }
  if (p.change_7d !== null && p.change_7d > 0) {
    const vs = ctx.catMedianChange !== null
      ? `, against a category median of ${pct(ctx.catMedianChange)} for the same week`
      : '';
    thesis.push(`TVL grew ${pct(p.change_7d)} in the seven days to the snapshot${vs} — reported as readiness evidence; the price does not chase one week's move.`);
  }
  if (w.age !== null && w.age >= 365) {
    const pc = ctx.agePercentile !== null ? ` — longer than ${ctx.agePercentile}% of the board has run` : '';
    thesis.push(`Tracked since ${p.listed_at}: ${w.age} days with no token recorded${pc}.`);
  }
  if (p.chains.length >= 4) {
    thesis.push(`Live on ${p.chains.length} chains (${p.chains.slice(0, 3).join(', ')}${p.chains.length > 3 ? ', …' : ''}): a wide deployment the readiness grade credits, though the price does not.`);
  }

  const risks: string[] = [];
  if (p.change_7d === null) {
    risks.push('DefiLlama reports no seven-day TVL change for it, so its direction is unmeasured — an absence in the record, not a reading.');
  } else if (p.change_7d <= -10) {
    risks.push(`TVL fell ${Math.abs(p.change_7d).toFixed(1)}% in the seven days to the snapshot. The price does not follow the slide down — it prices the category and the size, not the week — so a continuing slide is this row's unpriced risk.`);
  }
  if (w.age === null) {
    risks.push('The record carries no listing date, so its track record cannot be weighed; the readiness grade treats the gap as missing evidence.');
  } else if (w.age < 180) {
    risks.push(`Only ${w.age} days of tracked history: a short record, and little of it has been tested by a market move.`);
  }
  if (peer === undefined || peer.peers === 0) {
    risks.push(`No traded protocol prices its category, so it is valued at the market level (${mult(ctx.globalMultiple)} at typical size) — the thinnest evidence on the board.`);
  } else if (peer.peers <= 3) {
    risks.push(`Only ${peer.peers} traded peer${peer.peers === 1 ? '' : 's'} price${peer.peers === 1 ? 's' : ''} this category, so its level leans heavily on the market's; a single peer re-rating would move this row.`);
  }
  if (Math.abs(w.sizeGap) >= 1) {
    risks.push(`Its TVL sits ${Math.abs(w.sizeGap).toFixed(1)} decades ${w.sizeGap > 0 ? 'above' : 'below'} the market's typical size, so much of its price is the fitted size slope (x${w.sizeAdjustment.toFixed(2)}) rather than a peer of its own scale: the slope is a market-wide fit, not a measurement of this protocol.`);
  }
  if (peer !== undefined && peer.peers > 0 && w.levelMultiple >= 2 * ctx.globalMultiple) {
    risks.push(`Its category level (${mult(w.levelMultiple)} at typical size) is over twice the market's (${mult(ctx.globalMultiple)}): the price assumes it launches rich, like its category's most expensive peers.`);
  }
  if (p.chains.length === 1) {
    risks.push(`Deployed on a single chain (${p.chains[0] ?? 'unnamed'}): a chain-specific shock would hit the whole TVL at once.`);
  }
  if (p.category === null) {
    risks.push('DefiLlama names no category for it, so it is priced against the market-wide level rather than like-for-like protocols.');
  }
  if (risks.length === 0) {
    risks.push(`Its price rests on its category's peer pricing in a single day's record; peer prices after the fetch are outside what the snapshot can show.`);
  }

  const peerCount = peer !== undefined ? peer.peers : 0;
  let points = 0;
  if (peerCount >= 8) points += 2;
  else if (peerCount >= 4) points += 1;
  else if (peerCount === 0) points -= 1;
  if (p.change_7d !== null) points += 1;
  if (w.age !== null) points += 1;
  if (p.category === null) points -= 1;
  const confidence: Dossier['confidence'] = points >= 4 ? 'High' : points >= 2 ? 'Medium' : 'Low';
  const peerPart = peerCount === 0
    ? 'no traded peer prices its category'
    : `${peerCount} traded peer${peerCount === 1 ? '' : 's'} price${peerCount === 1 ? 's' : ''} its category`;
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
      main: chain === 'Ethereum'
        ? `Bridge $${capital} of USDC from Ethereum to one of the chains ${n} serves, through ${n} itself, then use the bridged funds in one app on the far side.`
        : `Bridge $${capital} of USDC from Ethereum to ${chain} through ${n}, then use the bridged funds in one app on the far side.`,
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
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from
 * the protocol's own record (category, chains, TVL, age) and never from a hand-written
 * list. The position every step works with is sized by the protocol's own depth — the
 * model's stated share of its TVL, floored and capped — and the hold step shows that
 * sizing: the deposit, its share of TVL, and the implied value that share carries on the
 * model's own figures, so no plan recommends a position the protocol's numbers make
 * absurd.
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
 * The model's validation, from the snapshot alone. The hold-out test fits the whole
 * pricing pipeline on one half of the traded market and predicts the other half's
 * recorded market caps with it, then swaps the halves; the naive baseline beside it
 * predicts with the fit half's plain median ratio alone, so the category-and-size
 * structure has to earn its place. A jackknife refits the model without each category's
 * largest peer, to show no single protocol's rating is carrying a level. The look-back
 * rolls every covered board row's TVL back along its own recorded seven-day change —
 * peer pricing held at the fetch's — and re-ranks the board, measuring how much of
 * today's order last week's figures already implied. The cross-view figures set the
 * board's ranking against a raw-TVL ranking and against the same model with the size
 * term switched off.
 */
export function validateModel(snapshot: Snapshot, board: BoardRow[]): Validation {
  const peers = tradedPeers(snapshot.protocols);
  const folds: HoldoutFold[] = [];
  const pooled: { pred: number; actual: number }[] = [];
  const pooledBase: { pred: number; actual: number }[] = [];
  for (const fold of [0, 1]) {
    const fit = peers.filter((p) => slugFold(p.slug) !== fold);
    const held = peers.filter((p) => slugFold(p.slug) === fold);
    const fitPricingModel = fitPricing(fit);
    const pairs = held.map((p) => ({ pred: impliedValue(p, snapshot.as_of, fitPricingModel).implied, actual: p.mcap_usd! }));
    const stats = errorStats(pairs);
    folds.push({ fold, fitted_on: fit.length, tested_on: held.length, median_factor: stats.median_factor, within_2x_pct: stats.within_2x_pct, spearman: stats.spearman });
    pooled.push(...pairs);
    const fitRatios = fit.map((p) => Math.min(MODEL.ratio_cap, Math.max(MODEL.ratio_floor, p.mcap_usd! / p.tvl_usd)));
    const anchor = median(fitRatios);
    pooledBase.push(...held.map((p) => ({ pred: Math.max(1, Math.round(p.tvl_usd * anchor)), actual: p.mcap_usd! })));
  }
  const all = errorStats(pooled);
  const base = errorStats(pooledBase);

  // Jackknife the fit: refit without each category's largest peer and measure how far
  // that category's level moves. A level one protocol can swing is not evidence.
  const full = fitPricing(snapshot.protocols);
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
    const refit = fitPricing(snapshot.protocols.filter((q) => q.slug !== largest.slug));
    const before = full.byCategory.get(category);
    const after = refit.byCategory.get(category);
    if (before !== undefined && after !== undefined && before.multiple_at_ref > 0) {
      jackknifeDeltas.push((100 * Math.abs(after.multiple_at_ref - before.multiple_at_ref)) / before.multiple_at_ref);
    }
  }
  const jackknifeMedian = jackknifeDeltas.length > 0 ? Math.round(10 * median(jackknifeDeltas)) / 10 : 0;

  const covered = board.filter((r) => r.change_7d !== null && r.change_7d > -100);
  const lookbackImplied = covered.map((r) => {
    const rolled = { ...r, tvl_usd: r.tvl_usd / (1 + r.change_7d! / 100) } as SnapshotProtocol;
    return impliedValue(rolled, snapshot.as_of, full).implied;
  });
  const byLookback = covered.map((r, i) => ({ slug: r.slug, v: lookbackImplied[i]! })).sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));

  const byTvl = [...board].sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const noSizePricing: Pricing = { ...full, size_slope: 0 };
  const noSizeValues = new Map(board.map((r) => [r.slug, impliedValue(r as unknown as SnapshotProtocol, snapshot.as_of, noSizePricing).implied]));
  const byNoSize = [...board].sort((a, b) => (noSizeValues.get(b.slug)! - noSizeValues.get(a.slug)!) || (a.slug < b.slug ? -1 : 1));
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
      nosize_spearman: round4(spearman(board.map((r) => r.implied_value_usd), board.map((r) => noSizeValues.get(r.slug)!))),
      nosize_top10: top10Overlap(byNoSize.map((r) => r.slug), boardSlugs),
    },
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const pricing = fitPricing(snapshot.protocols);
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
    const w = impliedValue(p, snapshot.as_of, pricing);
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
    const byTvl = [...list].sort((a, b) => b.p.tvl_usd - a.p.tvl_usd || (a.slug < b.slug ? -1 : 1));
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
    const peer = pricing.byCategory.get(categoryKey(s.p));
    const dossier = dossierFor(s.p, s.w, peer, {
      catRank: standing.rank,
      catSize: standing.size,
      catMedianChange: standing.medianChange,
      agePercentile: agePercentile(s.w.age),
      globalMultiple: pricing.global_multiple,
      referenceTvlUsd: pricing.reference_tvl_usd,
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
      grade: gradeFor(s.p, s.w, pricing.global_multiple),
      tier: tierFor(s.w.implied),
      signals: signalsFor(s.p, s.w, s.onWatchlist),
      model: {
        peer_multiple: round4(s.w.multiple),
        peers: s.w.peers,
        level_multiple: round4(s.w.levelMultiple),
        size_adjustment: round4(s.w.sizeAdjustment),
        size_gap: round4(s.w.sizeGap),
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

/** The traded protocols, by market cap: the peer set the pricing is fitted on. */
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
    level_multiple: row.model.level_multiple,
    size_adjustment: row.model.size_adjustment,
    size_gap: row.model.size_gap,
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
  const pricing = fitPricing(snapshot.protocols);
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
    global_multiple: pricing.global_multiple,
    reference_tvl_usd: pricing.reference_tvl_usd,
    size_slope: round4(pricing.size_slope),
    multiples: pricing.table,
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
