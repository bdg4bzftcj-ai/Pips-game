/*
 * Spotlock difficulty meter.
 *
 * Solves a puzzle the way a person would and reports how much reasoning each
 * tile needed. It never guesses: if it cannot make progress with the
 * techniques below, the puzzle is reported as "stalled".
 *
 * Techniques, in order of effort:
 *   links 0  A tile fits in only one spot, or a square can be covered only one way.
 *   links 1  "That can't go there": placing it would immediately leave some
 *            square or tile with nowhere to go.
 *   links n  The same, but the contradiction only shows up after following
 *            n-1 forced placements.
 */
(function (root) {
  'use strict';
  const GEN = (typeof module !== 'undefined' && module.exports) ? require('./generator.js') : root.SpotlockGen;

  function rate(p, opts) {
    const maxChain = (opts && opts.maxChain) || 5;
    const N = p.cells.length;
    const cellRegion = new Array(N);
    p.regions.forEach((rg, ri) => rg.cells.forEach(c => { cellRegion[c] = ri; }));
    const pairs = [];
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
      if (Math.abs(p.cells[a][0] - p.cells[b][0]) + Math.abs(p.cells[a][1] - p.cells[b][1]) === 1) pairs.push([a, b]);
    }
    const legal = (vals, c) => {
      vals[c.a] = c.va; vals[c.b] = c.vb;
      // only the regions touched can change status
      const ok = regionOK(p, vals, cellRegion[c.a]) && (cellRegion[c.a] === cellRegion[c.b] || regionOK(p, vals, cellRegion[c.b]));
      vals[c.a] = -1; vals[c.b] = -1;
      return ok;
    };
    const vals0 = new Array(N).fill(-1);
    let cands = [];
    p.dominoes.forEach(([x, y], d) => {
      for (const [a, b] of pairs) {
        const os = x === y ? [[x, y]] : [[x, y], [y, x]];
        for (const [va, vb] of os) {
          const c = { d, a, b, va, vb, key: d + ':' + a + '-' + b };
          if (legal(vals0, c)) cands.push(c);
        }
      }
    });

    function apply(state, c) {
      const vals = state.vals.slice(); vals[c.a] = c.va; vals[c.b] = c.vb;
      const used = state.used.slice(); used[c.d] = true;
      const next = [];
      for (const o of state.cands) {
        if (o.d === c.d || vals[o.a] !== -1 || vals[o.b] !== -1) continue;
        const ra = cellRegion[o.a], rb = cellRegion[o.b];
        const touched = ra === cellRegion[c.a] || ra === cellRegion[c.b] || rb === cellRegion[c.a] || rb === cellRegion[c.b];
        if (touched && !legal(vals, o)) continue;
        next.push(o);
      }
      return { vals, used, cands: next };
    }
    function broken(state) {
      const cover = new Uint8Array(N), has = new Uint8Array(p.dominoes.length);
      for (const o of state.cands) { cover[o.a] = 1; cover[o.b] = 1; has[o.d] = 1; }
      for (let i = 0; i < N; i++) if (state.vals[i] === -1 && !cover[i]) return true;
      for (let d = 0; d < p.dominoes.length; d++) if (!state.used[d] && !has[d]) return true;
      return false;
    }
    // A placement that is forced: one tile/spot left for a square or for a tile.
    // Two orientations of the same tile on the same squares count as one spot
    // when both squares are in the same region (the flip changes nothing).
    function single(state) {
      const byCell = new Map(), byDom = new Map();
      for (const o of state.cands) {
        for (const c of [o.a, o.b]) { if (!byCell.has(c)) byCell.set(c, []); byCell.get(c).push(o); }
        if (!byDom.has(o.d)) byDom.set(o.d, []); byDom.get(o.d).push(o);
      }
      const pick = (list) => {
        const k = list[0].key;
        for (const o of list) if (o.key !== k) return null;
        if (list.length > 1 && cellRegion[list[0].a] !== cellRegion[list[0].b]) return null;
        return list[0];
      };
      for (const list of byDom.values()) { const r = pick(list); if (r) return r; }
      for (const list of byCell.values()) { const r = pick(list); if (r) return r; }
      return null;
    }
    // Follow forced placements after assuming c; returns chain length at which it breaks, or 0.
    function refute(state, c, depth) {
      let s = apply(state, c);
      if (broken(s)) return 1;
      for (let k = 2; k <= depth; k++) {
        const f = single(s);
        if (!f) return 0;
        s = apply(s, f);
        if (broken(s)) return k;
      }
      return 0;
    }

    let state = { vals: vals0.slice(), used: new Array(p.dominoes.length).fill(false), cands };
    const steps = [];
    let placed = 0, pendingLinks = 0, stalled = false;
    const openingSingles = countSingles(state);
    while (placed < p.dominoes.length) {
      const f = single(state);
      if (f) {
        steps.push(pendingLinks); pendingLinks = 0;
        state = apply(state, f); placed++;
        if (broken(state) && placed < p.dominoes.length) { stalled = true; break; }
        continue;
      }
      // eliminate candidates, cheapest reasoning first
      let progressed = false;
      for (let depth = 1; depth <= maxChain && !progressed; depth++) {
        const keep = [];
        for (const c of state.cands) {
          if (refute(state, c, depth)) { progressed = true; } else keep.push(c);
        }
        if (progressed) { state = { vals: state.vals, used: state.used, cands: keep }; pendingLinks = Math.max(pendingLinks, depth); }
      }
      if (!progressed) { stalled = true; break; }
    }
    function countSingles(s) {
      // how many different tiles are placeable right away
      const seen = new Set(); let st = s;
      for (let i = 0; i < p.dominoes.length; i++) { const f = single(st); if (!f) break; seen.add(f.d); st = apply(st, f); }
      return seen.size;
    }
    const maxLinks = steps.length ? Math.max.apply(null, steps) : 0;
    const open = [];
    for (let i = 0; i < N; i++) if (state.vals[i] === -1) open.push(i);
    return {
      open,                        // squares still empty when the meter stopped
      solved: !stalled,
      steps,                       // links needed before each tile, in solve order
      firstLinks: steps.length ? steps[0] : (stalled ? pendingLinks || null : 0),
      maxLinks,
      thinkSteps: steps.filter(x => x > 0).length,
      openingRun: openingSingles,  // tiles placeable in a row from the start with no thinking
      score: steps.reduce((a, x) => a + x * x, 0),
    };
  }

  function regionOK(p, vals, ri) {
    const rg = p.regions[ri], rule = rg.rule;
    if (!rule) return true;
    let s = 0, n = 0, first = -1, mask = 0, eq = true, dup = false;
    for (const c of rg.cells) {
      const v = vals[c]; if (v < 0) continue;
      n++; s += v;
      if (first === -1) first = v; else if (v !== first) eq = false;
      if (mask & (1 << v)) dup = true; mask |= 1 << v;
    }
    const rem = rg.cells.length - n;
    switch (rule.type) {
      case 'sum': return s <= rule.value && s + 6 * rem >= rule.value;
      case 'lt': return s < rule.value;
      case 'gt': return s + 6 * rem > rule.value;
      case 'eq': return eq;
      case 'neq': return !dup;
    }
    return true;
  }

  // ---------- generation driven by the meter ----------
  // chain: deepest reasoning the level may need. keep(): must stay true while rules are
  // loosened. accept(): the finished puzzle belongs to this level.
  const LEVELS = {
    easy:   { dominoes: [5, 6],   W: 6, H: 6, regionMax: 3, chain: 1,
              keep: r => r.solved && r.firstLinks === 0 && r.maxLinks <= 1,
              accept: r => r.firstLinks === 0 && r.maxLinks <= 1 },
    medium: { dominoes: [8, 9],   W: 7, H: 7, regionMax: 4, chain: 2,
              keep: r => r.solved && r.maxLinks <= 2 && r.firstLinks <= 1,
              accept: r => r.maxLinks >= 1 && r.thinkSteps >= 2 },
    hard:   { dominoes: [11, 13], W: 7, H: 8, regionMax: 5, chain: 4,
              keep: r => r.solved,
              accept: r => r.maxLinks >= 2 && r.firstLinks >= 1 && r.thinkSteps >= 3 },
  };

  function strongest(values) {
    if (values.length > 1 && values.every(v => v === values[0])) return { type: 'eq' };
    return { type: 'sum', value: values.reduce((a, b) => a + b, 0) };
  }
  function weaker(values, rule, rng) {
    // looser rules that are still true for the answer, loosest first
    const out = [null];
    const sum = values.reduce((a, b) => a + b, 0), n = values.length;
    if (rule.type === 'sum' || rule.type === 'eq') {
      if (n >= 2 && new Set(values).size === n) out.push({ type: 'neq' });
      if (rule.type === 'sum') {
        if (sum < 6 * n && rng.next() < 0.5) out.push({ type: 'lt', value: sum + rng.int(1, 2) });
        else if (sum > 0) out.push({ type: 'gt', value: sum - rng.int(1, Math.min(2, sum)) });
      }
    }
    return out;
  }

  function generateRated(seed, level, custom) {
    const L = Object.assign({}, LEVELS[level] || LEVELS.medium, custom || {});
    const I = GEN._int;
    const rng = GEN.makeRng(seed + '|rated|' + level);
    for (let attempt = 0; attempt < 400; attempt++) {
      const k = rng.int(L.dominoes[0], L.dominoes[1]);
      const raw = I.growShape(rng, k, L.W, L.H);
      if (!raw) continue;
      const { rows, cols, pairs } = I.normalize(raw);
      const cells = [], idxOf = new Map();
      for (const pr of pairs) for (const [r, c] of pr) { idxOf.set(r * cols + c, cells.length); cells.push([r, c]); }
      const all = [];
      for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) all.push([a, b]);
      rng.shuffle(all);
      const doms = all.slice(0, k);
      const solution = new Array(cells.length), sol = [];
      pairs.forEach((pr, i) => {
        const flip = rng.next() < 0.5, [x, y] = doms[i];
        const ia = idxOf.get(pr[0][0] * cols + pr[0][1]), ib = idxOf.get(pr[1][0] * cols + pr[1][1]);
        solution[ia] = flip ? y : x; solution[ib] = flip ? x : y;
        sol.push({ a: ia, b: ib, va: solution[ia], vb: solution[ib] });
      });
      const regions = I.partition(rng, cells, rows, cols, L.regionMax, solution).regions;
      const valsOf = rg => rg.cells.map(c => solution[c]);
      regions.forEach(rg => { rg.rule = strongest(valsOf(rg)); });
      const p = { rows, cols, cells, regions, dominoes: doms };
      const meter = () => rate(p, { maxChain: L.chain });

      // 1. make it solvable by logic: split regions where the meter gets stuck
      let r = meter(), splits = 0;
      while (!L.keep(r) && splits < 4) {
        const openSet = new Set(r.solved ? cells.map((_, i) => i) : r.open);
        const cand = regions.filter(rg => rg.cells.length > 1 && rg.cells.some(c => openSet.has(c)));
        if (!cand.length) break;
        const rg = rng.pick(cand);
        const start = rng.pick(rg.cells.filter(c => openSet.has(c)));
        let chunk = rg.cells.length >= 4 ? I.halfChunk(rng, rg.cells, start, cells) : null;
        if (!chunk) {
          const one = rg.cells.find(c => I.connected(rg.cells.filter(x => x !== c), cells));
          if (one === undefined) break;
          chunk = [one];
        }
        rg.cells = rg.cells.filter(c => !chunk.includes(c));
        rg.rule = strongest(valsOf(rg));
        const nr = { cells: chunk, rule: null }; nr.rule = strongest(valsOf(nr));
        regions.push(nr);
        splits++; r = meter();
      }
      if (!L.keep(r)) continue;

      // 2. merge lone squares into a neighbouring region when the logic still works
      for (const rg of rng.shuffle(regions.filter(x => x.cells.length === 1))) {
        const [cr, cc] = cells[rg.cells[0]];
        const hosts = regions.filter(o => o !== rg && o.cells.length && o.cells.length < L.regionMax &&
          o.cells.some(c => Math.abs(cells[c][0] - cr) + Math.abs(cells[c][1] - cc) === 1));
        for (const host of rng.shuffle(hosts)) {
          const saveCells = host.cells.slice(), saveRule = host.rule, mine = rg.cells.slice();
          host.cells = host.cells.concat(mine); host.rule = strongest(valsOf(host)); rg.cells = [];
          const live = regions.filter(x => x.cells.length);
          const r2 = rate({ cells, regions: live, dominoes: doms }, { maxChain: L.chain });
          if (L.keep(r2)) break;
          host.cells = saveCells; host.rule = saveRule; rg.cells = mine;
        }
      }
      p.regions = regions.filter(x => x.cells.length);

      // 3. loosen rules one at a time while the puzzle stays solvable at this level
      for (const rg of rng.shuffle(p.regions.slice())) {
        const keepRule = rg.rule;
        let done = false;
        for (const w of weaker(valsOf(rg), keepRule, rng)) {
          rg.rule = w;
          if (L.keep(meter())) { done = true; break; }
        }
        if (!done) rg.rule = keepRule;
      }
      r = meter();
      if (!L.keep(r) || !L.accept(r)) continue;

      const order = rng.shuffle(doms.map((_, i) => i));
      return {
        id: seed + '|' + level, difficulty: level, rows, cols, cells,
        regions: p.regions.map(x => ({ cells: x.cells, rule: x.rule })),
        dominoes: order.map(i => (rng.next() < 0.5 ? [doms[i][1], doms[i][0]] : doms[i].slice())),
        solution: order.map(i => sol[i]),
        rating: { firstLinks: r.firstLinks, maxLinks: r.maxLinks, thinkSteps: r.thinkSteps, openingRun: r.openingRun, score: r.score, steps: r.steps },
      };
    }
    throw new Error('Could not build a ' + level + ' puzzle for ' + seed);
  }

  const api = { rate, generateRated, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpotlockRater = api;
})(typeof self !== 'undefined' ? self : this);
