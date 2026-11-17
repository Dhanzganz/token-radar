/* Token Radar — renders window.RADAR (written by main.ts beside this page) with no network.
   Views, chosen by the location hash: the board (#/board, filters in the query), a protocol's
   detail (#/protocol/<slug>), the traded peer set (#/live) and the method (#/method). */
'use strict';

const R = window.RADAR;
const $view = document.getElementById('view');

/** Escape a string for HTML text or attribute context. */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Whole dollars with thousands separators: 1234567 -> $1,234,567. */
function fmtFull(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Compact dollars for dense tables: $1.23B, $45.6M, $320K. */
function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}

/** A signed percentage with one decimal, or an em dash when unreported. */
function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  const s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  return n > 0 ? '<span class="up">' + s + '</span>' : n < 0 ? '<span class="down">' + s + '</span>' : s;
}

/** An age in days as years or days. */
function fmtAge(days) {
  if (days === null || days === undefined) return '—';
  if (days >= 730) return (days / 365.25).toFixed(1) + ' yrs';
  if (days >= 60) return Math.round(days / 30.4) + ' mo';
  return days + ' d';
}

/** A multiplier with two decimals. */
function fmtMult(n) {
  return '×' + Number(n).toFixed(2);
}

/** The hash route: { view, slug, params } out of location.hash. */
function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const params = new URLSearchParams(query || '');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'protocol' && parts[1]) return { view: 'detail', slug: decodeURIComponent(parts[1]), params };
  if (parts[0] === 'live') return { view: 'live', params };
  if (parts[0] === 'method') return { view: 'method', params };
  return { view: 'board', params };
}

/** Set the hash without scrolling, then render. */
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

/** The page chrome: brand, view tabs, and the headline figures. */
function renderChrome(active) {
  const top = R.rows[0];
  document.getElementById('topbar').innerHTML =
    '<div class="brand"><span class="mark">RADAR</span><h1>Token Radar</h1>' +
    '<span class="sub">Pre-token protocols ranked by implied launch value · snapshot of ' + esc(R.as_of) + '</span></div>' +
    '<nav class="views">' +
    '<a href="#/board" class="' + (active === 'board' || active === 'detail' ? 'on' : '') + '">BOARD</a>' +
    '<a href="#/live" class="' + (active === 'live' ? 'on' : '') + '">TRADED PEERS</a>' +
    '<a href="#/method" class="' + (active === 'method' ? 'on' : '') + '">METHOD</a></nav>' +
    '<div class="stats">' +
    stat('Protocols scanned', R.scanned) +
    stat('Watchlist covered', R.watchlist_size + ' <em>/ ' + R.watchlist_size + '</em>') +
    stat('Board rows', R.board_size) +
    stat('Tier 1 headliners', R.rows.filter((r) => r.tier === 1).length) +
    stat('Early finds below the floor', R.early_size) +
    stat('Global peer multiple', fmtMult(R.global_multiple)) +
    stat('Top implied value', top ? fmtMoney(top.implied_value_usd) : '—') +
    '</div>';
  document.getElementById('foot').innerHTML =
    '<div>Model <b>' + esc(R.model_version) + '</b> · Implied value is this board\u2019s own claim, derived from the snapshot\u2019s figures; ' +
    'a protocol here <i>records</i> no token, which is not proof it has none. Nothing here is a prediction that a token will be issued.</div>' +
    '<div class="src">Source: ' + esc(R.source) + '</div>';
}

/** One headline figure. */
function stat(k, v) {
  return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' + v + '</div></div>';
}

/* ------------------------------------------------------------------ board */

