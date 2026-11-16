/* Spotlock app: archive, play view, drag/tap placement, persistence. */
(function () {
  'use strict';

  const GEN = self.SpotlockGen;
  const ARCHIVE = self.SPOTLOCK_ARCHIVE || { start: '2025-01-01', days: [] };
  const START = ARCHIVE.start;
  const DIFFS = ['easy', 'medium', 'hard'];
  const DIFF_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const $ = (id) => document.getElementById(id);

  // ---------- storage ----------
  const KEY = 'spotlock:v1';
  let store = { prog: {}, settings: { live: true, theme: null, seenHelp: false }, practice: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      store = Object.assign(store, parsed);
      store.settings = Object.assign({ live: true, theme: null, seenHelp: false }, parsed.settings || {});
      store.practice = parsed.practice || {};
    }
  } catch (e) { /* storage unavailable: play without saving */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } }

  // ---------- dates ----------
  const pad = (n) => String(n).padStart(2, '0');
  function localISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isoToUTC(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function dayIndex(iso) { return Math.round((isoToUTC(iso) - isoToUTC(START)) / 86400000); }
  function addDays(iso, n) { const t = new Date(isoToUTC(iso) + n * 86400000); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  function todayISO() { return localISO(new Date()); }
  function prettyDate(iso, withYear) {
    const t = new Date(isoToUTC(iso));
    const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][t.getUTCDay()];
    return wd + ', ' + t.getUTCDate() + ' ' + MONTHS[t.getUTCMonth()] + (withYear ? ' ' + t.getUTCFullYear() : '');
  }
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? h + ':' + pad(m) + ':' + pad(r) : m + ':' + pad(r);
  }

  // ---------- puzzle encode/decode ----------
  function encode(p) {
    const order = p.cells.map((_, i) => i).sort((a, b) => p.cells[a][0] - p.cells[b][0] || p.cells[a][1] - p.cells[b][1]);
    const newIdx = []; order.forEach((old, n) => { newIdx[old] = n; });
    const cellRegion = [];
    p.regions.forEach((rg, ri) => rg.cells.forEach(c => { cellRegion[c] = ri; }));
    const grid = new Array(p.rows * p.cols).fill('.');
    p.cells.forEach(([r, c], i) => { grid[r * p.cols + c] = ALPHA[cellRegion[i]]; });
    const rules = p.regions.map(rg => {
      const r = rg.rule; if (!r) return '';
      return r.type === 'sum' ? String(r.value) : r.type === 'lt' ? '<' + r.value : r.type === 'gt' ? '>' + r.value : r.type === 'eq' ? '=' : '!';
    }).join(',');
    const doms = p.dominoes.map(d => d.join('')).join('');
    const sol = p.solution.map((s, i) => {
      const d = p.dominoes[i]; const fwd = s.va === d[0] && s.vb === d[1];
      return newIdx[fwd ? s.a : s.b] + '-' + newIdx[fwd ? s.b : s.a];
    }).join(',');
    return [p.rows + ',' + p.cols, grid.join(''), rules, doms, sol].join('|');
  }
  function decode(str) {
    const [dims, grid, rules, doms, sol] = str.split('|');
    const [rows, cols] = dims.split(',').map(Number);
    const cells = [], cellRegion = [];
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === '.') continue;
      cells.push([Math.floor(i / cols), i % cols]);
      cellRegion.push(ALPHA.indexOf(grid[i]));
    }
    const regions = rules.split(',').map(t => ({ cells: [], rule: parseRule(t) }));
    cellRegion.forEach((r, i) => regions[r].cells.push(i));
    const dominoes = [];
    for (let i = 0; i < doms.length; i += 2) dominoes.push([+doms[i], +doms[i + 1]]);
    const solution = sol.split(',').map(s => s.split('-').map(Number));
    return { rows, cols, cells, cellRegion, regions, dominoes, solution };
  }
  function parseRule(t) {
    if (!t) return null;
    if (t === '=') return { type: 'eq' };
    if (t === '!') return { type: 'neq' };
    if (t[0] === '<') return { type: 'lt', value: +t.slice(1) };
    if (t[0] === '>') return { type: 'gt', value: +t.slice(1) };
    return { type: 'sum', value: +t };
  }
  function ruleLabel(r) {
    if (!r) return '';
    switch (r.type) {
      case 'sum': return String(r.value);
      case 'lt': return '<' + r.value;
      case 'gt': return '>' + r.value;
      case 'eq': return '=';
      case 'neq': return '≠';
    }
    return '';
  }

  const cache = new Map();
  function dailyString(iso, diff) {
    const idx = dayIndex(iso), di = DIFFS.indexOf(diff);
    if (idx >= 0 && idx < ARCHIVE.days.length) return ARCHIVE.days[idx][di];
    const key = iso + ':' + diff;
    if (!cache.has(key)) cache.set(key, encode(GEN.generate('spotlock:' + iso, diff)));
    return cache.get(key);
  }
  function needsGeneration(iso) { const i = dayIndex(iso); return i < 0 || i >= ARCHIVE.days.length; }

  // ---------- game state ----------
  let S = null; // current game
  let cellSize = 52;

  function progressFor(id) { return store.prog[id] || null; }

  function openPuzzle(opts) {
    // opts: {kind:'daily', date, diff} | {kind:'practice', diff, seed}
    const go = () => {
      const str = opts.kind === 'daily' ? dailyString(opts.date, opts.diff)
        : encode(GEN.generate(opts.seed, opts.diff));
      const id = opts.kind === 'daily' ? opts.date + ':' + opts.diff : 'practice:' + opts.diff + ':' + opts.seed;
      const pz = decode(str);
      const idxOf = new Map();
      pz.cells.forEach(([r, c], i) => idxOf.set(r * pz.cols + c, i));
      pz.nb = pz.cells.map(([r, c]) => DIRS.map(([dr, dc]) => {
        const rr = r + dr, cc = c + dc;
        if (cc < 0 || cc >= pz.cols) return -1;
        const n = idxOf.get(rr * pz.cols + cc);
        return n === undefined ? -1 : n;
      }));
      const prog = progressFor(id);
      S = {
        opts, id, pz,
        place: pz.dominoes.map((_, i) => (prog && prog.p && prog.p[i]) ? prog.p[i].slice() : null),
        trayDir: pz.dominoes.map((_, i) => (prog && prog.t) ? prog.t[i] || 0 : 0),
        trayPos: pz.dominoes.map((_, i) => (prog && prog.q && prog.q[i] != null) ? prog.q[i] : i),
        elapsed: prog ? prog.e || 0 : 0,
        solved: !!(prog && prog.s),
        revealed: !!(prog && prog.r),
        locked: !!(prog && (prog.s || prog.r)),
        sel: -1, history: [], tStart: null,
      };
      showView('play');
      renderPlay();
      startTimer();
      hideBusy();
    };
    const slow = (opts.kind === 'daily' && needsGeneration(opts.date) && !cache.has(opts.date + ':' + opts.diff)) ||
      (opts.kind === 'practice' && opts.diff !== 'easy');
    if (slow) { showBusy(); setTimeout(go, 40); } else go();
  }

  function persist() {
    if (!S) return;
    const prev = store.prog[S.id] || {};
    store.prog[S.id] = Object.assign(prev, {
      p: S.place, t: S.trayDir, q: S.trayPos, e: currentElapsed(),
      s: prev.s || 0, r: S.revealed || false,
    });
    save();
  }

  // ---------- timer ----------
  let tick = null;
  function currentElapsed() { return S ? S.elapsed + (S.tStart ? Date.now() - S.tStart : 0) : 0; }
  function startTimer() {
    stopTimer();
    if (!S || S.locked) { updateTimer(); return; }
    S.tStart = Date.now();
    tick = setInterval(updateTimer, 500);
    updateTimer();
  }
  function stopTimer() {
    if (tick) clearInterval(tick); tick = null;
    if (S && S.tStart) { S.elapsed += Date.now() - S.tStart; S.tStart = null; }
  }
  function updateTimer() {
    if (!S) return;
    const prog = store.prog[S.id];
    $('timer').textContent = S.solved && prog && prog.s ? fmtTime(prog.s) : S.revealed ? '—' : fmtTime(currentElapsed());
  }
  document.addEventListener('visibilitychange', () => {
    if (!S || $('view-play').hidden) return;
    if (document.hidden) { stopTimer(); persist(); } else startTimer();
  });

  // ---------- geometry helpers ----------
  function cellsOf(placement) { // [a, dir] -> [a, b]
    const [a, dir] = placement; return [a, S.pz.nb[a][dir]];
  }
  function occupancy(except) {
    const occ = new Array(S.pz.cells.length).fill(-1);
    S.place.forEach((p, d) => { if (p && d !== except) { const [a, b] = cellsOf(p); occ[a] = d; occ[b] = d; } });
    return occ;
  }
  function fits(d, a, dir, occ) {
    if (a < 0 || a >= S.pz.cells.length) return false;
    const b = S.pz.nb[a][dir];
    return b !== -1 && occ[a] === -1 && occ[b] === -1;
  }
  function valuesNow() {
    const vals = new Array(S.pz.cells.length).fill(-1);
    S.place.forEach((p, d) => { if (p) { const [a, b] = cellsOf(p); vals[a] = S.pz.dominoes[d][0]; vals[b] = S.pz.dominoes[d][1]; } });
    return vals;
  }

  // ---------- rendering ----------
  const PIPS = { 0: [], 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8] };
  // Layouts are chosen so a horizontal tile turned 90° lands exactly on the vertical layout,
  // which keeps the end of the turn animation seamless.
  function pipSlots(n, horizontal) {
    if (n === 6) return horizontal ? [0, 3, 6, 2, 5, 8] : [0, 1, 2, 6, 7, 8];
    if (n === 2) return horizontal ? [2, 6] : [0, 8];
    if (n === 3) return horizontal ? [2, 4, 6] : [0, 4, 8];
    return PIPS[n] || [];
  }
  function makeDomino(d, dir) {
    const [x, y] = S.pz.dominoes[d];
    const el = document.createElement('div');
    const vertical = dir % 2 === 1;
    el.className = 'domino' + (vertical ? ' v' : '') + (dir >= 2 ? ' rev' : '');
    el.dataset.d = d;
    el.setAttribute('aria-label', 'Tile ' + x + ' and ' + y);
    for (const v of [x, y]) {
      const h = document.createElement('div');
      h.className = 'half';
      const on = new Set(pipSlots(v, !vertical));
      for (let i = 0; i < 9; i++) {
        const p = document.createElement('i');
        p.className = 'pip' + (on.has(i) ? ' on' : '');
        h.appendChild(p);
      }
      el.appendChild(h);
    }
    return el;
  }

  function computeCellSize() {
    if (!S) return;
    const { rows, cols } = S.pz;
    const wide = window.innerWidth >= 900;
    const availW = wide ? Math.min(620, window.innerWidth - 520) : window.innerWidth - 32 - 28;
    const availH = wide ? window.innerHeight - 200 : window.innerHeight * 0.52;
    cellSize = Math.floor(Math.max(30, Math.min(64, availW / cols, availH / rows)));
    document.documentElement.style.setProperty('--cell', cellSize + 'px');
  }

  function colorRegions(pz) {
    // greedy colouring so neighbouring regions differ
    const R = pz.regions.length;
    const adj = Array.from({ length: R }, () => new Set());
    pz.cells.forEach((_, i) => pz.nb[i].forEach(n => {
      if (n !== -1 && pz.cellRegion[n] !== pz.cellRegion[i]) adj[pz.cellRegion[i]].add(pz.cellRegion[n]);
    }));
    const color = new Array(R).fill(-1);
    const order = pz.regions.map((_, i) => i).sort((a, b) => adj[b].size - adj[a].size);
    const used = [0, 0, 0, 0, 0, 0];
    for (const r of order) {
      if (!pz.regions[r].rule) { color[r] = 'n'; continue; }
      const taken = new Set([...adj[r]].map(n => color[n]));
      let best = -1;
      for (let k = 0; k < 6; k++) if (!taken.has(k) && (best === -1 || used[k] < used[best])) best = k;
      if (best === -1) best = r % 6;
      color[r] = best; used[best]++;
    }
    return color;
  }

  function renderPlay() {
    computeCellSize();
    const { pz } = S;
    const board = $('board');
    board.innerHTML = '';
    board.classList.remove('won');
    board.style.setProperty('--rows', pz.rows);
    board.style.setProperty('--cols', pz.cols);
    // faint squares for the empty grid positions around the board
    const present = new Set(pz.cells.map(([r, c]) => r * pz.cols + c));
    for (let r = 0; r < pz.rows; r++) for (let c = 0; c < pz.cols; c++) {
      if (present.has(r * pz.cols + c)) continue;
      const g = document.createElement('div');
      g.className = 'gridspot';
      g.style.left = 'calc(' + c + ' * var(--cell))';
      g.style.top = 'calc(' + r + ' * var(--cell))';
      board.appendChild(g);
    }
    const colors = colorRegions(pz);
    S.colors = colors;
    pz.cells.forEach(([r, c], i) => {
      const el = document.createElement('div');
      const reg = pz.cellRegion[i];
      const col = colors[reg];
      el.className = 'cell' + (col === 'n' ? ' blank-region' : '');
      el.dataset.i = i;
      el.style.left = 'calc(' + c + ' * var(--cell))';
      el.style.top = 'calc(' + r + ' * var(--cell))';
      el.style.setProperty('--rc', 'var(--r' + col + ')');
      // region edges as inset shadows on sides that border another region / the outside
      const ink = 'var(--i' + col + ')';
      const sh = [];
      const same = (dir) => { const n = pz.nb[i][dir]; return n !== -1 && pz.cellRegion[n] === reg; };
      if (!same(3)) sh.push('inset 0 2px 0 ' + ink);
      if (!same(0)) sh.push('inset -2px 0 0 ' + ink);
      if (!same(1)) sh.push('inset 0 -2px 0 ' + ink);
      if (!same(2)) sh.push('inset 2px 0 0 ' + ink);
      // thin grid lines between squares of the same region
      const line = 'color-mix(in srgb, ' + ink + ' 38%, transparent)';
      if (same(0)) sh.push('inset -1px 0 0 ' + line);
      if (same(1)) sh.push('inset 0 -1px 0 ' + line);
      el.style.setProperty('--edges', sh.join(', ') || 'none');
      el.addEventListener('click', () => onCellTap(i));
      board.appendChild(el);
    });
    // badges: placed at bottom-right corner of the region's last cell (row-major)
    S.badges = pz.regions.map((rg, ri) => {
      if (!rg.rule) return null;
      const last = rg.cells.reduce((best, c) => {
        const [r, cc] = pz.cells[c], [br, bc] = pz.cells[best];
        return (r > br || (r === br && cc > bc)) ? c : best;
      }, rg.cells[0]);
      const [r, c] = pz.cells[last];
      const b = document.createElement('div');
      b.className = 'badge';
      b.textContent = ruleLabel(rg.rule);
      b.style.setProperty('--ri', 'var(--i' + colors[ri] + ')');
      b.style.left = 'calc(' + (c + 1) + ' * var(--cell) - 6px)';
      b.style.top = 'calc(' + (r + 1) + ' * var(--cell) - 6px)';
      board.appendChild(b);
      return b;
    });
    const label = S.opts.kind === 'daily'
      ? DIFF_NAME[S.opts.diff] + ' · No. ' + (dayIndex(S.opts.date) + 1)
      : 'Practice · ' + DIFF_NAME[S.opts.diff];
    $('play-name').textContent = label;
    $('play-sub').textContent = S.opts.kind === 'daily' ? prettyDate(S.opts.date, true) : pz.dominoes.length + ' tiles';
    $('m-live').checked = !!store.settings.live;
    renderPieces();
  }

  function renderPieces(flashBad) {
    const board = $('board');
    board.querySelectorAll('.domino').forEach(e => e.remove());
    S.place.forEach((p, d) => {
      if (!p) return;
      const [a, dir] = p;
      const b = S.pz.nb[a][dir];
      const tl = dir >= 2 ? b : a;
      const [r, c] = S.pz.cells[tl];
      const el = makeDomino(d, dir);
      el.style.left = 'calc(' + c + ' * var(--cell))';
      el.style.top = 'calc(' + r + ' * var(--cell))';
      el.style.setProperty('--w', dir % 2 ? 'var(--cell)' : 'calc(2 * var(--cell))');
      el.style.setProperty('--h', dir % 2 ? 'calc(2 * var(--cell))' : 'var(--cell)');
      el.style.setProperty('--n', d);
      attachPointer(el, d, 'board');
      board.appendChild(el);
    });
    // badges
    const vals = valuesNow();
    const status = GEN.regionStatus({ regions: S.pz.regions }, vals);
    const full = vals.every(v => v >= 0);
    S.pz.regions.forEach((rg, ri) => {
      const b = S.badges[ri]; if (!b) return;
      const st = status[ri];
      const show = store.settings.live || full || flashBad;
      b.classList.toggle('ok', show && st === 'ok');
      b.classList.toggle('bad', show && st === 'bad');
    });
    renderTray();
    $('btn-undo').disabled = !S.history.length || S.locked;
    $('btn-clear').disabled = S.locked || !S.place.some(Boolean);
    $('btn-rotate').disabled = S.locked;
  }

  const TRAY_COLS = 4;
  function slotCount() { return Math.ceil((S.pz.dominoes.length + 2) / TRAY_COLS) * TRAY_COLS; }
  // Which tray slot each unplaced tile sits in; fixes collisions by moving a tile to the first free slot.
  function settleTray() {
    const n = slotCount(), taken = new Array(n).fill(-1);
    const waiting = [];
    S.pz.dominoes.forEach((_, d) => {
      if (S.place[d]) return;
      const q = S.trayPos[d];
      if (q >= 0 && q < n && taken[q] === -1) taken[q] = d; else waiting.push(d);
    });
    for (const d of waiting) { const f = taken.indexOf(-1); taken[f] = d; S.trayPos[d] = f; }
    return taken;
  }
  function sizeTray() {
    const tray = $('tray');
    const w = tray.clientWidth || 340;
    const slotW = (w - 24 - (TRAY_COLS - 1) * 8) / TRAY_COLS;
    tray.style.setProperty('--t', Math.max(18, Math.min(44, Math.floor((slotW - 6) / 2))) + 'px');
  }
  function renderTray() {
    const tray = $('tray');
    tray.innerHTML = '';
    sizeTray();
    const taken = settleTray();
    let left = 0;
    taken.forEach((d, q) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.q = q;
      if (d !== -1) {
        left++;
        const el = makeDomino(d, S.trayDir[d]);
        if (S.sel === d) el.classList.add('sel');
        attachPointer(el, d, 'tray');
        slot.appendChild(el);
      }
      tray.appendChild(slot);
    });
    $('hint').textContent = S.locked
      ? (S.revealed ? 'This is the solution. Start over from the ⋯ menu to try again.' : 'Solved. Start over from the ⋯ menu to replay it.')
      : left === 0 ? 'Every tile is down. Check the rules marked in red.'
      : 'Drag a tile onto the board, or tap a tile then tap a square. Tap a placed tile to turn it. Drag tiles around the tray to arrange them.';
    runMotion();
  }

  // ---------- motion ----------
  // FLIP animation: after a re-render, start the tile at its old position/angle and ease it home.
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let pendingMotion = [];
  function tileEl(d) {
    return document.querySelector('#board .domino[data-d="' + d + '"]') || document.querySelector('.tray .domino[data-d="' + d + '"]');
  }
  function queueMotion(d, fromRect, turnDeg, origin) {
    if (!fromRect || reduceMotion.matches) return;
    pendingMotion.push({ d, from: fromRect, turn: turnDeg || 0, origin });
  }
  function turnBetween(fromDir, toDir) { // clockwise quarter turns, shortest way
    const k = ((toDir - fromDir) % 4 + 4) % 4;
    return k === 3 ? -90 : k * 90;
  }
  function runMotion() {
    const jobs = pendingMotion; pendingMotion = [];
    for (const j of jobs) {
      const el = tileEl(j.d);
      if (!el || !el.animate) continue;
      const to = el.getBoundingClientRect();
      if (!to.width) continue;
      const quarter = Math.abs(j.turn) % 180 === 90;
      const scale = quarter ? j.from.width / to.height : j.from.width / to.width;
      let startT, ease = 'cubic-bezier(.2, .9, .25, 1.15)', dur = 260;
      if (j.turn && j.origin) {
        // Pivot around a point (the tapped half's centre), given in viewport coords.
        const ox = j.origin.x - to.left, oy = j.origin.y - to.top;
        el.style.transformOrigin = ox + 'px ' + oy + 'px';
        const dx = j.origin.x - (to.left + ox), dy = j.origin.y - (to.top + oy);
        startT = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + (-j.turn) + 'deg)';
      } else {
        const dx = (j.from.left + j.from.width / 2) - (to.left + to.width / 2);
        const dy = (j.from.top + j.from.height / 2) - (to.top + to.height / 2);
        startT = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + (-j.turn) + 'deg) scale(' + (scale || 1) + ')';
        if (!j.turn) { ease = 'cubic-bezier(.2, .8, .2, 1)'; dur = 200 + Math.min(160, Math.hypot(dx, dy) / 3); }
      }
      el.classList.add('moving');
      const anim = el.animate([{ transform: startT }, { transform: 'none' }], { duration: dur, easing: ease });
      anim.onfinish = anim.oncancel = () => { el.classList.remove('moving'); el.style.transformOrigin = ''; };
    }
  }

  // ---------- interactions ----------
  function snapshot() { S.history.push({ place: S.place.map(p => p && p.slice()), trayDir: S.trayDir.slice(), trayPos: S.trayPos.slice() }); if (S.history.length > 200) S.history.shift(); }

  function changed() {
    persist();
    const vals = valuesNow();
    const full = vals.every(v => v >= 0);
    if (full) {
      const status = GEN.regionStatus({ regions: S.pz.regions }, vals);
      if (status.every(s => s === 'ok')) { win(); return; }
      renderPieces(true);
      toast('Every square is covered, but a rule is broken.');
      return;
    }
    renderPieces();
  }

  function onCellTap(i) {
    if (S.locked) return;
    if (S.sel < 0) { toast('Pick a tile from the tray first.'); return; }
    const d = S.sel, dir = S.trayDir[d];
    const occ = occupancy(d);
    const tries = [[i, dir], [S.pz.nb[i][(dir + 2) % 4], dir]];
    for (let k = 1; k < 4; k++) tries.push([i, (dir + k) % 4]);
    for (const [a, dd] of tries) {
      if (a !== -1 && a !== undefined && fits(d, a, dd, occ)) {
        snapshot();
        const src = tileEl(d);
        queueMotion(d, src && src.getBoundingClientRect(), turnBetween(dir, dd));
        S.place[d] = [a, dd];
        S.sel = -1;
        changed();
        return;
      }
    }
    toast("That tile doesn't fit there.");
  }

  function rotatePlaced(d, pivotHalf) {
    const [a, dir] = S.place[d];
    const b = S.pz.nb[a][dir];
    const occ = occupancy(d);
    for (let k = 1; k <= 3; k++) {
      const nd = (dir + k) % 4;
      let na;
      if (pivotHalf === 0) na = a;
      else { na = S.pz.nb[b][(nd + 2) % 4]; if (na === -1) continue; }
      if (fits(d, na, nd, occ)) {
        snapshot();
        const pivotCell = $('board').querySelectorAll('.cell')[pivotHalf === 0 ? a : b];
        const pr = pivotCell && pivotCell.getBoundingClientRect();
        const cur = tileEl(d);
        queueMotion(d, cur && cur.getBoundingClientRect(), k === 3 ? -90 : k * 90,
          pr && { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 });
        S.place[d] = [na, nd];
        changed();
        return;
      }
    }
    toast('No room to turn this tile.');
  }

  function rotateTray(d) {
    const cur = tileEl(d);
    queueMotion(d, cur && cur.getBoundingClientRect(), 90);
    S.trayDir[d] = (S.trayDir[d] + 1) % 4;
    persist();
    renderTray();
  }

  let drag = null;
  function attachPointer(el, d, source) {
    el.addEventListener('pointerdown', (e) => {
      if (S.locked || drag) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const dir = source === 'tray' ? S.trayDir[d] : S.place[d][1];
      drag = {
        el, d, source, dir, id: e.pointerId, moved: false, ghost: null,
        sx: e.clientX, sy: e.clientY,
        fx: (e.clientX - rect.left) / rect.width, fy: (e.clientY - rect.top) / rect.height,
        target: null,
      };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onCancel);
    });
  }
  function clearDropMarks() { document.querySelectorAll('.cell.drop-ok, .cell.drop-bad, .slot.drop-ok').forEach(c => c.classList.remove('drop-ok', 'drop-bad')); }
  // A tray slot under the pointer that this tile may move to (empty, or another tray tile to swap with).
  function traySlotAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const slot = hit && hit.closest && hit.closest('.tray .slot');
    if (!slot) return null;
    const q = +slot.dataset.q;
    const occupant = slot.querySelector('.domino');
    if (occupant) {
      const od = +occupant.dataset.d;
      if (od === drag.d) return null;
      if (drag.source !== 'tray') return null; // can't swap a board tile into an occupied slot
    }
    return { q, slot, swap: occupant ? +occupant.dataset.d : -1 };
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    if (!drag.moved) {
      drag.moved = true;
      const g = makeDomino(drag.d, drag.dir);
      g.classList.add('drag-ghost');
      const horiz = drag.dir % 2 === 0;
      drag.gw = (horiz ? 2 * cellSize : cellSize) - 8;
      drag.gh = (horiz ? cellSize : 2 * cellSize) - 8;
      g.style.width = drag.gw + 'px'; g.style.height = drag.gh + 'px';
      g.style.setProperty('--d', cellSize + 'px');
      document.body.appendChild(g);
      drag.ghost = g;
      drag.el.classList.add(drag.source === 'board' ? 'lifted' : 'used');
      if (S.sel !== -1) { S.sel = -1; document.querySelectorAll('.tray .domino.sel').forEach(x => x.classList.remove('sel')); }
    }
    const left = e.clientX - drag.fx * drag.gw, top = e.clientY - drag.fy * drag.gh;
    drag.ghost.style.left = left + 'px'; drag.ghost.style.top = top + 'px';
    // centre of the first half
    const hx = [0.25, 0.5, 0.75, 0.5][drag.dir] * drag.gw, hy = [0.5, 0.25, 0.5, 0.75][drag.dir] * drag.gh;
    const br = $('board').getBoundingClientRect();
    const col = Math.floor((left + hx - br.left) / cellSize), row = Math.floor((top + hy - br.top) / cellSize);
    clearDropMarks();
    drag.target = null;
    drag.slot = traySlotAt(e.clientX, e.clientY);
    if (drag.slot) { drag.slot.slot.classList.add('drop-ok'); return; }
    const wr = $('board-wrap').getBoundingClientRect();
    drag.overBoard = e.clientX >= wr.left && e.clientX <= wr.right && e.clientY >= wr.top && e.clientY <= wr.bottom;
    if (row < 0 || col < 0 || row >= S.pz.rows || col >= S.pz.cols) return;
    const a = S.pz.cells.findIndex(([r, c]) => r === row && c === col);
    if (a === -1) return;
    const occ = occupancy(drag.d);
    const cellEls = $('board').querySelectorAll('.cell');
    if (fits(drag.d, a, drag.dir, occ)) {
      drag.target = [a, drag.dir];
      cellEls[a].classList.add('drop-ok'); cellEls[S.pz.nb[a][drag.dir]].classList.add('drop-ok');
    } else {
      cellEls[a].classList.add('drop-bad');
    }
  }
  function endDrag() {
    if (!drag) return;
    drag.el.removeEventListener('pointermove', onMove);
    drag.el.removeEventListener('pointerup', onUp);
    drag.el.removeEventListener('pointercancel', onCancel);
    if (drag.ghost) drag.ghost.remove();
    clearDropMarks();
    drag = null;
  }
  function onCancel() { const wasBoard = drag && drag.source; endDrag(); if (wasBoard) renderPieces(); }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dg = drag;
    const ghostRect = dg.ghost ? dg.ghost.getBoundingClientRect() : null;
    endDrag();
    if (dg.moved) queueMotion(dg.d, ghostRect, 0);
    if (!dg.moved) {
      if (dg.source === 'tray') {
        if (S.sel === dg.d) rotateTray(dg.d);
        else { S.sel = dg.d; renderTray(); }
      } else {
        const horiz = dg.dir % 2 === 0;
        const first = horiz ? dg.fx < 0.5 : dg.fy < 0.5; // which visual half was tapped
        const half = (dg.dir < 2) === first ? 0 : 1;
        rotatePlaced(dg.d, half);
      }
      return;
    }
    if (dg.slot) {
      snapshot();
      if (dg.slot.swap !== -1) S.trayPos[dg.slot.swap] = S.trayPos[dg.d];
      S.trayPos[dg.d] = dg.slot.q;
      if (dg.source === 'board') { S.trayDir[dg.d] = dg.dir; S.place[dg.d] = null; changed(); }
      else { persist(); renderPieces(); }
    } else if (dg.target) {
      snapshot();
      S.place[dg.d] = dg.target;
      changed();
    } else if (dg.source === 'board' && !dg.overBoard) {
      snapshot();
      S.trayDir[dg.d] = dg.dir;
      S.place[dg.d] = null;
      changed();
    } else {
      renderPieces();
    }
  }

  function win() {
    stopTimer();
    const t = S.elapsed;
    const prev = store.prog[S.id] || {};
    prev.s = prev.s ? Math.min(prev.s, t) : t;
    prev.e = t;
    store.prog[S.id] = prev;
    S.solved = true; S.locked = true;
    persist();
    save();
    renderPieces();
    $('board').classList.add('won');
    updateTimer();
    const isDaily = S.opts.kind === 'daily';
    $('win-text').textContent = 'Solved in ' + fmtTime(t) + (isDaily ? ' · ' + DIFF_NAME[S.opts.diff] + ' No. ' + (dayIndex(S.opts.date) + 1) : '');
    const wt = document.querySelector('.win-tiles');
    wt.innerHTML = '<span class="mini-tile"></span><span class="mini-tile"></span><span class="mini-tile"></span>';
    setTimeout(() => { $('win').hidden = false; $('win-next').focus(); }, 650);
  }

  function nextPuzzle() {
    $('win').hidden = true;
    if (S.opts.kind === 'practice') { newPractice(S.opts.diff); return; }
    const isSolved = (iso, diff) => { const p = store.prog[iso + ':' + diff]; return p && (p.s || p.r); };
    let iso = S.opts.date;
    const start = DIFFS.indexOf(S.opts.diff);
    for (let k = 1; k < 3; k++) {
      const diff = DIFFS[(start + k) % 3];
      if (!isSolved(iso, diff)) { openPuzzle({ kind: 'daily', date: iso, diff }); return; }
    }
    for (let n = 0; n < 2000; n++) {
      iso = addDays(iso, -1);
      if (dayIndex(iso) < 0) break;
      if (!isSolved(iso, S.opts.diff)) { openPuzzle({ kind: 'daily', date: iso, diff: S.opts.diff }); return; }
    }
    goHome();
  }

  function newPractice(diff) {
    const seed = 'practice:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    store.practice[diff] = seed;
    // keep only current practice puzzles in storage
    Object.keys(store.prog).forEach(k => { if (k.startsWith('practice:' + diff + ':') && !k.endsWith(seed)) delete store.prog[k]; });
    save();
    openPuzzle({ kind: 'practice', diff, seed });
  }

  // ---------- home ----------
  let calMonth = null; // [year, monthIndex]
  let pickedDay = null;

  function stateText(iso, diff) {
    const p = store.prog[iso + ':' + diff];
    if (!p) return { cls: '', text: 'Not started' };
    if (p.s) return { cls: 'solved', text: 'Solved · ' + fmtTime(p.s) };
    if (p.r) return { cls: 'revealed', text: 'Solution shown' };
    if ((p.p || []).some(Boolean) || p.e > 1500) return { cls: 'progress', text: 'In progress · ' + fmtTime(p.e || 0) };
    return { cls: '', text: 'Not started' };
  }
  function diffCards(iso) {
    return DIFFS.map((diff, i) => {
      const st = stateText(iso, diff);
      return '<button class="diff-card ' + st.cls + '" data-date="' + iso + '" data-diff="' + diff + '">' +
        '<span class="mini">' + '<span class="mini-tile"></span>'.repeat(i + 1) + '</span>' +
        '<span class="dname">' + DIFF_NAME[diff] + '</span>' +
        '<span class="dstate">' + st.text + '</span></button>';
    }).join('');
  }

  function computeStats() {
    const today = todayISO();
    let solved = 0;
    const bestHard = [];
    const solvedDays = new Set();
    for (const [k, p] of Object.entries(store.prog)) {
      if (k.startsWith('practice:') || !p.s) continue;
      solved++;
      const [iso, diff] = k.split(':');
      solvedDays.add(iso);
      if (diff === 'hard') bestHard.push(p.s);
    }
    let streak = 0, d = today;
    if (!solvedDays.has(d)) d = addDays(d, -1);
    while (solvedDays.has(d)) { streak++; d = addDays(d, -1); }
    let longest = 0, run = 0;
    [...solvedDays].sort().forEach((iso, i, arr) => {
      run = i && addDays(arr[i - 1], 1) === iso ? run + 1 : 1;
      longest = Math.max(longest, run);
    });
    return { solved, streak, longest, bestHard: bestHard.length ? fmtTime(Math.min(...bestHard)) : '—' };
  }

  function renderHome() {
    const today = todayISO();
    $('today-label').textContent = 'Today · ' + prettyDate(today, false);
    $('today-title').textContent = 'Puzzle No. ' + (dayIndex(today) + 1);
    $('today-cards').innerHTML = diffCards(today);
    const st = computeStats();
    $('stats').innerHTML =
      '<div class="stat"><b>' + st.solved + '</b><span>Solved</span></div>' +
      '<div class="stat"><b>' + st.streak + '</b><span>Day streak</span></div>' +
      '<div class="stat"><b>' + st.longest + '</b><span>Best streak</span></div>' +
      '<div class="stat"><b>' + st.bestHard + '</b><span>Best hard</span></div>';
    if (!calMonth) { const t = new Date(); calMonth = [t.getFullYear(), t.getMonth()]; }
    renderCalendar();
  }

  function renderCalendar() {
    const [y, m] = calMonth;
    const today = todayISO();
    $('month-label').textContent = MONTHS[m] + ' ' + y;
    const [sy, sm] = START.split('-').map(Number);
    const t = new Date();
    $('month-prev').disabled = y < sy || (y === sy && m <= sm - 1);
    $('month-next').disabled = y > t.getFullYear() || (y === t.getFullYear() && m >= t.getMonth());
    const first = new Date(Date.UTC(y, m, 1));
    const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    let html = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => '<div class="cal-dow">' + d + '</div>').join('');
    for (let i = 0; i < lead; i++) html += '<div class="cal-day empty"></div>';
    for (let day = 1; day <= daysIn; day++) {
      const iso = y + '-' + pad(m + 1) + '-' + pad(day);
      const before = dayIndex(iso) < 0, future = iso > today;
      if (before) { html += '<div class="cal-day empty"></div>'; continue; }
      const dots = DIFFS.map((diff, i) => {
        const p = store.prog[iso + ':' + diff];
        return '<span class="dot ' + 'emh'[i] + (p && p.s ? ' on' : '') + '"></span>';
      }).join('');
      const cls = 'cal-day' + (future ? ' future' : '') + (iso === today ? ' today' : '') + (iso === pickedDay ? ' sel' : '');
      html += '<button class="' + cls + '" data-day="' + iso + '"' + (future ? ' disabled' : '') +
        ' aria-label="' + prettyDate(iso, true) + '">' + day + '<span class="dots">' + dots + '</span></button>';
    }
    $('calendar').innerHTML = html;
    renderDayPick();
  }

  function renderDayPick() {
    const el = $('day-pick');
    if (!pickedDay) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<div class="dp-title">' + prettyDate(pickedDay, true) + ' · No. ' + (dayIndex(pickedDay) + 1) + '</div>' +
      '<div class="diff-cards">' + diffCards(pickedDay) + '</div>';
  }

  // ---------- views ----------
  function showView(name) {
    $('view-home').hidden = name !== 'home';
    $('view-play').hidden = name !== 'play';
    $('menu').hidden = true;
    window.scrollTo(0, 0);
  }
  function goHome() {
    stopTimer(); persist();
    $('win').hidden = true;
    S = null;
    showView('home');
    renderHome();
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function showBusy() { $('busy').hidden = false; }
  function hideBusy() { $('busy').hidden = true; }

  function applyTheme() {
    const th = store.settings.theme;
    if (th) document.documentElement.setAttribute('data-theme', th);
  }

  // ---------- wire up ----------
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.diff-card');
    if (card) { openPuzzle({ kind: 'daily', date: card.dataset.date, diff: card.dataset.diff }); return; }
    const day = e.target.closest('.cal-day[data-day]');
    if (day && !day.disabled) { pickedDay = pickedDay === day.dataset.day ? null : day.dataset.day; renderCalendar(); return; }
    const pr = e.target.closest('[data-practice]');
    if (pr) { newPractice(pr.dataset.practice); return; }
    if (!$('menu').hidden && !e.target.closest('#menu') && !e.target.closest('#btn-menu')) $('menu').hidden = true;
  });
  $('month-prev').addEventListener('click', () => { let [y, m] = calMonth; m--; if (m < 0) { m = 11; y--; } calMonth = [y, m]; renderCalendar(); });
  $('month-next').addEventListener('click', () => { let [y, m] = calMonth; m++; if (m > 11) { m = 0; y++; } calMonth = [y, m]; renderCalendar(); });
  $('btn-back').addEventListener('click', goHome);
  $('btn-menu').addEventListener('click', () => { $('menu').hidden = !$('menu').hidden; });
  $('m-reset').addEventListener('click', () => {
    $('menu').hidden = true;
    const prev = store.prog[S.id] || {};
    S.place = S.place.map(() => null);
    S.history = []; S.sel = -1; S.elapsed = 0; S.revealed = false; S.solved = false; S.locked = false;
    prev.r = false; prev.e = 0; // keep best solve time in prev.s
    store.prog[S.id] = prev;
    persist();
    renderPlay();
    startTimer();
  });
  $('m-reveal').addEventListener('click', () => {
    $('menu').hidden = true;
    if (S.locked) return;
    stopTimer();
    S.place = S.pz.solution.map(([a, b]) => [a, S.pz.nb[a].indexOf(b)]);
    S.revealed = true; S.locked = true; S.sel = -1;
    persist();
    renderPieces();
    updateTimer();
    toast('Solution shown. This one won\'t count as solved.');
  });
  $('m-live').addEventListener('change', (e) => { store.settings.live = e.target.checked; save(); if (S) renderPieces(); });
  $('btn-undo').addEventListener('click', () => {
    if (!S.history.length || S.locked) return;
    const h = S.history.pop();
    S.place = h.place; S.trayDir = h.trayDir; if (h.trayPos) S.trayPos = h.trayPos; S.sel = -1;
    persist(); renderPieces();
  });
  $('btn-rotate').addEventListener('click', () => {
    if (S.locked) return;
    if (S.sel >= 0) rotateTray(S.sel); else toast('Tap a tile in the tray, then turn it.');
  });
  $('btn-clear').addEventListener('click', () => {
    if (S.locked || !S.place.some(Boolean)) return;
    snapshot(); S.place = S.place.map(() => null); S.sel = -1; changed();
  });
  $('win-next').addEventListener('click', nextPuzzle);
  $('win-home').addEventListener('click', goHome);
  $('win-stay').addEventListener('click', () => { $('win').hidden = true; });
  $('btn-help').addEventListener('click', () => { $('help').hidden = false; });
  $('help-close').addEventListener('click', () => { $('help').hidden = true; store.settings.seenHelp = true; save(); });
  $('btn-theme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    store.settings.theme = cur === 'dark' ? 'light' : 'dark';
    save(); applyTheme();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('help').hidden = true; $('menu').hidden = true; }
    if (!S || $('view-play').hidden) return;
    if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('btn-undo').click(); }
    if (e.key === 'r' || e.key === 'R') $('btn-rotate').click();
  });
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (S && !$('view-play').hidden) { computeCellSize(); renderTray(); } }, 120); });
  window.addEventListener('pagehide', () => { if (S) { stopTimer(); persist(); } });

  applyTheme();
  showView('home');
  renderHome();
  if (!store.settings.seenHelp) $('help').hidden = false;

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* not available here */ }
  }
})();
