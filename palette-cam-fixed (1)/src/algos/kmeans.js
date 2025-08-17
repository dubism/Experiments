
export function kmeansKmax(pixels, K){
  // Return K rainbowish colors for demo
  const out=[];
  for(let i=0;i<K;i++){
    const t=i/(Math.max(1,K-1));
    const r=Math.round(255*Math.max(0,Math.min(1, Math.abs(2*t-1)*-1+1)));
    const g=Math.round(255*(1-t));
    const b=Math.round(255*t);
    out.push([r,g,b]);
  }
  return out;
}