const SORTS = {
  rank: { label: 'Rank', get: (r) => r.rank, dir: 1 },
  name: { label: 'Protocol', get: (r) => r.name.toLowerCase(), dir: 1 },
  tvl: { label: 'TVL', get: (r) => r.tvl_usd, dir: -1 },
  change: { label: '7d %', get: (r) => (r.change_7d === null ? -Infinity : r.change_7d), dir: -1 },
  age: { label: 'Age', get: (r) => (r.age_days === null ? -1 : r.age_days), dir: -1 },
  mult: { label: 'Peer ×', get: (r) => r.peer_multiple, dir: -1 },
  implied: { label: 'Implied value', get: (r) => r.implied_value_usd, dir: -1 },
};
let shownCount = 60;

/** The tier's band as the toolbar and the method state it: Tier 1 at or above $150M, and so on. */
function tierLabel(t) {
  const i = R.tiers.findIndex((x) => x.tier === t.tier);
  const next = R.tiers[i - 1];
  if (next) return 'Tier ' + t.tier + ' · ' + t.label + ' (' + fmtMoney(t.min_usd) + '–' + fmtMoney(next.min_usd) + ')';
  if (i === 0) return 'Tier ' + t.tier + ' · ' + t.label + ' (≥ ' + fmtMoney(t.min_usd) + ')';
  return 'Tier ' + t.tier + ' · ' + t.label + ' (< ' + fmtMoney(R.tiers[i - 1].min_usd) + ')';
}

