const G = require('../www/js/generator.js');
const diffs = ['easy','medium','hard'];
for (const d of diffs) {
  let tot=0, max=0, n=40, blanks=0, regs=0;
  for (let i=0;i<n;i++){
    const t=Date.now();
    const p=G.generate('2025-01-'+i, d);
    const dt=Date.now()-t; tot+=dt; max=Math.max(max,dt);
    regs+=p.regions.length; blanks+=p.regions.filter(r=>!r.rule).length;
    // verify solution
    const vals=new Array(p.cells.length).fill(-1);
    p.solution.forEach((s,i)=>{vals[s.a]=s.va; vals[s.b]=s.vb;
      const dm=p.dominoes[i]; if(!((dm[0]===s.va&&dm[1]===s.vb)||(dm[1]===s.va&&dm[0]===s.vb))) throw 'domino mismatch';
      const [ra,ca]=p.cells[s.a],[rb,cb]=p.cells[s.b]; if(Math.abs(ra-rb)+Math.abs(ca-cb)!==1) throw 'not adjacent';});
    if (G.regionStatus(p, vals).some(x=>x!=='ok')) throw 'solution invalid';
    if (vals.some(v=>v<0)) throw 'uncovered';
  }
  console.log(d, 'avg ms', (tot/n).toFixed(1), 'max', max, 'blank regions', (blanks/regs*100).toFixed(0)+'%');
}
const p=G.generate('2025-03-03','hard'); console.log(p.rows,p.cols,p.cells.length,p.regions.map(r=>r.rule&&r.rule.type+(r.rule.value??'')).join(' '));
