import { play } from '../sound/sfx.js';
import { getSource, getVideoElement, getPhotoBitmap, computeSquareCrop, currentPhotoSrcRect } from '../core/camera.js';
import * as C from '../core/constants.js';
import { kmeansKmax } from '../algos/kmeans.js';
import { histogramKmax } from '../algos/hist.js';
import { medianCutKmax } from '../algos/mediancut.js';

// --- Private Helpers ---
function samplePixels(imgData, stride) {
  const d = imgData.data, n = d.length, out = [];
  for (let i = 0; i < n; i += 4 * stride) {
    if (d[i + 3] >= 250) out.push([d[i], d[i + 1], d[i + 2]]);
  }
  return out;
}

function rgbToHexLower([r, g, b]) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

function padToK(hexes, K) {
  if (hexes.length === 0) return Array(K).fill('#000000');
  while (hexes.length < K) hexes.push(hexes[hexes.length - 1]);
  return hexes.slice(0, K);
}

function computeFreezeHexesFromCrop(cropImg, sx, sy, sw, sh, state) {
  const { procWidth, algo, K, KMAX } = state;
  const w = Math.max(1, procWidth), h = w;
  const work = document.createElement('canvas');
  work.width = w; work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cropImg, sx, sy, sw, sh, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const pixels = samplePixels(img, 2); // Use finer stride for freeze

  let pal;
  if (algo === 'kmeans') pal = kmeansKmax(pixels, KMAX);
  else if (algo === 'hist') pal = histogramKmax(pixels, KMAX);
  else pal = medianCutKmax(pixels, KMAX);

  const sliced = pal.slice(0, Math.min(K, pal.length));
  return padToK(sliced.map(rgbToHexLower), K);
}

function buildHiCap() {
  const video = getVideoElement();
  if (getSource() === 'camera') {
    if (!(video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)) return null;
    const c = computeSquareCrop();
    if (c.sw <= 0) return null;
    const hi = document.createElement('canvas');
    hi.width = c.sw; hi.height = c.sh;
    const g = hi.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, c.sw, c.sh);
    return hi;
  } else if (getSource() === 'photo' && getPhotoBitmap()) {
    const r = currentPhotoSrcRect();
    const HI = Math.min(C.CAM_W, r.sw | 0);
    if (HI <= 0) return null;
    const hi = document.createElement('canvas');
    hi.width = HI; hi.height = HI;
    const g = hi.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(getPhotoBitmap(), r.sx, r.sy, r.sw, r.sh, 0, 0, HI, HI);
    return hi;
  }
  return null;
}

function renderCompositePNG(hiCap, hexes, elements) {
  const { compositeCanvas, compositeImg, compositeOverlay, rectChk, gradChk } = elements;
  const hasRects = !!rectChk.checked, hasGrad = !!gradChk.checked, hasLower = hasRects || hasGrad;
  const W = C.PAD + C.CAM_W + C.PAD;
  const H = C.PAD + C.CAM_H + (hasLower ? C.GUT : 0) + (hasRects ? C.RECT_H + C.LABEL_H : 0) + (hasRects && hasGrad ? C.GUT : 0) + (hasGrad ? C.GRAD_H : 0) + C.PAD;

  compositeCanvas.width = W; compositeCanvas.height = H;
  const ctx = compositeCanvas.getContext('2d');
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(hiCap, 0, 0, hiCap.width, hiCap.height, C.PAD, C.PAD, C.CAM_W, C.CAM_H);

  let y = C.PAD + C.CAM_H + (hasLower ? C.GUT : 0);
  if (hasRects) {
    const cellW = Math.ceil(C.CAM_W / Math.max(1, hexes.length));
    hexes.forEach((hex, i) => {
      ctx.fillStyle = hex;
      ctx.fillRect(C.PAD + i * cellW, y, cellW, C.RECT_H);
    });
    ctx.font = '30px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillStyle = '#d0d0d0'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const yLabel = y + C.RECT_H + 8;
    hexes.forEach((hex, i) => {
      ctx.fillText(hex.toUpperCase(), C.PAD + Math.round(i * cellW + cellW / 2), yLabel);
    });
    y += C.RECT_H + C.LABEL_H;
  }
  if (hasGrad) {
    if (hasRects) y += C.GUT;
    if (hexes.length <= 1) {
      ctx.fillStyle = hexes[0] || '#000000';
      ctx.fillRect(C.PAD, y, C.CAM_W, C.GRAD_H);
    } else {
      const g = ctx.createLinearGradient(C.PAD, 0, C.PAD + C.CAM_W, 0);
      hexes.forEach((hex, i) => g.addColorStop(i / (hexes.length - 1), hex));
      ctx.fillStyle = g;
      ctx.fillRect(C.PAD, y, C.CAM_W, C.GRAD_H);
    }
  }
  compositeImg.src = compositeCanvas.toDataURL('image/png');
  compositeOverlay.classList.add('open');
}

// --- Public (Exported) Functions ---
export function initComposite(elements, state, statusUpdater, toast) {
  const freezeNow = () => {
    play('freeze');
    const video = getVideoElement();
    const photo = getPhotoBitmap();
    const source = getSource();

    if (source === 'camera') {
      const pane = elements.videoPane;
      const { clientWidth: w, clientHeight: h } = pane;
      if (w > 0 && h > 0) {
        const c = computeSquareCrop();
        if (video.readyState >= 2 && c.sw > 0) {
          elements.frozenCanvas.width = w;
          elements.frozenCanvas.height = h;
          const g = elements.frozenCanvas.getContext('2d');
          g.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
          elements.frozenCanvas.style.display = 'block';
          video.style.visibility = 'hidden';
        }
      }
    }

    const hiCap = buildHiCap();
    if (!hiCap) { toast('Nothing to capture'); return; }

    let hexes;
    if (source === 'camera') {
      const c = computeSquareCrop();
      hexes = computeFreezeHexesFromCrop(video, c.sx, c.sy, c.sw, c.sh, state);
    } else {
      const r = currentPhotoSrcRect();
      hexes = computeFreezeHexesFromCrop(photo, r.sx, r.sy, r.sw, r.sh, state);
    }

    renderCompositePNG(hiCap, hexes, elements);
    statusUpdater('Frozen');
  };

  const unfreeze = () => {
    play('unfreeze');
    elements.compositeOverlay.classList.remove('open');
    statusUpdater('Live');
    if (getSource() === 'camera') {
      const g = elements.frozenCanvas.getContext('2d');
      g.clearRect(0, 0, elements.frozenCanvas.width, elements.frozenCanvas.height);
      elements.frozenCanvas.style.display = 'none';
      getVideoElement().style.visibility = '';
      getVideoElement().play().catch(() => {});
    }
  };

  on(elements.freezeBtn, 'click', freezeNow);
  on(elements.unfreezeBtn, 'click', unfreeze);
}
