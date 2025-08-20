// src/ui/controls.js
import { on, clamp } from './dom.js';
import { play } from '../sound/sfx.js';
import { getSource, setUiZoom, setPhotoZoom } from '../core/camera.js';

// -----------------------
// K CONTROL CONFIG (edit)
// -----------------------
const K_CFG = {
  MIN: 1,
  STEP: 1,                 // detent size
  DRAG_PX_PER_STEP: 24,    // px per K step (↑ = slower)
  WHEEL_PX_PER_STEP: 80,   // wheel delta per K step
  INVERT: true,            // up/scroll-up increases K
  ENABLE_DRAG: true,
  ENABLE_WHEEL: true
};

// Long-press + gesture tolerances
const LP_MS = 450;           // long-press hold time
const LP_SLOP = 22;          // px allowed jitter during long-press before cancel
const MOVE_TOL = 4;          // px to consider "moving"
const VERTICAL_RATIO = 0.75; // |dy| > 0.75|dx| to enter vertical drag

let ccOpen = false;
let pressLock = false;

// Preserve/restore original inline styles while we suppress iOS selection/callout
let _prevBodyUserSelect = '';
let _prevBodyCallout = '';
let _prevBodyTouchAction = '';

// --- Private Helpers ---
function lockPressSelection() {
  if (pressLock) return;
  pressLock = true;
  // Save
  const b = document.body;
  _prevBodyUserSelect = b.style.userSelect;
  _prevBodyCallout = b.style.webkitTouchCallout;
  _prevBodyTouchAction = b.style.touchAction;
  // Suppress iOS text selector/callout + gestures during press
  b.style.userSelect = 'none';
  b.style.webkitUserSelect = 'none';
  b.style.webkitTouchCallout = 'none';
  b.style.touchAction = 'none';
  document.body.classList.add('pressLock');
}

function unlockPressSelection() {
  if (!pressLock) return;
  pressLock = false;
  const b = document.body;
  b.style.userSelect = _prevBodyUserSelect;
  b.style.webkitUserSelect = '';
  b.style.webkitTouchCallout = _prevBodyCallout;
  b.style.touchAction = _prevBodyTouchAction;
  document.body.classList.remove('pressLock');
  try { window.getSelection()?.removeAllRanges(); } catch {}
}

function noScroll(e) {
  if (ccOpen) return;            // allow scrolling inside CC
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
  // --- Hard-disable native iOS selection/callout/gesture heuristics on the palette surface ---
  Object.assign(paletteClickable.style, {
    webkitUserSelect: 'none',
    userSelect: 'none',
    webkitTouchCallout: 'none',
    touchAction: 'none',
  });
  // Block context menu specifically on the palette (belt & suspenders)
  on(paletteClickable, 'contextmenu', (e) => { if (e.cancelable) e.preventDefault(); }, { capture: true });


  const { onKChange, onSizeChange, onThrottleChange, onAlgoChange, onDisplayChange } = callbacks;

  // Defensive: prevent browser gesture conflicts on iOS for the palette area
  try { paletteClickable.style.touchAction = 'none'; } catch {}

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
  kRange.min = String(K_CFG.MIN);
  kRange.step = String(K_CFG.STEP);

  const clampK = (v) => Math.max(K_CFG.MIN, Math.min(+kRange.max, Math.round(v)));
  const commitK = (k) => {
    const kk = clampK(k);
    if (kk !== state.K) {
      state.K = kk;
      kRange.value = String(kk);
      kVal.textContent = String(kk);
      onKChange(kk, true); // recompute cadence is throttled elsewhere
    }
  };

  on(kRange, 'input', () => commitK(+kRange.value));

  // ---- Palette long-press + drag (robust; no stuck states) ----
  on(paletteClickable, 'pointerdown', (e) => {
    if (e.cancelable) e.preventDefault();

    if (ccOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;

    // Optional invisible shield to swallow native behaviors (if provided in DOM)
    if (pressShield) {
      pressShield.style.display = 'block';
      pressShield.style.position = 'fixed';
      pressShield.style.inset = '0';
      pressShield.style.pointerEvents = 'none'; // visible only to Safari heuristics
    }

    const dragEnabled = !!K_CFG.ENABLE_DRAG; // LP ignores this; drag obeys it
    let lpTimer = 0;
    let lpCanceled = false;
    let sessionEnded = false;

    let movedPastLpSlop = false;
    let kDrag = false;
    let kAccum = 0;

    const startX = e.clientX;
    const startY = e.clientY;
    let lastY = startY;

    // Common cleanup that always runs exactly once
    const cleanup = () => {
      if (sessionEnded) return;
      sessionEnded = true;
      try { paletteClickable.releasePointerCapture(e.pointerId); } catch {}
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      clearTimeout(lpTimer);
      unlockScroll();
      unlockPressSelection();
      if (pressShield) pressShield.style.display = 'none';
    };

    const endSessionAndOpenCC = () => {
      cleanup();
      openCC();
    };

    try { paletteClickable.setPointerCapture(e.pointerId); } catch {}
    
    // Ensure cleanup if iOS steals the pointer or we leave target
    const onCancel = () => {
      // Critical: handle iOS pointercancel so state never gets stuck
      cleanup();
    };
paletteClickable.addEventListener('lostpointercapture', onCancel, { once: true });
    paletteClickable.addEventListener('pointerleave', onCancel, { once: true });
lockPressSelection();
    lockScroll();

    // Start long-press ALWAYS; cancel only on real drift or when drag begins
    lpTimer = setTimeout(() => {
      if (!lpCanceled && !kDrag) {
        endSessionAndOpenCC();
      }
    }, LP_MS);

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      // Cancel LP only after generous jitter slop (prevents iOS "selection" heuristics)
      if (!movedPastLpSlop && (Math.abs(dx) > LP_SLOP || Math.abs(dy) > LP_SLOP)) {
        movedPastLpSlop = true;
        lpCanceled = true;
        clearTimeout(lpTimer);
      }

      // Enter vertical K-drag only if allowed and motion is clearly vertical
      if (!kDrag && dragEnabled) {
        if (Math.abs(dy) > Math.abs(dx) * VERTICAL_RATIO && Math.abs(dy) > MOVE_TOL) {
          kDrag = true;
          if (!lpCanceled) { lpCanceled = true; clearTimeout(lpTimer); }
        }
      }

      // Movement-only detents while dragging
      if (kDrag) {
        const deltaY = ev.clientY - lastY;                 // up = negative
        const signed = K_CFG.INVERT ? (-deltaY) : deltaY;  // up increases if INVERT
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

    const onUp = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const tinyMove = Math.abs(dx) <= MOVE_TOL && Math.abs(dy) <= MOVE_TOL;

      // Tap action (no LP, no drag): cycle algo by side
      if (!ccOpen && !kDrag && tinyMove) {
        const r = paletteClickable.getBoundingClientRect();
        const leftHalf = (ev.clientX - r.left) < (paletteClickable.clientWidth / 2);
        onAlgoChange(leftHalf ? -1 : 1);
      }
      cleanup();
    };

    

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp, { once: true });
    document.addEventListener('pointercancel', onCancel, { once: true });
  });

  // Prevent native scroll on the palette area
  on(paletteClickable, 'wheel', e => e.preventDefault(), { passive: false });

  // Wheel -> detents from accumulated wheel delta (movement proxy)
  if (K_CFG.ENABLE_WHEEL) {
    let wheelAccum = 0;
    const wheelTarget = paletteClickable;
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
  on(throttleLog, 'input', () => onThrottleChange(+throttleLog.value)); // independent cadence
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