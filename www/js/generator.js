/*
 * Spotlock puzzle generator + solver.
 *
 * A puzzle is a board of cells (a subset of a W x H grid), a set of distinct
 * dominoes from the double-six set, and regions with optional rules. Every
 * domino must be placed on two orthogonally adjacent cells so that every cell
 * is covered and every region's rule holds.
 *
 * Generation is fully deterministic for a given seed string, so the daily
 * archive is the same on every device without shipping any puzzle data.
 */
(function (root) {
  'use strict';

  // ---------- seeded RNG ----------
  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    const next = mulberry32(hashString(String(seed)));
    const rng = {
      next,
      int(lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      pick(arr) { return arr[Math.floor(next() * arr.length)]; },
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
    };
    return rng;
  }

  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // right, down, left, up

  const CONFIG = {
    easy:   { dominoes: [5, 6],   W: 6, H: 6, regionMax: 3, preset: 0.75, maxSplits: 1, maxPip: 6 },
    medium: { dominoes: [8, 9],   W: 7, H: 7, regionMax: 4, preset: 0.35, maxSplits: 1, maxPip: 6 },
    hard:   { dominoes: [11, 13], W: 7, H: 8, regionMax: 5, preset: 0.0,  maxSplits: 2, maxPip: 6 },
  };

  // ---------- board shape (grown one domino at a time, so it is always tileable) ----------
  function growShape(rng, k, W, H) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const occ = new Map(); // key -> domino index
      const pairs = [];
      const key = (r, c) => r * W + c;
      const r0 = rng.int(1, H - 2), c0 = rng.int(1, W - 3);
      occ.set(key(r0, c0), 0); occ.set(key(r0, c0 + 1), 0);
      pairs.push([[r0, c0], [r0, c0 + 1]]);
      let stuck = 0;
      while (pairs.length < k && stuck < 400) {
        // pick a random occupied cell, random free neighbour, random second cell
        const cells = [...occ.keys()];
        const base = rng.pick(cells);
        const br = Math.floor(base / W), bc = base % W;
        const d1 = rng.pick(DIRS);
        const ar = br + d1[0], ac = bc + d1[1];
        const d2 = rng.pick(DIRS);
        const cr = ar + d2[0], cc = ac + d2[1];
        const ok = (r, c) => r >= 0 && r < H && c >= 0 && c < W && !occ.has(key(r, c));
        if (!ok(ar, ac) || !ok(cr, cc)) { stuck++; continue; }
        // Prefer compact shapes: count how many occupied neighbours the new domino touches
        let touch = 0;
        for (const [r, c] of [[ar, ac], [cr, cc]]) {
          for (const d of DIRS) if (occ.has(key(r + d[0], c + d[1]))) touch++;
        }
        if (touch < 2 && rng.next() < 0.6) { stuck++; continue; }
        const idx = pairs.length;
        occ.set(key(ar, ac), idx); occ.set(key(cr, cc), idx);
        pairs.push([[ar, ac], [cr, cc]]);
        stuck = 0;
      }
      if (pairs.length === k) return pairs;
    }
    return null;
  }

  function normalize(pairs) {
    let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
    for (const p of pairs) for (const [r, c] of p) {
      minR = Math.min(minR, r); minC = Math.min(minC, c);
      maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
    }
    return {
      rows: maxR - minR + 1,
      cols: maxC - minC + 1,
      pairs: pairs.map(p => p.map(([r, c]) => [r - minR, c - minC])),
    };
  }

  // ---------- regions ----------
  function partition(rng, cells, rows, cols, regionMax, solution, sameBias) {
    if (sameBias === undefined) sameBias = 0.45;
    const idxOf = new Map();
    cells.forEach(([r, c], i) => idxOf.set(r * cols + c, i));
    const region = new Array(cells.length).fill(-1);
    const order = rng.shuffle(cells.map((_, i) => i));
    let rid = 0;
    for (const start of order) {
      if (region[start] !== -1) continue;
      const roll = rng.next();
      let target = roll < 0.1 ? 1 : roll < 0.55 ? 2 : roll < 0.82 ? 3 : rng.int(3, regionMax);
      target = Math.min(target, regionMax);
      const members = [start];
      region[start] = rid;
      while (members.length < target) {
        const frontier = [];
        for (const m of members) {
          const [r, c] = cells[m];
          for (const d of DIRS) {
            const n = idxOf.get((r + d[0]) * cols + (c + d[1]));
            if (n !== undefined && region[n] === -1 && c + d[1] >= 0 && c + d[1] < cols) frontier.push(n);
          }
        }
        if (!frontier.length) break;
        const same = frontier.filter(f => solution[f] === solution[start]);
        const n = same.length && rng.next() < sameBias ? rng.pick(same) : rng.pick(frontier);
        region[n] = rid; members.push(n);
      }
      rid++;
    }
    // Merge accidental singletons into a neighbouring region (keeps a few on purpose).
    const sizes = new Array(rid).fill(0);
    region.forEach(r => sizes[r]++);
    for (const i of order) {
      if (sizes[region[i]] !== 1 || rng.next() < 0.25) continue;
      const [r, c] = cells[i];
      const nbs = [];
      for (const d of DIRS) {
        if (c + d[1] < 0 || c + d[1] >= cols) continue;
        const n = idxOf.get((r + d[0]) * cols + (c + d[1]));
        if (n !== undefined && region[n] !== region[i] && sizes[region[n]] < regionMax + 1) nbs.push(n);
      }
      if (!nbs.length) continue;
      const n = rng.pick(nbs);
      sizes[region[i]]--; region[i] = region[n]; sizes[region[n]]++;
    }
    const remap = new Map();
    const regions = [];
    region.forEach((r, i) => {
      if (!remap.has(r)) { remap.set(r, regions.length); regions.push({ cells: [], rule: null }); }
      regions[remap.get(r)].cells.push(i);
    });
    return { regions };
  }

  // Candidate rules for a region given its solution values, strongest last.
  function ruleOptions(values, rng) {
    const sum = values.reduce((a, b) => a + b, 0);
    const n = values.length;
    const opts = [];
    if (n === 1) {
      const v = values[0];
      const weak = [];
      if (v < 6) weak.push({ type: 'lt', value: v + 1 + (v < 5 && rng.next() < 0.5 ? 1 : 0) });
      if (v > 0) weak.push({ type: 'gt', value: v - 1 - (v > 1 && rng.next() < 0.5 ? 1 : 0) });
      if (weak.length) opts.push(rng.pick(weak));
      opts.push({ type: 'sum', value: v });
      return opts;
    }
    const allEq = values.every(v => v === values[0]);
    const allDiff = new Set(values).size === n;
    if (allEq) { opts.push({ type: 'eq' }); return opts; }
    if (allDiff && n >= 3 && rng.next() < 0.6) opts.push({ type: 'neq' });
    const cap = 6 * n;
    if (rng.next() < 0.35) {
      if (sum < cap && rng.next() < 0.5) opts.push({ type: 'lt', value: sum + rng.int(1, 3) });
      else if (sum > 0) opts.push({ type: 'gt', value: Math.max(0, sum - rng.int(1, 3)) });
    }
    opts.push({ type: 'sum', value: sum });
    return opts;
  }

  // ---------- solver ----------
  // board: { rows, cols, cells:[[r,c]], regions:[{cells, rule}], dominoes:[[a,b]] }
  // Calls onSolution(values, placements) for each solution; return true from it to stop.
  function solve(board, onSolution, nodeLimit) {
    const { cells, regions, dominoes, cols } = board;
    const N = cells.length;
    const idxOf = new Map();
    cells.forEach(([r, c], i) => idxOf.set(r * cols + c, i));
    // Order cells row-major so the first uncovered cell only pairs right or down.
    const order = cells.map((_, i) => i).sort((a, b) =>
      cells[a][0] - cells[b][0] || cells[a][1] - cells[b][1]);
    const right = new Int32Array(N).fill(-1), down = new Int32Array(N).fill(-1);
    cells.forEach(([r, c], i) => {
      const rr = c + 1 < cols ? idxOf.get(r * cols + c + 1) : undefined; if (rr !== undefined) right[i] = rr;
      const dd = idxOf.get((r + 1) * cols + c); if (dd !== undefined) down[i] = dd;
    });
    const cellRegion = new Int32Array(N).fill(-1);
    regions.forEach((rg, ri) => rg.cells.forEach(ci => { cellRegion[ci] = ri; }));
    const R = regions.length;
    const rSum = new Int32Array(R), rCnt = new Int32Array(R), rSize = new Int32Array(R);
    const rFirst = new Int32Array(R).fill(-1);
    const rMask = new Int32Array(R);
    regions.forEach((rg, ri) => { rSize[ri] = rg.cells.length; });

    const values = new Int32Array(N).fill(-1);
    const used = new Uint8Array(dominoes.length);
    const placement = new Array(dominoes.length).fill(null);
    let nodes = 0, aborted = false, stop = false;

    function canPut(ci, v) {
      const ri = cellRegion[ci];
      const rule = regions[ri].rule;
      if (!rule) return true;
      const s = rSum[ri] + v, rem = rSize[ri] - rCnt[ri] - 1;
      switch (rule.type) {
        case 'sum': return s <= rule.value && s + 6 * rem >= rule.value;
        case 'lt': return s < rule.value;
        case 'gt': return s + 6 * rem > rule.value;
        case 'eq': return rFirst[ri] === -1 || rFirst[ri] === v;
        case 'neq': return !(rMask[ri] & (1 << v));
      }
      return true;
    }
    function put(ci, v) {
      const ri = cellRegion[ci];
      values[ci] = v; rSum[ri] += v; rCnt[ri]++;
      if (rFirst[ri] === -1) rFirst[ri] = v;
      rMask[ri] |= (1 << v);
    }
    function take(ci, v) {
      const ri = cellRegion[ci];
      values[ci] = -1; rSum[ri] -= v; rCnt[ri]--;
      if (rCnt[ri] === 0) rFirst[ri] = -1;
      // neq regions never hold duplicates; for other regions the mask is only used by neq
      rMask[ri] &= ~(1 << v);
      if (regions[ri].rule && regions[ri].rule.type !== 'neq') {
        // rebuild mask for safety (duplicates possible in non-neq regions)
        let m = 0; for (const c of regions[ri].cells) if (values[c] >= 0) m |= (1 << values[c]);
        rMask[ri] = m;
      }
    }
    function tryPair(a, b, va, vb) {
      if (!canPut(a, va)) return false;
      put(a, va);
      const ok = canPut(b, vb);
      if (!ok) { take(a, va); return false; }
      put(b, vb);
      return true;
    }

    const nbrs = cells.map(([r, c]) => {
      const out = [];
      for (const d of DIRS) {
        if (c + d[1] < 0 || c + d[1] >= cols) continue;
        const n = idxOf.get((r + d[0]) * cols + (c + d[1]));
        if (n !== undefined) out.push(n);
      }
      return out;
    });
    // true if covering cell x left one of its uncovered neighbours with no free partner
    function isolated(x) {
      const nx = nbrs[x];
      for (let i = 0; i < nx.length; i++) {
        const y = nx[i];
        if (values[y] !== -1) continue;
        const ny = nbrs[y];
        let free = false;
        for (let j = 0; j < ny.length; j++) if (values[ny[j]] === -1) { free = true; break; }
        if (!free) return true;
      }
      return false;
    }

    function rec(pos) {
      if (stop) return;
      if (++nodes > nodeLimit) { aborted = true; stop = true; return; }
      while (pos < N && values[order[pos]] !== -1) pos++;
      if (pos === N) {
        if (onSolution(values, placement)) stop = true;
        return;
      }
      const a = order[pos];
      const partners = [];
      if (right[a] !== -1 && values[right[a]] === -1) partners.push(right[a]);
      if (down[a] !== -1 && values[down[a]] === -1) partners.push(down[a]);
      if (!partners.length) return;
      for (const b of partners) {
        for (let d = 0; d < dominoes.length; d++) {
          if (used[d]) continue;
          const [x, y] = dominoes[d];
          for (let o = 0; o < (x === y ? 1 : 2); o++) {
            const va = o ? y : x, vb = o ? x : y;
            if (!tryPair(a, b, va, vb)) continue;
            used[d] = 1; placement[d] = [a, b, o];
            if (!isolated(a) && !isolated(b)) rec(pos + 1);
            used[d] = 0; placement[d] = null;
            take(b, vb); take(a, va);
            if (stop) return;
          }
        }
      }
    }
    rec(0);
    return { aborted, nodes };
  }

  // A solution counts as "the same" as the target if every region holds the same
  // multiset of values (e.g. flipping a domino that sits inside one region).
  function regionKey(board, vals, ri) {
    return board.regions[ri].cells.map(c => vals[c]).sort().join(',');
  }
  // Returns 'unique' | 'multiple' | 'unknown'; alt holds a differing solution's values.
  function checkUnique(board, target, nodeLimit, strict) {
    if (strict) return checkStrict(board, target, nodeLimit, strict);
    let alt = null;
    const R = board.regions.length;
    const targetKeys = [];
    for (let ri = 0; ri < R; ri++) targetKeys.push(regionKey(board, target, ri));
    const res = solve(board, (vals) => {
      for (let ri = 0; ri < R; ri++) {
        if (regionKey(board, vals, ri) !== targetKeys[ri]) { alt = Array.from(vals); return true; }
      }
      return false;
    }, nodeLimit);
    if (alt) {
      const diff = [];
      for (let ri = 0; ri < R; ri++) if (regionKey(board, alt, ri) !== targetKeys[ri]) diff.push(ri);
      return { status: 'multiple', alt, diff };
    }
    if (res.aborted) return { status: 'unknown' };
    return { status: 'unique' };
  }

  // Strict uniqueness: the only freedom allowed is flipping a tile that lies inside one region.
  // strict = { pairs: [[a, b]...] (the intended tile positions), cellRegion }
  function checkStrict(board, target, nodeLimit, strict) {
    let alt = null, diffCells = null;
    const res = solve(board, (vals) => {
      const bad = [];
      for (const [a, b] of strict.pairs) {
        if (vals[a] === target[a] && vals[b] === target[b]) continue;
        if (strict.cellRegion[a] === strict.cellRegion[b] && vals[a] === target[b] && vals[b] === target[a]) continue;
        if (vals[a] !== target[a]) bad.push(a);
        if (vals[b] !== target[b]) bad.push(b);
      }
      if (!bad.length) return false;
      alt = Array.from(vals); diffCells = bad; return true;
    }, nodeLimit);
    if (alt) return { status: 'multiple', alt, diff: [...new Set(diffCells.map(c => strict.cellRegion[c]))] };
    if (res.aborted) return { status: 'unknown' };
    return { status: 'unique' };
  }

  // A connected chunk of a region (about half of it) containing `start`, whose removal
  // leaves the rest connected. Returns null if there is none.
  function halfChunk(rng, regionCells, start, cells) {
    const want = Math.max(1, Math.floor(regionCells.length / 2));
    for (let tries = 0; tries < 12; tries++) {
      const chunk = [start];
      while (chunk.length < want) {
        const opts = regionCells.filter(c => !chunk.includes(c) && chunk.some(x =>
          Math.abs(cells[x][0] - cells[c][0]) + Math.abs(cells[x][1] - cells[c][1]) === 1));
        if (!opts.length) break;
        chunk.push(rng.pick(opts));
      }
      const rest = regionCells.filter(c => !chunk.includes(c));
      if (rest.length && connected(rest, cells)) return chunk;
    }
    return null;
  }

  function connected(list, cells) {
    if (list.length <= 1) return true;
    const set = new Set(list), seen = new Set([list[0]]), stack = [list[0]];
    while (stack.length) {
      const x = stack.pop();
      for (const y of set) {
        if (seen.has(y)) continue;
        if (Math.abs(cells[x][0] - cells[y][0]) + Math.abs(cells[x][1] - cells[y][1]) === 1) { seen.add(y); stack.push(y); }
      }
    }
    return seen.size === list.length;
  }

  // ---------- main ----------
  function generate(seed, difficulty, opts) {
    opts = opts || {};
    const cfg = Object.assign({}, CONFIG[difficulty] || CONFIG.medium, opts.config || {});
    const rng = makeRng(seed + '|' + difficulty);
    for (let attempt = 0; attempt < 40; attempt++) {
      const k = rng.int(cfg.dominoes[0], cfg.dominoes[1]);
      const raw = growShape(rng, k, cfg.W, cfg.H);
      if (!raw) continue;
      const { rows, cols, pairs } = normalize(raw);
      const cells = [];
      const idxOf = new Map();
      for (const p of pairs) for (const [r, c] of p) { idxOf.set(r * cols + c, cells.length); cells.push([r, c]); }

      // choose distinct dominoes
      const all = [];
      for (let a = 0; a <= cfg.maxPip; a++) for (let b = a; b <= cfg.maxPip; b++) all.push([a, b]);
      rng.shuffle(all);
      const doms = all.slice(0, k);
      const solution = new Array(cells.length);
      const solPlacement = [];
      pairs.forEach((p, i) => {
        const flip = rng.next() < 0.5;
        const [x, y] = doms[i];
        const ia = idxOf.get(p[0][0] * cols + p[0][1]);
        const ib = idxOf.get(p[1][0] * cols + p[1][1]);
        solution[ia] = flip ? y : x;
        solution[ib] = flip ? x : y;
        solPlacement.push({ domino: i, a: flip ? ib : ia, b: flip ? ia : ib });
      });

      const { regions } = partition(rng, cells, rows, cols, cfg.regionMax, solution);
      // rule ladder for each region
      const ladders = regions.map(rg => ruleOptions(rg.cells.map(c => solution[c]), rng));
      const level = regions.map(() => -1);
      regions.forEach((rg, i) => {
        if (rng.next() < cfg.preset) { level[i] = ladders[i].length - 1; rg.rule = ladders[i][level[i]]; }
      });

      const board = { rows, cols, cells, regions, dominoes: doms };
      let strictInfo = null;
      if (opts.strict) {
        strictInfo = { pairs: solPlacement.map(sp => [sp.a, sp.b]), cellRegion: new Array(cells.length) };
        regions.forEach((rg, ri) => rg.cells.forEach(c => { strictInfo.cellRegion[c] = ri; }));
      }
      let ok = false, splits = 0;
      const splitBudget = attempt < 6 ? cfg.maxSplits : Infinity;
      for (let iter = 0; iter < 60; iter++) {
        const res = checkUnique(board, solution, cfg.nodeLimit || 250000, strictInfo);
        if (api.debug) api.debug.push(res.status);
        if (res.status === 'unique') { ok = true; break; }
        let pool = regions.map((_, i) => i);
        if (res.status === 'multiple') {
          pool = res.diff;
        }
        const candidates = pool.filter(i => level[i] < ladders[i].length - 1);
        if (candidates.length) {
          const pick = rng.pick(candidates);
          level[pick]++;
          regions[pick].rule = ladders[pick][level[pick]];
          continue;
        }
        // Every relevant region already has its strongest rule: split one apart.
        const splittable = pool.filter(i => regions[i].cells.length > 1);
        if (!splittable.length || ++splits > splitBudget) break;
        const ri = rng.pick(splittable);
        const rg = regions[ri];
        const diffCells = res.alt ? rg.cells.filter(c => res.alt[c] !== solution[c]) : [];
        const cut = diffCells.length ? rng.pick(diffCells) : rng.pick(rg.cells);
        // only cut a cell that keeps the remainder connected
        const rest = rg.cells.filter(c => c !== cut);
        if (!connected(rest, cells)) {
          const alt = rg.cells.find(c => connected(rg.cells.filter(x => x !== c), cells));
          if (alt === undefined) break;
          rest.splice(0, rest.length, ...rg.cells.filter(x => x !== alt));
          rest.cut = alt;
        }
        let cutCells = [rest.cut !== undefined ? rest.cut : cut];
        if (opts.strict && rg.cells.length >= 4) {
          const chunk = halfChunk(rng, rg.cells, cutCells[0], cells);
          if (chunk) cutCells = chunk;
        }
        rg.cells = rg.cells.filter(c => !cutCells.includes(c));
        ladders[ri] = ruleOptions(rg.cells.map(c => solution[c]), rng);
        level[ri] = ladders[ri].length - 1;
        rg.rule = ladders[ri][level[ri]];
        const lad = opts.strict ? ruleOptions(cutCells.map(c => solution[c]), rng)
          : [{ type: 'sum', value: solution[cutCells[0]] }];
        regions.push({ cells: cutCells, rule: lad[lad.length - 1] });
        ladders.push(lad);
        level.push(lad.length - 1);
        if (strictInfo) regions.forEach((r2, i2) => r2.cells.forEach(c => { strictInfo.cellRegion[c] = i2; }));
      }
      if (!ok) continue;

      // Shuffle tray order and orientation so it gives nothing away.
      const trayOrder = rng.shuffle(doms.map((_, i) => i));
      const dominoes = trayOrder.map(i => (rng.next() < 0.5 ? [doms[i][1], doms[i][0]] : doms[i].slice()));
      // Map solution placements to the new tray indices (values define which half goes where).
      const sol = trayOrder.map(oldIdx => {
        const sp = solPlacement[oldIdx];
        return { a: sp.a, b: sp.b, va: solution[sp.a], vb: solution[sp.b] };
      });
      return {
        id: seed + '|' + difficulty,
        difficulty,
        rows, cols,
        cells,
        regions: regions.map(r => ({ cells: r.cells, rule: r.rule })),
        dominoes,
        solution: sol, // [{a, b, va, vb}] per tray domino (cells a/b with values va/vb)
      };
    }
    throw new Error('Failed to generate puzzle for ' + seed);
  }

  // Validate a full or partial placement. values: array (cell -> value or -1)
  function regionStatus(puzzle, values) {
    return puzzle.regions.map(rg => {
      const vals = rg.cells.map(c => values[c]);
      const filled = vals.filter(v => v >= 0);
      const full = filled.length === vals.length;
      const rule = rg.rule;
      if (!rule) return full ? 'ok' : 'open';
      const s = filled.reduce((a, b) => a + b, 0);
      const rem = vals.length - filled.length;
      let possible = true, satisfied = false;
      switch (rule.type) {
        case 'sum': possible = s <= rule.value && s + 6 * rem >= rule.value; satisfied = full && s === rule.value; break;
        case 'lt': possible = s < rule.value; satisfied = full && possible; break;
        case 'gt': possible = s + 6 * rem > rule.value; satisfied = full && s > rule.value; break;
        case 'eq': possible = filled.every(v => v === filled[0]); satisfied = full && possible; break;
        case 'neq': possible = new Set(filled).size === filled.length; satisfied = full && possible; break;
      }
      if (!possible) return 'bad';
      if (satisfied) return 'ok';
      return full ? 'bad' : 'open';
    });
  }

  const api = { generate, solve, regionStatus, makeRng, hashString, CONFIG, _int: { growShape, normalize, partition, connected, halfChunk, DIRS } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpotlockGen = api;
})(typeof self !== 'undefined' ? self : this);
