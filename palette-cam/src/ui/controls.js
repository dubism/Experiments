// src/ui/controls.js
import { on, clamp } from './dom.js';
import { play } from '../sound/sfx.js';
import { getSource, setUiZoom, setPhotoZoom } from '../core/camera.js';

// -----------------------
// K CONTROL CONFIG (edit)
// -----------------------
const K_CFG = {
  MIN: 1,                 // slider minimum (also pushed to DOM)
  STEP: 1,                // K increments per detent
  DRAG_PX_PER_STEP: 40,   // pixels of drag per 1 K step (↑ = slower)
  WHEEL_PX_PER_STEP: 100, // wheel delta per 1 K step (↑ = slower)
  INVERT: true,           // true: up/scroll-up increases K
  ENABLE_DRAG: true,
  ENABLE_WHEEL: true
};

let ccOpen = false;
let pressLock = false;

// --- Private Helpers ---
function lockPressSelection() {
  if (pressLock) return;
  pressLock = true;
  document.body.classList.add('pressLock');
}

function unlockPressSelection() {
  if (!pressLock) return;
  pressLock = false;
  document.body.classList.remove('pressLock');
  try { window.getSelection()?.removeAllRanges(); } catch {}
}

function noScroll(e) {
  if (ccOpen) return;
  if (e.cancelable) e.preventDefault();
}

function lockScroll() {
  document.addEventListener('touchmove', noScroll, { passive: false, capture: true });
  document.addEventListener('wheel', noScroll, { passive: false, capture: true });
}

function unlockScroll() {
  document.removeEventListener('touchmove', noScroll, { capture: true });
  document.removeEventListener('wheel', noScroll, { capture: true });
}

