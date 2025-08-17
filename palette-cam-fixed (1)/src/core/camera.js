
import { $, on } from '../ui/dom.js';

let _source='camera';
let videoEl=null;
let uiZoom=1;

export function getSource(){ return _source; }
export function getVideoElement(){ return videoEl; }
export function setUiZoom(z){ uiZoom = Math.max(1, Math.min(10, z)); if(videoEl) videoEl.style.transform = `scale(${uiZoom})`; }
export function setPhotoZoom(z){ /* noop for demo */ }

export async function initCamera(elements, status, toast){
  videoEl = elements.video;
  try{
    status('Starting camera…');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' }, audio:false });
    videoEl.srcObject = stream;
    await videoEl.play();
    status('Camera');
  }catch(err){
    toast('Camera error: '+err.message);
    status('Camera blocked');
  }
}

export async function startCamera(){ /* kept for compat */ }

export function computeSquareCrop(){
  const vw = videoEl?.videoWidth || 0;
  const vh = videoEl?.videoHeight || 0;
  if(!vw||!vh) return { sx:0, sy:0, sw:0, sh:0 };
  const base = Math.min(vw, vh);
  const sw = base, sh = base;
  const sx = Math.floor((vw-sw)/2);
  const sy = Math.floor((vh-sh)/2);
  return { sx, sy, sw, sh };
}

export function drawPhotoPreview(){ /* noop in demo */ }
