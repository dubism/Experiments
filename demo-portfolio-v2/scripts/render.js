// Rendering handled in scenes.js
// --- DEBUG OVERLAY (toggle 'd') ---
import { Driver } from './scrollDriver.js';
(function(){
  const box = document.createElement('div');
  box.style.cssText='position:fixed;top:8px;right:8px;background:#000a;color:#fff;padding:6px 8px;font:12px/1.2 ui-monospace;z-index:9999;border-radius:6px;backdrop-filter:blur(6px);display:none';
  document.body.appendChild(box);
  function tick(){
    const s = Driver.getState();
    box.textContent = `ch ${s.currentIdx}  v=${s.velocity.toFixed(2)} px/ms`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.addEventListener('keydown', (e)=>{ if(e.key==='d') box.style.display = (box.style.display==='none'?'block':'none'); });
})();    
