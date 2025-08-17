// app.js — wire-up
import { $, on } from './ui/dom.js';
import { primeOnce } from './sound/sfx.js';
import { initCamera } from './core/camera.js';
import { renderPaletteInto } from './features/composite.js';
import { kmeansKmax } from './algos/kmeans.js';
import { initControls } from './ui/controls.js';

const elements = {
  video: $('#video'),
  frozenCanvas: $('#frozenCanvas'),
  status: $('#status'),
  camError: $('#camError'),
  swatches: $('#swatches'),
  paletteClickable: $('#paletteClickable'),
  kRange: $('#k'),
  kVal: $('#kVal'),
  // optional legacy controls
  sizeRange: $('#size'),
  sizeVal: $('#sizeVal'),
  throttleLog: $('#throttleLog'),
  throttleVal: $('#throttleVal'),
  rectChk: $('#rects'),
  gradChk: $('#grad'),
  // zoom
  zoomSlider: $('#zoomSlider'),
  zoomMinus: $('#zoomMinus'),
  zoomPlus: $('#zoomPlus'),
  // CC
  ccWrap: $('#ccWrap'),
  ccClose: $('#ccClose'),
  ccK: $('#ccK'),
};

const state = { K: 6 };

const status = (t)=> elements.status.textContent = t;
const toast = (t)=>{ elements.camError.textContent = t; elements.camError.style.display='block'; setTimeout(()=> elements.camError.style.display='none', 2200); };

function render(){
  const cols = kmeansKmax([], state.K);
  renderPaletteInto(elements.swatches, cols);
  elements.kVal.textContent = String(state.K);
  if(elements.ccK) elements.ccK.textContent = String(state.K);
}

async function init(){
  primeOnce();
  await initCamera(elements, status, toast);
  render();

  initControls(elements, state, {
    onKChange: ()=> render(),
    onOpenCC: ()=>{},
    onCloseCC: ()=>{},
    onDisplayChange: ()=> render(),
  });

  // init values
  elements.kRange.value = String(state.K);
  elements.kVal.textContent = String(state.K);
  if(elements.ccK) elements.ccK.textContent = String(state.K);
}
init();
