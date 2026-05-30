import { on } from '../ui/dom.js';
import { play } from '../sound/sfx.js';
import { getSource, getVideoElement, getPhotoBitmap, computeSquareCrop, currentPhotoSrcRect } from '../core/camera.js';
import * as C from '../core/constants.js';
import { kmeansKmax } from '../algos/kmeans.js';
import { histogramKmax } from '../algos/hist.js';
import { medianCutKmax } from '../algos/mediancut.js';

const STORY_W = 1080;
const STORY_H = 1920;

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

function pickTextColor(bg, palette) {
  const sorted = sortedByLuma(palette);
  if (!sorted.length) return [255, 255, 255];
  const dark = sorted[0];
  const light = sorted[sorted.length - 1];
  return Math.abs(luminance(bg) - luminance(light)) > Math.abs(luminance(bg) - luminance(dark)) ? light : dark;
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export image.')), type, quality);
  });
}

function makeFileName(mode) {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const suffix = mode === 'immersive' ? 'immersive-story' : 'classic';
  return `palette-${suffix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
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
    modeBtn = createButton('exportModeBtn', 'MODE: EXISTING', 'btn');
    actions.appendChild(modeBtn);
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
  elements.shareSaveBtn = shareSaveBtn;
  elements.downloadBtn = downloadBtn;
}

function ensureExportModeControl(elements, state) {
  state.exportMode = state.exportMode || 'existing';

  let field = elements.cc?.querySelector('#exportModeField');
  if (!field && elements.cc) {
    field = document.createElement('div');
    field.id = 'exportModeField';
    field.className = 'field';
    field.innerHTML = `
      <div class="field-head">
        <span class="label">Output image</span>
        <span class="value" id="exportModeVal">Existing</span>
      </div>
      <div class="field-body">
        <button type="button" class="btn wide" id="exportModeCcBtn">Toggle immersive story</button>
      </div>
      <div class="divider"></div>
    `;
    elements.cc.appendChild(field);
  }

  elements.exportModeVal = field?.querySelector('#exportModeVal') || null;
  elements.exportModeCcBtn = field?.querySelector('#exportModeCcBtn') || null;
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

function computeFreezeHexesFromCrop(cropImg, sx, sy, sw, sh, state) {
  const { procWidth, algo, K, KMAX } = state;
  const w = Math.max(32, procWidth | 0);
  const work = document.createElement('canvas');
  work.width = w;
  work.height = w;

  const ctx = work.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cropImg, sx, sy, sw, sh, 0, 0, w, w);

  const pixels = samplePixels(ctx.getImageData(0, 0, w, w), 2);
  let pal;
  if (algo === 'kmeans') pal = kmeansKmax(pixels, KMAX);
  else if (algo === 'hist') pal = histogramKmax(pixels, KMAX);
  else pal = medianCutKmax(pixels, KMAX);

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

function drawRoundedImage(ctx, img, x, y, size, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + size, y, x + size, y + size, radius);
  ctx.arcTo(x + size, y + size, x, y + size, radius);
  ctx.arcTo(x, y + size, x, y, radius);
  ctx.arcTo(x, y, x + size, y, radius);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0, img.width, img.height, x, y, size, size);
  ctx.restore();
}

function fillStripe(ctx, colors, y, h, inset = 0, reverse = false) {
  const arr = reverse ? [...colors].reverse() : colors;
  const w = STORY_W - inset * 2;
  const n = Math.max(1, arr.length);
  for (let i = 0; i < n; i++) {
    const x0 = inset + Math.round((i / n) * w);
    const x1 = inset + Math.round(((i + 1) / n) * w);
    ctx.fillStyle = arr[i];
    ctx.fillRect(x0, y, Math.max(1, x1 - x0), h);
  }
}

function drawImmersiveStory(ctx, hiCap, hexes, elements) {
  const palette = padToK(hexes.slice(), Math.max(6, hexes.length)).map(hexToRgb);
  const sorted = sortedByLuma(palette);
  const dark = sorted[0];
  const light = sorted[sorted.length - 1];
  const mid = sorted[(sorted.length / 2) | 0];
  const hexPalette = palette.map(rgbToHexLower);

  elements.compositeCanvas.width = STORY_W;
  elements.compositeCanvas.height = STORY_H;

  const bg = ctx.createLinearGradient(0, 0, STORY_W, STORY_H);
  palette.forEach((c, i) => bg.addColorStop(i / Math.max(1, palette.length - 1), rgbCss(mix(c, light, 0.1))));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  fillStripe(ctx, hexPalette, 56, 48, 72, false);
  fillStripe(ctx, hexPalette, 124, 24, 116, true);

  const outer = 928;
  const x = Math.round((STORY_W - outer) / 2);
  const y = 246;
  const frameBands = 7;
  const band = 18;
  for (let i = 0; i < frameBands; i++) {
    ctx.fillStyle = hexPalette[i % hexPalette.length];
    ctx.fillRect(x + i * band, y + i * band, outer - i * band * 2, outer - i * band * 2);
  }
  const imagePad = frameBands * band;
  drawRoundedImage(ctx, hiCap, x + imagePad, y + imagePad, outer - imagePad * 2, 34);

  const panelX = 72;
  const panelY = 1214;
  const panelW = STORY_W - panelX * 2;
  const panelH = 520;
  ctx.fillStyle = rgbCss(mix(mid, light, 0.18), 0.95);
  ctx.fillRect(panelX, panelY, panelW, panelH);

  let rowY = panelY + 40;
  if (elements.rectChk.checked) {
    fillStripe(ctx, hexPalette, rowY, 128, panelX + 28, false);
    rowY += 162;
  }

  if (elements.gradChk.checked) {
    const grad = ctx.createLinearGradient(panelX + 28, 0, panelX + panelW - 28, 0);
    hexPalette.forEach((hex, i) => grad.addColorStop(i / Math.max(1, hexPalette.length - 1), hex));
    ctx.fillStyle = grad;
    ctx.fillRect(panelX + 28, rowY, panelW - 56, 96);
    rowY += 136;
  }

  const tileGap = 14;
  const cols = Math.min(5, hexPalette.length);
  const tileW = Math.floor((panelW - 56 - tileGap * (cols - 1)) / cols);
  const tileH = 96;
  const tileY = Math.min(rowY, panelY + panelH - tileH - 42);
  hexPalette.slice(0, cols).forEach((hex, i) => {
    ctx.fillStyle = hex;
    ctx.fillRect(panelX + 28 + i * (tileW + tileGap), tileY, tileW, tileH);
  });

  const labelBg = mix(dark, light, 0.24);
  const labelText = pickTextColor(labelBg, palette);
  ctx.fillStyle = rgbCss(labelBg, 0.92);
  ctx.fillRect(72, STORY_H - 112, STORY_W - 144, 54);
  ctx.font = '24px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgbCss(labelText);
  ctx.fillText('IMMERSIVE STORY · 1080 × 1920', STORY_W / 2, STORY_H - 85);
}

async function renderCompositePNG(hiCap, hexes, elements, exportState, mode) {
  const canvas = elements.compositeCanvas;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (mode === 'immersive') drawImmersiveStory(ctx, hiCap, hexes, elements);
  else drawExistingComposite(ctx, hiCap, hexes, elements);

  const blob = await canvasToBlob(canvas, 'image/png');
  const filename = makeFileName(mode);

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
  ensureExportModeControl(elements, state);

  const exportState = { blob: null, filename: '', objectUrl: '', hiCap: null, hexes: null };

  const syncModeUI = () => {
    const immersive = state.exportMode === 'immersive';
    if (elements.exportModeBtn) elements.exportModeBtn.textContent = immersive ? 'MODE: IMMERSIVE' : 'MODE: EXISTING';
    if (elements.exportModeVal) elements.exportModeVal.textContent = immersive ? 'Immersive story' : 'Existing';
    if (elements.exportModeCcBtn) elements.exportModeCcBtn.textContent = immersive ? 'Toggle to existing' : 'Toggle to immersive story';
  };

  const rerender = async () => {
    if (!exportState.hiCap || !exportState.hexes) return;
    statusUpdater('Rendering…');
    await renderCompositePNG(exportState.hiCap, exportState.hexes, elements, exportState, state.exportMode);
    statusUpdater('Frozen');
  };

  const toggleMode = async () => {
    play('click');
    state.exportMode = state.exportMode === 'immersive' ? 'existing' : 'immersive';
    syncModeUI();
    if (elements.compositeOverlay.classList.contains('open')) await rerender();
  };

  const freezeNow = async () => {
    play('freeze');
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
      const hexes = computeFreezeHexesFromCrop(hiCap, 0, 0, hiCap.width, hiCap.height, state);
      exportState.hiCap = hiCap;
      exportState.hexes = hexes;
      await renderCompositePNG(hiCap, hexes, elements, exportState, state.exportMode);
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
  if (elements.exportModeCcBtn) on(elements.exportModeCcBtn, 'click', () => { toggleMode(); });

  syncModeUI();
}