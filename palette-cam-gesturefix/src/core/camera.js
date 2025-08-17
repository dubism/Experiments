import { $ } from '../ui/dom.js';

let videoEl=null;

export function getSource(){ return 'camera'; }
export function getVideoElement(){ return videoEl; }
export function setUiZoom(z){ if(videoEl) videoEl.style.transform = `scale(${z})`; }
export function setPhotoZoom(z){ /* noop */ }

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
export async function startCamera(){} 
export function computeSquareCrop(){ return { sx:0, sy:0, sw:0, sh:0 }; }
export function currentPhotoSrcRect(){ return { x:0,y:0,w:0,h:0 }; }
export function drawPhotoPreview(){}
