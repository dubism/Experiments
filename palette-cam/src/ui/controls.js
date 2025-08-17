// src/ui/controls.js
import { on, clamp } from './dom.js';
import { play } from '../sound/sfx.js';
import { getSource, setUiZoom, setPhotoZoom } from '../core/camera.js';

// -----------------------
// K CONTROL CONFIG (edit)
// -----------------------
const K_CFG = {
  MIN: 1,                  // slider minimum (also pushed to DOM)
  STEP: 1,                 // K increments per detent
  DRAG_PX_PER_STEP: 24,    // pixels of drag per 1 K step (↑ = slower) [snappier]
  WHEEL_PX_PER_STEP: 80,   // wheel delta per 1 K step (↑ = slower)
  INVERT: true,            // true: up/scroll-up increases K
  ENABLE_DRAG: true,
  ENABLE_WHEEL: true
};

// Long-press + gesture tolerances
const LP_MS = 450;         // long-press hold time
const LP_SLOP = 20;        // px allowed drift during long-press before cancel
const MOVE_TOL = 4;        // px to decide "we're moving" for drag mode
const VERTICAL_RATIO = 1;  // require |dy| > 1*|dx| to enter vertical drag

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
  // K (palette size) — MOVEMENT-ONLY
  // ============================

  // Keep native slider bounds/steps aligned with our detents
  kRange.min = String(K_CFG.MIN);
  kRange.step = String(K_CFG.STEP);

  const clampK = (v) => Math.max(K_CFG.MIN, Math.min(+kRange.max, Math.round(v)));
  const commitK = (k) => {
    const kk = clampK(k);
    if (kk !== state.K) {
      state.K = kk;
      kRange.value = String(kk);
      kVal.textContent = String(kk);
      // Immediate signal; palette recompute cadence is separately throttled in app.js
      onKChange(kk, true);
    }
  };

  // Slider thumb drag -> direct detent updates (no time element)
  on(kRange, 'input', () => commitK(+kRange.value));

  // Palette vertical drag & long-press (decoupled from ENABLE_DRAG)
  let lpTimer = 0, lpCanceled = false;

  on(paletteClickable, 'pointerdown', (e) => {
    if (ccOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;

    const dragEnabled = !!K_CFG.ENABLE_DRAG; // long-press ignores this; drag obeys it
    let movedTooFarForLP = false;
    let kDrag = false;
    let kAccum = 0;

    const startX = e.clientX;
    const startY = e.clientY;
    let lastY = startY;

    try { paletteClickable.setPointerCapture(e.pointerId); } catch {}
    lockPressSelection();
    lockScroll();

    // Start long-press ALWAYS; only canceled by true movement beyond LP_SLOP or entering drag
    lpCanceled = false;
    lpTimer = setTimeout(() => {
      if (!lpCanceled && !kDrag) {
        try { paletteClickable.releasePointerCapture(e.pointerId); } catch {}
        openCC();
      }
    }, LP_MS);

    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      // Cancel long-press only after generous slop (robust to micro-jitter)
      if (!movedTooFarForLP && (Math.abs(dx) > LP_SLOP || Math.abs(dy) > LP_SLOP)) {
        movedTooFarForLP = true;
        lpCanceled = true;
        clearTimeout(lpTimer);
      }

      // Enter vertical K-drag only if allowed, motion is vertical enough, and exceeds small tol
      if (!kDrag && dragEnabled) {
        if (Math.abs(dy) > Math.abs(dx) * VERTICAL_RATIO && Math.abs(dy) > MOVE_TOL) {
          kDrag = true;
          // If we just transitioned into drag, ensure LP is canceled
          if (!lpCanceled) { lpCanceled = true; clearTimeout(lpTimer); }
        }
      }

      // While in K-drag, step purely by movement detents (no timing)
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
      clearTimeout(lpTimer);
      unlockScroll();
      unlockPressSelection();

      // Tap action (no LP, no drag, minimal movement) -> cycle algo by side
      const endRect = paletteClickable.getBoundingClientRect();
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const tinyMove = Math.abs(dx) <= MOVE_TOL && Math.abs(dy) <= MOVE_TOL;

      if (!ccOpen && !kDrag && tinyMove) {
        const leftHalf = (ev.clientX - endRect.left) < (paletteClickable.clientWidth / 2);
        onAlgoChange(leftHalf ? -1 : 1);
      }
    };

    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', finish, { once: true });
  });

  // Prevent native scroll on the palette area
  on(paletteClickable, 'wheel', e => e.preventDefault(), { passive: false });

  // Wheel -> detents from accumulated wheel delta (movement proxy), independent of time
  if (K_CFG.ENABLE_WHEEL) {
    let wheelAccum = 0;
    const wheelTarget = paletteClickable; // wheel over the interactive area
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
  on(throttleLog, 'input', () => onThrottleChange(+throttleLog.value)); // independent palette refresh cadence
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
