import { on } from '../ui/dom.js';
import { play } from '../sound/sfx.js';
import { getSource, getVideoElement, getPhotoBitmap, computeSquareCrop, currentPhotoSrcRect } from '../core/camera.js';
import * as C from '../core/constants.js';
import { kmeansKmax } from '../algos/kmeans.js';
import { histogramKmax } from '../algos/hist.js';
import { medianCutKmax } from '../algos/mediancut.js';

const STORY_W = 1080;
const STORY_H = 1920;
const EXPORT_ALGOS = ['kmeans', 'hist', 'mediancut'];
const EXPORT_ALGO_LABELS = {
  kmeans: 'K-MEANS',
  hist: 'HISTOGRAM',
  mediancut: 'MEDIAN-CUT'
};

function samplePixels(imgData, stride) {
  const d = imgData.data;
  const out = [];
  const step = Math.max(1, stride | 0) * 4;
  for (let i = 0; i < d.length; i += step) {
    if (d[i + 3] >= 250) out.push([d[i], d[i + 1], d[i + 2]]);
  }
  return out;
}

function rgbToHexLower([r, g, b]) {
  const h = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToRgb(hex) {
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return [128, 128, 128];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function padToK(hexes, K) {
  if (!hexes.length) return Array(K).fill('#808080');
  while (hexes.length < K) hexes.push(hexes[hexes.length - 1]);
  return hexes.slice(0, K);
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function mix(a, b, t) {
  return [
    clamp255(a[0] + (b[0] - a[0]) * t),
    clamp255(a[1] + (b[1] - a[1]) * t),
    clamp255(a[2] + (b[2] - a[2]) * t)
  ];
}

function rgbCss(rgb, alpha = 1) {
  return alpha >= 1 ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function luminance(rgb) {
  const lin = rgb.map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function sortedByLuma(colors) {
  return [...colors].sort((a, b) => luminance(a) - luminance(b));
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export image.')), type, quality);
  });
}

function makeFileName(mode, algo) {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const suffix = mode === 'poster' ? 'poster' : 'classic';
  const algoName = algo === 'mediancut' ? 'median' : algo;
  return `palette-${suffix}-${algoName}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}

function createButton(id, label, className = 'btn') {
  const b = document.createElement('button');
  b.id = id;
  b.className = className;
  b.type = 'button';
  b.textContent = label;
  return b;
}

function ensureExportControls(elements) {
  const overlay = elements.compositeOverlay;
  let actions = elements.compositeActions || overlay.querySelector('#compositeActions');

  if (!actions) {
    actions = document.createElement('div');
    actions.id = 'compositeActions';
    overlay.appendChild(actions);
  }

  let modeBtn = elements.exportModeBtn || overlay.querySelector('#exportModeBtn');
  if (!modeBtn) {
    modeBtn = createButton('exportModeBtn', 'FORMAT: CLASSIC', 'btn');
    actions.appendChild(modeBtn);
  }

  let exportAlgoBtn = elements.exportAlgoBtn || overlay.querySelector('#exportAlgoBtn');
  if (!exportAlgoBtn) {
    exportAlgoBtn = createButton('exportAlgoBtn', 'SAMPLE: K-MEANS', 'btn');
    actions.appendChild(exportAlgoBtn);
  }

  let regenerateBtn = elements.regenerateBtn || overlay.querySelector('#regenerateBtn');
  if (!regenerateBtn) {
    regenerateBtn = createButton('regenerateBtn', 'NEW POSTER', 'btn');
    actions.appendChild(regenerateBtn);
  }

  let shareSaveBtn = elements.shareSaveBtn || overlay.querySelector('#shareSaveBtn');
  if (!shareSaveBtn) {
    shareSaveBtn = createButton('shareSaveBtn', 'SHARE / SAVE', 'btn cta');
    actions.appendChild(shareSaveBtn);
  }

  let downloadBtn = elements.downloadBtn || overlay.querySelector('#downloadBtn');
  if (!downloadBtn) {
    downloadBtn = createButton('downloadBtn', 'DOWNLOAD PNG', 'btn');
    actions.appendChild(downloadBtn);
  }

  if (elements.unfreezeBtn && elements.unfreezeBtn.parentElement !== actions) actions.appendChild(elements.unfreezeBtn);

  elements.compositeActions = actions;
  elements.exportModeBtn = modeBtn;
  elements.exportAlgoBtn = exportAlgoBtn;
  elements.regenerateBtn = regenerateBtn;
  elements.shareSaveBtn = shareSaveBtn;
  elements.downloadBtn = downloadBtn;
}

function ensureExportPanelControls(elements, state) {
  state.exportMode = state.exportMode || 'existing';
  state.exportAlgo = state.exportAlgo || state.algo || 'kmeans';
  state.posterSeed = state.posterSeed || 0;

  let field = elements.cc?.querySelector('#exportModeField');
  if (!field && elements.cc) {
    field = document.createElement('div');
    field.id = 'exportModeField';
    field.className = 'field';
    field.innerHTML = `
      <div class="field-head">
        <span class="label">Output format</span>
        <span class="value" id="exportModeVal">Classic</span>
      </div>
      <div class="field-body">
        <button type="button" class="btn wide" id="exportModeCcBtn">Switch to poster</button>
      </div>
      <div class="divider"></div>
    `;
    elements.cc.appendChild(field);
  }

  let algoField = elements.cc?.querySelector('#exportAlgoField');
  if (!algoField && elements.cc) {
    algoField = document.createElement('div');
    algoField.id = 'exportAlgoField';
    algoField.className = 'field';
    algoField.innerHTML = `
      <div class="field-head">
        <span class="label">Export sampling</span>
        <span class="value" id="exportAlgoVal">K-MEANS</span>
      </div>
      <div class="field-body">
        <button type="button" class="btn wide" id="exportAlgoCcBtn">Switch sampling algorithm</button>
      </div>
      <div class="divider"></div>
    `;
    elements.cc.appendChild(algoField);
  }

  elements.exportModeVal = field?.querySelector('#exportModeVal') || null;
  elements.exportModeCcBtn = field?.querySelector('#exportModeCcBtn') || null;
  elements.exportAlgoVal = algoField?.querySelector('#exportAlgoVal') || null;
  elements.exportAlgoCcBtn = algoField?.querySelector('#exportAlgoCcBtn') || null;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function shareBlob(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Palette image' });
    return true;
  }
  return false;
}

function computePaletteForAlgo(pixels, algo, KMAX) {
  if (algo === 'hist') return histogramKmax(pixels, KMAX);
  if (algo === 'mediancut') return medianCutKmax(pixels, KMAX);
  return kmeansKmax(pixels, KMAX);
}

function computeFreezeHexesFromCrop(cropImg, sx, sy, sw, sh, state, algo = state.exportAlgo || state.algo || 'kmeans') {
  const { procWidth, K, KMAX } = state;
  const w = Math.max(32, procWidth | 0);
  const work = document.createElement('canvas');
  work.width = w;
  work.height = w;

  const ctx = work.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cropImg, sx, sy, sw, sh, 0, 0, w, w);

  const pixels = samplePixels(ctx.getImageData(0, 0, w, w), 2);
  const pal = computePaletteForAlgo(pixels, algo, KMAX);
  return padToK(pal.slice(0, Math.min(K, pal.length)).map(rgbToHexLower), K);
}

function buildHiCap() {
  const source = getSource();
  const video = getVideoElement();

  if (source === 'camera') {
    if (!(video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)) return null;
    const c = computeSquareCrop();
    if (c.sw <= 0 || c.sh <= 0) return null;

    const hi = document.createElement('canvas');
    hi.width = c.sw;
    hi.height = c.sh;
    const g = hi.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, c.sw, c.sh);
    return hi;
  }

  if (source === 'photo' && getPhotoBitmap()) {
    const r = currentPhotoSrcRect();
    const HI = Math.min(C.CAM_W, Math.max(1, r.sw | 0));
    if (HI <= 0) return null;

    const hi = document.createElement('canvas');
    hi.width = HI;
    hi.height = HI;
    const g = hi.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(getPhotoBitmap(), r.sx, r.sy, r.sw, r.sh, 0, 0, HI, HI);
    return hi;
  }

  return null;
}

function drawExistingComposite(ctx, hiCap, hexes, elements) {
  const hasRects = !!elements.rectChk.checked;
  const hasGrad = !!elements.gradChk.checked;
  const hasLower = hasRects || hasGrad;
  const W = C.PAD + C.CAM_W + C.PAD;
  const H = C.PAD + C.CAM_H + (hasLower ? C.GUT : 0) + (hasRects ? C.RECT_H + C.LABEL_H : 0) + (hasRects && hasGrad ? C.GUT : 0) + (hasGrad ? C.GRAD_H : 0) + C.PAD;

  elements.compositeCanvas.width = W;
  elements.compositeCanvas.height = H;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(hiCap, 0, 0, hiCap.width, hiCap.height, C.PAD, C.PAD, C.CAM_W, C.CAM_H);

  let y = C.PAD + C.CAM_H + (hasLower ? C.GUT : 0);
  if (hasRects) {
    const cellW = C.CAM_W / Math.max(1, hexes.length);
    hexes.forEach((hex, i) => {
      const x0 = C.PAD + Math.round(i * cellW);
      const x1 = C.PAD + Math.round((i + 1) * cellW);
      ctx.fillStyle = hex;
      ctx.fillRect(x0, y, Math.max(1, x1 - x0), C.RECT_H);
    });
    ctx.font = '30px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillStyle = '#d0d0d0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const yLabel = y + C.RECT_H + 8;
    hexes.forEach((hex, i) => ctx.fillText(hex.toUpperCase(), C.PAD + Math.round(i * cellW + cellW / 2), yLabel));
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
}

function fillStripe(ctx, colors, x, y, w, h, vertical = false, reverse = false) {
  const arr = reverse ? [...colors].reverse() : colors;
  const n = Math.max(1, arr.length);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = arr[i];
    if (vertical) {
      const y0 = y + Math.round((i / n) * h);
      const y1 = y + Math.round(((i + 1) / n) * h);
      ctx.fillRect(x, y0, w, Math.max(1, y1 - y0));
    } else {
      const x0 = x + Math.round((i / n) * w);
      const x1 = x + Math.round(((i + 1) / n) * w);
      ctx.fillRect(x0, y, Math.max(1, x1 - x0), h);
    }
  }
}

function hardGradient(ctx, colors, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const n = Math.max(1, colors.length - 1);
  colors.forEach((hex, i) => g.addColorStop(i / n, hex));
  return g;
}

function drawSquareImage(ctx, img, x, y, size) {
  ctx.drawImage(img, 0, 0, img.width, img.height, x, y, size, size);
}

function drawPosterComposite(ctx, hiCap, hexes, elements, seed = 0) {
  const hexPalette = padToK(hexes.slice(), Math.max(6, hexes.length));
  const rgbPalette = hexPalette.map(hexToRgb);
  const sorted = sortedByLuma(rgbPalette);
  const dark = sorted[0];
  const light = sorted[sorted.length - 1];
  const mid = sorted[(sorted.length / 2) | 0];

  elements.compositeCanvas.width = STORY_W;
  elements.compositeCanvas.height = STORY_H;

  const variant = Math.abs(seed | 0) % 5;
  const rotated = hexPalette.map((_, i) => hexPalette[(i + variant) % hexPalette.length]);
  const reverse = variant % 2 === 1;
  const bg = hardGradient(
    ctx,
    reverse ? rotated.slice().reverse() : rotated,
    variant % 3 === 0 ? 0 : STORY_W,
    0,
    variant % 3 === 1 ? 0 : STORY_W,
    STORY_H
  );
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  const wash = mix(light, mid, 0.34);
  ctx.fillStyle = rgbCss(wash, 0.22);
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  const imageSizes = [760, 820, 700, 860, 780];
  const imageX = [96, 164, 72, 148, 248][variant];
  const imageY = [250, 310, 430, 228, 360][variant];
  const imageSize = imageSizes[variant];

  const slabColor = rgbCss(mix(mid, light, 0.12), 0.92);
  const slabX = [0, 90, 0, 360, 0][variant];
  const slabY = [176, 210, 330, 160, 260][variant];
  const slabW = [STORY_W, 900, 760, 720, 820][variant];
  const slabH = [980, 920, 780, 1080, 940][variant];
  ctx.fillStyle = slabColor;
  ctx.fillRect(slabX, slabY, slabW, slabH);

  if (elements.gradChk.checked) {
    const gradX = [72, 0, 690, 72, 0][variant];
    const gradY = [1280, 1260, 160, 1220, 1340][variant];
    const gradW = [936, STORY_W, 250, 860, STORY_W][variant];
    const gradH = [210, 240, 1150, 170, 180][variant];
    ctx.fillStyle = hardGradient(ctx, rotated, gradX, gradY, gradX + gradW, gradY + gradH);
    ctx.fillRect(gradX, gradY, gradW, gradH);
  }

  drawSquareImage(ctx, hiCap, imageX, imageY, imageSize);

  if (elements.rectChk.checked) {
    const stripY = [1570, 1510, 1320, 1520, 118][variant];
    const stripH = [178, 140, 210, 126, 190][variant];
    fillStripe(ctx, rotated, 72, stripY, 936, stripH, false, variant % 2 === 0);

    const sideX = [0, 904, 0, 0, 902][variant];
    fillStripe(ctx, rotated, sideX, 0, 178, STORY_H, true, variant % 2 === 1);
  }

  // Final sharp accent line: sampled colors only, no labels, no black.
  const accent = rgbCss(mix(dark, light, 0.18));
  ctx.fillStyle = accent;
  if (variant % 2 === 0) ctx.fillRect(72, 1780, 936, 32);
  else ctx.fillRect(64, 126, 32, 1668);
}

async function renderCompositePNG(hiCap, hexes, elements, exportState, mode, algo, seed) {
  const canvas = elements.compositeCanvas;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (mode === 'poster') drawPosterComposite(ctx, hiCap, hexes, elements, seed);
  else drawExistingComposite(ctx, hiCap, hexes, elements);

  const blob = await canvasToBlob(canvas, 'image/png');
  const filename = makeFileName(mode, algo);

  if (exportState.objectUrl) URL.revokeObjectURL(exportState.objectUrl);
  exportState.objectUrl = URL.createObjectURL(blob);
  exportState.blob = blob;
  exportState.filename = filename;

  elements.compositeImg.src = exportState.objectUrl;
  elements.compositeImg.alt = filename;
  elements.compositeOverlay.classList.add('open');
}

export function initComposite(elements, state, statusUpdater, toast) {
  ensureExportControls(elements);
  ensureExportPanelControls(elements, state);

  const exportState = { blob: null, filename: '', objectUrl: '', hiCap: null, hexes: null };

  const syncModeUI = () => {
    const poster = state.exportMode === 'poster';
    const algoLabel = EXPORT_ALGO_LABELS[state.exportAlgo] || EXPORT_ALGO_LABELS.kmeans;

    if (elements.exportModeBtn) elements.exportModeBtn.textContent = poster ? 'FORMAT: POSTER' : 'FORMAT: CLASSIC';
    if (elements.exportModeVal) elements.exportModeVal.textContent = poster ? 'Poster' : 'Classic';
    if (elements.exportModeCcBtn) elements.exportModeCcBtn.textContent = poster ? 'Switch to classic' : 'Switch to poster';

    if (elements.exportAlgoBtn) elements.exportAlgoBtn.textContent = `SAMPLE: ${algoLabel}`;
    if (elements.exportAlgoVal) elements.exportAlgoVal.textContent = algoLabel;

    if (elements.regenerateBtn) elements.regenerateBtn.hidden = !poster;
  };

  const recomputeHexes = () => {
    if (!exportState.hiCap) return;
    exportState.hexes = computeFreezeHexesFromCrop(exportState.hiCap, 0, 0, exportState.hiCap.width, exportState.hiCap.height, state, state.exportAlgo);
  };

  const rerender = async ({ recompute = false, regenerate = false } = {}) => {
    if (!exportState.hiCap) return;
    if (recompute || !exportState.hexes) recomputeHexes();
    if (regenerate) state.posterSeed = (state.posterSeed || 0) + 1;
    statusUpdater('Rendering…');
    await renderCompositePNG(exportState.hiCap, exportState.hexes, elements, exportState, state.exportMode, state.exportAlgo, state.posterSeed || 0);
    statusUpdater('Frozen');
  };

  const toggleMode = async () => {
    play('click');
    state.exportMode = state.exportMode === 'poster' ? 'existing' : 'poster';
    syncModeUI();
    if (elements.compositeOverlay.classList.contains('open')) await rerender({ regenerate: state.exportMode === 'poster' });
  };

  const cycleExportAlgo = async () => {
    play('click');
    const i = EXPORT_ALGOS.indexOf(state.exportAlgo);
    state.exportAlgo = EXPORT_ALGOS[(i + 1 + EXPORT_ALGOS.length) % EXPORT_ALGOS.length];
    syncModeUI();
    if (elements.compositeOverlay.classList.contains('open')) await rerender({ recompute: true });
  };

  const regeneratePoster = async () => {
    if (state.exportMode !== 'poster') return;
    play('click');
    await rerender({ regenerate: true });
  };

  const freezeNow = async () => {
    play('freeze');
    state.exportAlgo = state.exportAlgo || state.algo || 'kmeans';
    syncModeUI();

    const source = getSource();
    const video = getVideoElement();

    if (source === 'camera') {
      const pane = elements.videoPane;
      const { clientWidth: w, clientHeight: h } = pane;
      if (w > 0 && h > 0) {
        const c = computeSquareCrop();
        if (video.readyState >= 2 && c.sw > 0) {
          elements.frozenCanvas.width = w;
          elements.frozenCanvas.height = h;
          const g = elements.frozenCanvas.getContext('2d');
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = 'high';
          g.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
          elements.frozenCanvas.style.display = 'block';
          video.style.visibility = 'hidden';
        }
      }
    }

    const hiCap = buildHiCap();
    if (!hiCap) {
      toast('Nothing to capture');
      return;
    }

    try {
      statusUpdater('Exporting…');
      exportState.hiCap = hiCap;
      recomputeHexes();
      await renderCompositePNG(hiCap, exportState.hexes, elements, exportState, state.exportMode, state.exportAlgo, state.posterSeed || 0);
      statusUpdater('Frozen');
    } catch (err) {
      console.error(err);
      statusUpdater('Export failed');
      toast(err?.message || 'Export failed');
    }
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

  const shareOrSave = async () => {
    if (!exportState.blob) {
      toast('No exported image yet');
      return;
    }
    try {
      const shared = await shareBlob(exportState.blob, exportState.filename);
      if (!shared) downloadBlob(exportState.blob, exportState.filename);
    } catch (err) {
      if (err?.name !== 'AbortError') downloadBlob(exportState.blob, exportState.filename);
    }
  };

  const download = () => {
    if (!exportState.blob) {
      toast('No exported image yet');
      return;
    }
    downloadBlob(exportState.blob, exportState.filename);
  };

  if (!navigator.canShare && elements.shareSaveBtn) elements.shareSaveBtn.textContent = 'SAVE IMAGE';

  on(elements.freezeBtn, 'click', () => { freezeNow(); });
  on(elements.unfreezeBtn, 'click', unfreeze);
  on(elements.shareSaveBtn, 'click', shareOrSave);
  on(elements.downloadBtn, 'click', download);
  on(elements.exportModeBtn, 'click', () => { toggleMode(); });
  on(elements.exportAlgoBtn, 'click', () => { cycleExportAlgo(); });
  on(elements.regenerateBtn, 'click', () => { regeneratePoster(); });
  on(elements.compositeImg, 'click', () => { regeneratePoster(); });
  if (elements.exportModeCcBtn) on(elements.exportModeCcBtn, 'click', () => { toggleMode(); });
  if (elements.exportAlgoCcBtn) on(elements.exportAlgoCcBtn, 'click', () => { cycleExportAlgo(); });

  syncModeUI();
}
