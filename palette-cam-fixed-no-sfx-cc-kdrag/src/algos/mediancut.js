export function medianCutKmax(pixels, Kmax){
  if(!pixels.length) return [];
  const allIdx = Uint32Array.from({length:pixels.length}, (_,i)=>i);
  let boxes=[{ids:allIdx, id:0}]; let nextId=1;

  function stats(ids){
    let rMin=255,gMin=255,bMin=255, rMax=0,gMax=0,bMax=0;
    let sr=0,sg=0,sb=0, n=ids.length||ids.byteLength;
    for(let i=0;i<n;i++){
      const p=pixels[ids[i]]; const r=p[0],g=p[1],b=p[2];
      if(r<rMin)rMin=r; if(g<gMin)gMin=g; if(b<bMin)bMin=b;
      if(r>rMax)rMax=r; if(g>gMax)gMax=g; if(b>bMax)bMax=b;
      sr+=r; sg+=g; sb+=b;
    }
    return {rMin,rMax,gMin,gMax,bMin,bMax, mean:[sr/n, sg/n, sb/n], n};
  }
  function split(ids){
    const s = stats(ids);
    const rangeR = s.rMax - s.rMin, rangeG = s.gMax - s.gMin, rangeB = s.bMax - s.bMin;
    const axis = (rangeR>=rangeG && rangeR>=rangeB)?0:((rangeG>=rangeB)?1:2);
    const sorted = Array.from(ids).sort((i1,i2)=>pixels[i1][axis]-pixels[i2][axis]);
    const mid = sorted.length>>1 || 1;
    return {A:Uint32Array.from(sorted.slice(0,mid)), B:Uint32Array.from(sorted.slice(mid))};
  }
  while(boxes.length < Kmax){
    boxes.sort((x,y)=>{
      const sx=stats(x.ids), sy=stats(y.ids);
      const pop = (sy.n - sx.n);
      if(pop) return pop;
      const rx = Math.max(sx.rMax-sx.rMin, sx.gMax-sx.gMin, sx.bMax-sx.bMin);
      const ry = Math.max(sy.rMax-sy.rMin, sy.gMax-sy.gMin, sy.bMax-sy.bMin);
      return (ry - rx) || (x.id - y.id);
    });
    const box=boxes.shift(); if(!box || box.ids.length<=1){ if(box) boxes.push(box); break; }
    const {A,B} = split(box.ids);
    boxes.push({ids:A, id:nextId++});
    boxes.push({ids:B, id:nextId++});
  }
  const reps = boxes.map(b=>{
    const s=stats(b.ids); return {c:s.mean, n:s.n, id:b.id};
  }).sort((a,b)=> (b.n-a.n) || (a.id-b.id)).map(o=>o.c);
  return reps.slice(0,Kmax);
}