/** The board: toolbar (search, category, chain, floor, tier, watchlist, sort) over a sortable table. */
function renderBoard(params) {
  const q = params.get('q') || '';
  const cat = params.get('cat') || '';
  const chain = params.get('chain') || '';
  const minTvl = Number(params.get('min') || 0);
  const tier = Number(params.get('tier') || 0);
  const watch = params.get('watch') === '1';
  const sortKey = SORTS[params.get('sort')] ? params.get('sort') : 'rank';
  const dir = params.get('dir') ? Number(params.get('dir')) : SORTS[sortKey].dir;

  const cats = [...new Set(R.rows.map((r) => r.category || 'Uncategorised'))].sort();
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  const topImplied = R.rows.length ? R.rows[0].implied_value_usd : 1;

  let rows = R.rows.filter((r) => {
    if (watch && !r.watchlist) return false;
    if (tier && r.tier !== tier) return false;
    if (cat && (r.category || 'Uncategorised') !== cat) return false;
    if (chain && !r.chains.includes(chain)) return false;
    if (minTvl && r.tvl_usd < minTvl) return false;
    if (q) {
      const hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
  const spec = SORTS[sortKey];
  rows = [...rows].sort((a, b) => {
    const va = spec.get(a);
    const vb = spec.get(b);
    const cmp = va < vb ? -1 : va > vb ? 1 : a.rank - b.rank;
    return cmp * dir;
  });

  const shown = rows.slice(0, shownCount);
  const opt = (v, cur, label) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(label) + '</option>';
  const head = (key, label) =>
    '<th data-sort="' + key + '" class="' + (sortKey === key ? 'sorted' : '') + '">' + label + (sortKey === key ? (dir === 1 ? ' ↑' : ' ↓') : '') + '</th>';

  $view.innerHTML =
    '<div class="toolbar">' +
    '<label>Search</label><input type="search" id="f-q" value="' + esc(q) + '" placeholder="name, slug, category">' +
    '<label>Category</label><select id="f-cat">' + opt('', cat, 'All categories') + cats.map((c) => opt(c, cat, c)).join('') + '</select>' +
    '<label>Chain</label><select id="f-chain">' + opt('', chain, 'All chains') + chains.map((c) => opt(c, chain, c)).join('') + '</select>' +
    '<label>Min TVL</label><select id="f-min">' +
    opt(0, minTvl, 'Any') + opt(10000000, minTvl, '$10M') + opt(50000000, minTvl, '$50M') + opt(100000000, minTvl, '$100M') + opt(1000000000, minTvl, '$1B') + '</select>' +
    '<label>Tier</label><select id="f-tier">' + opt(0, tier, 'All tiers') + R.tiers.map((t) => opt(t.tier, tier, tierLabel(t))).join('') + '</select>' +
    '<label class="check"><input type="checkbox" id="f-watch"' + (watch ? ' checked' : '') + '> Watchlist only</label>' +
    '<label>Sort</label><select id="f-sort">' + Object.keys(SORTS).map((k) => opt(k, sortKey, SORTS[k].label)).join('') + '</select>' +
    '<span class="count">Showing <b>' + shown.length + '</b> of ' + rows.length + ' protocols</span>' +
    '</div>' +
    (rows.length === 0
      ? '<div class="empty">No protocol matches those filters. Loosen one and the radar sweeps again.</div>'
      : '<table class="board"><thead><tr>' +
        head('rank', '#') + head('name', 'Protocol') + '<th>Chains</th>' + head('tvl', 'TVL') + head('change', '7d %') +
        head('age', 'Age') + head('mult', 'Peer ×') + head('implied', 'Implied value') + '<th>Grade</th><th>Tier</th><th>Signals</th>' +
        '</tr></thead><tbody>' +
        shown.map((r) =>
          '<tr data-slug="' + esc(r.slug) + '" class="' + (r.watchlist ? 'wl' : '') + '">' +
          '<td class="rank' + (r.rank <= 3 ? ' top' : '') + '">' + r.rank + '</td>' +
          '<td class="name"><span class="pname">' + esc(r.name) + '</span><span class="cat">' + esc(r.category || 'Uncategorised') + '</span></td>' +
          '<td>' + r.chains.length + '</td>' +
          '<td>' + fmtMoney(r.tvl_usd) + '</td>' +
          '<td>' + fmtPct(r.change_7d) + '</td>' +
          '<td>' + fmtAge(r.age_days) + '</td>' +
          '<td>' + fmtMult(r.peer_multiple) + '</td>' +
          '<td class="val">' + fmtMoney(r.implied_value_usd) +
          '<span class="vbar"><i style="width:' + Math.max(3, Math.round(100 * Math.log10(Math.max(r.implied_value_usd, 10)) / Math.log10(topImplied))) + '%"></i></span></td>' +
          '<td><span class="grade ' + esc(r.grade) + '">' + esc(r.grade) + '</span></td>' +
          '<td><span class="tier t' + r.tier + '" title="' + esc(tierLabel(R.tiers.find((t) => t.tier === r.tier))) + '">T' + r.tier + '</span></td>' +
          '<td style="text-align:left;white-space:normal">' + r.signals.slice(0, 3).map((s) => '<span class="chip' + (s === 'Watchlist' ? ' hot' : '') + '">' + esc(s) + '</span>').join('') + '</td>' +
          '</tr>').join('') +
        '</tbody></table>' +
        (rows.length > shown.length
          ? '<div class="more"><button id="more">Show all ' + rows.length + ' protocols</button></div>'
          : '')) +
    '<p class="note">Every row records no token in the snapshot. <b>Watchlist</b> rows are the house\u2019s floor set (TVL at or above ' +
    fmtMoney(R.floor_usd) + ', no token, not a wrapped or staked product); the rest are early finds below that floor. ' +
    'Tiers band the board by implied value (' + R.tiers.map((t) => tierLabel(t)).join(' · ') + '); the bar under each value is its log-scale share of the top row. ' +
    'Click any row for its dossier, model working and farm plan.</p>';

  const apply = () => {
    const p = new URLSearchParams();
    const nq = document.getElementById('f-q').value.trim();
    const ncat = document.getElementById('f-cat').value;
    const nchain = document.getElementById('f-chain').value;
    const nmin = document.getElementById('f-min').value;
    const ntier = document.getElementById('f-tier').value;
    const nwatch = document.getElementById('f-watch').checked;
    const nsort = document.getElementById('f-sort').value;
    if (nq) p.set('q', nq);
    if (ncat) p.set('cat', ncat);
    if (nchain) p.set('chain', nchain);
    if (Number(nmin)) p.set('min', nmin);
    if (Number(ntier)) p.set('tier', ntier);
    if (nwatch) p.set('watch', '1');
    if (nsort !== 'rank') p.set('sort', nsort);
    shownCount = 60;
    go('#/board' + (p.toString() ? '?' + p.toString() : ''));
  };
  for (const id of ['f-cat', 'f-chain', 'f-min', 'f-tier', 'f-sort']) document.getElementById(id).addEventListener('change', apply);
  document.getElementById('f-watch').addEventListener('change', apply);
  document.getElementById('f-q').addEventListener('change', apply);
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      const p = new URLSearchParams(params);
      if (key === sortKey) p.set('dir', String(dir * -1));
      else { p.set('sort', key); p.delete('dir'); }
      go('#/board?' + p.toString());
    });
  });
  document.querySelectorAll('tr[data-slug]').forEach((tr) => {
    tr.addEventListener('click', () => go('#/protocol/' + encodeURIComponent(tr.getAttribute('data-slug'))));
  });
  const more = document.getElementById('more');
  if (more) more.addEventListener('click', () => { shownCount = rows.length; render(); });
}

