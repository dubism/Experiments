import { on, clamp } from './dom.js';
import { play } from '../sound/sfx.js';
import { getSource, setUiZoom, setPhotoZoom, drawPhotoPreview } from '../core/camera.js';

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
    paletteClickable, kRange, sizeRange, throttleLog, rectChk, gradChk,
    zoomSlider, zoomMinus, zoomPlus, ccWrap, cc, pressShield, compositeOverlay
  } = elements;

  const { onKChange, onSizeChange, onThrottleChange, onAlgoChange, onDisplayChange } = callbacks;

  // --- Controls Panel (CC) Logic ---
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

  // --- Palette Gestures ---
  let lpTimer = 0, movedTooFar = false, longPressed = false;
  const LP_MS = 450, MOVE_TOL = 10;

  on(paletteClickable, 'pointerdown', (e) => {
    if (ccOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;

    movedTooFar = false; longPressed = false;
    const startX = e.clientX, startY = e.clientY;
    let lastX = startX, lastY = startY;
    let kDrag = false, kAccum = 0;
    const stepPx = Math.max(30, Math.min(56, Math.round(paletteClickable.clientHeight / 6)));
    let ax = 0, ay = -1, dirSign = 1;

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
          dirSign = (dy < 0) ? 1 : -1;
        }
      }
      if (kDrag) {
        kAccum += (ev.clientY - lastY) * dirSign;
        const steps = Math.trunc(kAccum / stepPx);
        if (steps) {
          const newK = clamp(state.K + steps, +kRange.min, +kRange.max);
          if (newK !== state.K) onKChange(newK, true); // true for instant update
          kAccum -= steps * stepPx;
        }
        if (ev.cancelable) ev.preventDefault();
      }
      lastX = ev.clientX; lastY = ev.clientY;
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
  on(paletteClickable, 'wheel', e => e.preventDefault(), { passive: false });

  // --- Sliders and Checkboxes ---
  on(kRange, 'input', () => onKChange(+kRange.value, true));
  on(sizeRange, 'input', () => onSizeChange(+sizeRange.value));
  on(throttleLog, 'input', () => onThrottleChange(+throttleLog.value));
  on(rectChk, 'change', onDisplayChange);
  on(gradChk, 'change', onDisplayChange);

  // --- Zoom Controls ---
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
