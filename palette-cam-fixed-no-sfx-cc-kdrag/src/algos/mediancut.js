import { rgbToOklab, oklabToRgb, meanLab } from './color.js';

function stats(points, ids) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let L = 0, A = 0, B = 0;

  for (let i = 0; i < ids.length; i++) {
    const p = points[ids[i]];
    for (let a = 0; a < 3; a++) {
      if (p[a] < lo[a]) lo[a] = p[a];
      if (p[a] > hi[a]) hi[a] = p[a];
    }
    L += p[0]; A += p[1]; B += p[2];
  }

  const n = Math.max(1, ids.length);
  const range = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  return { lo, hi, range, n: ids.length, mean: [L / n, A / n, B / n] };
}

function split(points, ids) {
  const s = stats(points, ids);
  const axis = (s.range[0] >= s.range[1] && s.range[0] >= s.range[2]) ? 0 : (s.range[1] >= s.range[2] ? 1 : 2);
  const sorted = Array.from(ids).sort((i, j) => points[i][axis] - points[j][axis]);
  const mid = Math.max(1, sorted.length >> 1);
  return {
    A: Uint32Array.from(sorted.slice(0, mid)),
    B: Uint32Array.from(sorted.slice(mid))
  };
}

export function medianCutKmax(pixels, Kmax) {
  if (!pixels.length || Kmax <= 0) return [];

  const labs = pixels.map(rgbToOklab);
  const allIds = Uint32Array.from({ length: pixels.length }, (_, i) => i);
  let boxes = [{ ids: allIds, id: 0 }];
  let nextId = 1;

  while (boxes.length < Kmax) {
    boxes.sort((a, b) => {
      const sa = stats(labs, a.ids);
      const sb = stats(labs, b.ids);
      const wa = Math.max(...sa.range) * Math.sqrt(sa.n);
      const wb = Math.max(...sb.range) * Math.sqrt(sb.n);
      return (wb - wa) || (a.id - b.id);
    });

    const box = boxes.shift();
    if (!box || box.ids.length <= 1) {
      if (box) boxes.push(box);
      break;
    }

    const { A, B } = split(labs, box.ids);
    if (!A.length || !B.length) {
      boxes.push(box);
      break;
    }

    boxes.push({ ids: A, id: nextId++ });
    boxes.push({ ids: B, id: nextId++ });
  }

  return boxes
    .map(box => ({ c: meanLab(labs, box.ids), n: box.ids.length, id: box.id }))
    .sort((a, b) => (b.n - a.n) || (a.id - b.id))
    .slice(0, Kmax)
    .map(o => oklabToRgb(o.c));
}