/* ------------------------------------------------------------------ detail */

/** Split a farm step string back into its action, cost and time for display. */
function splitStep(s) {
  const m = /^(.*) Cost: (.+)\. Time: (.+)\.$/.exec(s);
  if (!m) return { text: s, cost: '', time: '' };
  return { text: m[1], cost: m[2], time: m[3] };
}

/** A factor row in the model breakdown: label, value, and a bar scaled to `frac`. */
function factor(label, value, frac, amber) {
  const pct = Math.max(2, Math.min(100, Math.round(frac * 100)));
  return '<div class="factor"><div class="row"><span class="k">' + esc(label) + '</span><span class="v">' + esc(value) + '</span></div>' +
    '<div class="bar"><i class="' + (amber ? 'amb' : '') + '" style="width:' + pct + '%"></i></div></div>';
}

/** One protocol's page: its dossier, the model's working, the peer evidence, and the farm plan. */
function renderDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) { renderBoard(new URLSearchParams()); return; }
  const cat = R.multiples.find((m) => m.category === (r.category || 'Uncategorised'));
  const base = r.tvl_usd * r.peer_multiple;
  const chips = r.signals.map((s) => '<span class="chip' + (s === 'Watchlist' ? ' hot' : '') + '">' + esc(s) + '</span>').join('');
  const d = r.dossier;
  const catMax = r.cat_top.length ? r.cat_top[0].tvl_usd : 1;
  $view.innerHTML =
    '<a class="back" href="#/board">&larr; Back to the board</a>' +
    '<div class="detail-head"><div><h2>' + esc(r.name) + '</h2>' +
    '<div class="meta">Rank <b>#' + r.rank + '</b> of ' + R.board_size + ' · ' + esc(r.category || 'Uncategorised') +
    ' · Grade <span class="grade ' + esc(r.grade) + '">' + esc(r.grade) + '</span>' +
    ' · <span class="tier t' + r.tier + '">' + esc(tierLabel(R.tiers.find((t) => t.tier === r.tier))) + '</span> · ' + chips + '</div></div>' +
    '<div class="big-val"><div class="k">Implied launch value</div><div class="v">' + fmtFull(r.implied_value_usd) + '</div></div></div>' +
    '<div class="cols">' +
    '<section class="card"><h3>The thesis — what its record shows</h3>' +
    '<ul class="bullets">' + d.thesis.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
    '<p class="note">Every line is computed from this protocol\u2019s own fields in the snapshot — TVL, seven-day change, listing date, chains — and the peer table its category produced. Nothing is fetched, and nothing is asserted that the record does not carry.</p></section>' +
    '<section class="card"><h3>Risks in its own record</h3>' +
    '<ul class="bullets risks">' + d.risks.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
    '<div class="conf"><span class="conf-badge ' + esc(d.confidence) + '">Evidence confidence: ' + esc(d.confidence) + '</span>' +
    '<p class="note">' + esc(d.confidence_reason) + ' Confidence grades the evidence behind the price, not the protocol: it cannot see team, audits, tokenomics or anything after the fetch.</p></div></section></div>' +
    '<div class="cols">' +
    '<section class="card"><h3>How the value is derived</h3>' +
    '<div class="kv"><span class="k">TVL (snapshot)</span><span class="v">' + fmtFull(r.tvl_usd) + '</span></div>' +
    '<div class="kv"><span class="k">Peer multiple, ' + esc(r.category || 'Uncategorised') + '</span><span class="v">' + fmtMult(r.peer_multiple) +
    ' from ' + r.peers + ' traded peer' + (r.peers === 1 ? '' : 's') + '</span></div>' +
    '<div class="kv"><span class="k">Base value, TVL &times; multiple</span><span class="v">' + fmtFull(base) + '</span></div>' +
    factor('Growth, 7d TVL change ' + (r.change_7d === null ? 'unreported' : r.change_7d.toFixed(1) + '%'), fmtMult(r.growth_multiplier), (r.growth_multiplier - 0.6) / 0.9, r.growth_multiplier < 1) +
    factor('Maturity, ' + (r.age_days === null ? 'listing date unreported' : fmtAge(r.age_days) + ' with no token'), fmtMult(r.maturity_multiplier), (r.maturity_multiplier - 0.7) / 0.6, false) +
    factor('Reach, ' + r.chains.length + (r.chains.length === 1 ? ' chain' : ' chains'), fmtMult(r.reach_multiplier), (r.reach_multiplier - 1) / 0.25, false) +
    '<div class="kv"><span class="k">Implied value</span><span class="v">' + fmtFull(r.implied_value_usd) + '</span></div>' +
    '<p class="note">The multiple is the depth-weighted median market-cap-to-TVL ratio of the ' + r.peers + ' traded protocol' + (r.peers === 1 ? '' : 's') + ' in this category' +
    (cat ? ' (weighted median ' + fmtMult(cat.raw_median) + ', each peer weighted by the square root of its TVL)' : '') + ', shrunk toward the global median of ' + fmtMult(R.global_multiple) +
    '. The Method view shows the whole table and every constant.</p></section>' +
    '<section class="card"><h3>The record</h3>' +
    '<div class="kv"><span class="k">Slug</span><span class="v">' + esc(r.slug) + '</span></div>' +
    '<div class="kv"><span class="k">Token status</span><span class="v">records no token</span></div>' +
    '<div class="kv"><span class="k">On the house watchlist</span><span class="v">' + (r.watchlist ? 'yes' : 'no — early find below the floor') + '</span></div>' +
    '<div class="kv"><span class="k">TVL</span><span class="v">' + fmtFull(r.tvl_usd) + '</span></div>' +
    '<div class="kv"><span class="k">TVL change, 7 days</span><span class="v">' + (r.change_7d === null ? 'unreported' : r.change_7d.toFixed(2) + '%') + '</span></div>' +
    '<div class="kv"><span class="k">Tracked since</span><span class="v">' + esc(r.listed_at || 'unreported') + '</span></div>' +
    '<div class="kv"><span class="k">Chains</span><span class="v">' + r.chains.map(esc).join(', ') + '</span></div>' +
    '<h3 style="margin-top:16px">Standing in ' + esc(r.category || 'Uncategorised') + ' — by TVL</h3>' +
    '<table class="mini catstand"><tbody>' +
    r.cat_top.map((p) =>
      '<tr class="' + (p.slug === r.slug ? 'me' : '') + '"><td>' + esc(p.name) + (p.slug === r.slug ? ' <span class="chip hot">this one</span>' : '') + '</td>' +
      '<td class="barcell"><span class="vbar wide"><i style="width:' + Math.max(2, Math.round(100 * p.tvl_usd / catMax)) + '%"></i></span></td>' +
      '<td>' + fmtMoney(p.tvl_usd) + '</td></tr>').join('') +
    '</tbody></table>' +
    '<p class="note">#' + r.cat_rank + ' of ' + r.cat_size + ' pre-token protocols in its category on this board, by TVL in the snapshot.</p>' +
    '<h3 style="margin-top:16px">Farm plan</h3>' +
    '<ol class="plan">' + r.farm_steps.map((s) => {
      const p = splitStep(s);
      return '<li><div class="step">' + esc(p.text) + '</div><div class="tags">' +
        (p.cost ? '<span class="chip">Cost: ' + esc(p.cost) + '</span>' : '') +
        (p.time ? '<span class="chip">Time: ' + esc(p.time) + '</span>' : '') + '</div></li>';
    }).join('') + '</ol>' +
    '<p class="note"><b>Careful:</b> a farm plan is a way to be an early, genuine user. It is not a promise of an airdrop, and no step here asks you to pay anyone to claim anything.</p>' +
    '</section></div>';
}

