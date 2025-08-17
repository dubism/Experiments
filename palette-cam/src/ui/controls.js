// src/ui/controls.js
import { on, clamp } from './dom.js';
import { play } from '../sound/sfx.js';
import { getSource, setUiZoom, setPhotoZoom } from '../core/camera.js';

/**
 * Interaction goals (as per spec):
 * - Press & hold on #paletteClickable for ~450 ms ⇒ open #ccWrap (no native selection/callout).
 * - If you move vertically past a small threshold BEFORE 450 ms ⇒ enter K-drag (no CC).
 * - Releasing after either path fully cleans state (no stuck interactions; next drag works).
 *
 * Implementation notes:
 * - We strictly gate K changes to movement detents (no time-based acceleration).
 * - We aggressively clean up on pointerup, pointercancel, and lostpointercapture.
 * - We temporarily lock user-select/touch-callout to defeat iOS heuristics during press.
 */

// ---------- Tunables ----------
const LP_MS = 450;           // long-press hold time
const LP_SLOP = 22;          // px allowed jitter during long-press before cancel
const MOVE_TOL = 4;          // px to consider "moving"
const VERTICAL_RATIO = 0.75; // |dy| > 0.75|dx| to enter vertical drag

// K control config
const K_CFG = {
  MIN: 1,
  STEP: 1,
  DRAG_PX_PER_STEP: 24,
  WHEEL_PX_PER_STEP: 80,
  INVERT: true,          // up increases K
  ENABLE_DRAG: true,
  ENABLE_WHEEL: true,
};

// ---------- Global modal state ----------
let ccOpen = false;
let pressLock = false;

// Preserve original inline styles while we suppress iOS selection/callout
let _prevBodyUserSelect = '';
let _prevBodyCallout = '';
let _prevBodyTouchAction = '';

function lockPressSelection() {
  if (pressLock) return;
  pressLock = true;
  const b = document.body;
  _prevBodyUserSelect = b.style.userSelect;
  _prevBodyCallout = b.style.webkitTouchCallout;
  _prevBodyTouchAction = b.style.touchAction;
  b.style.userSelect = 'none';
  b.style.webkitUserSelect = 'none';
  b.style.webkitTouchCallout = 'none';
  b.style.touchAction = 'none';
}

function unlockPressSelection() {
  if (!pressLock) return;
  pressLock = false;
  const b = document.body;
  b.style.userSelect = _prevBodyUserSelect;
  b.style.webkitUserSelect = '';
  b.style.webkitTouchCallout = _prevBodyCallout;
  b.style.touchAction = _prevBodyTouchAction;
  try { window.getSelection()?.removeAllRanges(); } catch {}
}

