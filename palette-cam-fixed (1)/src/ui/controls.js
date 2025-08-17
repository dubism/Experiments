
// Gesture + K controls
import { on, clamp } from './dom.js';
import { play } from '../sound/sfx.js';

const LP_MS = 450;
const MOVE_TOL = 12;           // px before we consider it a move
const V_DIR_RATIO = 0.75;      // prefer vertical intent (|dy| >= 0.75|dx|)
const DRAG_PX_PER_STEP = 24;   // px per K step
const INVERT = true;           // up = increase K

function suppressSelection(onNow){
  const b = document.body;
  if(onNow){
    document.body.classList.add('pressLock');
  }else{
    document.body.classList.remove('pressLock');
  }
}

export function initControls(elements, state, hooks){
  const { paletteClickable, ccWrap, ccClose, kRange, kVal, ccK, swatches } = elements;
  const { onKChange, onOpenCC, onCloseCC, onDisplayChange } = hooks;

  // K range wiring (fallback/manual)
  on(kRange, 'input', () => {
    state.K = +kRange.value;
    kVal.textContent = String(state.K);
    if (ccK) ccK.textContent = String(state.K);
    onKChange(state.K);
  });

  // CC close button
  on(ccClose, 'click', () => {
    ccWrap.classList.add('hidden');
    onCloseCC?.();
  });

  // ===== Gesture state =====
  let pressId = 0;
  let lpTimer = null;
  let draggingK = false;
  let startX=0, startY=0;
  let lastDetent=0; // integer steps since start
  let activePointer=null;

  function cleanup(){
    pressId++;
    activePointer = null;
    if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; }
    if(draggingK){ draggingK=false; }
    suppressSelection(false);
  }

  function openCC(){
    elements.ccWrap.classList.remove('hidden');
    onOpenCC?.();
  }

  function startLongPressSequence(pid){
    // only if still same press and not already dragging
    lpTimer = setTimeout(()=>{
      if(pid !== pressId || draggingK) return;
      openCC();
    }, LP_MS);
  }

  function commitDetents(dy){
    // positive steps increase K if INVERT true and dy<0 (upwards)
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
      if (ccK) ccK.textContent = String(state.K);
      onKChange?.(state.K);
      play('tick');
    }
  }

  on(paletteClickable, 'pointerdown', (e)=>{
    paletteClickable.setPointerCapture(e.pointerId);
    activePointer = e.pointerId;
    pressId++;
    draggingK = false;
    lastDetent = 0;
    startX = e.clientX; startY = e.clientY;
    suppressSelection(true);
    startLongPressSequence(pressId);
  });

  on(paletteClickable, 'pointermove', (e)=>{
    if(activePointer !== e.pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    // If we haven't decided yet and movement shows vertical intent before LP, switch to K-drag.
    if(!draggingK && (adx > MOVE_TOL || ady > MOVE_TOL)){
      if(ady >= V_DIR_RATIO * adx){
        // Enter K-drag: cancel long-press
        draggingK = true;
        if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; }
      }else{
        // Not vertical dominant; still allow long-press if timer remains.
        return;
      }
    }
    if(draggingK){
      commitDetents(dy);
    }
  }, { passive: true });

  function endAny(e){
    if(activePointer !== null){
      try{ paletteClickable.releasePointerCapture(activePointer); }catch{}
    }
    cleanup();
  }

  on(paletteClickable, 'pointerup', endAny);
  on(paletteClickable, 'pointercancel', endAny);
  on(paletteClickable, 'lostpointercapture', endAny);

  // Prevent iOS text selection/callout on long-press
  on(paletteClickable, 'contextmenu', (e)=> e.preventDefault(), { passive:false });
}
