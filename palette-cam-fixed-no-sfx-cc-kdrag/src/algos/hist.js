export function histogramKmax(pixels, Kmax) {
  if (!pixels.length || Kmax <= 0) return [];

  const B = 18;
  const gridSize = B * B * B;
  const bins = new Uint32Array(gridSize);
  const sumR = new Float64Array(gridSize);
  const sumG = new Float64Array(gridSize);
  const sumB = new Float64Array(gridSize);
  const toBin = v => Math.min(B - 1, (v * B / 256) | 0);

  for (const p of pixels) {
    const r = toBin(p[0]);
    const g = toBin(p[1]);
    const b = toBin(p[2]);
    const idx = r * B * B + g * B + b;
    bins[idx]++;
    sumR[idx] += p[0];
    sumG[idx] += p[1];
    sumB[idx] += p[2];
  }

  const smooth = new Float32Array(gridSize);
  const w = [1, 2, 1];

  for (let r = 0; r < B; r++) {
    for (let g = 0; g < B; g++) {
      for (let b = 0; b < B; b++) {
        let acc = 0;
        for (let dr = -1; dr <= 1; dr++) {
          const rr = r + dr; if (rr < 0 || rr >= B) continue;
          for (let dg = -1; dg <= 1; dg++) {
            const gg = g + dg; if (gg < 0 || gg >= B) continue;
            for (let db = -1; db <= 1; db++) {
              const bb = b + db; if (bb < 0 || bb >= B) continue;
              acc += bins[rr * B * B + gg * B + bb] * w[dr + 1] * w[dg + 1] * w[db + 1];
            }
          }
        }
        smooth[r * B * B + g * B + b] = acc;
      }
    }
  }

  const candidates = [];
  for (let i = 0; i < gridSize; i++) if (smooth[i] > 0) candidates.push({ i, v: smooth[i] });
  candidates.sort((a, b) => b.v - a.v);

  const picked = [];
  const taken = new Uint8Array(gridSize);
  const nmsRadius = 1;

  for (const c of candidates) {
    if (picked.length >= Kmax) break;
    if (taken[c.i]) continue;

    picked.push(c.i);

    const br = (c.i / (B * B)) | 0;
    const bg = ((c.i % (B * B)) / B) | 0;
    const bb = c.i % B;

    for (let dr = -nmsRadius; dr <= nmsRadius; dr++) {
      const rr = br + dr; if (rr < 0 || rr >= B) continue;
      for (let dg = -nmsRadius; dg <= nmsRadius; dg++) {
        const gg = bg + dg; if (gg < 0 || gg >= B) continue;
        for (let db = -nmsRadius; db <= nmsRadius; db++) {
          const bb2 = bb + db; if (bb2 < 0 || bb2 >= B) continue;
          taken[rr * B * B + gg * B + bb2] = 1;
        }
      }
    }
  }

  return picked.map(i => {
    const n = Math.max(1, bins[i]);
    return [sumR[i] / n, sumG[i] / n, sumB[i] / n];
  });
}