function noScroll(e) {
  if (ccOpen) return; // allow scrolling inside CC
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

// ---------- Main ----------
export function initControls(elements, state, callbacks) {
  const {
    paletteClickable, kRange, kVal, sizeRange, throttleLog, rectChk, gradChk,
    zoomSlider, zoomMinus, zoomPlus, ccWrap, cc, pressShield, compositeOverlay
  } = elements;

  const { onKChange, onSizeChange, onThrottleChange, onAlgoChange, onDisplayChange } = callbacks;

  // CC open/close
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
    if (compositeOverlay?.classList?.contains('open')) return;
    if (ccOpen && !cc.contains(e.target)) closeCC();
  }, { capture: true });
  on(document, 'keydown', (e) => { if (e.key === 'Escape' && ccOpen) closeCC(); });

  // Protect against native selection/callout while any press is active or CC open
  on(document, 'selectstart', (e) => { if (pressLock || ccOpen) e.preventDefault(); }, { capture: true });
  on(document, 'contextmenu', (e) => { if (pressLock || ccOpen) e.preventDefault(); }, { capture: true });

  // ---- K range (direct slider) ----
  kRange.min = String(K_CFG.MIN);
  kRange.step = String(K_CFG.STEP);
  const clampK = (v) => Math.max(K_CFG.MIN, Math.min(+kRange.max, Math.round(v)));
  const commitK = (k) => {
    const kk = clampK(k);
    if (kk !== state.K) {
      state.K = kk;
      kRange.value = String(kk);
      kVal.textContent = String(kk);
      onKChange(kk, true);
    }
  };
  on(kRange, 'input', () => commitK(+kRange.value));

  // ---- Palette long-press + vertical K-drag ----
  on(paletteClickable, 'pointerdown', (e) => {
    if (ccOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;

    // Invisible shield to discourage Safari heuristics (but keep pointer-events off!)
    if (pressShield) {
      pressShield.style.display = 'block';
      pressShield.style.position = 'fixed';
      pressShield.style.inset = '0';
      pressShield.style.pointerEvents = 'none';
    }

    const dragEnabled = !!K_CFG.ENABLE_DRAG;
    let lpTimer = 0;
    let lpCanceled = false;
    let sessionEnded = false;

    let movedPastLpSlop = false;
    let kDrag = false;
    let kAccum = 0;

    const startX = e.clientX;
    const startY = e.clientY;
    let lastY = startY;

    const cleanup = () => {
      if (sessionEnded) return;
      sessionEnded = true;
      try { paletteClickable.releasePointerCapture(e.pointerId); } catch {}
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onCancel, true);
      document.removeEventListener('lostpointercapture', onLost, true);
      clearTimeout(lpTimer);
      unlockScroll();
      unlockPressSelection();
      if (pressShield) pressShield.style.display = 'none';
    };

    const endSessionAndOpenCC = () => { cleanup(); openCC(); };

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      // Cancel LP only after generous jitter slop
      if (!movedPastLpSlop && (Math.abs(dx) > LP_SLOP || Math.abs(dy) > LP_SLOP)) {
        movedPastLpSlop = true;
        lpCanceled = true;
        clearTimeout(lpTimer);
      }

      // Enter vertical K-drag if motion is clearly vertical and beyond MOVE_TOL
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

      // Tap (no LP, no drag): cycle algo by left/right half
      if (!ccOpen && !kDrag && tinyMove) {
        const r = paletteClickable.getBoundingClientRect();
        const leftHalf = (ev.clientX - r.left) < (paletteClickable.clientWidth / 2);
        onAlgoChange(leftHalf ? -1 : 1);
      }
      cleanup();
    };

    const onCancel = () => { cleanup(); };
    const onLost = () => { cleanup(); };

    try { paletteClickable.setPointerCapture(e.pointerId); } catch {}
    lockPressSelection();
    lockScroll();

    // Start LP timer; it will be canceled on real drift or when drag begins
    lpTimer = setTimeout(() => {
      if (!lpCanceled && !kDrag) endSessionAndOpenCC();
    }, LP_MS);

    // Use capture to ensure we still clean up if nested elements stop propagation
    document.addEventListener('pointermove', onMove, { passive: false, capture: true });
    document.addEventListener('pointerup', onUp, { passive: false, capture: true });
    document.addEventListener('pointercancel', onCancel, { passive: false, capture: true });
    document.addEventListener('lostpointercapture', onLost, { passive: false, capture: true });
  });

  // ---- Wheel: optional K by wheel on desktop ----
  if (K_CFG.ENABLE_WHEEL) {
    on(paletteClickable, 'wheel', (e) => {
      if (e.ctrlKey || e.metaKey) return; // let pinch-to-zoom etc.
      const delta = e.deltaY || e.wheelDelta || 0;
      const signed = K_CFG.INVERT ? (-delta) : delta;
      const steps = Math.sign(signed) * Math.floor(Math.abs(signed) / K_CFG.WHEEL_PX_PER_STEP);
      if (steps) {
        commitK(state.K + steps * K_CFG.STEP);
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });
  }

  // ---- Rect/Gradient toggles ----
  on(rectChk, 'change', onDisplayChange);
  on(gradChk, 'change', onDisplayChange);

  // ---- Zoom controls ----
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
