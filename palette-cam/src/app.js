// --- Module Imports ---
import { $, $$ } from './ui/dom.js';
import { primeOnce, play } from './sound/sfx.js';
import { kmeansKmax } from './algos/kmeans.js';
import { histogramKmax } from './algos/hist.js';
import { medianCutKmax } from './algos/mediancut.js';
import { initCamera, startCamera, getSource, getVideoElement, getPhotoBitmap, computeSquareCrop, currentPhotoSrcRect, drawPhotoPreview } from './core/camera.js';
import { initControls } from './ui/controls.js';
import { initComposite } from './features/composite.js';
import { initManualPicker } from './features/manualPicker.js'; // <-- [ADD]

// --- Element Querying ---
// Find all necessary DOM elements once and store them in a central object.
const elements = {
  video: $('#video'), frozenCanvas: $('#frozenCanvas'), status: $('#status'),
  fps: $('#fps'), res: $('#res'), swatches: $('#swatches'), gradient: $('#gradient'),
  paletteClickable: $('#paletteClickable'), kRange: $('#k'), kVal: $('#kVal'),
  sizeRange: $('#size'), sizeVal: $('#sizeVal'), throttleLog: $('#throttleLog'),
  throttleVal: $('#throttleVal'), rectChk: $('#rects'), gradChk: $('#grad'),
  zoomSlider: $('#zoom'), zoomMinus: $('#zoomMinus'), zoomPlus: $('#zoomPlus'),
  freezeBtn: $('#freezeBtn'), compositeOverlay: $('#compositeOverlay'),
  compositeCanvas: $('#compositeCanvas'), compositeImg: $('#compositeImg'),
  unfreezeBtn: $('#unfreezeBtn'), ccWrap: $('#ccWrap'), cc: $('#cc'),
  algoName: $('#algoName'), pressShield: $('#pressShield'), camError: $('#camError'),
  offCanvas: $('#off'), srcCamera: $('#srcCamera'), srcPhoto: $('#srcPhoto'),
  pick: $('#pick'), photoPreview: $('#photoPreview'), videoPane: $('#videoPane'),
  controlsBar: $('#controlsBar')
};

// --- Application State ---
const state = {
  algo: 'kmeans',
  K: +elements.kRange.value,
  procWidth: +elements.sizeRange.value,
  throttleN: 40,
  KMAX: +elements.kRange.max,
  lastPaletteKmax: null,
};

// --- Constants & Labels ---
const ALGOS = ['kmeans', 'hist', 'mediancut'];
const ALGO_LABELS = { kmeans: 'K-Means (LAB)', hist: 'Histogram', mediancut: 'Median-cut' };
const ALGO_COPY = {
  kmeans: 'K-Means (LAB): groups similar colors in human-perceived space.',
  hist: 'Histogram: picks colors that appear most often with simple smoothing.',
  mediancut: 'Median-cut: slices the color range into balanced boxes.'
};
const TH_MIN = 1, TH_MAX = 150;
const sliderToN = v => Math.max(TH_MIN, Math.min(TH_MAX, Math.round(TH_MIN * Math.exp((v / 100) * Math.log(TH_MAX / TH_MIN)))));
const nToSlider = n => Math.round((Math.log(Math.max(TH_MIN, Math.min(TH_MAX, n)) / TH_MIN) / Math.log(TH_MAX / TH_MIN)) * 100);

// --- Core Functions ---
const status = t => { try { elements.status.textContent = t; } catch {} };
const toast = msg => {
  if (!msg) return;
  elements.camError.textContent = msg;
  elements.camError.style.display = 'block';
  setTimeout(() => elements.camError.style.display = 'none', 2600);
};

function renderPalette(pal, skipClear = false) {
  if (!skipClear) elements.swatches.innerHTML = '';
  const showRects = elements.rectChk.checked;
  const showGrad = elements.gradChk.checked;

  elements.swatches.style.display = showRects ? '' : 'none';
  if (showRects) {
    pal.forEach(rgb => {
      const d = document.createElement('div');
      d.className = 'swatch';
      d.style.background = `rgb(${rgb.join(',')})`;
      elements.swatches.appendChild(d);
    });
  }

  elements.gradient.hidden = !showGrad || !pal.length;
  if (showGrad && pal.length) {
    const stops = pal.map(rgb => `rgb(${rgb.join(',')})`).join(', ');
    elements.gradient.style.background = `linear-gradient(90deg, ${stops})`;
  }
}

function applyKInstant(newK) {
  state.K = newK;
  elements.kVal.textContent = newK;
  elements.swatches.innerHTML = '';
  if (state.lastPaletteKmax?.length) {
    const pal = state.lastPaletteKmax.slice(0, newK);
    renderPalette(pal, true);
    if (pal.length < newK) {
      for (let i = 0; i < newK - pal.length; i++) {
        const d = document.createElement('div');
        d.className = 'swatch';
        d.style.background = '#222';
        elements.swatches.appendChild(d);
      }
    }
  }
}

