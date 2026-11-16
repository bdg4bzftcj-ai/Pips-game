#!/usr/bin/env node
// Runs the difficulty meter over the daily archive and prints a summary per level.
// Usage: node scripts/rate-archive.js [sampleEveryNDays]
global.self = global;
require('../www/data/archive.js');
const { rate } = require('../www/js/rater.js');
const A = self.SPOTLOCK_ARCHIVE, ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function decode(str) {
  const [dims, grid, rules, doms] = str.split('|'); const [, cols] = dims.split(',').map(Number);
  const cells = [], reg = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] !== '.') { cells.push([Math.floor(i / cols), i % cols]); reg.push(ALPHA.indexOf(grid[i])); }
  const regions = rules.split(',').map(t => ({ cells: [], rule: !t ? null : t === '=' ? { type: 'eq' } : t === '!' ? { type: 'neq' }
    : t[0] === '<' ? { type: 'lt', value: +t.slice(1) } : t[0] === '>' ? { type: 'gt', value: +t.slice(1) } : { type: 'sum', value: +t } }));
  reg.forEach((r, i) => regions[r].cells.push(i));
  const dominoes = []; for (let i = 0; i < doms.length; i += 2) dominoes.push([+doms[i], +doms[i + 1]]);
  return { cells, regions, dominoes };
}
module.exports = { decode };
if (require.main === module) {
  const every = +process.argv[2] || 5;
  ['easy', 'medium', 'hard'].forEach((name, di) => {
    let n = 0, solved = 0, first0 = 0; const maxL = {}, firstL = {}; let think = 0, open = 0;
    for (let i = 0; i < A.days.length; i += every) {
      const r = rate(decode(A.days[i][di])); n++;
      if (!r.solved) { maxL.stall = (maxL.stall || 0) + 1; continue; }
      solved++; maxL[r.maxLinks] = (maxL[r.maxLinks] || 0) + 1; firstL[r.firstLinks] = (firstL[r.firstLinks] || 0) + 1;
      think += r.thinkSteps; open += r.openingRun; if (r.firstLinks === 0) first0++;
    }
    console.log(name, 'n=' + n, '| hardest step links:', JSON.stringify(maxL), '| first tile links:', JSON.stringify(firstL),
      '| avg thinking steps', (think / solved).toFixed(1), '| avg free opening tiles', (open / solved).toFixed(1));
  });
}