/* ------------------------------------------------------------------ live */

/** The traded peer set: protocols whose token already trades, at the market's own values. */
function renderLive() {
  $view.innerHTML =
    '<p class="note" style="margin-top:12px">These protocols already have a token, so the radar does not rank them: it reads them. ' +
    'Their market-cap-to-TVL ratios are the peer evidence behind every multiple on the board — the Method view shows how they are combined.</p>' +
    '<table class="mini"><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>MCap / TVL</th><th>7d %</th></tr></thead><tbody>' +
    R.live.map((p) =>
      '<tr><td style="font-family:var(--sans);font-weight:600">' + esc(p.name) + '</td><td>' + esc(p.category || 'Uncategorised') + '</td>' +
      '<td>' + fmtMoney(p.tvl_usd) + '</td><td>' + fmtMoney(p.mcap_usd) + '</td><td>' + (p.mcap_tvl === null ? '—' : fmtMult(p.mcap_tvl)) + '</td>' +
      '<td>' + fmtPct(p.change_7d) + '</td></tr>').join('') +
    '</tbody></table>';
}

/* ------------------------------------------------------------------ method */

/** The method: the formula, the constants, and the derived multiple table, all stated plainly. */
function renderMethod() {
  const c = R.constants;
  const kv = (k, v) => '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';
  $view.innerHTML =
    '<div class="prose"><h2 style="margin:14px 0 6px">How this radar values a launch that has not happened</h2>' +
    '<p>Every figure comes from the sealed snapshot itself: ' + R.scanned + ' protocols, fetched once from DefiLlama\u2019s public API and frozen on ' + esc(R.as_of) +
    '. Nothing is fetched live, no protocol name is special-cased, and the same code prices every row.</p>' +
    '<p><b>Step 1 — learn what the market pays.</b> For each traded protocol, take <code>mcap / TVL</code>, clamp it to ' + c.ratio_floor + '–' + c.ratio_cap +
    ', and group by category. A category\u2019s multiple is its <b>depth-weighted median</b> ratio: each peer counts in proportion to the square root of its TVL, so the protocols the market has actually capitalised set the price, while no single giant can dictate it. ' +
    'The median is then shrunk toward the global median (' + fmtMult(R.global_multiple) + ') as if the global had ' + c.shrink_peers +
    ' extra peers, and kept within a third to three times that median, so a category with two wild ratios cannot dominate its board. The global median itself stays a plain median of every ratio: it is the anchor the shrinkage leans on, and weighting it too would let a handful of the largest protocols in the snapshot flatten every category\u2019s evidence toward one figure.</p>' +
    '<p><b>Step 2 — price the pre-token protocol like its peers.</b> <code>implied = TVL &times; category multiple &times; growth &times; maturity &times; reach</code>. ' +
    'Growth damps the seven-day TVL change (clamped to ' + c.growth_floor_pct + '%…+' + c.growth_cap_pct + '%) by ' + c.growth_weight + '. ' +
    'Maturity rises from ' + c.maturity_floor + ' to ' + (c.maturity_floor + c.maturity_range) + ' over ' + c.maturity_days + ' days of running with no token — a protocol that has operated for years without issuing has more to launch. ' +
    'Reach adds ' + (c.reach_per_chain * 100) + '% per extra chain, up to ' + c.reach_chains + ' chains.</p>' +
    '<p><b>Step 3 — screen the board.</b> The board ranks every protocol on the house watchlist (TVL at or above ' + fmtMoney(R.floor_usd) + ', records no token, not a wrapped or staked product), ' +
    'plus every other pre-token protocol below that floor whose name carries no version marker, no whole word <i>wrapped</i>, <i>staked</i> or <i>staking</i>, and no exchange\u2019s name at its head. ' +
    'Traded protocols are never ranked; they are the evidence, shown under Traded peers.</p>' +
    '<p><b>Step 4 — write the dossier, band the board.</b> Each row\u2019s detail page carries a dossier the model writes from the same record: a thesis of what the protocol\u2019s own fields support (its standing in its category, its momentum against that category\u2019s median, its track record, its reach, its peers\u2019 pricing), the risks the same fields show (a falling or unreported seven-day change, a short or dateless record, a thin or rich peer set, a single chain), and a confidence grade for the evidence — high when at least eight traded peers price the category and both the seven-day change and the listing date are reported, lower as the record thins. Confidence grades the evidence behind a price, never the protocol. ' +
    'The board is also banded into tiers by implied value: ' + R.tiers.map((t) => tierLabel(t)).join(' · ') + '.</p>' +
    '<p><b>What this is not.</b> An implied value is the board\u2019s claim about what a launch would be worth if the record stayed as it is. It does not predict that a token will be issued, or when. ' +
    'A protocol here <i>records</i> no token in DefiLlama\u2019s fields, which is not proof it has none.</p></div>' +
    '<div class="cols"><section class="card"><h3>Model constants — ' + esc(R.model_version) + '</h3>' +
    kv('Ratio clamp', c.ratio_floor + ' – ' + c.ratio_cap) +
    kv('Peer weighting', 'square root of TVL (exponent ' + c.weight_exponent + ')') +
    kv('Shrinkage', c.shrink_peers + ' phantom global peers') +
    kv('Multiple band', 'global / ' + c.multiple_band + ' to global × ' + c.multiple_band) +
    kv('Global peer multiple', fmtMult(R.global_multiple)) +
    kv('Growth clamp / weight', c.growth_floor_pct + '% … +' + c.growth_cap_pct + '% / ' + c.growth_weight) +
    kv('Maturity', c.maturity_floor + ' → ' + (c.maturity_floor + c.maturity_range) + ' over ' + c.maturity_days + ' days') +
    kv('Maturity, date unknown', '×' + c.maturity_unknown) +
    kv('Reach', '+' + (c.reach_per_chain * 100) + '% per chain, max ' + c.reach_chains) +
    '</section>' +
    '<section class="card"><h3>Derived peer multiples</h3>' +
    '<table class="mini"><thead><tr><th>Category</th><th>Peers</th><th>Weighted median</th><th>Multiple used</th></tr></thead><tbody>' +
    R.multiples.map((m) => '<tr><td>' + esc(m.category) + '</td><td>' + m.peers + '</td><td>' + fmtMult(m.raw_median) + '</td><td>' + fmtMult(m.multiple) + '</td></tr>').join('') +
    '</tbody></table></section></div>';
}

/* ------------------------------------------------------------------ boot */

function render() {
  const r = route();
  renderChrome(r.view);
  if (r.view === 'detail') renderDetail(r.slug);
  else if (r.view === 'live') renderLive();
  else if (r.view === 'method') renderMethod();
  else renderBoard(r.params);
  $view.setAttribute('aria-busy', 'false');
}

window.addEventListener('hashchange', render);
render();