// --- Layout & Sizing ---
function recalcSquare() {
  const vv = window.visualViewport;
  const vw = window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;
  const isLandscape = vw > vh;
  const sq = isLandscape ? vh : Math.min(vw, vh);
  document.documentElement.style.setProperty('--sq', `${Math.round(sq)}px`);
  if (getSource() === 'photo') drawPhotoPreview();
}
['load', 'resize', 'orientationchange'].forEach(evt => window.addEventListener(evt, recalcSquare, { passive: true }));
window.visualViewport?.addEventListener('resize', recalcSquare, { passive: true });
new ResizeObserver(() => {
  const hBar = Math.round(elements.controlsBar.getBoundingClientRect().height);
  const hCta = Math.round(elements.freezeBtn.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--cbH', `${hBar}px`);
  document.documentElement.style.setProperty('--ctaH', `${hCta || 56}px`);
}).observe(elements.controlsBar);

// --- Main Processing Loop ---
let frameCounter = 0, lastT = performance.now(), fps = 0, skipCounter = 0;
const offCtx = elements.offCanvas.getContext('2d', { willReadFrequently: true });
function samplePixels(imgData, stride) {
    const d = imgData.data, n = d.length, out = [];
    for (let i = 0; i < n; i += 4 * stride) {
        if (d[i + 3] >= 250) out.push([d[i], d[i + 1], d[i + 2]]);
    }
    return out;
}

function tick(now) {
  requestAnimationFrame(tick);
  if (now - lastT >= 500) {
    fps = Math.round((frameCounter * 1000) / (now - lastT));
    elements.fps.textContent = String(fps);
    frameCounter = 0;
    lastT = now;
  }
  frameCounter++;

  if (--skipCounter > 0) return;
  skipCounter = state.throttleN;
  
  elements.offCanvas.width = state.procWidth;
  elements.offCanvas.height = state.procWidth;
  
  if (getSource() === 'camera' && getVideoElement()?.readyState >= 2) {
    const { sx, sy, sw, sh } = computeSquareCrop();
    if (sw > 0) {
      offCtx.drawImage(getVideoElement(), sx, sy, sw, sh, 0, 0, state.procWidth, state.procWidth);
      elements.res.textContent = `${getVideoElement().videoWidth}×${getVideoElement().videoHeight}`;
    }
  } else if (getSource() === 'photo' && getPhotoBitmap()) {
    const { sx, sy, sw, sh } = currentPhotoSrcRect();
    offCtx.drawImage(getPhotoBitmap(), sx, sy, sw, sh, 0, 0, state.procWidth, state.procWidth);
    elements.res.textContent = `${Math.round(sw)}×${Math.round(sh)}`;
  } else {
    offCtx.clearRect(0, 0, state.procWidth, state.procWidth);
  }

  const pixels = samplePixels(offCtx.getImageData(0, 0, state.procWidth, state.procWidth), 6);
  if (state.algo === 'kmeans') state.lastPaletteKmax = kmeansKmax(pixels, state.KMAX);
  else if (state.algo === 'hist') state.lastPaletteKmax = histogramKmax(pixels, state.KMAX);
  else state.lastPaletteKmax = medianCutKmax(pixels, state.KMAX);

  if (state.lastPaletteKmax?.length) {
    renderPalette(state.lastPaletteKmax.slice(0, Math.min(state.K, state.lastPaletteKmax.length)));
  }
}

// --- Initialization ---
function init() {
  document.addEventListener('pointerdown', primeOnce, { once: true });
  window.addEventListener('error', e => toast(`Script error: ${e.message || 'unknown'}`), { once: true });

  // Render algorithm descriptions
  const brief = $('#algoBrief');
  brief.innerHTML = ALGOS.map(a => `<div class="a" data-a="${a}">${ALGO_COPY[a]}</div>`).join('');
  const highlightAlgoDesc = () => $$('#algoBrief .a').forEach(n => n.classList.toggle('active', n.dataset.a === state.algo));

  const setAlgo = (next) => {
    state.algo = next;
    elements.algoName.textContent = ALGO_LABELS[state.algo];
    highlightAlgoDesc();
    state.lastPaletteKmax = null;
  };
  
  initCamera(elements, status, toast);
  initComposite(elements, state, status, toast);
  initControls(elements, state, {
    onKChange: (newK, instant) => {
        play('tick');
        elements.kRange.value = newK;
        if (instant) applyKInstant(newK);
        else state.K = newK;
    },
    onSizeChange: (newSize) => {
        play('tick');
        state.procWidth = newSize;
        elements.sizeVal.textContent = `${newSize} px`;
    },
    onThrottleChange: (newThrottle) => {
        play('tick');
        state.throttleN = sliderToN(newThrottle);
        elements.throttleVal.textContent = String(state.throttleN);
    },
    onAlgoChange: (dir) => {
        play('click');
        const i = ALGOS.indexOf(state.algo);
        setAlgo(ALGOS[(i + dir + ALGOS.length) % ALGOS.length]);
    },
    onDisplayChange: () => {
        play('click');
        renderPalette(state.lastPaletteKmax?.slice(0, state.K) || []);
    },
  });

  // Manual Picker wiring
  initManualPicker(elements, state, offCtx); // <-- [ADD]

  // Set initial UI values
  elements.kVal.textContent = String(state.K);
  elements.sizeVal.textContent = `${state.procWidth} px`;
  state.throttleN = sliderToN(+elements.throttleLog.value);
  elements.throttleVal.textContent = String(state.throttleN);
  elements.throttleLog.value = String(nToSlider(state.throttleN));
  setAlgo(state.algo);

  startCamera(status).catch(err => toast(err.message));
  recalcSquare();
  requestAnimationFrame(tick);
}

// Start the application
init();