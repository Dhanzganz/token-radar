// Token Radar model "radar-2": one sealed DefiLlama snapshot in, one ranked board out.
//
// The board's job is to find protocols that record no token yet, say what a launch would be
// worth, and tell a reader how to farm each one. Every number on the board is derived from
// the snapshot's own figures at run time; no protocol name is ever special-cased.
//
// The value model, in one paragraph. Protocols whose token already trades are the peer set:
// for each category, the model takes the traded protocols' market-cap-to-TVL ratios, clamps
// them to a sane band, and uses a median shrunk toward the global median by the peer count,
// so a category with two wild peers cannot dominate. A pre-token protocol's implied value is
// its TVL times its category's peer multiple, adjusted by three documented factors: a damped
// seven-day growth factor, a maturity factor that grows with how long the protocol has run
// with no token, and a small reach factor for the chains it already spans. The dashboard's
// Method view prints the derived multiple table, so a reader can audit every figure.
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
export const MODEL_VERSION = 'radar-2';

/** The model's constants. Every one is stated in the dashboard's Method view. */
export const MODEL = {
  /** Traded peers' mcap/TVL ratios are clamped to this band before any median is taken. */
  ratio_floor: 0.01,
  ratio_cap: 5,
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
} as const;

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
  signals: string[];
  peer_multiple: number;
  peers: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
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

/** Everything the dashboard renders: the board, the traded peer set, and the model behind both. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  constants: typeof MODEL;
  global_multiple: number;
  multiples: CategoryMultiple[];
  scanned: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
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
 * multiple is its median ratio shrunk toward the global median by the peer count, so thin
 * categories lean on the whole market and deep ones stand on their own record.
 */
export function deriveMultiples(snapshot: Snapshot): { global: number; table: CategoryMultiple[]; byCategory: Map<string, CategoryMultiple> } {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = Math.min(MODEL.ratio_cap, Math.max(MODEL.ratio_floor, p.mcap_usd / p.tvl_usd));
    all.push(ratio);
    const key = categoryKey(p);
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const globalRaw = all.length > 0 ? median(all) : 0.2;
  const global = round4(globalRaw);
  const table: CategoryMultiple[] = [];
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of ratiosByCategory) {
    const raw = median(ratios);
    const shrunk = (ratios.length * raw + MODEL.shrink_peers * globalRaw) / (ratios.length + MODEL.shrink_peers);
    // One or two wild peers must not price a whole category: keep the result within a band
    // around the global median, a third of it to three times it.
    const banded = Math.min(globalRaw * MODEL.multiple_band, Math.max(globalRaw / MODEL.multiple_band, shrunk));
    const entry: CategoryMultiple = { category, peers: ratios.length, raw_median: round4(raw), multiple: round4(banded) };
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

/** Score one protocol: TVL x peer multiple, adjusted by growth, maturity and reach. */
export function impliedValue(p: SnapshotProtocol, asOf: string, derived: { global: number; byCategory: Map<string, CategoryMultiple> }): Working {
  const peer = multipleFor(p, derived);
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(MODEL.growth_cap_pct, Math.max(MODEL.growth_floor_pct, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * MODEL.growth_weight;
  const maturityMult = age === null
    ? MODEL.maturity_unknown
    : MODEL.maturity_floor + (Math.min(age, MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  const reachMult = 1 + MODEL.reach_per_chain * Math.min(Math.max(p.chains.length - 1, 0), MODEL.reach_chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * peer.multiple * growthMult * maturityMult * reachMult));
  return { implied, multiple: peer.multiple, peers: peer.peers, growthPct, growthMult, maturityMult, reachMult, age };
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

/** How much capital one farm position needs, scaled to the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 10_000_000) return 75;
  return 50;
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
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
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
      cost: `$${capital} of capital and about ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: acts.weekly,
      cost: `about ${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity appears in more than one weekly snapshot of the protocol.`,
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
  return scored.map((s, i) => ({
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
    token_status: 'pre-token',
    watchlist: s.onWatchlist,
    age_days: s.w.age,
    implied_value_usd: s.w.implied,
    grade: gradeFor(s.p, s.w, derived.global),
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
    farm_steps: farmSteps(s.p, s.w.age).map(stepText),
  }));
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
    signals: row.signals,
    peer_multiple: row.model.peer_multiple,
    peers: row.model.peers,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const derived = deriveMultiples(snapshot);
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    constants: MODEL,
    global_multiple: derived.global,
    multiples: derived.table,
    scanned: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - snapshot.watchlist.length,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
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