// --- Public (Exported) Functions ---
export function initControls(elements, state, callbacks) {
  const {
    paletteClickable, kRange, kVal, sizeRange, throttleLog, rectChk, gradChk,
    zoomSlider, zoomMinus, zoomPlus, ccWrap, cc, pressShield, compositeOverlay
  } = elements;

  const { onKChange, onSizeChange, onThrottleChange, onAlgoChange, onDisplayChange } = callbacks;

  // ----- Controls Panel (CC) Logic -----
  const openCC = () => {
    play('open');
    unlockScroll();
    unlockPressSelection();
    ccWrap.style.display = 'block';
    ccWrap.classList.add('open');
    ccOpen = true;
  };
  const closeCC = () => {
    play('close');
    ccOpen = false;
    ccWrap.classList.remove('open');
    ccWrap.style.display = 'none';
  };
  on(cc, 'pointerdown', e => e.stopPropagation(), { capture: true });
  on(cc, 'click', e => e.stopPropagation(), { capture: true });
  on(document, 'pointerdown', (e) => {
    if (compositeOverlay.classList.contains('open')) return;
    if (ccOpen && !cc.contains(e.target)) closeCC();
  }, { capture: true });
  on(document, 'keydown', (e) => { if (e.key === 'Escape' && ccOpen) closeCC(); });

  // Prevent selection/context menu while CC is open or during gestures
  on(document, 'selectstart', (e) => { if (pressLock) e.preventDefault(); }, { capture: true });
  on(document, 'selectionchange', () => { if (pressLock) try { window.getSelection()?.removeAllRanges(); } catch {} });
  on(document, 'contextmenu', (e) => { if (ccOpen || pressLock) e.preventDefault(); }, { capture: true });

  // ============================
  // K (palette size) — FULL CTRL
  // ============================

  // Push min to DOM to keep native slider bounds aligned
  kRange.min = String(K_CFG.MIN);

  const clampK = (v) => Math.max(K_CFG.MIN, Math.min(+kRange.max, Math.round(v)));
  const commitK = (k) => {
    const kk = clampK(k);
    if (kk !== state.K) {
      state.K = kk;
      kRange.value = String(kk);
      kVal.textContent = String(kk);
      onKChange(kk, /*instant*/ true); // instant UI response; recompute is throttled in app.js
    }
  };

  // --- Slider input (dragging the range thumb) ---
  on(kRange, 'input', () => commitK(+kRange.value));

  // --- Palette Gestures (drag up/down over the preview to change K) ---
  let lpTimer = 0, movedTooFar = false, longPressed = false;
  const LP_MS = 450, MOVE_TOL = 10;

  on(paletteClickable, 'pointerdown', (e) => {
    if (!K_CFG.ENABLE_DRAG) return;
    if (ccOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;

    movedTooFar = false; longPressed = false;
    const startX = e.clientX, startY = e.clientY;
    let lastY = startY;
    let kDrag = false, kAccum = 0;

    paletteClickable.setPointerCapture(e.pointerId);
    lockPressSelection();
    lockScroll();

    lpTimer = setTimeout(() => {
      if (movedTooFar || kDrag) return;
      longPressed = true;
      try { paletteClickable.releasePointerCapture(e.pointerId); } catch {}
      openCC();
    }, LP_MS);

    const move = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!kDrag && (Math.abs(dx) > MOVE_TOL || Math.abs(dy) > MOVE_TOL)) {
        movedTooFar = true; clearTimeout(lpTimer);
        if (Math.abs(dy) > Math.abs(dx) * 0.7) {
          kDrag = true;
        }
      }
      if (kDrag) {
        const deltaY = ev.clientY - lastY;                 // up = negative
        const signed = K_CFG.INVERT ? (-deltaY) : deltaY;  // make up increase if INVERT=true
        kAccum += signed;

        const stepPx = K_CFG.DRAG_PX_PER_STEP;
        let steps = 0;
        while (kAccum >= stepPx) { steps += 1; kAccum -= stepPx; }
        while (kAccum <= -stepPx){ steps -= 1; kAccum += stepPx; }
        if (steps) commitK(state.K + steps * K_CFG.STEP);

        if (ev.cancelable) ev.preventDefault();
      }
      lastY = ev.clientY;
    };

    const finish = (ev) => {
      try { paletteClickable.releasePointerCapture(e.pointerId); } catch {}
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      clearTimeout(lpTimer); unlockScroll(); unlockPressSelection();
      if (!longPressed && !kDrag && !movedTooFar) {
        onAlgoChange((ev.clientX - paletteClickable.getBoundingClientRect().left) < (paletteClickable.clientWidth / 2) ? -1 : 1);
      }
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish, { once: true });
  });

  // Prevent native scroll on the palette area
  on(paletteClickable, 'wheel', e => e.preventDefault(), { passive: false });

  // --- Wheel over the slider (optional) ---
  if (K_CFG.ENABLE_WHEEL) {
    let wheelAccum = 0;
    const wheelTarget = kRange; // change to paletteClickable if you prefer
    on(wheelTarget, 'wheel', (e) => {
      e.preventDefault();
      const signed = K_CFG.INVERT ? (-e.deltaY) : e.deltaY;
      wheelAccum += signed;

      const stepPx = K_CFG.WHEEL_PX_PER_STEP;
      let steps = 0;
      while (wheelAccum >= stepPx) { steps += 1; wheelAccum -= stepPx; }
      while (wheelAccum <= -stepPx){ steps -= 1; wheelAccum += stepPx; }
      if (steps) commitK(state.K + steps * K_CFG.STEP);
    }, { passive: false });
  }

  // ======================
  // Size & Throttle & UI
  // ======================
  on(sizeRange, 'input', () => onSizeChange(+sizeRange.value));
  on(throttleLog, 'input', () => onThrottleChange(+throttleLog.value));
  on(rectChk, 'change', onDisplayChange);
  on(gradChk, 'change', onDisplayChange);

  // ===============
  // Zoom Controls
  // ===============
  const setZoom = (v) => {
    const z = clamp(v, 1, 10);
    zoomSlider.value = z;
    if (getSource() === 'camera') setUiZoom(z);
    else setPhotoZoom(z);
  };
  on(zoomSlider, 'input', () => { play('tick'); setZoom(+zoomSlider.value); });
  on(zoomMinus, 'click', () => { play('tick'); setZoom(+zoomSlider.value - 0.25); });
  on(zoomPlus, 'click', () => { play('tick'); setZoom(+zoomSlider.value + 0.25); });
}