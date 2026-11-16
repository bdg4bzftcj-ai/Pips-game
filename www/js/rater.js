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
    const N = p.cells.length, D = p.dominoes.length, R = p.regions.length;
    const cellRegion = new Int16Array(N);
    const rType = new Int8Array(R), rVal = new Int16Array(R), rSize = new Int16Array(R);
    const TYPES = { sum: 1, lt: 2, gt: 3, eq: 4, neq: 5 };
    p.regions.forEach((rg, ri) => {
      rg.cells.forEach(c => { cellRegion[c] = ri; });
      rSize[ri] = rg.cells.length;
      rType[ri] = rg.rule ? TYPES[rg.rule.type] : 0;
      rVal[ri] = rg.rule && rg.rule.value !== undefined ? rg.rule.value : 0;
    });
    // candidate placements: tile d with value va on square a and vb on square b
    const cd = [], ca = [], cb = [], cva = [], cvb = [], ckey = [];
    let pairId = 0;
    const pairList = [];
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
      if (Math.abs(p.cells[a][0] - p.cells[b][0]) + Math.abs(p.cells[a][1] - p.cells[b][1]) === 1) pairList.push([a, b]);
    }
    const P = pairList.length;
    p.dominoes.forEach(([x, y], d) => {
      pairList.forEach(([a, b], pi) => {
        const os = x === y ? [[x, y]] : [[x, y], [y, x]];
        for (const [va, vb] of os) { cd.push(d); ca.push(a); cb.push(b); cva.push(va); cvb.push(vb); ckey.push(d * P + pi); }
      });
    });
    pairId = P;
    const C = cd.length;
    const byCell = Array.from({ length: N }, () => []), byDom = Array.from({ length: D }, () => []), byReg = Array.from({ length: R }, () => []);
    for (let i = 0; i < C; i++) {
      byCell[ca[i]].push(i); byCell[cb[i]].push(i); byDom[cd[i]].push(i);
      const ra = cellRegion[ca[i]], rb = cellRegion[cb[i]];
      byReg[ra].push(i); if (rb !== ra) byReg[rb].push(i);
    }

    function newState() {
      return { alive: new Uint8Array(C), vals: new Int8Array(N).fill(-1), used: new Uint8Array(D),
        cellCnt: new Int16Array(N), domCnt: new Int16Array(D),
        rSum: new Int16Array(R), rCnt: new Int16Array(R), rMask: new Uint8Array(R), broken: false, placed: 0 };
    }
    function copy(s) {
      return { alive: s.alive.slice(), vals: s.vals.slice(), used: s.used.slice(), cellCnt: s.cellCnt.slice(), domCnt: s.domCnt.slice(),
        rSum: s.rSum.slice(), rCnt: s.rCnt.slice(), rMask: s.rMask.slice(), broken: s.broken, placed: s.placed };
    }
    // would region r still be satisfiable after adding value v (and w, or -1)?
    function regionFits(s, r, v, w) {
      const t = rType[r];
      if (t === 0) return true;
      const k = w < 0 ? 1 : 2;
      const sum = s.rSum[r] + v + (w < 0 ? 0 : w), rem = rSize[r] - s.rCnt[r] - k;
      switch (t) {
        case 1: return sum <= rVal[r] && sum + 6 * rem >= rVal[r];
        case 2: return sum < rVal[r];
        case 3: return sum + 6 * rem > rVal[r];
        case 4: { const m = s.rMask[r] | (1 << v) | (w < 0 ? 0 : (1 << w)); return (m & (m - 1)) === 0; }
        case 5: return !(s.rMask[r] & (1 << v)) && (w < 0 || (w !== v && !(s.rMask[r] & (1 << w))));
      }
      return true;
    }
    function legal(s, i) {
      const ra = cellRegion[ca[i]], rb = cellRegion[cb[i]];
      if (ra === rb) return regionFits(s, ra, cva[i], cvb[i]);
      return regionFits(s, ra, cva[i], -1) && regionFits(s, rb, cvb[i], -1);
    }
    function kill(s, o) { s.alive[o] = 0; s.cellCnt[ca[o]]--; s.cellCnt[cb[o]]--; s.domCnt[cd[o]]--; }
    function apply(s, i) {
      const a = ca[i], b = cb[i], d = cd[i], ra = cellRegion[a], rb = cellRegion[b];
      s.vals[a] = cva[i]; s.vals[b] = cvb[i]; s.used[d] = 1; s.placed++;
      s.rSum[ra] += cva[i]; s.rCnt[ra]++; s.rMask[ra] |= 1 << cva[i];
      s.rSum[rb] += cvb[i]; s.rCnt[rb]++; s.rMask[rb] |= 1 << cvb[i];
      let l = byDom[d]; for (let k = 0; k < l.length; k++) if (s.alive[l[k]]) kill(s, l[k]);
      l = byCell[a]; for (let k = 0; k < l.length; k++) if (s.alive[l[k]]) kill(s, l[k]);
      l = byCell[b]; for (let k = 0; k < l.length; k++) if (s.alive[l[k]]) kill(s, l[k]);
      l = byReg[ra]; for (let k = 0; k < l.length; k++) if (s.alive[l[k]] && !legal(s, l[k])) kill(s, l[k]);
      if (rb !== ra) { l = byReg[rb]; for (let k = 0; k < l.length; k++) if (s.alive[l[k]] && !legal(s, l[k])) kill(s, l[k]); }
      s.broken = false;
      for (let c = 0; c < N; c++) if (s.vals[c] === -1 && s.cellCnt[c] === 0) { s.broken = true; return; }
      for (let x = 0; x < D; x++) if (!s.used[x] && s.domCnt[x] === 0) { s.broken = true; return; }
    }
    // A forced placement: one spot left for a tile, or one way left to cover a square.
    // Both orientations of a tile on the same two squares count as one spot when the
    // squares share a region (the flip changes nothing).
    function pickFrom(s, list) {
      let first = -1, n = 0;
      for (let k = 0; k < list.length; k++) {
        const o = list[k]; if (!s.alive[o]) continue;
        if (first === -1) first = o; else if (ckey[o] !== ckey[first]) return -1;
        n++;
      }
      if (first === -1) return -1;
      if (n > 1 && cellRegion[ca[first]] !== cellRegion[cb[first]]) return -1;
      return first;
    }
    function single(s) {
      for (let d = 0; d < D; d++) if (!s.used[d]) { const r = pickFrom(s, byDom[d]); if (r !== -1) return r; }
      for (let c = 0; c < N; c++) if (s.vals[c] === -1) { const r = pickFrom(s, byCell[c]); if (r !== -1) return r; }
      return -1;
    }
    // Assume candidate i and follow forced placements; returns the chain length at which
    // a contradiction appears, or 0 if none within `depth`.
    function refute(s0, i, depth) {
      const s = copy(s0);
      apply(s, i);
      if (s.broken) return 1;
      for (let k = 2; k <= depth; k++) {
        const f = single(s);
        if (f === -1) return 0;
        apply(s, f);
        if (s.broken && s.placed < D) return k;
        if (s.placed === D) return 0;
      }
      return 0;
    }

    let state = newState();
    for (let i = 0; i < C; i++) if (legal(state, i)) { state.alive[i] = 1; state.cellCnt[ca[i]]++; state.cellCnt[cb[i]]++; state.domCnt[cd[i]]++; }
    // tiles placeable in a row from the start with no thinking
    let openingRun = 0;
    { const s = copy(state); for (;;) { const f = single(s); if (f === -1) break; apply(s, f); openingRun++; if (s.broken || s.placed === D) break; } }

    const steps = [];
    let pendingLinks = 0, stalled = false;
    for (let c = 0; c < N; c++) if (state.cellCnt[c] === 0) stalled = true;
    while (!stalled && state.placed < D) {
      const f = single(state);
      if (f !== -1) {
        steps.push(pendingLinks); pendingLinks = 0;
        apply(state, f);
        if (state.broken && state.placed < D) { stalled = true; break; }
        continue;
      }
      let progressed = false;
      for (let depth = 1; depth <= maxChain && !progressed; depth++) {
        const dead = [];
        for (let i = 0; i < C; i++) if (state.alive[i] && refute(state, i, depth)) dead.push(i);
        if (dead.length) {
          progressed = true;
          for (const i of dead) kill(state, i);
          pendingLinks = Math.max(pendingLinks, depth);
        }
      }
      if (!progressed) { stalled = true; break; }
    }
    const open = [];
    for (let i = 0; i < N; i++) if (state.vals[i] === -1) open.push(i);
    const maxLinks = steps.length ? Math.max.apply(null, steps) : 0;
    return {
      open,                        // squares still empty when the meter stopped
      solved: !stalled,
      steps,                       // links needed before each tile, in solve order
      firstLinks: steps.length ? steps[0] : (stalled ? pendingLinks || null : 0),
      maxLinks,
      thinkSteps: steps.filter(x => x > 0).length,
      openingRun,
      score: steps.reduce((a, x) => a + x * x, 0),
    };
  }

  // ---------- generation driven by the meter ----------
  // Targets come from measuring a large sample of published puzzles of this kind:
  // difficulty is mostly board size plus a few one- or two-link eliminations.
  //   depths    how deep the hardest step may go, as [links, share of puzzles]
  //   think     [fewest, most] tiles that need an elimination before they can be placed
  //   obvious   share of puzzles whose first tile is forced with no thinking
  const LEVELS = {
    easy:   { dominoes: [4, 6],   W: 6, H: 6, regionMax: 3, islands: [0.12, 0],
              pBlank: 0.5, pLoose: 0.4, pMerge: 0.6, sameBias: 0.9, clump: 0.5,
              depths: [[1, 1]], think: [0, 2], obvious: 0.6 },
    medium: { dominoes: [6, 9],   W: 7, H: 7, regionMax: 4, islands: [0.06, 0],
              pBlank: 0.6, pLoose: 0.45, pMerge: 0.65, sameBias: 0.9, clump: 0.5,
              depths: [[1, 0.72], [2, 0.28]], think: [1, 3], obvious: 0.18 },
    hard:   { dominoes: [11, 16], W: 7, H: 9, regionMax: 5, islands: [0.2, 0.1],
              pBlank: 0.55, pLoose: 0.5, pMerge: 0.9, sameBias: 0.9, clump: 0.4,
              depths: [[1, 0.62], [2, 0.2], [3, 0.18]], think: [2, 3], obvious: 0.25 },
  };
  // Decide what this particular puzzle should feel like, then build toward it.
  function planFor(L, rng) {
    let roll = rng.next(), depth = L.depths[L.depths.length - 1][0];
    for (const [d, share] of L.depths) { if (roll < share) { depth = d; break; } roll -= share; }
    const obvious = rng.next() < L.obvious;
    const maxThink = L.think[1] + (rng.next() < 0.2 ? 1 : 0);
    return {
      depth, obvious,
      keep: r => r.solved && r.maxLinks <= depth && r.thinkSteps <= maxThink && (!obvious || r.firstLinks === 0),
      accept: (r, lenient) => r.thinkSteps >= L.think[0] && (depth === 1 || L.think[0] === 0 || r.maxLinks >= 1) &&
        (obvious || lenient || r.firstLinks > 0 || L.think[0] === 0),
    };
  }

  // Board shape: one blob, or several separate islands laid out side by side / stacked.
  function buildShape(rng, k, L) {
    const I = GEN._int;
    const roll = rng.next();
    const parts = roll < L.islands[1] ? 3 : roll < L.islands[1] + L.islands[0] ? 2 : 1;
    if (parts === 1 || k < parts * 2) { const raw = I.growShape(rng, k, L.W, L.H); return raw ? I.normalize(raw) : null; }
    const sizes = [];
    let left = k;
    for (let i = 0; i < parts; i++) {
      const n = i === parts - 1 ? left : Math.max(1, Math.min(left - (parts - 1 - i), rng.int(1, Math.ceil(left / (parts - i)) + 1)));
      sizes.push(n); left -= n;
    }
    const pieces = [];
    for (const n of sizes) {
      const side = Math.max(3, Math.min(L.W, Math.ceil(Math.sqrt(n * 2)) + 2));
      const raw = I.growShape(rng, n, side, Math.min(L.H, side + 1));
      if (!raw) return null;
      pieces.push(I.normalize(raw));
    }
    // shelf packing with a one-square gap between islands
    let x = 0, y = 0, shelfH = 0, cols = 0;
    const pairs = [];
    for (const pc of pieces) {
      if (x > 0 && x + pc.cols > L.W + 1) { x = 0; y += shelfH + 1; shelfH = 0; }
      for (const pr of pc.pairs) pairs.push(pr.map(([r, c]) => [r + y, c + x]));
      x += pc.cols + 1; shelfH = Math.max(shelfH, pc.rows); cols = Math.max(cols, x - 1);
    }
    const rows = y + shelfH;
    if (rows > L.H + 1) return null;
    return { rows, cols, pairs };
  }

  function strongest(values) {
    if (values.length > 1 && values.every(v => v === values[0])) return { type: 'eq' };
    return { type: 'sum', value: values.reduce((a, b) => a + b, 0) };
  }
  function weaker(values, rule, rng, L) {
    // looser rules that are still true for the answer, loosest first; each is only
    // offered some of the time so the overall mix of rule types stays balanced
    const out = [];
    const sum = values.reduce((a, b) => a + b, 0), n = values.length;
    if (rng.next() < L.pBlank && n <= 3) out.push(null);
    if (rule.type === 'sum' && rng.next() < L.pLoose) {
      if (sum < 6 * n && (sum === 0 || rng.next() < 0.33)) out.push({ type: 'lt', value: sum + rng.int(1, 2) });
      else if (sum > 0) out.push({ type: 'gt', value: sum - rng.int(1, Math.min(2, sum)) });
    }
    if (n >= 3 && new Set(values).size === n && rng.next() < 0.04) out.push({ type: 'neq' });
    return out;
  }

  function generateRated(seed, level, custom) {
    const L = Object.assign({}, LEVELS[level] || LEVELS.medium, custom || {});
    const I = GEN._int;
    const rng = GEN.makeRng(seed + '|rated|' + level);
    const k = rng.int(L.dominoes[0], L.dominoes[1]); // fixed per puzzle so big boards aren't under-represented
    const plan = planFor(L, rng);
    for (let attempt = 0; attempt < 400; attempt++) {
      const shape = buildShape(rng, k, L);
      if (!shape) continue;
      const { rows, cols, pairs } = shape;
      const cells = [], idxOf = new Map();
      for (const pr of pairs) for (const [r, c] of pr) { idxOf.set(r * cols + c, cells.length); cells.push([r, c]); }
      const all = [];
      for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) all.push([a, b]);
      rng.shuffle(all);
      const pool = all.slice(0, k);
      // Lay the tiles on the shape. Part of the time, pick the tile and direction that puts
      // equal numbers next to each other, so "all equal" regions come up naturally.
      const solution = new Array(cells.length).fill(-1), sol = [], doms = [];
      const neighbours = (ci) => {
        const out = [], [r, c] = cells[ci];
        for (const [dr, dc] of I.DIRS) {
          if (c + dc < 0 || c + dc >= cols) continue;
          const n = idxOf.get((r + dr) * cols + (c + dc));
          if (n !== undefined && solution[n] !== -1) out.push(solution[n]);
        }
        return out;
      };
      pairs.forEach((pr) => {
        const ia = idxOf.get(pr[0][0] * cols + pr[0][1]), ib = idxOf.get(pr[1][0] * cols + pr[1][1]);
        let pick = 0, flip = rng.next() < 0.5;
        if (rng.next() < (L.clump || 0)) {
          const na = neighbours(ia), nb = neighbours(ib);
          let best = -1;
          pool.forEach(([x, y], pi) => {
            for (const f of [false, true]) {
              const va = f ? y : x, vb = f ? x : y;
              const sc = na.filter(v => v === va).length + nb.filter(v => v === vb).length + (va === vb ? 0.5 : 0) + rng.next() * 0.3;
              if (sc > best) { best = sc; pick = pi; flip = f; }
            }
          });
        }
        const [x, y] = pool.splice(pick, 1)[0];
        solution[ia] = flip ? y : x; solution[ib] = flip ? x : y;
        doms.push([x, y]);
        sol.push({ a: ia, b: ib, va: solution[ia], vb: solution[ib] });
      });
      const regions = I.partition(rng, cells, rows, cols, L.regionMax, solution, L.sameBias).regions;
      const valsOf = rg => rg.cells.map(c => solution[c]);
      regions.forEach(rg => { rg.rule = strongest(valsOf(rg)); });
      const p = { rows, cols, cells, regions, dominoes: doms };
      const meter = () => rate(p, { maxChain: plan.depth });

      // 1. make it solvable by logic: split regions where the meter gets stuck
      let r = meter(), splits = 0;
      while (!plan.keep(r) && splits < Math.max(4, k)) {
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
      if (!plan.keep(r)) { if (api.stats) api.stats.stage1 = (api.stats.stage1 || 0) + 1, api.stats['s1_' + (r.solved ? 'deep' : 'stall')] = (api.stats['s1_' + (r.solved ? 'deep' : 'stall')] || 0) + 1; continue; }

      // 2. merge lone squares into a neighbouring region when the logic still works
      for (const rg of rng.shuffle(regions.filter(x => x.cells.length === 1))) {
        if (rng.next() > L.pMerge) continue;
        const [cr, cc] = cells[rg.cells[0]];
        const hosts = regions.filter(o => o !== rg && o.cells.length && o.cells.length < L.regionMax &&
          o.cells.some(c => Math.abs(cells[c][0] - cr) + Math.abs(cells[c][1] - cc) === 1));
        for (const host of rng.shuffle(hosts)) {
          const saveCells = host.cells.slice(), saveRule = host.rule, mine = rg.cells.slice();
          host.cells = host.cells.concat(mine); host.rule = strongest(valsOf(host)); rg.cells = [];
          const live = regions.filter(x => x.cells.length);
          const r2 = rate({ cells, regions: live, dominoes: doms }, { maxChain: plan.depth });
          if (plan.keep(r2)) break;
          host.cells = saveCells; host.rule = saveRule; rg.cells = mine;
        }
      }
      p.regions = regions.filter(x => x.cells.length);

      // 3. loosen rules one at a time while the puzzle stays solvable at this level
      for (const rg of rng.shuffle(p.regions.slice())) {
        const keepRule = rg.rule;
        let done = false;
        for (const w of weaker(valsOf(rg), keepRule, rng, L)) {
          rg.rule = w;
          if (plan.keep(meter())) { done = true; break; }
        }
        if (!done) rg.rule = keepRule;
      }
      r = meter();
      if (!plan.keep(r) || !plan.accept(r, attempt > 150)) { if (api.stats) { const k2 = 'final_t' + r.thinkSteps + '_m' + r.maxLinks; api.stats[k2] = (api.stats[k2] || 0) + 1; } continue; }

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

  // A puzzle for a named slot (a date, a practice seed). Always succeeds: if one seed
  // runs out of attempts it moves on to the next variation of it.
  function generateFor(seed, level) {
    for (let v = 0; ; v++) {
      try { return generateRated(v ? seed + '#' + v : seed, level); } catch (e) { if (v > 50) throw e; }
    }
  }

  const api = { rate, generateRated, generateFor, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpotlockRater = api;
})(typeof self !== 'undefined' ? self : this);
