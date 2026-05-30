// src/algos/color.js

export function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function srgbToLinear01(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linear01ToSrgb(v) {
  const c = Math.max(0, Math.min(1, v));
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return clamp255(s * 255);
}

// Björn Ottosson OKLab conversion. Good enough for perceptual palette picking,
// much more reliable than Euclidean distance in raw sRGB.
export function rgbToOklab([r, g, b]) {
  const lr = srgbToLinear01(r);
  const lg = srgbToLinear01(g);
  const lb = srgbToLinear01(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(Math.max(0, l));
  const m_ = Math.cbrt(Math.max(0, m));
  const s_ = Math.cbrt(Math.max(0, s));

  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  ];
}

export function oklabToRgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return [linear01ToSrgb(lr), linear01ToSrgb(lg), linear01ToSrgb(lb)];
}

export function dist2Lab(a, b) {
  const d0 = a[0] - b[0];
  const d1 = a[1] - b[1];
  const d2 = a[2] - b[2];
  return d0 * d0 + d1 * d1 + d2 * d2;
}

export function meanLab(labs, ids) {
  let L = 0, A = 0, B = 0;
  const n = ids.length;
  if (!n) return [0, 0, 0];

  for (let i = 0; i < n; i++) {
    const p = labs[ids[i]];
    L += p[0]; A += p[1]; B += p[2];
  }

  return [L / n, A / n, B / n];
}

export function meanRgb(pixels, ids) {
  let r = 0, g = 0, b = 0;
  const n = ids.length;
  if (!n) return [0, 0, 0];

  for (let i = 0; i < n; i++) {
    const p = pixels[ids[i]];
    r += p[0]; g += p[1]; b += p[2];
  }

  return [r / n, g / n, b / n];
}
