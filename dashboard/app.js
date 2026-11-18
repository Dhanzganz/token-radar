// Token Radar dashboard. Renders window.RADAR (data.js) with no fetch and no network:
// a ranked board of pre-token protocols, one detail view per row, the model's method
// and validation, and the traded peers the pricing is fitted on.
(function () {
  'use strict';
  var R = window.RADAR;
  var view = document.getElementById('view');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(n) {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function usdFull(n) {
    return n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n == null) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function mult(n) { return 'x' + Number(n).toFixed(2); }
  function bySlug(slug) {
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) return R.rows[i];
    return null;
  }
  function tierLabel(t) {
    for (var i = 0; i < R.tiers.length; i++) if (R.tiers[i].tier === t) return R.tiers[i].label;
    return '';
  }

  function renderChrome(current) {
    var v = R.validation;
    document.getElementById('topbar').innerHTML =
      '<h1>Token Radar</h1>' +
      '<p class="sub">Pre-token protocols ranked by the value the traded market implies for them. ' +
      'Each price is fitted from the snapshot&rsquo;s traded protocols: a level for the protocol&rsquo;s category, ' +
      'adjusted by a size slope, both estimated in log space. Snapshot of ' + esc(R.as_of) + ' &middot; ' + esc(R.source) + '.</p>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + R.scanned + '</b><span>protocols scanned</span></div>' +
      '<div class="stat"><b>' + R.board_size + '</b><span>board rows (' + R.watchlist_size + ' watchlist + ' + R.early_size + ' early)</span></div>' +
      '<div class="stat"><b>x' + v.median_factor.toFixed(2) + '</b><span>hold-out median miss (naive x' + v.baseline_median_factor.toFixed(2) + ')</span></div>' +
      '<div class="stat"><b>' + mult(R.global_multiple) + '</b><span>market multiple at ' + usd(R.reference_tvl_usd) + ' TVL</span></div>' +
      '<div class="stat"><b>' + R.size_slope.toFixed(2) + '</b><span>size slope per decade of TVL</span></div>' +
      '</div>';
    var tabs = [['board', 'Board'], ['method', 'Method &amp; validation'], ['peers', 'Traded peers']];
    document.getElementById('tabs').innerHTML = tabs.map(function (t) {
      return '<a href="#/' + (t[0] === 'board' ? '' : t[0]) + '"' + (current === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('');
    document.getElementById('foot').innerHTML =
      '<p>Model ' + esc(R.model_version) + '. Prices are a fitted model&rsquo;s reading of one day&rsquo;s record, not a forecast: ' +
      'the Method view shows the fit, its hold-out errors and what it leaves out. Farm plans are sized from each protocol&rsquo;s own ' +
      'depth and are a starting point for your own checks, not advice.</p>';
  }

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var q = {};
    var qi = h.indexOf('?');
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (kv) {
        var p = kv.split('=');
        q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
      h = h.slice(0, qi);
    }
    var parts = h.split('/').filter(Boolean);
    return { parts: parts, q: q };
  }

  function route() {
    var parsed = parseHash();
    var parts = parsed.parts;
    view.setAttribute('aria-busy', 'true');
    if (parts[0] === 'row' && parts[1]) {
      renderChrome('board');
      renderDetail(parts[1], parts[2] === 'plan');
    } else if (parts[0] === 'method') {
      renderChrome('method');
      renderMethod();
    } else if (parts[0] === 'peers') {
      renderChrome('peers');
      renderPeers();
    } else {
      renderChrome('board');
      renderBoard(parsed.q);
    }
    view.setAttribute('aria-busy', 'false');
    view.focus({ preventScroll: true });
    var toPlan = parts[0] === 'row' && parts[2] === 'plan';
    if (!toPlan) window.scrollTo(0, 0);
  }

  function chips(signals) {
    return '<span class="chips">' + signals.map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join('') + '</span>';
  }

  function renderBoard(q) {
    var tier = q.tier ? Number(q.tier) : 0;
    var watchOnly = q.watch === '1';
    var query = (q.q || '').toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (tier && r.tier !== tier) return false;
      if (watchOnly && !r.watchlist) return false;
      if (query && (r.name + ' ' + (r.category || '') + ' ' + r.slug).toLowerCase().indexOf(query) < 0) return false;
      return true;
    });
    var tierButtons = ['<button data-tier="0" aria-pressed="' + (tier === 0) + '">All tiers</button>']
      .concat(R.tiers.map(function (t) {
        return '<button data-tier="' + t.tier + '" aria-pressed="' + (tier === t.tier) + '">T' + t.tier + ' ' + esc(t.label) + '</button>';
      })).join('');
    var html = '<section class="panel"><h2>The board</h2>' +
      '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name, category, slug" value="' + esc(q.q || '') + '" aria-label="Search the board">' +
      '<span class="group" role="group" aria-label="Tier filter">' + tierButtons + '</span>' +
      '<label><input type="checkbox" id="watch"' + (watchOnly ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count">' + rows.length + ' of ' + R.board_size + ' rows</span>' +
      '</div>' +
      '<table><thead><tr><th>#</th><th>Protocol</th><th class="num">TVL</th><th class="num">7d</th>' +
      '<th class="num">Implied value</th><th class="num">Multiple</th><th>Grade</th><th>Tier</th><th>Signals</th></tr></thead><tbody>';
    html += rows.map(function (r) {
      var chg = r.change_7d == null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '"><td class="rank">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><br><span class="cat">' + esc(r.category || 'Uncategorised') + '</span></td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td><td class="num">' + chg + '</td>' +
        '<td class="num"><b>' + usd(r.implied_value_usd) + '</b></td><td class="num">' + mult(r.peer_multiple) + '</td>' +
        '<td><span class="grade ' + r.grade + '">' + r.grade + '</span></td>' +
        '<td>T' + r.tier + '</td><td>' + chips(r.signals) + '</td></tr>';
    }).join('');
    html += '</tbody></table>';
    if (rows.length === 0) html += '<p class="note">No rows match this filter.</p>';
    html += '</section>';
    view.innerHTML = html;

    function apply(patch) {
      var next = Object.assign({}, q, patch);
      var qs = Object.keys(next).filter(function (k) { return next[k] !== '' && next[k] != null; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(next[k]); }).join('&');
      location.hash = '#/' + (qs ? '?' + qs : '');
    }
    var search = document.getElementById('q');
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { apply({ q: search.value }); }, 250);
    });
    view.querySelectorAll('button[data-tier]').forEach(function (b) {
      b.addEventListener('click', function () { apply({ tier: b.getAttribute('data-tier') === '0' ? '' : b.getAttribute('data-tier') }); });
    });
    document.getElementById('watch').addEventListener('change', function (e) { apply({ watch: e.target.checked ? '1' : '' }); });
    view.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/row/' + tr.getAttribute('data-slug'); });
    });
  }

  function renderDetail(slug, toPlan) {
    var r = bySlug(slug);
    if (!r) {
      view.innerHTML = '<section class="panel"><p><a class="back" href="#/">&larr; The board</a></p><p>No row named ' + esc(slug) + ' is on this board.</p></section>';
      return;
    }
    var cat = r.category || 'Uncategorised';
    var age = r.age_days == null ? 'not in the record' : r.age_days + ' days';
    var listed = r.listed_at || 'unreported';
    var derive =
      'Priced from its peers: ' + (r.peers > 0
        ? 'the ' + r.peers + ' traded ' + esc(cat) + ' protocol' + (r.peers === 1 ? ' sets' : 's set') + ' a level of ' + mult(r.level_multiple) +
          ' of TVL for a protocol of the market&rsquo;s typical size (' + usd(R.reference_tvl_usd) + ').'
        : 'no traded protocol prices ' + esc(cat) + ', so the market level of ' + mult(R.global_multiple) + ' carries this row.') +
      ' At ' + usd(r.tvl_usd) + ' of TVL its size sits ' + Math.abs(r.size_gap).toFixed(2) + ' decades ' +
      (r.size_gap >= 0 ? 'above' : 'below') + ' that typical size, and the fitted size slope (' + R.size_slope.toFixed(2) +
      ' per decade) adjusts the level by x' + r.size_adjustment.toFixed(2) + ' to ' + mult(r.peer_multiple) +
      ' &mdash; ' + usd(r.tvl_usd) + ' x ' + r.peer_multiple.toFixed(4) + ' = <b>' + usdFull(r.implied_value_usd) + '</b>.';
    var kv = [
      [usdFull(r.implied_value_usd), 'implied launch value'],
      [usdFull(r.tvl_usd), 'TVL at the snapshot'],
      [mult(r.peer_multiple), 'multiple it is priced at'],
      [mult(r.level_multiple), 'category level at typical size'],
      ['x' + r.size_adjustment.toFixed(2), 'size adjustment (gap ' + (r.size_gap >= 0 ? '+' : '') + r.size_gap.toFixed(2) + ')'],
      [String(r.peers), 'traded peers pricing its category'],
      ['#' + r.cat_rank + ' of ' + r.cat_size, 'in its category, by TVL'],
      [age, 'tracked, listed ' + listed],
      [r.change_7d == null ? 'unreported' : pct(r.change_7d), 'TVL change, 7 days'],
      [r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's'), r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ', …' : '')],
    ].map(function (p) { return '<div><b>' + p[0] + '</b><span>' + p[1] + '</span></div>'; }).join('');
    var peersHtml = r.cat_top.map(function (p) {
      return p.slug === r.slug
        ? '<li><span class="here">' + esc(p.name) + ' (this row)</span><span class="mono">' + usd(p.tvl_usd) + '</span></li>'
        : '<li><a href="#/row/' + esc(p.slug) + '">' + esc(p.name) + '</a><span class="mono">' + usd(p.tvl_usd) + '</span></li>';
    }).join('');
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    view.innerHTML =
      '<section class="panel">' +
      '<p><a class="back" href="#/">&larr; The board</a></p>' +
      '<div class="detail-head"><h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<span class="grade ' + r.grade + '">' + r.grade + '</span><span class="cat">Tier ' + r.tier + ' ' + esc(tierLabel(r.tier)) + ' &middot; ' + esc(cat) + '</span>' +
      chips(r.signals) + '</div>' +
      '<div class="kv">' + kv + '</div>' +
      '<div class="derive">' + derive + '</div>' +
      '<div class="cols"><div><h3>Why it ranks here</h3><ul>' +
      r.dossier.thesis.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
      '</ul></div><div><h3>What could make this wrong</h3><ul>' +
      r.dossier.risks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
      '</ul></div></div>' +
      '<p>Confidence in the evidence behind this price: <span class="conf ' + r.dossier.confidence + '">' + r.dossier.confidence + '</span> &mdash; ' +
      esc(r.dossier.confidence_reason) + '</p>' +
      '<h3>Largest in ' + esc(cat) + ' on this board</h3><ul class="catpeers">' + peersHtml + '</ul>' +
      '</section>' +
      '<section class="panel" id="plan"><h2>Farm plan</h2>' +
      '<div class="planline">Position sized from ' + esc(r.name) + '&rsquo;s own depth: <b>' + usdFull(r.plan.deposit_usd) + '</b> ' +
      '(' + r.plan.share_pct + '% of its TVL), carrying about <b>' + usdFull(r.plan.exposure_usd) + '</b> of implied value at this row&rsquo;s multiple. ' +
      'The plan rule: ' + (R.constants.deposit_share * 100) + '% of TVL, at least ' + usdFull(R.constants.deposit_floor_usd) +
      ', at most ' + usdFull(R.constants.deposit_cap_usd) + '.</div>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<p class="note">A plan is a starting point, not advice: check the protocol&rsquo;s own pages, terms and audits before committing funds, ' +
      'and never a sum you cannot afford to have locked or lost.</p></section>';
    if (toPlan) {
      var el = document.getElementById('plan');
      if (el) el.scrollIntoView();
    }
  }

  function renderMethod() {
    var v = R.validation;
    var c = R.constants;
    var multRows = R.multiples.map(function (m) {
      return '<tr><td>' + esc(m.category) + '</td><td class="num">' + m.peers + '</td>' +
        '<td class="num">' + mult(m.multiple_at_ref) + '</td><td class="num">' + mult(m.raw_multiple_at_ref) + '</td></tr>';
    }).join('');
    var foldRows = v.folds.map(function (f) {
      return '<tr><td>Fold ' + f.fold + '</td><td class="num">' + f.fitted_on + '</td><td class="num">' + f.tested_on + '</td>' +
        '<td class="num">x' + f.median_factor.toFixed(2) + '</td><td class="num">' + f.within_2x_pct.toFixed(1) + '%</td>' +
        '<td class="num">' + f.spearman.toFixed(2) + '</td></tr>';
    }).join('');
    view.innerHTML =
      '<section class="panel"><h2>How a price is made</h2>' +
      '<p>Every traded protocol in the snapshot lends the model one observation: the logarithm of its market-cap-to-TVL ratio, ' +
      'winsorised to the band the traded record spans (x' + c.ratio_floor + ' to x' + c.ratio_cap + '). The model fits two things to those ' +
      'observations. A <b>level</b> for each category: the median of its peers&rsquo; log-ratios after size is accounted for, shrunk toward ' +
      'the market level by n/(n + ' + c.shrink_peers + '), so a category with two peers leans on the market and one with twenty stands on its ' +
      'own record. And a <b>size slope</b>: fitted by the Theil&ndash;Sen median of pairwise slopes, it says how the multiple moves per decade ' +
      'of TVL away from the market&rsquo;s typical size (' + usd(R.reference_tvl_usd) + '). On this record the slope is ' + R.size_slope.toFixed(2) +
      ' &mdash; market cap grows at roughly the square root of TVL, so a protocol ten times the typical size is priced at about ' +
      'x' + Math.pow(10, R.size_slope).toFixed(2) + ' of its category&rsquo;s level. A pre-token protocol is then priced at ' +
      '<code>TVL x 10^(level + slope x size gap)</code>, the multiple kept inside the traded band.</p>' +
      '<p>Levels and slope are fitted alternately, ' + c.fit_passes + ' passes, until they agree. Every step is a median of a fixed set, ' +
      'so the fit is exact and two runs on the same snapshot agree to the byte.</p>' +
      '<h3>What the price leaves out, on purpose</h3>' +
      '<p>The seven-day TVL change, the listing age and the chain count do not move any price on this board. On the traded record each ' +
      'field&rsquo;s rank correlation with the log-ratio is within a few points of zero (change: &minus;0.02, age: +0.01, chains: &minus;0.07), ' +
      'and the multipliers the previous model carried for them are ablated in the repo&rsquo;s MODEL_NOTES.md: bolted back onto this model ' +
      'they improve the hold-out median slightly and give back more in the share of prices landing within 2x. Those fields still appear on ' +
      'every row &mdash; in the readiness grade, the signals and the dossier &mdash; where they describe a protocol without pretending to price it.</p>' +
      '<h3>Fitted category levels</h3>' +
      '<p class="note">The multiple a protocol of the market&rsquo;s typical size (' + usd(R.reference_tvl_usd) + ' TVL) carries in each category. ' +
      '&ldquo;Before shrinkage&rdquo; is the category&rsquo;s own size-adjusted median.</p>' +
      '<table><thead><tr><th>Category</th><th class="num">Traded peers</th><th class="num">Multiple at typical size</th><th class="num">Before shrinkage</th></tr></thead><tbody>' +
      multRows + '</tbody></table></section>' +
      '<section class="panel"><h2>Validation, from the same snapshot</h2>' +
      '<p><b>Hold-out test.</b> The whole pipeline is fitted on one half of the ' + v.peers_tested + ' traded protocols and predicts the other ' +
      'half&rsquo;s recorded market caps; then the halves swap and the errors pool. Beside it, the naive anchor: the same halves priced at ' +
      'TVL x the fit half&rsquo;s plain median ratio.</p>' +
      '<table><thead><tr><th>Model</th><th class="num">Median miss</th><th class="num">Within 2x</th><th class="num">Within 3x</th><th class="num">Rank corr.</th></tr></thead><tbody>' +
      '<tr><td><b>This model (category level + size slope)</b></td><td class="num">x' + v.median_factor.toFixed(2) + '</td><td class="num">' + v.within_2x_pct.toFixed(1) + '%</td><td class="num">' + v.within_3x_pct.toFixed(1) + '%</td><td class="num">' + v.spearman.toFixed(2) + '</td></tr>' +
      '<tr><td>Naive anchor (TVL x median ratio)</td><td class="num">x' + v.baseline_median_factor.toFixed(2) + '</td><td class="num">' + v.baseline_within_2x_pct.toFixed(1) + '%</td><td class="num">&mdash;</td><td class="num">' + v.baseline_spearman.toFixed(2) + '</td></tr>' +
      '</tbody></table>' +
      '<table><thead><tr><th>Fold</th><th class="num">Fitted on</th><th class="num">Tested on</th><th class="num">Median miss</th><th class="num">Within 2x</th><th class="num">Rank corr.</th></tr></thead><tbody>' +
      foldRows + '</tbody></table>' +
      '<h3>Robustness</h3>' +
      '<p><b>Jackknife.</b> Refit without each category&rsquo;s largest peer: the median category level moves ' + v.multiples_jackknife_median_pct +
      '% across ' + v.multiples_jackknife_categories + ' categories with at least three peers &mdash; no single protocol is carrying its category.</p>' +
      '<p><b>Look-back.</b> Roll every covered row&rsquo;s TVL back along its own recorded seven-day change (' + v.lookback.covered + ' of ' +
      v.lookback.board_size + ' rows carry the field) and re-price with today&rsquo;s fit: the re-ranked board correlates ' + v.lookback.spearman.toFixed(2) +
      ' with today&rsquo;s and shares ' + v.lookback.top10_overlap + ' of its top ten &mdash; most of today&rsquo;s order was already implied a week ago.</p>' +
      '<p><b>Cross-checks.</b> Against a raw TVL ranking the board correlates ' + v.views.tvl_spearman.toFixed(2) + ' (top-ten overlap ' + v.views.tvl_top10 +
      ' of 10): close, because value follows size, but not the same list. Against this same model with the size slope switched off it correlates ' +
      v.views.nosize_spearman.toFixed(2) + ' (overlap ' + v.views.nosize_top10 + ' of 10): the size term is what moves the largest protocols down the board, ' +
      'where the traded record says they belong.</p>' +
      '<h3>Constants</h3><p class="note">Ratio band x' + c.ratio_floor + '&ndash;x' + c.ratio_cap + ' &middot; shrinkage n/(n + ' + c.shrink_peers +
      ') &middot; slope kept within [' + c.slope_floor + ', ' + c.slope_cap + '] &middot; ' + c.fit_passes + ' fit passes &middot; farm position ' +
      (c.deposit_share * 100) + '% of TVL, ' + usdFull(c.deposit_floor_usd) + '&ndash;' + usdFull(c.deposit_cap_usd) + ', rounded to ' + usdFull(c.deposit_round_usd) + '.</p></section>';
  }

  function renderPeers() {
    var rows = R.live.map(function (p, i) {
      var chg = p.change_7d == null ? '—' : '<span class="' + (p.change_7d >= 0 ? 'up' : 'down') + '">' + pct(p.change_7d) + '</span>';
      return '<tr><td class="rank">' + (i + 1) + '</td><td><span class="name">' + esc(p.name) + '</span><br><span class="cat">' + esc(p.category || 'Uncategorised') + '</span></td>' +
        '<td class="num">' + usd(p.tvl_usd) + '</td><td class="num">' + usd(p.mcap_usd) + '</td>' +
        '<td class="num">' + (p.mcap_tvl == null ? '—' : mult(p.mcap_tvl)) + '</td><td class="num">' + chg + '</td></tr>';
    }).join('');
    view.innerHTML = '<section class="panel"><h2>The traded peers</h2>' +
      '<p>The largest traded protocols in the snapshot, at their own market figures. These are the observations the model is fitted on: ' +
      'each one&rsquo;s cap-to-TVL ratio, in log space, is a vote for its category&rsquo;s level and for the size slope. Centralised exchanges are ' +
      'left out of this view; their ratios price a company, not a protocol.</p>' +
      '<table><thead><tr><th>#</th><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Cap / TVL</th><th class="num">7d</th></tr></thead><tbody>' +
      rows + '</tbody></table></section>';
    view.querySelectorAll('tbody tr').forEach(function (tr) { tr.style.cursor = 'default'; });
  }

  window.addEventListener('hashchange', route);
  route();
})();
