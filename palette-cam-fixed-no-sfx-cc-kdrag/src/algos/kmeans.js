import { rgbToOklab, oklabToRgb, dist2Lab } from './color.js';

function mean(points, ids) {
  let a = 0, b = 0, c = 0;
  const n = ids.length;
  if (!n) return [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const p = points[ids[i]];
    a += p[0]; b += p[1]; c += p[2];
  }
  return [a / n, b / n, c / n];
}

function rangeAxis(points, ids) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < ids.length; i++) {
    const p = points[ids[i]];
    for (let a = 0; a < 3; a++) {
      if (p[a] < lo[a]) lo[a] = p[a];
      if (p[a] > hi[a]) hi[a] = p[a];
    }
  }
  const r = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  return (r[0] >= r[1] && r[0] >= r[2]) ? 0 : (r[1] >= r[2] ? 1 : 2);
}

function seededCentroids(points, ids, K) {
  if (K <= 1 || ids.length <= 1) return [mean(points, ids)];

  const axis = rangeAxis(points, ids);
  const sorted = Array.from(ids).sort((i, j) => points[i][axis] - points[j][axis]);
  const centers = [];

  for (let k = 0; k < K; k++) {
    const t = K === 1 ? 0.5 : k / (K - 1);
    const idx = sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(t * (sorted.length - 1))))];
    centers.push(points[idx].slice());
  }

  return centers;
}

export function kmeansKmax(pixels, Kmax) {
  if (!pixels.length || Kmax <= 0) return [];

  const K = Math.max(1, Math.min(Kmax | 0, pixels.length));
  const labs = pixels.map(rgbToOklab);
  const ids = Uint32Array.from({ length: pixels.length }, (_, i) => i);
  let centers = seededCentroids(labs, ids, K);
  let groups = Array.from({ length: K }, () => []);

  for (let iter = 0; iter < 12; iter++) {
    groups = Array.from({ length: K }, () => []);

    for (let i = 0; i < labs.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const d = dist2Lab(labs[i], centers[k]);
        if (d < bestD) { bestD = d; best = k; }
      }
      groups[best].push(i);
    }

    let moved = 0;
    for (let k = 0; k < K; k++) {
      if (!groups[k].length) continue;
      const next = mean(labs, groups[k]);
      moved += dist2Lab(centers[k], next);
      centers[k] = next;
    }
    if (moved < 1e-8) break;
  }

  return groups
    .map((ids, i) => ({ c: centers[i], n: ids.length, i }))
    .filter(o => o.n > 0)
    .sort((a, b) => (b.n - a.n) || (a.i - b.i))
    .slice(0, Kmax)
    .map(o => oklabToRgb(o.c));
}
