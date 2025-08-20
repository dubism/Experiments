export function histogramKmax(pixels, Kmax){
  if(!pixels.length) return [];
  const B=16, gridSize=B*B*B;
  const bins = new Uint32Array(gridSize);
  const toBin = (v)=> Math.min(B-1, (v*B/256)|0);
  for(const p of pixels){
    const r=toBin(p[0]), g=toBin(p[1]), b=toBin(p[2]);
    bins[r*B*B + g*B + b]++;
  }
  const w = [1,2,1], smooth = new Float32Array(gridSize);
  for(let r=0;r<B;r++) for(let g=0;g<B;g++) for(let b=0;b<B;b++){
    let acc=0;
    for(let dr=-1;dr<=1;dr++){
      const rr=r+dr; if(rr<0||rr>=B) continue;
      for(let dg=-1;dg<=1;dg++){
        const gg=g+dg; if(gg<0||gg>=B) continue;
        for(let db=-1;db<=1;db++){
          const bb=b+db; if(bb<0||bb>=B) continue;
          acc += bins[rr*B*B + gg*B + bb] * w[dr+1]*w[dg+1]*w[db+1];
        }
      }
    }
    smooth[r*B*B + g*B + b] = acc;
  }
  const candidates=[]; for(let i=0;i<gridSize;i++) if(smooth[i]>0) candidates.push({i, v:smooth[i]});
  candidates.sort((a,b)=>b.v-a.v);
  const picked=[], taken = new Uint8Array(gridSize); const NMSr = 1;
  for(const c of candidates){
    if(picked.length>=Kmax) break;
    if(taken[c.i]) continue;
    picked.push(c.i);
    const bi = c.i, br = (bi/(B*B))|0, bg = ((bi%(B*B))/B)|0, bb = bi%B;
    for(let dr=-NMSr; dr<=NMSr; dr++){
      const rr=br+dr; if(rr<0||rr>=B) continue;
      for(let dg=-NMSr; dg<=NMSr; dg++){
        const gg=bg+dg; if(gg<0||gg>=B) continue;
        for(let db=-NMSr; db<=NMSr; db++){
          const bb2=bb+db; if(bb2<0||bb>=B) continue;
          taken[rr*B*B + gg*B + bb2] = 1;
        }
      }
    }
  }
  const toCenter = (bin)=> Math.round((bin+0.5)*(255/B));
  return picked.map(i=>{
    const r=(i/(B*B))|0, g=((i%(B*B))/B)|0, b=i%B;
    return [toCenter(r), toCenter(g), toCenter(b)];
  });
}
