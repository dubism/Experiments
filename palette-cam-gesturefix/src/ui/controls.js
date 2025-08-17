// src/ui/controls.js — robust long-press vs K-drag
import { on, clamp } from './dom.js';
import { play } from '../sound/sfx.js';
import { getSource, setUiZoom, setPhotoZoom } from '../core/camera.js';

// ---- Config ----
const LP_MS = 450;             // long-press duration
const MOVE_TOL = 12;           // px to consider it a move
const V_DIR_RATIO = 0.75;      // vertical intent gate
const DRAG_PX_PER_STEP = 24;   // px per K step
const INVERT = true;           // up increases K

const State = Object.freeze({ IDLE:0, PRESSING:1, DRAG_K:2, CC_OPEN:3 });

function lockPress(lock){
  const b = document.body;
  if(lock) b.classList.add('pressLock');
  else b.classList.remove('pressLock');
}

export function initControls(elements, state, hooks){
  const {
    paletteClickable, ccWrap, ccClose,
    kRange, kVal, ccK,
    sizeRange, sizeVal, throttleLog, throttleVal,
    rectChk, gradChk,
    zoomSlider, zoomMinus, zoomPlus
  } = elements;

  const { onKChange = ()=>{}, onOpenCC=()=>{}, onCloseCC=()=>{}, onDisplayChange=()=>{} } = hooks || {};

  // Range wiring
  on(kRange, 'input', () => {
    state.K = +kRange.value;
    kVal.textContent = String(state.K);
    if(ccK) ccK.textContent = String(state.K);
    onKChange(state.K);
  });

  on(ccClose, 'click', () => {
    ccWrap.classList.add('hidden');
    if(current === State.CC_OPEN) current = State.IDLE;
    onCloseCC();
  });

  // --- Gesture machine ---
  let current = State.IDLE;
  let lpTimer = null;
  let startX=0, startY=0;
  let lastDetent = 0;
  let activePointer = null;

  function resetLP(){
    if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; }
  }
  function cleanup(){
    resetLP();
    if(activePointer !== null){
      try{ paletteClickable.releasePointerCapture(activePointer); }catch{}
    }
    activePointer = null;
    lastDetent = 0;
    lockPress(false);
    current = (current === State.CC_OPEN) ? State.CC_OPEN : State.IDLE;
  }

  function openCC(){
    ccWrap.classList.remove('hidden');
    current = State.CC_OPEN;
    onOpenCC();
  }

  function beginLP(){
    resetLP();
    const idAtStart = activePointer;
    lpTimer = setTimeout(()=>{
      // Open only if still pressing and not dragging
      if(current === State.PRESSING && activePointer === idAtStart){
        openCC();
      }
    }, LP_MS);
  }

  function commitDetents(dy){
    const signed = INVERT ? -dy : dy;
    const steps = Math.trunc(signed / DRAG_PX_PER_STEP);
    if(steps === lastDetent) return;
    const delta = steps - lastDetent;
    lastDetent = steps;
    const next = clamp(state.K + delta, 1, 32);
    if(next !== state.K){
      state.K = next;
      kRange.value = String(state.K);
      kVal.textContent = String(state.K);
      if(ccK) ccK.textContent = String(state.K);
      onKChange(state.K);
      play('tick');
    }
  }

  on(paletteClickable, 'pointerdown', (e)=>{
    if(current === State.CC_OPEN){
      // When CC is open, ignore palette presses
      return;
    }
    if(activePointer !== null) cleanup();
    paletteClickable.setPointerCapture(e.pointerId);
    activePointer = e.pointerId;
    startX = e.clientX; startY = e.clientY;
    current = State.PRESSING;
    lastDetent = 0;
    lockPress(true);
    beginLP();
  }, { passive: true });

  on(paletteClickable, 'pointermove', (e)=>{
    if(e.pointerId !== activePointer) return;
    if(current === State.CC_OPEN) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const adx = Math.abs(dx), ady = Math.abs(dy);

    if(current === State.PRESSING){
      if(adx > MOVE_TOL || ady > MOVE_TOL){
        // Decide intent
        if(ady >= V_DIR_RATIO * adx){
          current = State.DRAG_K;
          resetLP();
          commitDetents(dy);
        }else{
          // non-vertical: keep waiting for LP
          // do nothing
        }
      }
    }else if(current === State.DRAG_K){
      commitDetents(dy);
    }
  }, { passive: true });

  function endAny(){
    // If LP never fired, ensure clean reset so next drag works immediately
    if(current !== State.CC_OPEN){
      current = State.IDLE;
    }
    cleanup();
  }
  on(paletteClickable, 'pointerup', endAny, { passive:true });
  on(paletteClickable, 'pointercancel', endAny, { passive:true });
  on(paletteClickable, 'lostpointercapture', endAny);

  // Suppress context menu during active press
  on(paletteClickable, 'contextmenu', (e)=>{ e.preventDefault(); }, { passive:false });
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) endAny(); });

  // --- Misc UI (size/throttle/rect/grad) kept for parity but optional ---
  if(sizeRange && sizeVal){
    on(sizeRange, 'input', ()=>{ sizeVal.textContent = sizeRange.value; });
  }
  if(throttleLog && throttleVal){
    on(throttleLog, 'input', ()=>{
      throttleVal.textContent = String(+throttleLog.value);
    });
  }
  if(rectChk) on(rectChk, 'change', onDisplayChange);
  if(gradChk) on(gradChk, 'change', onDisplayChange);

  // Zoom controls
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
