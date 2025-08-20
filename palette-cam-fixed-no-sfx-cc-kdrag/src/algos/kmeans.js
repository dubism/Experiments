export function kmeansKmax(pixels, Kmax){
  if(!pixels.length) return [];
  const idxs = Uint32Array.from({length:pixels.length}, (_,i)=>i);
  let leaves = [{ids:idxs, id:0}];
  let nextId=1;

  function centroid(ids){
    let r=0,g=0,b=0; const n=ids.length||ids.byteLength;
    for(let i=0;i<n;i++){ const p=pixels[ids[i]]; r+=p[0]; g+=p[1]; b+=p[2]; }
    const inv=1/Math.max(1,n); return [r*inv,g*inv,b*inv];
  }
  function split2(ids){
    let nr=0,ng=0,nb=0, n=ids.length||ids.byteLength;
    for(let i=0;i<n;i++){ const p=pixels[ids[i]]; nr+=p[0]; ng+=p[1]; nb+=p[2]; }
    const mr=nr/n, mg=ng/n, mb=nb/n;
    let vr=0,vg=0,vb=0;
    for(let i=0;i<n;i++){ const p=pixels[ids[i]]; const dr=p[0]-mr,dg=p[1]-mg,db=p[2]-mb; vr+=dr*dr; vg+=dg*dg; vb+=db*db; }
    const axis = (vr>=vg && vr>=vb)?0:((vg>=vb)?1:2);

    const c=[mr,mg,mb];
    const seedA=c.slice(), seedB=c.slice();
    let A=[], B=[]; let ca=seedA, cb=seedB;
    for(let it=0; it<3; it++){
      A.length=0; B.length=0;
      for(let i=0;i<n;i++){
        const p=pixels[ids[i]];
        const da=(p[0]-ca[0])**2 + (p[1]-ca[1])**2 + (p[2]-ca[2])**2;
        const db=(p[0]-cb[0])**2 + (p[1]-cb[1])**2 + (p[2]-cb[2])**2;
        (da<=db?A:B).push(ids[i]);
      }
      if(A.length===0 || B.length===0){
        const sorted = Array.from(ids).sort((i1,i2)=>pixels[i1][axis]-pixels[i2][axis]);
        const mid = sorted.length>>1;
        A = sorted.slice(0, mid);
        B = sorted.slice(mid);
      }
      ca = centroid(A); cb = centroid(B);
    }
    return {A:Uint32Array.from(A), B:Uint32Array.from(B), ca, cb};
  }

  while(leaves.length < Kmax){
    leaves.sort((x,y)=> (y.ids.length - x.ids.length) || (x.id - y.id));
    const node = leaves.shift();
    if(!node || node.ids.length<=1){ if(node) leaves.push(node); break; }
    const {A,B} = split2(node.ids);
    leaves.push({ids:A, id:nextId++});
    leaves.push({ids:B, id:nextId++});
  }

  const reps = leaves.map(l=>({c:centroid(l.ids), n:l.ids.length, id:l.id}))
                     .sort((a,b)=> (b.n-a.n) || (a.id-b.id))
                     .map(o=>o.c);
  return reps.slice(0, Kmax);
}
